"""
RAG A/B testing — compare retrieval strategies to improve quality.

Runs two retrieval strategies in parallel on the same query and logs
which one returns higher-scoring, more relevant results. Results are
stored in Supabase for offline analysis.

Strategies compared:
    A (baseline):  Standard cosine similarity, k=5
    B (challenger): Higher k with re-ranking by score variance

This is an internal evaluation tool — it never affects the live agent.
It's triggered by the POST /documents/ab-test endpoint (admin only).

AB test result table (add to SUPABASE_MIGRATION.sql):
    CREATE TABLE IF NOT EXISTS rag_ab_tests (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid        NOT NULL,
        query         text        NOT NULL,
        strategy_a    jsonb       NOT NULL DEFAULT '{}',
        strategy_b    jsonb       NOT NULL DEFAULT '{}',
        winner        text,       -- 'A' | 'B' | 'tie'
        created_at    timestamptz NOT NULL DEFAULT now()
    );
"""

from __future__ import annotations

import time
from typing import Literal

from src.rag.embeddings   import embed_text
from src.rag.vector_store import similarity_search
from src.utils.logger     import get_logger

logger = get_logger(__name__)

Winner = Literal["A", "B", "tie"]


async def run_ab_test(
    query:   str,
    user_id: str,
) -> dict:
    """
    Run both retrieval strategies and return a comparison report.

    Returns:
        {
            query:     str,
            strategy_a: { chunks, avg_score, latency_ms },
            strategy_b: { chunks, avg_score, latency_ms },
            winner:    "A" | "B" | "tie",
            summary:   str   (human-readable conclusion)
        }
    """
    try:
        query_embedding = embed_text(query)
    except Exception as e:
        return {"error": f"Embedding failed: {e}"}

    # Run both strategies
    result_a = _strategy_a(query_embedding, user_id)
    result_b = _strategy_b(query_embedding, user_id)

    winner = _pick_winner(result_a, result_b)
    summary = _build_summary(result_a, result_b, winner)

    report = {
        "query":      query,
        "strategy_a": result_a,
        "strategy_b": result_b,
        "winner":     winner,
        "summary":    summary,
    }

    # Persist result for offline analysis
    _save_result(user_id, report)

    return report


def _strategy_a(query_embedding: list[float], user_id: str) -> dict:
    """
    Strategy A (baseline): cosine similarity, k=5, no re-ranking.
    This is what the live agent uses.
    """
    t0 = time.perf_counter()
    try:
        chunks = similarity_search(query_embedding=query_embedding, user_id=user_id, k=5)
    except Exception as e:
        return {"chunks": [], "avg_score": 0.0, "latency_ms": 0, "error": str(e)}

    elapsed = round((time.perf_counter() - t0) * 1000)
    scores  = [c.get("score", 0.0) for c in chunks]
    avg     = sum(scores) / len(scores) if scores else 0.0

    return {
        "strategy":    "baseline_cosine_k5",
        "chunks":      [_slim_chunk(c) for c in chunks],
        "count":       len(chunks),
        "avg_score":   round(avg, 4),
        "max_score":   round(max(scores, default=0.0), 4),
        "min_score":   round(min(scores, default=0.0), 4),
        "latency_ms":  elapsed,
    }


def _strategy_b(query_embedding: list[float], user_id: str) -> dict:
    """
    Strategy B (challenger): fetch more results (k=10), then re-rank
    by a combined score of relevance + content length diversity.

    Hypothesis: fetching extra candidates and re-ranking avoids
    returning multiple near-duplicate chunks from the same document.
    """
    t0 = time.perf_counter()
    try:
        raw = similarity_search(query_embedding=query_embedding, user_id=user_id, k=10)
    except Exception as e:
        return {"chunks": [], "avg_score": 0.0, "latency_ms": 0, "error": str(e)}

    # Re-rank: penalise chunks from the same document to improve diversity
    reranked = _diversity_rerank(raw, top_k=5)

    elapsed = round((time.perf_counter() - t0) * 1000)
    scores  = [c.get("score", 0.0) for c in reranked]
    avg     = sum(scores) / len(scores) if scores else 0.0

    return {
        "strategy":    "diversity_rerank_k10",
        "chunks":      [_slim_chunk(c) for c in reranked],
        "count":       len(reranked),
        "avg_score":   round(avg, 4),
        "max_score":   round(max(scores, default=0.0), 4),
        "min_score":   round(min(scores, default=0.0), 4),
        "latency_ms":  elapsed,
    }


def _diversity_rerank(chunks: list[dict], top_k: int) -> list[dict]:
    """
    Greedy diversity re-ranking — iteratively selects the next chunk
    that is from a different document than previously selected ones
    when possible, while still prioritising high scores.
    """
    if not chunks:
        return []

    selected: list[dict] = []
    used_docs: set[str]  = set()
    remaining = sorted(chunks, key=lambda c: c.get("score", 0.0), reverse=True)

    # First pass: pick best chunk from each document
    for chunk in remaining:
        doc_id = chunk.get("document_id", "")
        if doc_id not in used_docs:
            selected.append(chunk)
            used_docs.add(doc_id)
        if len(selected) >= top_k:
            break

    # Second pass: fill remaining slots with highest-score duplicates
    if len(selected) < top_k:
        for chunk in remaining:
            if chunk not in selected:
                selected.append(chunk)
            if len(selected) >= top_k:
                break

    return selected[:top_k]


def _pick_winner(a: dict, b: dict) -> Winner:
    """
    Declare a winner based on avg_score with a minimum margin.
    Within ±0.01 of each other is a tie.
    """
    score_a = a.get("avg_score", 0.0)
    score_b = b.get("avg_score", 0.0)

    if abs(score_a - score_b) < 0.01:
        return "tie"
    return "A" if score_a > score_b else "B"


def _build_summary(a: dict, b: dict, winner: Winner) -> str:
    if winner == "tie":
        return (
            f"Both strategies performed similarly "
            f"(A: {a['avg_score']:.3f}, B: {b['avg_score']:.3f}). "
            "Keep the baseline (Strategy A) for lower latency."
        )
    better  = a if winner == "A" else b
    worse   = b if winner == "A" else a
    margin  = abs(better["avg_score"] - worse["avg_score"])
    return (
        f"Strategy {winner} ({better['strategy']}) wins with avg score "
        f"{better['avg_score']:.3f} vs {worse['avg_score']:.3f} "
        f"(+{margin:.3f} margin). "
        f"Latency: {better['latency_ms']}ms vs {worse['latency_ms']}ms."
    )


def _slim_chunk(chunk: dict) -> dict:
    """Return a compact chunk representation for the report (no full content)."""
    return {
        "filename":    chunk.get("filename", ""),
        "chunk_index": chunk.get("chunk_index", 0),
        "score":       round(chunk.get("score", 0.0), 4),
        "preview":     chunk.get("content", "")[:120] + "...",
    }


def _save_result(user_id: str, report: dict) -> None:
    """Persist the A/B test result to Supabase for later analysis."""
    try:
        from src.database.client import get_supabase_safe
        db = get_supabase_safe()
        if not db:
            return
        db.table("rag_ab_tests").insert({
            "user_id":    user_id,
            "query":      report["query"],
            "strategy_a": report["strategy_a"],
            "strategy_b": report["strategy_b"],
            "winner":     report["winner"],
        }).execute()
    except Exception as e:
        logger.warning("ab_test_save_failed", user_id=user_id, error=str(e))
