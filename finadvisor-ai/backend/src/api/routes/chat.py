import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import AsyncGenerator

from src.auth.dependencies import get_current_user
from src.agent.graph import run_agent, stream_agent
from src.database.operations import (
    create_chat_session,
    get_user_sessions,
    get_session_messages,
    save_message,
    update_session_title,
    update_session_tokens,
    delete_session,
    get_user_by_id,
    get_portfolio,
    get_user_memories,
    check_user_message_limit,
    increment_message_count,
    log_usage,
)
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    session_id: str = None
    model_id: str = None
    stream: bool = True


class NewSessionRequest(BaseModel):
    model_id: str = None


def _build_portfolio_summary(positions: list) -> str:
    if not positions:
        return ""
    tickers = [p["ticker"] for p in positions[:5]]
    summary = f"{len(positions)} positions: {', '.join(tickers)}"
    if len(positions) > 5:
        summary += f" and {len(positions) - 5} more"
    return summary


def _auto_title(message: str) -> str:
    """Generate a smart, concise chat title using GPT."""
    try:
        import openai
        from src.config.settings import settings
        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY, timeout=8.0)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Generate a short, smart chat title (3-5 words max) for this message. Be specific and descriptive. No quotes, no punctuation at the end. Examples: 'Bitcoin Price Today', 'Portfolio Risk Analysis', 'Retirement Savings Plan', 'Apple Stock Outlook'."},
                {"role": "user", "content": message[:200]}
            ],
            max_tokens=15,
            temperature=0.3,
        )
        title = resp.choices[0].message.content.strip().strip('"').strip("'")
        return title[:60] if title else _fallback_title(message)
    except Exception:
        return _fallback_title(message)


def _fallback_title(message: str) -> str:
    import re
    msg = message.strip()
    low = msg.lower()
    greetings = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", "howdy", "sup"]
    if any(low.startswith(g) for g in greetings) or low in ["hi", "hello", "hey"]:
        return "Casual Chat"
    for prefix in ["what is the price of", "what is the", "what is", "how do i", "how does",
                   "can you", "could you", "please", "tell me about", "explain", "show me"]:
        if low.startswith(prefix):
            msg = msg[len(prefix):].strip()
            break
    msg = re.sub(r'[?!.]+$', '', msg).strip()
    words = msg.split()
    return " ".join(words[:5]).title()[:60] or message[:40].title()


def _find_empty_session(sessions: list) -> str | None:
    """
    Return the session_id of the most recent session with no messages.
    Uses message_count if available (requires updated get_user_sessions),
    otherwise falls back to title-based check.
    """
    for s in sessions:
        if "message_count" in s:
            if s["message_count"] == 0:
                return s.get("id") or s.get("session_id")
        else:
            title = s.get("title", "")
            if title in ("New Chat", "", None):
                return s.get("id") or s.get("session_id")
    return None


async def _get_user_context(user_id: str, model_id: str = None) -> dict:
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    portfolio = get_portfolio(user_id)
    memories = get_user_memories(user_id)
    return {
        "user_name": user.get("preferred_name") or (user.get("full_name", "").split()[0] if user.get("full_name") else ""),
        "preferred_language": user.get("preferred_language", "en"),
        "preferred_currency": user.get("preferred_currency", "USD"),
        "tier": user.get("tier", "free"),
        "model_id": model_id or user.get("preferred_model", "gpt-4o-mini"),
        "temperature": float(user.get("temperature", 0.3)),
        "top_p": float(user.get("top_p", 1.0)),
        "portfolio_summary": _build_portfolio_summary(portfolio),
        "memories": [m["content"] for m in memories[:10]],
    }


