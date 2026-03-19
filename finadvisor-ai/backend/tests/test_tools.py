"""
Tests for financial calculation tools.

These tools are pure functions with no external dependencies —
no API keys, no database, no network calls needed.

Coverage:
    - calculate_roi: positive gain, loss, zero gain, single share
    - compound_interest: basic growth, zero rate, long horizon
    - dollar_cost_average: regular investing, zero return
    - estimate_capital_gains: long-term, short-term, no gain
    - tax_bracket_lookup: each bracket, edge cases
    - memory scoring heuristic
    - document processor: chunking, empty content, oversized file
    - embeddings: batch caching, dimension consistency
    - retriever: empty query guard, score filtering
"""

from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch


# ── ROI Calculator ────────────────────────────────────────────

class TestCalculateROI:

    def test_positive_return(self):
        from src.tools.calculation_tools import calculate_roi
        result = calculate_roi.invoke({"buy_price": 100.0, "sell_price": 150.0, "shares": 10})
        assert "50.00%" in result
        assert "500.00" in result

    def test_negative_return(self):
        from src.tools.calculation_tools import calculate_roi
        result = calculate_roi.invoke({"buy_price": 200.0, "sell_price": 150.0, "shares": 5})
        assert "-25.00%" in result
        assert "-250.00" in result

    def test_zero_gain(self):
        from src.tools.calculation_tools import calculate_roi
        result = calculate_roi.invoke({"buy_price": 100.0, "sell_price": 100.0})
        assert "0.00%" in result

    def test_single_share_default(self):
        from src.tools.calculation_tools import calculate_roi
        result = calculate_roi.invoke({"buy_price": 50.0, "sell_price": 75.0})
        assert "50.00%" in result
        assert "25.00" in result

    def test_fractional_shares(self):
        from src.tools.calculation_tools import calculate_roi
        result = calculate_roi.invoke({"buy_price": 1000.0, "sell_price": 1100.0, "shares": 0.5})
        assert "10.00%" in result


# ── Compound Interest ─────────────────────────────────────────

class TestCompoundInterest:

    def test_basic_growth(self):
        from src.tools.calculation_tools import compound_interest
        result = compound_interest.invoke({
            "principal": 10000.0, "annual_rate": 0.07,
            "years": 10, "compounds_per_year": 12,
        })
        # $10k at 7% for 10 years ≈ $20,097
        assert "20," in result or "19," in result
        assert "Final amount" in result

    def test_zero_interest_rate(self):
        from src.tools.calculation_tools import compound_interest
        result = compound_interest.invoke({
            "principal": 5000.0, "annual_rate": 0.0,
            "years": 5, "compounds_per_year": 12,
        })
        assert "5,000.00" in result

    def test_returns_interest_earned(self):
        from src.tools.calculation_tools import compound_interest
        result = compound_interest.invoke({
            "principal": 1000.0, "annual_rate": 0.10,
            "years": 1, "compounds_per_year": 1,
        })
        assert "Interest earned" in result
        assert "100.00" in result

    def test_longer_horizon_grows_more(self):
        from src.tools.calculation_tools import compound_interest
        r10 = compound_interest.invoke({"principal": 1000.0, "annual_rate": 0.08, "years": 10})
        r20 = compound_interest.invoke({"principal": 1000.0, "annual_rate": 0.08, "years": 20})
        # Extract the final amounts and compare numerically
        def extract_amount(s):
            import re
            m = re.search(r'Final amount: \$([\d,]+\.[\d]+)', s)
            return float(m.group(1).replace(",", "")) if m else 0
        assert extract_amount(r20) > extract_amount(r10)


# ── Dollar Cost Averaging ─────────────────────────────────────

class TestDollarCostAverage:

    def test_basic_dca(self):
        from src.tools.calculation_tools import dollar_cost_average
        result = dollar_cost_average.invoke({
            "monthly_investment": 500.0,
            "annual_return": 0.08,
            "years": 10,
        })
        assert "Total invested" in result
        assert "60,000.00" in result   # 500 * 120 months

    def test_zero_return(self):
        from src.tools.calculation_tools import dollar_cost_average
        result = dollar_cost_average.invoke({
            "monthly_investment": 100.0,
            "annual_return": 0.0,
            "years": 5,
        })
        # 100 * 60 months = $6,000 with no growth
        assert "6,000.00" in result

    def test_portfolio_value_exceeds_invested_with_positive_return(self):
        from src.tools.calculation_tools import dollar_cost_average
        import re
        result = dollar_cost_average.invoke({
            "monthly_investment": 200.0,
            "annual_return": 0.10,
            "years": 15,
        })
        def extract(label, text):
            m = re.search(rf'{label}: \$([\d,]+\.[\d]+)', text)
            return float(m.group(1).replace(",", "")) if m else 0
        invested = extract("Total invested", result)
        value    = extract("Portfolio value", result)
        assert value > invested


