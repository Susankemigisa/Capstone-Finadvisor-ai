"""
Long-term memory — facts that persist across sessions.

Stores and retrieves structured "memories" about a user in Supabase.
A memory is a short factual string extracted from conversation history,
e.g. "User is saving for a house deposit" or "User holds AAPL and TSLA".

The extraction pipeline runs after each completed session:
    1. extract_memories_from_history() — LLM reads the conversation
       and produces a list of fact strings worth remembering.
    2. save_memories() — upserts those facts to the `user_memories` table.
    3. get_memories() — called at the start of each new session to inject
       prior facts into the system prompt via state["memories"].

Table schema (add to SUPABASE_MIGRATION.sql):
    CREATE TABLE IF NOT EXISTS user_memories (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        memory      text NOT NULL,
        category    text NOT NULL DEFAULT 'general',
        importance  int  NOT NULL DEFAULT 1,  -- 1 low, 2 medium, 3 high
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, memory)
    );
    CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from src.utils.logger import get_logger

logger = get_logger(__name__)

# Maximum memories to inject into the system prompt per session.
# Keeps the context window cost low while still providing useful context.
MAX_MEMORIES_PER_SESSION = 12

# Extraction prompt — instructs the LLM to pull durable facts from history.
_EXTRACTION_PROMPT = """You are a memory extractor for a financial advisor AI.

Review this conversation and extract facts about the user that would be
useful to remember in FUTURE conversations. Focus on:
- Financial goals (saving for a house, retirement planning, etc.)
- Portfolio holdings and preferences
- Risk tolerance and investment style
- Income/expense patterns mentioned
- Life events with financial impact (new job, marriage, child, etc.)
- Preferred currency, language nuances

Rules:
- Return ONLY a JSON array of strings, no other text
- Each string is one concise fact, max 20 words
- Skip facts already obvious from the user profile
- Skip one-off queries (e.g. "asked about AAPL price today")
- Return [] if nothing durable was learned

Conversation:
{history}

Return JSON array:"""


def _db():
    from src.database.client import get_supabase_safe
    return get_supabase_safe()


async def get_memories(user_id: str, limit: int = MAX_MEMORIES_PER_SESSION) -> list[str]:
    """
    Load the most important long-term memories for a user.

    Returns a list of plain strings ready to inject into state["memories"].
    Ordered by importance DESC, then recency DESC.
    Returns [] gracefully if Supabase is unavailable.
    """
    db = _db()
    if not db:
        return []

    try:
        result = (
            db.table("user_memories")
            .select("memory")
            .eq("user_id", user_id)
            .order("importance", desc=True)
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        memories = [row["memory"] for row in (result.data or [])]
        logger.info("memories_loaded", user_id=user_id, count=len(memories))
        return memories

    except Exception as e:
        logger.warning("memories_load_failed", user_id=user_id, error=str(e))
        return []


async def save_memories(user_id: str, memories: list[str], category: str = "general") -> int:
    """
    Upsert a list of memory strings for a user.

    Uses INSERT ... ON CONFLICT (user_id, memory) DO UPDATE to avoid
    duplicates while refreshing updated_at on re-encounter.

    Returns the number of memories successfully saved.
    """
    if not memories:
        return 0

    db = _db()
    if not db:
        return 0

    saved = 0
    for memory in memories:
        memory = memory.strip()
        if not memory or len(memory) > 500:
            continue
        try:
            db.table("user_memories").upsert(
                {
                    "user_id":    user_id,
                    "memory":     memory,
                    "category":   category,
                    "importance": _score_importance(memory),
                    "updated_at": datetime.utcnow().isoformat(),
                },
                on_conflict="user_id,memory",
            ).execute()
            saved += 1
        except Exception as e:
            logger.warning("memory_save_failed", user_id=user_id, memory=memory[:50], error=str(e))

    logger.info("memories_saved", user_id=user_id, saved=saved, total=len(memories))
    return saved


async def delete_all_memories(user_id: str) -> bool:
    """
    Wipe all long-term memories for a user.

    Called when the user requests a full memory reset from Settings.
    Returns True on success.
    """
    db = _db()
    if not db:
        return False

    try:
        db.table("user_memories").delete().eq("user_id", user_id).execute()
        logger.info("memories_deleted", user_id=user_id)
        return True
    except Exception as e:
        logger.warning("memories_delete_failed", user_id=user_id, error=str(e))
        return False


async def extract_and_save_memories(
    user_id: str,
    history: list[dict],
    model_id: str = "gpt-4o-mini",
) -> list[str]:
    """
    Run the memory extraction pipeline for a completed session.

    Sends the conversation history to the LLM, parses the returned
    JSON array of facts, and persists them via save_memories().

    Returns the list of newly extracted memory strings.
    Should be called in the background after a session ends —
    never in the hot path of a user request.
    """
    if not history:
        return []

    # Build a compact text representation of the conversation
    history_text = _format_history_for_extraction(history)
    if len(history_text) < 100:
        return []

    prompt = _EXTRACTION_PROMPT.format(history=history_text)

    try:
        from src.models.model_manager import get_model
        llm = get_model(model_id, temperature=0.0)
        response = llm.invoke(prompt)
        raw = response.content if hasattr(response, "content") else str(response)

        # Parse JSON array — strip any accidental markdown fences
        raw = raw.strip().strip("```json").strip("```").strip()
        memories = json.loads(raw)

        if not isinstance(memories, list):
            return []

        # Sanitise: strings only, reasonable length
        clean = [m for m in memories if isinstance(m, str) and 3 < len(m) < 300]

        if clean:
            await save_memories(user_id, clean)
            logger.info("memories_extracted", user_id=user_id, count=len(clean))

        return clean

    except json.JSONDecodeError:
        logger.warning("memory_extraction_json_failed", user_id=user_id)
        return []
    except Exception as e:
        logger.warning("memory_extraction_failed", user_id=user_id, error=str(e))
        return []


# ── Helpers ───────────────────────────────────────────────────

def _format_history_for_extraction(history: list[dict]) -> str:
    """Convert a message list into a compact text block for the LLM."""
    lines = []
    for msg in history:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        if not content or role in ("system", "tool"):
            continue
        prefix = "User" if role == "human" else "Advisor"
        # Truncate very long messages to keep the prompt manageable
        truncated = content[:400] + "..." if len(content) > 400 else content
        lines.append(f"{prefix}: {truncated}")
    return "\n".join(lines)


def _score_importance(memory: str) -> int:
    """
    Heuristically score a memory string (1=low, 2=medium, 3=high).

    High-importance memories are injected first when the limit is reached.
    """
    memory_lower = memory.lower()

    high_keywords = [
        "goal", "saving", "retirement", "mortgage", "debt", "risk",
        "portfolio", "invest", "income", "salary", "net worth",
    ]
    medium_keywords = [
        "prefer", "like", "hate", "avoid", "always", "never",
        "currency", "country", "job", "family",
    ]

    if any(k in memory_lower for k in high_keywords):
        return 3
    if any(k in memory_lower for k in medium_keywords):
        return 2
    return 1
