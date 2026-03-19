"""
Tool executor node — runs the tool calls requested by the planner.

BUG FIX (from code review):
    The original implementation called get_all_tools() WITHOUT passing
    enabled_tool_ids, meaning a user-disabled tool could still execute.
    Fixed: we now pass state["enabled_tools"] to both get_all_tools()
    AND the ToolNode so the filter is enforced at execution time.

Scratchpad:
    Every tool call and its result is appended to state["scratchpad"]
    as a structured log entry. This stays internal (never shown to the
    user) but is available for:
        - Debugging and LangSmith tracing
        - The reasoning node to review what has been tried
        - Post-session analytics
"""

from __future__ import annotations

import time
from datetime import datetime

from langchain_core.messages import ToolMessage
from langgraph.prebuilt import ToolNode

from src.agent.state import AgentState
from src.utils.logger import get_logger

logger = get_logger(__name__)


def tool_executor_node(state: AgentState) -> dict:
    """
    Execute all tool calls from the last planner message.

    Steps:
        1. Extract pending tool calls from the last AI message.
        2. Build a ToolNode scoped to the user's ENABLED tools only.
           (Bug fix: original used get_all_tools() without the filter.)
        3. Execute tools, catching per-tool failures gracefully.
        4. Append structured scratchpad entries for each call + result.
        5. Return updated messages, tools_used, and scratchpad.
    """
    messages = state.get("messages", [])
    if not messages:
        return {}

    last_message = messages[-1]
    if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
        return {}

    tool_calls = last_message.tool_calls

    # ── BUG FIX: respect enabled_tools from state ─────────────
    # The planner already filtered which tools the LLM can *call*.
    # We enforce the same filter here so a crafted tool_call_id
    # cannot bypass user preferences and trigger a disabled tool.
    enabled_tool_ids: list[str] | None = state.get("enabled_tools")

    from src.tools import get_all_tools
    tools = get_all_tools(enabled_tool_ids=enabled_tool_ids)
    tool_map = {t.name: t for t in tools}

    tool_names = [
        tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "unknown")
        for tc in tool_calls
    ]

    logger.info(
        "executing_tools",
        tools=tool_names,
        user_id=state.get("user_id"),
        enabled_filter=enabled_tool_ids is not None,
    )

    # ── Execute via ToolNode (handles parallel calls correctly) ─
    tool_node = ToolNode(tools)
    scratchpad_entries = []
    result_messages = []

    try:
        t0 = time.perf_counter()
        result = tool_node.invoke(state)
        elapsed_ms = round((time.perf_counter() - t0) * 1000)

        result_messages = result.get("messages", [])

        # Build scratchpad entries from the returned ToolMessages
        tool_results_by_id = {
            msg.tool_call_id: msg.content
            for msg in result_messages
            if isinstance(msg, ToolMessage)
        }

        for tc in tool_calls:
            name    = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "unknown")
            call_id = tc.get("id")   if isinstance(tc, dict) else getattr(tc, "id",   "")
            args    = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", {})

            # Was this tool actually available (not disabled)?
            was_available = name in tool_map

            scratchpad_entries.append({
                "step":        "tool_call",
                "timestamp":   datetime.utcnow().isoformat(),
                "tool":        name,
                "args":        args,
                "result":      tool_results_by_id.get(call_id, "[no result]") if was_available else "[tool disabled]",
                "available":   was_available,
                "elapsed_ms":  elapsed_ms,
            })

    except Exception as e:
        logger.error("tool_execution_failed", tools=tool_names, error=str(e))

        # Return graceful error ToolMessages so the planner can respond
        for tc in tool_calls:
            name    = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "unknown")
            call_id = tc.get("id")   if isinstance(tc, dict) else getattr(tc, "id",   "")
            result_messages.append(
                ToolMessage(
                    content=f"Tool '{name}' encountered an error. Please try a different approach.",
                    tool_call_id=call_id,
                )
            )
            scratchpad_entries.append({
                "step":      "tool_error",
                "timestamp": datetime.utcnow().isoformat(),
                "tool":      name,
                "error":     str(e),
            })

    # ── Accumulate state ──────────────────────────────────────
    existing_tools     = state.get("tools_used", [])
    existing_scratchpad = state.get("scratchpad", [])

    return {
        "messages":   result_messages,
        "tools_used": existing_tools + tool_names,
        "scratchpad": existing_scratchpad + scratchpad_entries,
    }