"""
LangGraph StateGraph — the FinAdvisor agent execution graph.

Node order per turn:
    rag_node → planner → [needs_review? → human_review] → tools → planner → … → END

Nodes:
    rag_node          Retrieves relevant document chunks (Phase 2 RAG pipeline)
    planner           LLM call — decides what to say or which tools to call
    human_review      HITL interrupt — pauses for user confirmation on sensitive actions
    tools             Executes tool calls with enabled_tools filter (bug fixed)

Edges:
    START      → rag_node   (always run RAG check first)
    rag_node   → planner    (always proceed to planner)
    planner    → [conditional: should_require_human_review]
                    "review" → human_review → tools → planner
                    "tools"  → tools → planner
                    "end"    → END
"""

from langgraph.graph import StateGraph, END, START
from langgraph.types import Command

from src.agent.state import AgentState
from src.agent.nodes.planner import planner_node, should_continue
from src.agent.nodes.tool_executor import tool_executor_node
from src.agent.nodes.rag_node import rag_node
from src.agent.nodes.human_in_loop import human_review_node, should_require_human_review
from src.memory.short_term import get_checkpointer
from src.utils.logger import get_logger

logger = get_logger(__name__)

_graph = None

# Prefixes that signal binary payloads inside ToolMessage content.
# These must be forwarded directly to the frontend — the LLM will never
# copy a 40KB base64 string into its prose response.
_BINARY_PREFIXES = ("CHART_BASE64:", "FILE_BASE64_PDF:", "FILE_BASE64_XLSX:")


def _is_binary_tool_result(content: str) -> bool:
    """Return True if the tool result is a binary payload (chart/file base64)."""
    if not isinstance(content, str):
        return False
    return any(content.startswith(p) for p in _BINARY_PREFIXES)


def _build_graph():
    """
    Compile the LangGraph StateGraph.

    Uses the singleton MemorySaver checkpointer from short_term.py
    so session history persists across turns within the same thread_id.
    """
    builder = StateGraph(AgentState)

    builder.add_node("rag",          rag_node)
    builder.add_node("planner",      planner_node)
    builder.add_node("human_review", human_review_node)
    builder.add_node("tools",        tool_executor_node)

    builder.add_edge(START, "rag")
    builder.add_edge("rag", "planner")

    builder.add_conditional_edges(
        "planner",
        should_require_human_review,
        {
            "review": "human_review",
            "tools":  "tools",
            "end":    END,
        },
    )

    builder.add_edge("human_review", "tools")
    builder.add_edge("tools", "planner")

    checkpointer = get_checkpointer()
    graph = builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["human_review"],
    )

    logger.info("agent_graph_compiled", nodes=["rag", "planner", "human_review", "tools"])
    return graph


def get_graph():
    """Return the compiled graph singleton."""
    global _graph
    if _graph is None:
        _graph = _build_graph()
    return _graph


async def run_agent(
    user_message:       str,
    user_id:            str,
    session_id:         str,
    model_id:           str   = "gpt-4o-mini",
    user_name:          str   = "",
    preferred_currency: str   = "USD",
    preferred_language: str   = "en",
    tier:               str   = "free",
    temperature:        float = 0.3,
    top_p:              float = 1.0,
    portfolio_summary:  str   = "",
    memories:           list  = None,
    rag_context:        list  = None,
    enabled_tools:      list  = None,
) -> dict:
    """
    Run the agent for one user message turn (non-streaming).

    Returns a dict with:
        response:          str   — final text response (with binary payloads appended)
        tools_used:        list
        scratchpad:        list
        prompt_tokens:     int
        completion_tokens: int
        cost_usd:          float
        hitl_pending:      bool
        hitl_payload:      dict
        error:             str
    """
    from langchain_core.messages import HumanMessage
    from src.agent.state import default_state
    from src.memory.short_term import get_session_config

    graph  = get_graph()
    config = get_session_config(session_id)

    state = default_state(
        user_id=user_id, session_id=session_id, model_id=model_id,
        user_name=user_name, preferred_currency=preferred_currency,
        preferred_language=preferred_language, tier=tier,
        temperature=temperature, top_p=top_p,
    )
    state["portfolio_summary"] = portfolio_summary
    state["memories"]          = memories or []
    state["rag_context"]       = rag_context or []
    state["enabled_tools"]     = enabled_tools
    state["messages"]          = [HumanMessage(content=user_message)]

    try:
        result = await graph.ainvoke(state, config=config)
    except Exception as e:
        logger.error("graph_run_failed", user_id=user_id, error=str(e))
        return _error_response(str(e))

    if result.get("hitl_pending") or result.get("requires_human_review"):
        return {**_empty_response(), "hitl_pending": True, "hitl_payload": result.get("__interrupt__", {})}

    return _extract_response(result)


