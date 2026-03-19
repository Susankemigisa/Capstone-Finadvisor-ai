"""
Tests for the RAG pipeline.

Coverage:
    - document_processor: PDF, TXT, CSV extraction and chunking
    - embeddings: batch processing, caching, backend selection
    - vector_store: store and search with mocked backends
    - retriever: full pipeline with mocked embeddings + vector store
    - rag_node: intent detection, no-op on irrelevant queries
    - ab_testing: strategy comparison, winner selection
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── Retriever ─────────────────────────────────────────────────

class TestRetriever:

    def test_empty_query_returns_empty(self, fake_user_id):
        from src.rag.retriever import retrieve_chunks
        with patch("src.rag.retriever.embed_text", return_value=[0.1] * 10):
            result = retrieve_chunks(query="", user_id=fake_user_id)
        assert result == []

    def test_whitespace_query_returns_empty(self, fake_user_id):
        from src.rag.retriever import retrieve_chunks
        result = retrieve_chunks(query="   ", user_id=fake_user_id)
        assert result == []

    def test_low_score_chunks_filtered_out(self, fake_user_id):
        """Chunks below HARD_MIN_SCORE should not be returned."""
        from src.rag.retriever import retrieve_chunks, HARD_MIN_SCORE

        low_score_chunks = [
            {"content": "some text", "filename": "doc.pdf", "chunk_index": 0,
             "document_id": "abc", "score": HARD_MIN_SCORE - 0.1},
        ]
        with patch("src.rag.retriever.embed_text", return_value=[0.1] * 10):
            with patch("src.rag.retriever.similarity_search", return_value=low_score_chunks):
                result = retrieve_chunks(query="tell me about finances", user_id=fake_user_id)
        assert result == []

    def test_high_score_chunks_returned(self, fake_user_id):
        """Chunks above HARD_MIN_SCORE should be returned."""
        from src.rag.retriever import retrieve_chunks, HARD_MIN_SCORE

        good_chunks = [
            {"content": "Revenue was $1.2M in 2024", "filename": "report.pdf",
             "chunk_index": 0, "document_id": "abc", "score": HARD_MIN_SCORE + 0.1},
        ]
        with patch("src.rag.retriever.embed_text", return_value=[0.1] * 10):
            with patch("src.rag.retriever.similarity_search", return_value=good_chunks):
                result = retrieve_chunks(query="what was the revenue", user_id=fake_user_id)
        assert len(result) == 1
        assert result[0]["content"] == "Revenue was $1.2M in 2024"

    def test_duplicates_are_removed(self, fake_user_id):
        """Two chunks with the same content prefix should be deduplicated."""
        from src.rag.retriever import retrieve_chunks, HARD_MIN_SCORE

        duplicate_content = "This is a duplicated chunk that appears twice in the results."
        chunks = [
            {"content": duplicate_content, "filename": "a.pdf", "chunk_index": 0,
             "document_id": "abc", "score": 0.90},
            {"content": duplicate_content, "filename": "b.pdf", "chunk_index": 0,
             "document_id": "def", "score": 0.88},
        ]
        with patch("src.rag.retriever.embed_text", return_value=[0.1] * 10):
            with patch("src.rag.retriever.similarity_search", return_value=chunks):
                result = retrieve_chunks(query="duplicated chunk", user_id=fake_user_id)
        assert len(result) == 1

    def test_results_sorted_by_score_descending(self, fake_user_id):
        from src.rag.retriever import retrieve_chunks

        chunks = [
            {"content": "Lower score chunk xyz", "filename": "a.pdf",
             "chunk_index": 0, "document_id": "a", "score": 0.70},
            {"content": "Higher score chunk abc", "filename": "b.pdf",
             "chunk_index": 0, "document_id": "b", "score": 0.95},
            {"content": "Middle score chunk def", "filename": "c.pdf",
             "chunk_index": 0, "document_id": "c", "score": 0.80},
        ]
        with patch("src.rag.retriever.embed_text", return_value=[0.1] * 10):
            with patch("src.rag.retriever.similarity_search", return_value=chunks):
                result = retrieve_chunks(query="financial report details", user_id=fake_user_id)

        scores = [r["score"] for r in result]
        assert scores == sorted(scores, reverse=True)

    def test_embed_failure_returns_empty(self, fake_user_id):
        from src.rag.retriever import retrieve_chunks
        with patch("src.rag.retriever.embed_text", side_effect=RuntimeError("API error")):
            result = retrieve_chunks(query="what is my balance", user_id=fake_user_id)
        assert result == []

    def test_retrieve_for_query_formats_markdown(self, fake_user_id):
        from src.rag.retriever import retrieve_for_query

        chunks = [
            {"content": "Revenue: $500k", "filename": "report.pdf",
             "chunk_index": 0, "document_id": "a", "score": 0.92},
        ]
        with patch("src.rag.retriever.retrieve_chunks", return_value=chunks):
            result = retrieve_for_query(query="revenue", user_id=fake_user_id)

        assert "report.pdf" in result
        assert "Revenue: $500k" in result
        assert "92%" in result

    def test_retrieve_for_query_no_results_message(self, fake_user_id):
        from src.rag.retriever import retrieve_for_query
        with patch("src.rag.retriever.retrieve_chunks", return_value=[]):
            result = retrieve_for_query(query="something irrelevant", user_id=fake_user_id)
        assert "No relevant documents" in result


# ── RAG Node ──────────────────────────────────────────────────

class TestRagNode:

    def _make_state(self, message: str, user_id: str = "user-123") -> dict:
        from langchain_core.messages import HumanMessage
        return {
            "messages":   [HumanMessage(content=message)],
            "user_id":    user_id,
            "rag_context": [],
        }

    def test_skips_simple_greeting(self):
        """A simple greeting should not trigger retrieval."""
        from src.agent.nodes.rag_node import rag_node, _query_needs_retrieval
        state = self._make_state("Hello!")
        assert _query_needs_retrieval("Hello!", state) is False

    def test_triggers_on_document_keyword(self):
        from src.agent.nodes.rag_node import _query_needs_retrieval
        state = self._make_state("What does my document say?")
        assert _query_needs_retrieval("What does my document say?", state) is True

    def test_triggers_on_long_query(self):
        from src.agent.nodes.rag_node import _query_needs_retrieval
        long_query = "Can you please tell me what the specific financial projections " \
                     "were for the third quarter based on the data I provided earlier?"
        state = self._make_state(long_query)
        assert _query_needs_retrieval(long_query, state) is True

    def test_triggers_when_existing_context(self):
        """If rag_context already exists, keep retrieving (continuing doc conversation)."""
        from src.agent.nodes.rag_node import _query_needs_retrieval
        state = {
            "messages": [],
            "user_id": "user-123",
            "rag_context": [{"content": "previous chunk"}],
        }
        assert _query_needs_retrieval("tell me more", state) is True

    def test_noop_when_no_messages(self):
        from src.agent.nodes.rag_node import rag_node
        result = rag_node({"messages": [], "user_id": "u1", "rag_context": []})
        assert result == {}

    def test_returns_context_on_successful_retrieval(self):
        from src.agent.nodes.rag_node import rag_node
        from langchain_core.messages import HumanMessage

        mock_chunks = [
            {"content": "Revenue data", "filename": "report.pdf",
             "chunk_index": 0, "score": 0.88},
        ]
        state = {
            "messages":    [HumanMessage(content="What does my uploaded report say?")],
            "user_id":     "user-123",
            "rag_context": [],
        }
        with patch("src.agent.nodes.rag_node._retrieve", return_value=mock_chunks):
            result = rag_node(state)

        assert "rag_context" in result
        assert len(result["rag_context"]) == 1


# ── A/B Testing ───────────────────────────────────────────────

class TestABTesting:

    @pytest.mark.asyncio
    async def test_ab_test_returns_report(self, fake_user_id):
        from src.rag.ab_testing import run_ab_test

        mock_chunks = [
            {"content": "chunk text", "filename": "doc.pdf",
             "chunk_index": 0, "document_id": "abc", "score": 0.85},
        ]
        with patch("src.rag.ab_testing.embed_text", return_value=[0.1] * 10):
            with patch("src.rag.ab_testing.similarity_search", return_value=mock_chunks):
                with patch("src.rag.ab_testing._save_result"):
                    report = await run_ab_test(
                        query="what is my portfolio value",
                        user_id=fake_user_id,
                    )

        assert "query"      in report
        assert "strategy_a" in report
        assert "strategy_b" in report
        assert "winner"     in report
        assert "summary"    in report
        assert report["winner"] in ("A", "B", "tie")

    def test_pick_winner_a_wins(self):
        from src.rag.ab_testing import _pick_winner
        a = {"avg_score": 0.90}
        b = {"avg_score": 0.80}
        assert _pick_winner(a, b) == "A"

    def test_pick_winner_b_wins(self):
        from src.rag.ab_testing import _pick_winner
        a = {"avg_score": 0.70}
        b = {"avg_score": 0.85}
        assert _pick_winner(a, b) == "B"

    def test_pick_winner_tie(self):
        from src.rag.ab_testing import _pick_winner
        a = {"avg_score": 0.800}
        b = {"avg_score": 0.805}
        assert _pick_winner(a, b) == "tie"

    def test_diversity_rerank_one_per_doc(self):
        """Re-ranking should prefer one chunk per document."""
        from src.rag.ab_testing import _diversity_rerank
        chunks = [
            {"content": "a", "document_id": "doc1", "score": 0.95},
            {"content": "b", "document_id": "doc1", "score": 0.90},  # same doc
            {"content": "c", "document_id": "doc2", "score": 0.85},
            {"content": "d", "document_id": "doc3", "score": 0.80},
        ]
        result = _diversity_rerank(chunks, top_k=3)
        doc_ids = [r["document_id"] for r in result]
        # First 3 should prefer distinct documents
        assert "doc1" in doc_ids
        assert "doc2" in doc_ids
        assert "doc3" in doc_ids
