"""
AgentState — the single shared state object flowing through the LangGraph.

Every node reads from and writes to this TypedDict. LangGraph merges
the partial dicts returned by each node into the running state using
the reducer functions defined here (add_messages for the message list,
plain assignment for everything else).

New fields added in Phase 1:
    scratchpad:          list[dict]  — structured log of tool calls + results
    reasoning:           str         — chain-of-thought from the reasoning node
    hitl_pending:        bool        — True while waiting for human confirmation
"""

from typing import Annotated, Any, Optional
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class AgentState(TypedDict):
    # ── Conversation ──────────────────────────────────────────
    messages: Annotated[list, add_messages]

    # ── User context ──────────────────────────────────────────
    user_id:            str
    session_id:         str
    model_id:           str
    user_name:          str
    preferred_currency: str
    preferred_language: str
    tier:               str

    # ── Financial context ─────────────────────────────────────
    portfolio_summary:  str
    goals_summary:      str         # user's active financial goals injected at session start
    memories:           list[str]   # long-term memories injected at session start

    # ── RAG context ───────────────────────────────────────────
    rag_context:        list[dict]  # chunks retrieved by rag_node

    # ── Tool config ───────────────────────────────────────────
    enabled_tools:      Optional[list[str]]   # None = all default tools enabled

    # ── Agentic scratchpad ────────────────────────────────────
    scratchpad:         list[dict]  # internal log: tool calls, results, timings
    reasoning:          str         # chain-of-thought (internal, not shown to user)

    # ── Human-in-the-loop ────────────────────────────────────
    requires_human_review: bool     # planner sets True for risky actions
    hitl_pending:          bool     # True while graph is waiting for user decision

    # ── LLM parameters (set by user in Settings, never shown raw) ─
    temperature: float
    top_p:       float

    # ── Metrics ───────────────────────────────────────────────
    tools_used:         list[str]
    prompt_tokens:      int
    completion_tokens:  int
    cost_usd:           float

    # ── Control flow ──────────────────────────────────────────
    error:   str
    is_done: bool


def default_state(
    user_id:            str,
    session_id:         str,
    model_id:           str   = "gpt-4o-mini",
    user_name:          str   = "",
    preferred_currency: str   = "USD",
    preferred_language: str   = "en",
    tier:               str   = "free",
    temperature:        float = 0.3,
    top_p:              float = 1.0,
) -> dict:
    """Return a fully initialised default state dict for a new turn."""
    return {
        "user_id":             user_id,
        "session_id":          session_id,
        "model_id":            model_id,
        "user_name":           user_name,
        "preferred_currency":  preferred_currency,
        "preferred_language":  preferred_language,
        "tier":                tier,
        "temperature":         temperature,
        "top_p":               top_p,
        "enabled_tools":       None,
        "portfolio_summary":   "",
        "goals_summary":       "",
        "memories":            [],
        "rag_context":         [],
        "scratchpad":          [],
        "reasoning":           "",
        "tools_used":          [],
        "prompt_tokens":       0,
        "completion_tokens":   0,
        "cost_usd":            0.0,
        "error":               "",
        "requires_human_review": False,
        "hitl_pending":        False,
        "is_done":             False,
    }