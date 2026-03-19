"""
Retriever — orchestrates embedding + vector search for the RAG node.

This is the module imported by rag_node.py. It combines:
    1. embeddings.embed_text()  — embed the user query
    2. vector_store.similarity_search()  — find relevant chunks
    3. Post-processing: deduplication, score filtering, context enrichment

Public API:
    retrieve_chunks(query, user_id, k) → list[dict]
    user_has_documents(user_id)        → bool
"""

from __future__ import annotations

from src.rag.embeddings   import embed_text
from src.rag.vector_store import similarity_search, get_user_documents
from src.utils.logger     import get_logger

logger = get_logger(__name__)

# Hard minimum score — chunks below this are never returned regardless
# of how many results were requested. Set in rag_node.py as well, but
# this acts as a second gate at the retriever level.
HARD_MIN_SCORE = 0.65


def retrieve_chunks(
    query:   str,
    user_id: str,
    k:       int = 10,
) -> list[dict]:
    """
    Main retrieval entry point called by rag_node.

    Pipeline:
        query → embed → similarity_search → deduplicate → score_filter → return

    Returns list of chunk dicts ordered by score descending:
        content, filename, chunk_index, document_id, score

    Returns [] on any failure so the agent continues without RAG context.
    """
    if not query or not query.strip():
        return []

    # 1. Embed the query
    try:
        query_embedding = embed_text(query)
    except Exception as e:
        logger.warning("retriever_embed_failed", user_id=user_id, error=str(e))
        return []

    # 2. Vector search
    try:
        raw_results = similarity_search(
            query_embedding=query_embedding,
            user_id=user_id,
            k=k,
        )
    except Exception as e:
        logger.warning("retriever_search_failed", user_id=user_id, error=str(e))
        return []

    if not raw_results:
        return []

    # 3. Score filter
    filtered = [r for r in raw_results if r.get("score", 0.0) >= HARD_MIN_SCORE]

    # 4. Deduplicate by content (same chunk from two queries)
    seen_content: set[str] = set()
    deduped = []
    for chunk in filtered:
        content_key = chunk["content"][:100]  # First 100 chars as fingerprint
        if content_key not in seen_content:
            seen_content.add(content_key)
            deduped.append(chunk)

    # 5. Sort by score descending and cap
    deduped.sort(key=lambda c: c.get("score", 0.0), reverse=True)
    final = deduped[:k]

    logger.info(
        "retrieval_complete",
        user_id=user_id,
        query_preview=query[:60],
        raw=len(raw_results),
        filtered=len(filtered),
        returned=len(final),
    )

    return final


def user_has_documents(user_id: str) -> bool:
    """
    Quick check — does this user have any uploaded documents?

    Used by rag_node to skip retrieval entirely for users who have
    never uploaded anything (avoids embedding cost on every message).
    """
    try:
        docs = get_user_documents(user_id)
        return len(docs) > 0
    except Exception:
        return False


def retrieve_for_query(
    query:   str,
    user_id: str,
    k:       int = 5,
) -> str:
    """
    Convenience wrapper — returns a formatted context string instead
    of raw chunk dicts. Used by the search_documents tool.

    Returns a markdown-formatted context block or a "no results" message.
    """
    chunks = retrieve_chunks(query=query, user_id=user_id, k=k)

    if not chunks:
        return "No relevant documents found for this query."

    sections = []
    for i, chunk in enumerate(chunks, 1):
        filename = chunk.get("filename", "Unknown document")
        score    = chunk.get("score", 0.0)
        content  = chunk.get("content", "")
        sections.append(
            f"**[{i}] {filename}** (relevance: {score:.0%})\n{content}"
        )

    return "\n\n---\n\n".join(sections)
