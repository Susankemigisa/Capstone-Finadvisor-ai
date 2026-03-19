"""
Short-term memory — in-session conversation memory.

Uses LangGraph's MemorySaver checkpointer to persist the full message
history for the duration of a session (thread_id = session_id).

Each session gets its own isolated memory thread. When the user starts
a new chat session, a new thread_id is generated and memory resets.

This module is the single source of truth for the checkpointer instance.
The graph imports it via get_checkpointer() so we never create duplicate
MemorySaver instances.
"""

from langgraph.checkpoint.memory import MemorySaver
from src.utils.logger import get_logger

logger = get_logger(__name__)

# Singleton checkpointer — one instance shared across the entire app lifecycle.
# MemorySaver stores state in-process (RAM). For multi-process deployments,
# swap this for a Supabase/Redis-backed checkpointer without changing the
# rest of the codebase — just replace the return value of get_checkpointer().
_checkpointer: MemorySaver | None = None


def get_checkpointer() -> MemorySaver:
    """
    Return the singleton MemorySaver checkpointer.

    Thread-safe for async use — LangGraph handles concurrent access
    to the same MemorySaver instance internally.
    """
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = MemorySaver()
        logger.info("short_term_memory_initialised", backend="MemorySaver")
    return _checkpointer


def get_session_config(session_id: str) -> dict:
    """
    Build the LangGraph config dict for a given session.

    Pass this as config= when invoking or streaming the graph.
    LangGraph uses thread_id to isolate each session's message history.
    """
    return {"configurable": {"thread_id": session_id}}


async def get_session_history(session_id: str) -> list[dict]:
    """
    Retrieve the stored message history for a session.

    Returns a list of message dicts:
        role: "human" | "ai" | "tool" | "system"
        content: str
        tool_calls: list  (AI messages only, when present)

    Returns an empty list if no history exists for this session.
    """
    checkpointer = get_checkpointer()
    config = get_session_config(session_id)

    try:
        checkpoint = await checkpointer.aget(config)
        if not checkpoint:
            return []

        messages = checkpoint.get("channel_values", {}).get("messages", [])
        history = []
        for msg in messages:
            role = _get_role(msg)
            content = msg.content if hasattr(msg, "content") else str(msg)
            entry: dict = {"role": role, "content": content}
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                entry["tool_calls"] = [
                    {
                        "name": tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", ""),
                        "id":   tc.get("id")   if isinstance(tc, dict) else getattr(tc, "id",   ""),
                    }
                    for tc in msg.tool_calls
                ]
            history.append(entry)
        return history

    except Exception as e:
        logger.warning("session_history_read_failed", session_id=session_id, error=str(e))
        return []


async def clear_session(session_id: str) -> bool:
    """
    Delete all stored state for a session.

    Called when the user deletes a chat session so stale checkpointed
    state does not bleed into future runs with the same thread_id.
    Returns True on success, False if session did not exist or on error.
    """
    checkpointer = get_checkpointer()
    config = get_session_config(session_id)

    try:
        existing = await checkpointer.aget(config)
        if not existing:
            return False
        # Overwrite with empty checkpoint to effectively clear the thread
        await checkpointer.aput(config, {}, {}, {})
        logger.info("session_cleared", session_id=session_id)
        return True
    except Exception as e:
        logger.warning("session_clear_failed", session_id=session_id, error=str(e))
        return False


def _get_role(msg) -> str:
    """Map a LangChain message object to a plain role string."""
    class_name = type(msg).__name__.lower()
    if "human" in class_name:
        return "human"
    if "ai" in class_name or "assistant" in class_name:
        return "ai"
    if "tool" in class_name or "function" in class_name:
        return "tool"
    if "system" in class_name:
        return "system"
    return "unknown"