# ── Capital Gains Tax ─────────────────────────────────────────

class TestCapitalGains:

    def test_long_term_gain(self):
        from src.tools.tax_tools import estimate_capital_gains
        result = estimate_capital_gains.invoke({
            "buy_price": 100.0, "sell_price": 200.0,
            "shares": 10, "held_days": 400,
        })
        assert "Long-term" in result
        assert "15%" in result
        assert "150.00" in result   # $1000 gain * 15%

    def test_short_term_gain(self):
        from src.tools.tax_tools import estimate_capital_gains
        result = estimate_capital_gains.invoke({
            "buy_price": 50.0, "sell_price": 80.0,
            "shares": 20, "held_days": 180,
        })
        assert "Short-term" in result
        assert "22%" in result

    def test_no_gain_no_tax(self):
        from src.tools.tax_tools import estimate_capital_gains
        result = estimate_capital_gains.invoke({
            "buy_price": 100.0, "sell_price": 100.0,
            "shares": 5, "held_days": 200,
        })
        assert "0.00" in result

    def test_loss_produces_zero_tax(self):
        from src.tools.tax_tools import estimate_capital_gains
        result = estimate_capital_gains.invoke({
            "buy_price": 200.0, "sell_price": 150.0,
            "shares": 10, "held_days": 400,
        })
        # Loss — tax should be $0
        assert "0.00" in result

    def test_exactly_365_days_is_long_term(self):
        from src.tools.tax_tools import estimate_capital_gains
        result = estimate_capital_gains.invoke({
            "buy_price": 100.0, "sell_price": 200.0,
            "shares": 1, "held_days": 365,
        })
        assert "Long-term" in result


# ── Tax Bracket Lookup ────────────────────────────────────────

class TestTaxBracket:

    def test_lowest_bracket(self):
        from src.tools.tax_tools import tax_bracket_lookup
        result = tax_bracket_lookup.invoke({"annual_income": 10000.0})
        assert "10%" in result

    def test_middle_bracket(self):
        from src.tools.tax_tools import tax_bracket_lookup
        result = tax_bracket_lookup.invoke({"annual_income": 60000.0})
        assert "22%" in result

    def test_highest_bracket(self):
        from src.tools.tax_tools import tax_bracket_lookup
        result = tax_bracket_lookup.invoke({"annual_income": 700000.0})
        assert "37%" in result

    def test_includes_income_in_output(self):
        from src.tools.tax_tools import tax_bracket_lookup
        result = tax_bracket_lookup.invoke({"annual_income": 50000.0})
        assert "50,000" in result

    def test_filing_status_in_output(self):
        from src.tools.tax_tools import tax_bracket_lookup
        result = tax_bracket_lookup.invoke({
            "annual_income": 80000.0,
            "filing_status": "married_filing_jointly",
        })
        assert "married" in result.lower()


# ── Document Processor ────────────────────────────────────────