@router.get("/sessions")
async def list_sessions(limit: int = 1000, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    sessions = get_user_sessions(user_id, limit=limit)
    return {"sessions": sessions}


@router.post("/sessions")
async def create_session(
    body: NewSessionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a new chat session."""
    session_id = str(uuid.uuid4())
    ctx = await _get_user_context(current_user["user_id"], body.model_id)
    session = create_chat_session(
        session_id=session_id,
        user_id=current_user["user_id"],
        model=ctx["model_id"],
    )
    if not session:
        raise HTTPException(status_code=500, detail="Failed to create session.")
    logger.info("session_created", session_id=session_id)
    return session


@router.get("/sessions/{session_id}/messages")
async def get_messages(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get all messages for a session."""
    messages = get_session_messages(session_id)
    return {"messages": messages}


@router.delete("/sessions/{session_id}")
async def remove_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a chat session and all its messages."""
    from src.database.operations import delete_session as db_delete
    deleted = db_delete(session_id, current_user["user_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"message": "Session deleted."}


@router.post("/send")
async def send_message(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]

    limit_result = check_user_message_limit(user_id)
    if not limit_result["allowed"]:
        resets_in = limit_result.get("resets_in_minutes", 180)
        window_hours = limit_result.get("window_hours", 3)
        window_limit = limit_result.get("window_limit", 10)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"rate_limit:{resets_in}:{window_hours}:{window_limit}",
        )

    ctx = await _get_user_context(user_id, body.model_id)
    session_id = body.session_id
    is_new_session = not session_id

    if is_new_session:
        existing_sessions = get_user_sessions(user_id)
        reuse_id = _find_empty_session(existing_sessions)
        if reuse_id:
            session_id = reuse_id
            logger.info("session_reused", session_id=session_id, user_id=user_id)
        else:
            session_id = str(uuid.uuid4())
            create_chat_session(
                session_id=session_id,
                user_id=user_id,
                model=ctx["model_id"],
            )
        update_session_title(session_id, _auto_title(body.message))

    from src.tools.portfolio_tools import set_user_context as set_portfolio_ctx
    from src.tools.budget_tools import set_user_context as set_budget_ctx
    set_portfolio_ctx(user_id)
    set_budget_ctx(user_id)

    save_message(session_id=session_id, role="user", content=body.message)
    increment_message_count(user_id)

    if body.stream:
        return StreamingResponse(
            _stream_response(body.message, session_id, user_id, ctx),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "X-Session-ID": session_id,
            },
        )

    import time as _time
    _t0 = _time.time()
    result = await run_agent(
        user_message=body.message,
        user_id=user_id,
        session_id=session_id,
        model_id=ctx["model_id"],
        user_name=ctx["user_name"],
        preferred_currency=ctx["preferred_currency"],
        preferred_language=ctx["preferred_language"],
        tier=ctx["tier"],
        portfolio_summary=ctx["portfolio_summary"],
        memories=ctx["memories"],
    )

    save_message(
        session_id=session_id,
        role="assistant",
        content=result["response"],
        model_used=ctx["model_id"],
        tool_calls=result.get("tools_used", []),
        prompt_tokens=result.get("prompt_tokens", 0),
        completion_tokens=result.get("completion_tokens", 0),
    )

    log_usage(
        user_id=user_id,
        session_id=session_id,
        model=ctx["model_id"],
        prompt_tokens=result.get("prompt_tokens", 0),
        completion_tokens=result.get("completion_tokens", 0),
        cost_usd=result.get("cost_usd", 0.0),
        tools_used=result.get("tools_used", []),
        response_time_ms=int((_time.time() - _t0) * 1000),
    )

    update_session_tokens(
        session_id,
        result.get("prompt_tokens", 0) + result.get("completion_tokens", 0),
        result.get("cost_usd", 0.0),
    )

    return {
        "session_id": session_id,
        "response": result["response"],
        "tools_used": result.get("tools_used", []),
        "usage": {
            "prompt_tokens": result.get("prompt_tokens", 0),
            "completion_tokens": result.get("completion_tokens", 0),
            "cost_usd": result.get("cost_usd", 0.0),
        },
    }


async def _stream_response(
    message: str,
    session_id: str,
    user_id: str,
    ctx: dict,
) -> AsyncGenerator[str, None]:
    """SSE generator — streams agent tokens to the client."""

    def sse(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    full_response = ""
    actual_tools_used = []
    import time as _time
    _t0 = _time.time()

    try:
        async for chunk in stream_agent(
            user_message=message,
            user_id=user_id,
            session_id=session_id,
            model_id=ctx["model_id"],
            user_name=ctx["user_name"],
            preferred_currency=ctx["preferred_currency"],
            preferred_language=ctx["preferred_language"],
            tier=ctx["tier"],
            portfolio_summary=ctx["portfolio_summary"],
            memories=ctx["memories"],
            temperature=ctx.get("temperature", 0.3),
            top_p=ctx.get("top_p", 1.0),
        ):
            if chunk.startswith("__TOOLS_USED__:"):
                import json as _json
                try:
                    actual_tools_used = _json.loads(chunk[len("__TOOLS_USED__:"):])
                except Exception:
                    pass
            else:
                full_response += chunk
                yield sse({"type": "token", "content": chunk})

    except Exception as e:
        logger.error("stream_error", user_id=user_id, error=str(e))
        yield sse({"type": "error", "message": "An error occurred. Please try again."})
        return

    response_time_ms = int((_time.time() - _t0) * 1000)

    completion_tokens = max(1, len(full_response.split()) * 4 // 3)
    prompt_tokens = max(1, len(message.split()) * 4 // 3)
    model_id = ctx["model_id"]
    if "gpt-4o-mini" in model_id:
        cost_usd = round((prompt_tokens * 0.00000015) + (completion_tokens * 0.0000006), 6)
    elif "gpt-4o" in model_id:
        cost_usd = round((prompt_tokens * 0.0000025) + (completion_tokens * 0.00001), 6)
    else:
        cost_usd = 0.0
    tools_used = actual_tools_used

    save_message(
        session_id=session_id,
        role="assistant",
        content=full_response,
        model_used=ctx["model_id"],
        tool_calls=tools_used,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )

    try:
        log_usage(
            user_id=user_id,
            session_id=session_id,
            model=ctx["model_id"],
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=cost_usd,
            tools_used=tools_used,
            response_time_ms=response_time_ms,
        )
    except Exception:
        pass

    yield sse({"type": "done", "session_id": session_id})


class FeedbackRequest(BaseModel):
    message_id: str
    rating: str  # "up" or "down"


@router.post("/feedback")
async def submit_feedback(
    body: FeedbackRequest,
    current_user: dict = Depends(get_current_user),
):
    """Submit thumbs up/down feedback on an AI message."""
    try:
        from src.database.operations import _db
        user_id = current_user["user_id"]

        _db().table("messages").update({
            "feedback": body.rating,
            "feedback_at": "now()",
        }).eq("id", body.message_id).eq("role", "assistant").execute()

        if body.rating == "down":
            msg = _db().table("messages").select("content").eq("id", body.message_id).execute()
            if msg.data:
                bad_response = msg.data[0].get("content", "")[:200]
                _db().table("agent_memories").insert({
                    "user_id": user_id,
                    "content": f"User gave thumbs down on this type of response: '{bad_response[:100]}...' — avoid similar responses",
                    "memory_type": "feedback",
                    "importance": 0.8,
                    "is_active": True,
                }).execute()

        return {"status": "ok", "rating": body.rating}
    except Exception as e:
        logger.error("feedback_failed", error=str(e))
        return {"status": "ok"}


@router.get("/tools")
async def get_tool_registry(current_user: dict = Depends(get_current_user)):
    """Get all available tools with metadata for the plugin system UI."""
    from src.tools import TOOL_REGISTRY
    user_id = current_user["user_id"]
    try:
        from src.database.operations import _db
        result = _db().table("users").select("enabled_tools").eq("id", user_id).execute()
        enabled = result.data[0].get("enabled_tools") if result.data else None
        if enabled is None:
            enabled = [t["id"] for t in TOOL_REGISTRY if t["default"]]
    except Exception:
        enabled = [t["id"] for t in TOOL_REGISTRY if t["default"]]
    return {"tools": TOOL_REGISTRY, "enabled": enabled}


class UpdateToolsRequest(BaseModel):
    enabled_tools: list


@router.post("/tools")
async def update_enabled_tools(
    body: UpdateToolsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Save user's enabled tools."""
    from src.database.operations import _db
    import json
    user_id = current_user["user_id"]
    _db().table("users").update({
        "enabled_tools": body.enabled_tools
    }).eq("id", user_id).execute()
    return {"status": "ok", "enabled": body.enabled_tools}