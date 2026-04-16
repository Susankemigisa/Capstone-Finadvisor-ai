"""
RAG node — retrieves relevant document chunks before the planner runs.

This node runs at the START of each graph turn, before the planner.
It checks whether the user's latest message warrants a document search,
runs retrieval if so, and injects the results into state["rag_context"].

The planner then reads state["rag_context"] and renders it into the
system prompt via the rag_prompt.json template — giving the LLM grounded
context from the user's own uploaded financial documents.

Graph position:
    START → rag_node → planner → [tools? → tools → planner] → END

The node is designed to be a no-op when:
    - The user has no uploaded documents
    - The RAG pipeline is not yet configured (missing API keys)
    - The query is clearly not document-related (e.g. "what is Bitcoin?")
"""

from __future__ import annotations

from src.agent.state import AgentState
from src.utils.logger import get_logger

logger = get_logger(__name__)

# Minimum relevance score to include a chunk (0.0–1.0 cosine similarity).
# Chunks below this threshold are discarded to reduce noise.
MIN_RELEVANCE_SCORE = 0.72

# Maximum chunks to inject per turn. More chunks = richer context but
# higher token cost. 5 is a good balance for financial documents.
MAX_CHUNKS = 5

# Keywords that strongly suggest the user is asking about their own documents.
# Used for a cheap pre-filter before hitting the vector store.
DOCUMENT_INTENT_KEYWORDS = [
    "document", "uploaded", "file", "report", "statement", "according to",
    "in my", "my document", "my report", "my statement", "what does it say",
    "summarise", "summarize", "extract", "find in", "based on my",
]


# Cache of user_ids that have NO uploaded documents.
# Avoids hitting Supabase on every single message for users who haven't
# uploaded anything. Cleared when a document upload is detected.
_users_with_no_docs: set[str] = set()


def rag_node(state: AgentState) -> dict:
    """
    Retrieve relevant document chunks for the current user message.

    Algorithm:
        1. Extract the latest human message.
        2. Quick-check whether retrieval is likely useful (keyword scan).
        3. Check (cached) whether the user has any uploaded documents at all.
        4. If yes, run semantic search via the retriever.
        5. Filter results by relevance score.
        6. Return updated rag_context in the state delta.

    Returns {} (no-op) if retrieval is skipped or fails — the planner
    continues without RAG context rather than crashing.
    """
    messages = state.get("messages", [])
    user_id  = state.get("user_id", "")

    # Extract the latest human message
    query = _extract_latest_human_message(messages)
    if not query:
        return {}

    # Skip retrieval if the query almost certainly doesn't need documents
    if not _query_needs_retrieval(query, state):
        logger.debug("rag_skipped_no_intent", user_id=user_id, query=query[:60])
        return {}

    # Skip if we already know this user has no documents (cached)
    if user_id in _users_with_no_docs:
        logger.debug("rag_skipped_no_docs_cached", user_id=user_id)
        return {}

    # Quick DB check: does this user have any uploaded documents at all?
    # This is a cheap COUNT query — far cheaper than a full vector search.
    if not _user_has_documents(user_id):
        _users_with_no_docs.add(user_id)
        logger.debug("rag_skipped_no_docs", user_id=user_id)
        return {}

    # Attempt retrieval — graceful no-op on any failure
    try:
        chunks = _retrieve(query=query, user_id=user_id)
    except Exception as e:
        logger.warning("rag_retrieval_failed", user_id=user_id, error=str(e))
        return {}

    if not chunks:
        logger.debug("rag_no_results", user_id=user_id, query=query[:60])
        return {}

    logger.info(
        "rag_context_injected",
        user_id=user_id,
        chunks=len(chunks),
        query=query[:60],
    )

    return {"rag_context": chunks}


def _user_has_documents(user_id: str) -> bool:
    """Return True if the user has at least one uploaded document chunk."""
    try:
        from src.database.client import get_supabase
        db = get_supabase()
        result = db.table("document_chunks") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .limit(1) \
            .execute()
        return (result.count or 0) > 0
    except Exception as e:
        # If the table doesn't exist or query fails, don't block — allow RAG attempt
        logger.debug("rag_doc_check_failed", user_id=user_id, error=str(e))
        return True


def _retrieve(query: str, user_id: str) -> list[dict]:
    """
    Run semantic search and return formatted chunk dicts.

    Each chunk dict has the shape expected by rag_prompt.json:
        filename:    str  — original document filename
        chunk_index: int  — position in the source document
        content:     str  — the text of this chunk
        score:       float — cosine similarity (0–1)
    """
    # Import here to avoid circular imports and keep startup fast
    # when RAG is not yet configured.
    try:
        from src.rag.retriever import retrieve_chunks
    except ImportError:
        logger.warning("rag_retriever_not_available")
        return []

    raw_chunks = retrieve_chunks(
        query=query,
        user_id=user_id,
        k=MAX_CHUNKS * 2,  # Fetch extra so we can filter by score
    )

    # Filter by relevance score and cap at MAX_CHUNKS
    filtered = [
        {
            "filename":    c.get("filename", "Unknown document"),
            "chunk_index": c.get("chunk_index", 0),
            "content":     c.get("content", ""),
            "score":       round(c.get("score", 0.0), 3),
        }
        for c in raw_chunks
        if c.get("score", 0.0) >= MIN_RELEVANCE_SCORE and c.get("content", "").strip()
    ]

    return filtered[:MAX_CHUNKS]


def _extract_latest_human_message(messages: list) -> str:
    """Return the text of the most recent HumanMessage, or ''."""
    for msg in reversed(messages):
        class_name = type(msg).__name__.lower()
        if "human" in class_name:
            content = msg.content if hasattr(msg, "content") else str(msg)
            return content.strip() if isinstance(content, str) else ""
    return ""


def _query_needs_retrieval(query: str, state: AgentState) -> bool:
    """
    Lightweight heuristic — should we bother hitting the vector store?

    Returns True if:
        - The query contains document-intent keywords, OR
        - The state already has rag_context (continuing a doc conversation), OR
        - The query is long (detailed questions often reference prior documents)
    Returns False for short greetings, simple market queries, etc.
    """
    query_lower = query.lower()

    # Explicit document intent
    if any(kw in query_lower for kw in DOCUMENT_INTENT_KEYWORDS):
        return True

    # Continuing a document conversation
    if state.get("rag_context"):
        return True

    # Long detailed query — likely referring to a specific document
    if len(query.split()) > 20:
        return True

    return False