async def stream_agent(
    user_message:       str,
    user_id:            str,
    session_id:         str,
    model_id:           str   = "gpt-4o-mini",
    user_name:          str   = "",
    preferred_currency: str   = "USD",
    preferred_language: str   = "en",
    tier:               str   = "free",
    temperature:        float = 0.3,
    top_p:              float = 1.0,
    portfolio_summary:  str   = "",
    memories:           list  = None,
    rag_context:        list  = None,
    enabled_tools:      list  = None,
):
    """
    Stream the agent's response token by token.
    Yields string chunks. Used by the SSE chat endpoint.

    Special yielded values:
        "CHART_BASE64:..."        — chart/image base64 payload (yielded from ToolMessage)
        "FILE_BASE64_PDF:..."     — PDF file payload
        "FILE_BASE64_XLSX:..."    — Excel file payload
        "__TOOLS_USED__:[...]"    — JSON list of tool names (final chunk)
        "__HITL__:{...}"          — HITL interrupt payload

    ROOT CAUSE FIX:
        The original implementation only yielded content from the "planner" node
        (AIMessage chunks). Chart and image tools return their base64 payload as a
        ToolMessage (node="tools"), which was silently filtered out.

        The LLM planner receives the ToolMessage as context but writes a short prose
        response ("Here's your chart!") — it never copies the 40KB base64 string back
        into its own text. So the frontend received the text but never the image.

        Fix: when a ToolMessage in the "tools" node contains a binary prefix
        (CHART_BASE64:, FILE_BASE64_PDF:, FILE_BASE64_XLSX:), yield it directly.
        The frontend MessageBubble already handles all these prefixes correctly.
    """
    import json
    from langchain_core.messages import HumanMessage, ToolMessage
    from src.agent.state import default_state
    from src.memory.short_term import get_session_config

    graph  = get_graph()
    config = get_session_config(session_id)

    state = default_state(
        user_id=user_id, session_id=session_id, model_id=model_id,
        user_name=user_name, preferred_currency=preferred_currency,
        preferred_language=preferred_language, tier=tier,
        temperature=temperature, top_p=top_p,
    )
    state["portfolio_summary"] = portfolio_summary
    state["memories"]          = memories or []
    state["rag_context"]       = rag_context or []
    state["enabled_tools"]     = enabled_tools
    state["messages"]          = [HumanMessage(content=user_message)]

    tools_called = []

    try:
        async for chunk in graph.astream(state, config=config, stream_mode="messages"):
            if isinstance(chunk, tuple):
                message, metadata = chunk
                node = metadata.get("langgraph_node", "")

                # Track tool names as the planner emits tool_call chunks
                if hasattr(message, "tool_calls") and message.tool_calls:
                    for tc in message.tool_calls:
                        name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
                        if name and name not in tools_called:
                            tools_called.append(name)

                # ── Planner text tokens ───────────────────────────────
                # Stream prose tokens from the planner's AIMessage/AIMessageChunk.
                # Skip ToolMessages (they have tool_call_id) — those are handled below.
                if (
                    node == "planner"
                    and hasattr(message, "content")
                    and message.content
                    and not hasattr(message, "tool_call_id")
                ):
                    yield message.content

                # ── Binary tool results ───────────────────────────────
                # ROOT CAUSE FIX: ToolMessages from chart/image/export tools carry
                # their entire payload (base64 PNG, PDF, XLSX) as the message content.
                # The planner never copies these back into its prose response.
                # We must yield them here, directly from the tools node, so the
                # frontend can extract and render them.
                elif (
                    node == "tools"
                    and isinstance(message, ToolMessage)
                    and isinstance(message.content, str)
                    and _is_binary_tool_result(message.content)
                ):
                    yield message.content  # e.g. "CHART_BASE64:iVBOR..." or "FILE_BASE64_PDF:..."

            # Handle HITL interrupt event
            elif isinstance(chunk, dict) and chunk.get("__interrupt__"):
                interrupt_data = chunk["__interrupt__"]
                yield f"__HITL__:{json.dumps(interrupt_data)}"
                return

    except Exception as e:
        logger.error("stream_failed", user_id=user_id, error=str(e))
        yield "\n\nI encountered an error. Please try again."

    if tools_called:
        yield f"__TOOLS_USED__:{json.dumps(tools_called)}"


# ── Helpers ───────────────────────────────────────────────────

def _extract_response(result: dict) -> dict:
    """
    Extract the final text response from the graph result.

    ROOT CAUSE FIX (non-streaming path):
        The original code only looked at AIMessages (skipped ToolMessages via
        the tool_call_id check). Binary tool results were silently discarded.

        Fix: collect binary payloads from ToolMessages and append them to the
        prose response so the saved message content contains both the text and
        the CHART_BASE64/FILE_BASE64 tokens. The frontend's MessageBubble will
        extract and render them on load.
    """
    from langchain_core.messages import ToolMessage

    messages      = result.get("messages", [])
    response_text = ""
    binary_parts  = []

    for msg in reversed(messages):
        # Find the last planner prose response
        if not response_text:
            if hasattr(msg, "content") and msg.content and not hasattr(msg, "tool_call_id"):
                response_text = msg.content

        # Collect binary tool payloads (charts, files)
        if isinstance(msg, ToolMessage) and isinstance(msg.content, str):
            if _is_binary_tool_result(msg.content):
                binary_parts.insert(0, msg.content)

    # Append binary payloads after the prose so the frontend can strip + render them
    if binary_parts:
        response_text = (response_text or "") + "\n" + "\n".join(binary_parts)

    return {
        "response":          response_text or "I couldn't generate a response. Please try again.",
        "tools_used":        result.get("tools_used", []),
        "scratchpad":        result.get("scratchpad", []),
        "prompt_tokens":     result.get("prompt_tokens", 0),
        "completion_tokens": result.get("completion_tokens", 0),
        "cost_usd":          result.get("cost_usd", 0.0),
        "hitl_pending":      False,
        "hitl_payload":      {},
        "error":             result.get("error", ""),
    }


def _error_response(error: str) -> dict:
    return {
        **_empty_response(),
        "response": "I encountered an error processing your request. Please try again.",
        "error":    error,
    }


def _empty_response() -> dict:
    return {
        "response": "", "tools_used": [], "scratchpad": [],
        "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0,
        "hitl_pending": False, "hitl_payload": {}, "error": "",
    }