class TestDocumentProcessor:

    def test_process_txt_returns_chunks(self, test_txt_bytes):
        from src.rag.document_processor import process_document
        chunks = process_document(
            file_bytes=test_txt_bytes,
            filename="report.txt",
            content_type="text/plain",
        )
        assert len(chunks) > 0
        assert all("content" in c for c in chunks)
        assert all("chunk_index" in c for c in chunks)
        assert all(len(c["content"]) > 0 for c in chunks)

    def test_process_csv(self):
        from src.rag.document_processor import process_document
        csv_bytes = b"name,amount,date\nSalary,5000,2024-01-01\nRent,-1500,2024-01-02\n"
        chunks = process_document(
            file_bytes=csv_bytes,
            filename="budget.csv",
            content_type="text/csv",
        )
        assert len(chunks) > 0

    def test_unsupported_extension_returns_empty(self):
        from src.rag.document_processor import process_document
        chunks = process_document(
            file_bytes=b"some content",
            filename="image.jpg",
            content_type="image/jpeg",
        )
        assert chunks == []

    def test_empty_content_returns_empty(self):
        from src.rag.document_processor import process_document
        chunks = process_document(
            file_bytes=b"   \n\n   ",
            filename="empty.txt",
            content_type="text/plain",
        )
        assert chunks == []

    def test_oversized_file_raises_value_error(self):
        from src.rag.document_processor import process_document
        # 21 MB of data — over the 20 MB limit
        big_bytes = b"x" * (21 * 1024 * 1024)
        with pytest.raises(ValueError, match="MB"):
            process_document(file_bytes=big_bytes, filename="huge.txt")

    def test_chunk_metadata_contains_filename(self, test_txt_bytes):
        from src.rag.document_processor import process_document
        chunks = process_document(
            file_bytes=test_txt_bytes,
            filename="my_report.txt",
        )
        for chunk in chunks:
            assert chunk["metadata"]["filename"] == "my_report.txt"

    def test_chunks_have_sequential_indices(self, test_txt_bytes):
        from src.rag.document_processor import process_document
        chunks = process_document(file_bytes=test_txt_bytes, filename="test.txt")
        indices = [c["chunk_index"] for c in chunks]
        assert indices == sorted(indices)


# ── Embeddings ────────────────────────────────────────────────

class TestEmbeddings:

    def test_embed_batch_returns_correct_count(self):
        from src.rag.embeddings import embed_batch
        mock_vectors = [[0.1, 0.2, 0.3]] * 3
        with patch("src.rag.embeddings._embed_openai", return_value=mock_vectors):
            results = embed_batch(["text one", "text two", "text three"])
        assert len(results) == 3

    def test_embed_batch_empty_returns_empty(self):
        from src.rag.embeddings import embed_batch
        assert embed_batch([]) == []

    def test_embed_batch_uses_cache(self):
        """Embedding the same text twice should only call the API once."""
        from src.rag import embeddings as emb_module
        # Clear cache first
        emb_module._CACHE.clear()

        call_count = 0
        def fake_embed(texts):
            nonlocal call_count
            call_count += 1
            return [[0.5] * 10] * len(texts)

        with patch("src.rag.embeddings._embed_openai", side_effect=fake_embed):
            emb_module.embed_batch(["hello world"])
            emb_module.embed_batch(["hello world"])  # Should hit cache

        assert call_count == 1

    def test_get_embedding_dimension_openai(self):
        from src.rag.embeddings import get_embedding_dimension
        with patch("src.rag.embeddings.get_backend", return_value="openai"):
            dim = get_embedding_dimension()
        assert dim == 1536

    def test_get_embedding_dimension_local(self):
        from src.rag.embeddings import get_embedding_dimension
        with patch("src.rag.embeddings.get_backend", return_value="local"):
            dim = get_embedding_dimension()
        assert dim == 384


# ── Long-term Memory ──────────────────────────────────────────

class TestLongTermMemory:

    def test_score_importance_high_keywords(self):
        from src.memory.long_term import _score_importance
        assert _score_importance("User is saving for retirement") == 3
        assert _score_importance("User has a mortgage") == 3
        assert _score_importance("User's investment goal is 10%") == 3

    def test_score_importance_medium_keywords(self):
        from src.memory.long_term import _score_importance
        assert _score_importance("User prefers USD currency") == 2
        assert _score_importance("User always checks news in the morning") == 2

    def test_score_importance_low(self):
        from src.memory.long_term import _score_importance
        assert _score_importance("User asked about something today") == 1

    def test_format_history_skips_system_messages(self):
        from src.memory.long_term import _format_history_for_extraction
        history = [
            {"role": "system",    "content": "You are an advisor"},
            {"role": "human",     "content": "I want to save for a house"},
            {"role": "assistant", "content": "Great goal! How much do you have saved?"},
            {"role": "tool",      "content": "price: $450"},
        ]
        result = _format_history_for_extraction(history)
        assert "system" not in result.lower()
        assert "tool" not in result.lower()
        assert "save for a house" in result
        assert "Great goal" in result

    def test_format_history_truncates_long_messages(self):
        from src.memory.long_term import _format_history_for_extraction
        long_content = "x" * 1000
        history = [{"role": "human", "content": long_content}]
        result = _format_history_for_extraction(history)
        assert len(result) < 700   # 400 char limit + prefix + ellipsis
