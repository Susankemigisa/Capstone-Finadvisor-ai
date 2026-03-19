"""
Shared pytest fixtures for FinAdvisor AI test suite.

Design principles:
    - No real API keys required — all LLM and DB calls are mocked
    - No network calls — tests run fully offline
    - No .env file required — settings are patched per test
    - Fast — the full suite should complete in under 30 seconds

Fixtures available to all test modules:
    mock_settings       Patched Settings with fake but valid values
    fake_user           A realistic user dict (no DB required)
    fake_session_id     A fixed UUID for session tests
    mock_db             MagicMock Supabase client
    mock_llm_response   A fake LangChain AIMessage
    test_pdf_bytes      Minimal valid PDF bytes for upload tests
    test_txt_bytes      Plain text bytes for upload tests
"""

from __future__ import annotations

import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ── Patch settings before any src imports ────────────────────
# This ensures no real .env is needed to run the test suite.
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-32chars")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("OPENAI_API_KEY", "sk-test-key-not-real")
os.environ.setdefault("DATABASE_URL", "")  # Empty = use ChromaDB fallback


# ── Core fixtures ─────────────────────────────────────────────

@pytest.fixture
def fake_user_id() -> str:
    return "550e8400-e29b-41d4-a716-446655440000"


@pytest.fixture
def fake_session_id() -> str:
    return "660e8400-e29b-41d4-a716-446655440001"


@pytest.fixture
def fake_user(fake_user_id) -> dict:
    """A realistic user dict matching the users table schema."""
    return {
        "id":                   fake_user_id,
        "email":                "test@finadvisor.ai",
        "full_name":            "Test User",
        "preferred_name":       "Test",
        "preferred_model":      "gpt-4o-mini",
        "preferred_currency":   "USD",
        "preferred_language":   "en",
        "temperature":          0.3,
        "top_p":                1.0,
        "tier":                 "free",
        "is_active":            True,
        "email_verified":       True,
        "message_count_today":  0,
        "stripe_customer_id":   None,
        "subscription_status":  "inactive",
    }


@pytest.fixture
def mock_db():
    """
    Mock Supabase client — returns empty results by default.
    Individual tests can override specific table responses:

        mock_db.table("users").select().eq().execute.return_value.data = [fake_user]
    """
    db = MagicMock()
    # Default: every table operation returns empty data
    default_result = MagicMock()
    default_result.data = []
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = default_result
    db.table.return_value.insert.return_value.execute.return_value = default_result
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = default_result
    db.table.return_value.delete.return_value.eq.return_value.execute.return_value = default_result
    db.table.return_value.upsert.return_value.execute.return_value = default_result
    return db


@pytest.fixture
def mock_llm_response():
    """A fake LangChain AIMessage with no tool calls."""
    from langchain_core.messages import AIMessage
    msg = AIMessage(content="This is a test response from the AI.")
    msg.usage_metadata = {"input_tokens": 100, "output_tokens": 50}
    return msg


@pytest.fixture
def mock_llm_response_with_tool():
    """A fake LangChain AIMessage that requests a tool call."""
    from langchain_core.messages import AIMessage
    msg = AIMessage(
        content="",
        tool_calls=[{
            "id":   "call_test123",
            "name": "get_stock_price",
            "args": {"ticker": "AAPL"},
        }],
    )
    msg.usage_metadata = {"input_tokens": 120, "output_tokens": 20}
    return msg


@pytest.fixture
def test_pdf_bytes() -> bytes:
    """
    Minimal valid PDF bytes — enough for pypdf to parse without error.
    Does not require any external files.
    """
    return (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n"
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        b"4 0 obj\n<< /Length 44 >>\nstream\n"
        b"BT /F1 12 Tf 100 700 Td (Test financial document) Tj ET\n"
        b"endstream\nendobj\n"
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        b"xref\n0 6\n0000000000 65535 f\n"
        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n9\n%%EOF"
    )


@pytest.fixture
def test_txt_bytes() -> bytes:
    """Plain text document bytes for RAG ingestion tests."""
    return (
        b"Annual Financial Report 2024\n\n"
        b"Total Revenue: $1,250,000\n"
        b"Operating Expenses: $890,000\n"
        b"Net Profit: $360,000\n\n"
        b"Investment Portfolio Summary:\n"
        b"- Apple Inc (AAPL): 100 shares at $175.00\n"
        b"- Microsoft Corp (MSFT): 50 shares at $380.00\n"
        b"- S&P 500 ETF (SPY): 200 shares at $450.00\n\n"
        b"Risk Assessment: Medium risk portfolio with diversified holdings.\n"
        b"Recommended action: Rebalance quarterly.\n"
    )


@pytest.fixture
def valid_access_token(fake_user) -> str:
    """A real signed JWT access token for the fake user."""
    from src.auth.jwt_handler import create_access_token
    return create_access_token(
        user_id=fake_user["id"],
        email=fake_user["email"],
    )


@pytest.fixture
def auth_headers(valid_access_token) -> dict:
    """Authorization headers dict ready to pass to test client requests."""
    return {"Authorization": f"Bearer {valid_access_token}"}
