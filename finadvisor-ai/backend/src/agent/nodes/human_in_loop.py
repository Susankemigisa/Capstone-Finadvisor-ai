"""
Human-in-the-loop (HITL) — interrupt gate for sensitive actions.

This module provides two things:

1. should_require_human_review(state) — called by the graph's conditional
   edge BEFORE tool execution. Returns True if the pending tool calls
   contain a sensitive action that requires user confirmation.

2. human_review_node(state) — the graph node that handles a HITL interrupt.
   When LangGraph hits an interrupt() call, it pauses the graph and surfaces
   a confirmation payload to the API layer. The chat route sends this to the
   frontend. The user clicks Confirm or Cancel. The frontend resumes the graph
   with the user's decision injected back into state.

Trigger conditions (configured by __init__ answers):
    - Adding or removing portfolio positions
    - Modifying budget or tax records  
    - Risky queries flagged by the planner (requires_human_review=True)

Flow:
    planner → [conditional: needs_review?]
                   YES → human_review_node → (interrupt) → resume → tools
                   NO  → tools
"""

from __future__ import annotations

from langgraph.types import interrupt

from src.agent.state import AgentState
from src.utils.logger import get_logger

logger = get_logger(__name__)

# Tools that ALWAYS require explicit user confirmation before execution.
# These modify persistent financial data — the cost of an accidental action
# (e.g. deleting a portfolio position) outweighs the friction of a confirm step.
SENSITIVE_TOOLS: set[str] = {
    # Portfolio mutations
    "add_position",
    "remove_position",
    # Budget mutations
    "add_expense",
    "add_income",
    # Tax record mutations
    "add_tax_record",
    "update_tax_record",
    "delete_tax_record",
}

# Human-readable descriptions shown in the confirmation dialog.
TOOL_ACTION_DESCRIPTIONS: dict[str, str] = {
    "add_position":      "Add a new position to your portfolio",
    "remove_position":   "Remove a position from your portfolio",
    "add_expense":       "Log a new expense in your budget",
    "add_income":        "Log a new income entry in your budget",
    "add_tax_record":    "Create a new tax record",
    "update_tax_record": "Update an existing tax record",
    "delete_tax_record": "Permanently delete a tax record",
}


def should_require_human_review(state: AgentState) -> str:
    """
    Conditional edge function — decides whether to interrupt for review.

    Returns:
        "review"  → route to human_review_node
        "tools"   → route directly to tool_executor_node
        "end"     → no tool calls, go to END
    """
    # If the planner flagged this turn as high-risk
    if state.get("requires_human_review"):
        logger.info(
            "hitl_triggered_by_planner",
            user_id=state.get("user_id"),
        )
        return "review"

    messages = state.get("messages", [])
    if not messages:
        return "end"

    last_message = messages[-1]
    if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
        return "end"

    # Check whether any pending tool call is in the sensitive set
    pending_tool_names = {
        tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "")
        for tc in last_message.tool_calls
    }

    sensitive_pending = pending_tool_names & SENSITIVE_TOOLS
    if sensitive_pending:
        logger.info(
            "hitl_triggered_by_tool",
            user_id=state.get("user_id"),
            tools=list(sensitive_pending),
        )
        return "review"

    return "tools"


def human_review_node(state: AgentState) -> dict:
    """
    HITL interrupt node — surfaces a confirmation request to the user.

    When this node runs, it calls LangGraph's interrupt() which:
      1. Pauses graph execution and saves the current state checkpoint.
      2. Returns an interrupt payload to the caller (the chat route).
      3. Waits until the graph is resumed with a Command.

    The chat route extracts the interrupt payload and sends it to the
    frontend as a special SSE event:
        event: hitl_review
        data: { action, tool_calls, session_id }

    The frontend renders a confirmation dialog. On Confirm, it calls:
        POST /chat/resume  { session_id, approved: true }
    On Cancel:
        POST /chat/resume  { session_id, approved: false }

    The /chat/resume endpoint resumes the graph with:
        Command(resume={"approved": true/false})

    If approved=True  → execution continues to tool_executor_node.
    If approved=False → a cancellation message is injected and the
                        graph routes to END without running the tools.
    """
    messages = state.get("messages", [])
    last_message = messages[-1] if messages else None

    # Build a human-readable summary of what's about to happen
    pending_actions = []
    if last_message and hasattr(last_message, "tool_calls") and last_message.tool_calls:
        for tc in last_message.tool_calls:
            name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "")
            args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", {})
            description = TOOL_ACTION_DESCRIPTIONS.get(name, f"Run action: {name}")
            pending_actions.append({
                "tool":        name,
                "description": description,
                "args":        args,
            })

    # Also handle planner-flagged review (no specific tool, just a risky query)
    if not pending_actions and state.get("requires_human_review"):
        pending_actions.append({
            "tool":        "general_review",
            "description": "The AI wants to proceed with a potentially sensitive action",
            "args":        {},
        })

    logger.info(
        "hitl_interrupt_raised",
        user_id=state.get("user_id"),
        session_id=state.get("session_id"),
        actions=[a["tool"] for a in pending_actions],
    )

    # ── Interrupt ─────────────────────────────────────────────
    # LangGraph pauses here. `user_decision` will be the value passed
    # to Command(resume=...) when the graph is resumed.
    user_decision = interrupt({
        "type":    "human_review",
        "actions": pending_actions,
        "message": _build_confirmation_message(pending_actions),
    })
    # ──────────────────────────────────────────────────────────

    approved = user_decision.get("approved", False) if isinstance(user_decision, dict) else False

    if approved:
        logger.info("hitl_approved", user_id=state.get("user_id"), actions=[a["tool"] for a in pending_actions])
        # Return nothing — state is unchanged, graph routes to tools
        return {}
    else:
        logger.info("hitl_rejected", user_id=state.get("user_id"), actions=[a["tool"] for a in pending_actions])
        # Inject a cancellation AI message so the user gets a response
        from langchain_core.messages import AIMessage
        cancel_msg = AIMessage(
            content=_build_cancellation_message(pending_actions)
        )
        return {
            "messages":            [cancel_msg],
            "requires_human_review": False,
            "is_done":             True,
        }


# ── Message builders ──────────────────────────────────────────

def _build_confirmation_message(actions: list[dict]) -> str:
    """Plain-English summary of what the agent is about to do."""
    if not actions:
        return "The advisor wants to take an action. Do you approve?"

    if len(actions) == 1:
        return f"The advisor wants to: {actions[0]['description']}. Do you approve?"

    action_list = "\n".join(f"  • {a['description']}" for a in actions)
    return f"The advisor wants to perform the following actions:\n{action_list}\n\nDo you approve?"


def _build_cancellation_message(actions: list[dict]) -> str:
    """Friendly message shown to the user when they decline."""
    if not actions:
        return "No problem — I've cancelled that action. Let me know if you'd like to try something else. 😊"

    descriptions = [a["description"].lower() for a in actions]
    joined = " and ".join(descriptions)
    return (
        f"Understood — I won't {joined}. "
        "If you change your mind, just let me know and I can walk you through it step by step. 😊"
    )