import asyncio
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
    get_financial_goals,
    check_user_message_limit,
    increment_message_count,
    log_usage,
)
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

# How often to send a keep-alive comment during silent tool execution (seconds).
# Vercel's edge network and most nginx proxies kill idle SSE after 60-120s.
# Sending a harmless SSE comment every 15s keeps the connection alive while
# yfinance / chart generation runs in the background.
_SSE_KEEPALIVE_INTERVAL = 15


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


def _build_goals_summary(goals: list) -> str:
    """Format user's financial goals into a concise string for the system prompt."""
    if not goals:
        return ""
    lines = []
    for g in goals:
        name    = g.get("goal_name", "Unnamed goal")
        target  = g.get("target_amount", 0)
        current = g.get("current_amount", 0)
        by_date = g.get("target_date", "")
        pct     = round((current / target * 100), 1) if target else 0
        line    = f"- {name}: ${current:,.0f} saved of ${target:,.0f} target ({pct}% complete)"
        if by_date:
            line += f", deadline {by_date}"
        lines.append(line)
    return "\n".join(lines)


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
    memories  = get_user_memories(user_id)
    goals     = get_financial_goals(user_id)
    return {
        "user_name":          user.get("preferred_name") or (user.get("full_name", "").split()[0] if user.get("full_name") else ""),
        "preferred_language": user.get("preferred_language", "en"),
        "preferred_currency": user.get("preferred_currency", "USD"),
        "tier":               user.get("tier", "free"),
        "model_id":           model_id or user.get("preferred_model", "gpt-4o-mini"),
        "temperature":        float(user.get("temperature", 0.3)),
        "top_p":              float(user.get("top_p", 1.0)),
        "portfolio_summary":  _build_portfolio_summary(portfolio),
        "goals_summary":      _build_goals_summary(goals),
        "memories":           [m["content"] for m in memories[:10]],
    }


@router.get("/sessions")
async def list_sessions(limit: int = 1000, current_user: dict = Depends(get_current_user)):
    user_id  = current_user["user_id"]
    sessions = get_user_sessions(user_id, limit=limit)
    return {"sessions": sessions}


@router.post("/sessions")
async def create_session(
    body: NewSessionRequest,
    current_user: dict = Depends(get_current_user),
):
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
    messages = get_session_messages(session_id)
    return {"messages": messages}


@router.delete("/sessions/{session_id}")
async def remove_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
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
        resets_in    = limit_result.get("resets_in_minutes", 180)
        window_hours = limit_result.get("window_hours", 3)
        window_limit = limit_result.get("window_limit", 10)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"rate_limit:{resets_in}:{window_hours}:{window_limit}",
        )

    ctx        = await _get_user_context(user_id, body.model_id)
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
        # Run title generation in background — doesn't block the user's first response
        async def _bg_title(sid: str, msg: str):
            try:
                title = await asyncio.get_event_loop().run_in_executor(None, _auto_title, msg)
                update_session_title(sid, title)
            except Exception:
                pass
        asyncio.create_task(_bg_title(session_id, body.message))

    from src.tools.portfolio_tools import set_user_context as set_portfolio_ctx
    from src.tools.budget_tools    import set_user_context as set_budget_ctx
    set_portfolio_ctx(user_id)
    set_budget_ctx(user_id)

    save_message(session_id=session_id, role="user", content=body.message)
    increment_message_count(user_id)

    if body.stream:
        return StreamingResponse(
            _stream_response(body.message, session_id, user_id, ctx),
            media_type="text/event-stream",
            headers={
                "Cache-Control":    "no-cache",
                "X-Accel-Buffering": "no",
                "X-Session-ID":     session_id,
            },
        )

    import time as _time
    _t0    = _time.time()
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

    # ── Background: extract long-term memories from this exchange ──────────
    # Runs after the response is already returned to the user — zero latency impact.
    # Only fires every 5th message to keep LLM costs low.
    async def _bg_memory(sid: str, uid: str, model: str):
        try:
            msgs = get_session_messages(sid)
            # Only extract if session has enough content and on every 5th message
            if len(msgs) >= 4 and len(msgs) % 5 == 0:
                from src.memory.long_term import extract_and_save_memories
                history = [{"role": m["role"], "content": m["content"]} for m in msgs]
                await extract_and_save_memories(uid, history, model_id=model)
        except Exception:
            pass  # Memory extraction is non-critical — never block the user

    asyncio.create_task(_bg_memory(session_id, user_id, ctx["model_id"]))

    return {
        "session_id": session_id,
        "response":   result["response"],
        "tools_used": result.get("tools_used", []),
        "usage": {
            "prompt_tokens":     result.get("prompt_tokens", 0),
            "completion_tokens": result.get("completion_tokens", 0),
            "cost_usd":          result.get("cost_usd", 0.0),
        },
    }


async def _stream_response(
    message: str,
    session_id: str,
    user_id: str,
    ctx: dict,
) -> AsyncGenerator[str, None]:
    """
    SSE generator — streams agent tokens to the client.

    FIX: added a keep-alive heartbeat that fires every _SSE_KEEPALIVE_INTERVAL
    seconds while the stream is silent (i.e. during tool execution).

    Without this, when the agent calls get_market_overview() (8 parallel yfinance
    requests) or generate_bar_chart() (matplotlib rendering), the SSE connection
    sends nothing for potentially 10-30 seconds. Vercel's edge network and most
    reverse proxies (nginx, Cloudflare) treat an idle SSE connection as dead and
    close it after 60-120s — which is why the chart never arrived.

    SSE comments (lines starting with ':') are ignored by the EventSource spec
    on the client side, so the heartbeat is invisible to the frontend.
    """

    def sse(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    def sse_keepalive() -> str:
        # SSE comment — ignored by EventSource, keeps TCP connection alive
        return ": keepalive\n\n"

    full_response      = ""
    actual_tools_used  = []
    import time as _time
    _t0 = _time.time()

    # Wrap stream_agent in an async queue so we can interleave keep-alive ticks
    queue: asyncio.Queue = asyncio.Queue()

    async def _producer():
        """Push chunks from stream_agent into the queue, then signal done."""
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
                await queue.put(("chunk", chunk))
        except Exception as e:
            await queue.put(("error", str(e)))
        finally:
            await queue.put(("done", None))

    producer_task = asyncio.create_task(_producer())

    try:
        while True:
            try:
                # Wait up to _SSE_KEEPALIVE_INTERVAL seconds for the next chunk.
                # If nothing arrives in that window, send a keep-alive comment so
                # the proxy knows the connection is still alive.
                kind, value = await asyncio.wait_for(
                    queue.get(),
                    timeout=_SSE_KEEPALIVE_INTERVAL,
                )
            except asyncio.TimeoutError:
                # No chunk arrived in time — send heartbeat and keep waiting
                yield sse_keepalive()
                continue

            if kind == "done":
                break
            elif kind == "error":
                logger.error("stream_error", user_id=user_id, error=value)
                yield sse({"type": "error", "message": "An error occurred. Please try again."})
                return
            else:
                # kind == "chunk"
                chunk = value
                if chunk.startswith("__TOOLS_USED__:"):
                    try:
                        actual_tools_used = json.loads(chunk[len("__TOOLS_USED__:"):])
                    except Exception:
                        pass
                elif any(chunk.startswith(p) for p in ("CHART_BASE64:", "FILE_BASE64_PDF:", "FILE_BASE64_XLSX:")):
                    full_response += chunk
                    yield sse({"type": "binary", "content": chunk})
                else:
                    full_response += chunk
                    yield sse({"type": "token", "content": chunk})

    finally:
        producer_task.cancel()

    response_time_ms = int((_time.time() - _t0) * 1000)

    completion_tokens = max(1, len(full_response.split()) * 4 // 3)
    prompt_tokens     = max(1, len(message.split()) * 4 // 3)
    model_id          = ctx["model_id"]
    if "gpt-4o-mini" in model_id:
        cost_usd = round((prompt_tokens * 0.00000015) + (completion_tokens * 0.0000006), 6)
    elif "gpt-4o" in model_id:
        cost_usd = round((prompt_tokens * 0.0000025)  + (completion_tokens * 0.00001),   6)
    else:
        cost_usd = 0.0

    save_message(
        session_id=session_id,
        role="assistant",
        content=full_response,
        model_used=ctx["model_id"],
        tool_calls=actual_tools_used,
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
            tools_used=actual_tools_used,
            response_time_ms=response_time_ms,
        )
    except Exception:
        pass

    # Reorder: move all binary payloads to end of full_response.
    # CHART_BASE64/FILE_BASE64 arrive mid-stream between two planner turns.
    # If stored inline (prose + binary + prose), MessageBubble's extractor
    # captures trailing prose chars as part of the base64, corrupting it.
    # Moving binary to the end guarantees clean extraction.
    _binary_prefixes = ("CHART_BASE64:", "FILE_BASE64_PDF:", "FILE_BASE64_XLSX:")
    _prose_lines = []
    _binary_lines = []
    for _line in full_response.split("\n"):
        if any(_line.startswith(_p) for _p in _binary_prefixes):
            _binary_lines.append(_line)
        else:
            _prose_lines.append(_line)
    full_response = "\n".join(_prose_lines).strip()
    if _binary_lines:
        full_response += "\n" + "\n".join(_binary_lines)

    yield sse({"type": "done", "session_id": session_id, "full_content": full_response})

    # ── Background: extract long-term memories from completed stream ───────
    async def _bg_memory_stream(sid: str, uid: str, model: str):
        try:
            msgs = get_session_messages(sid)
            if len(msgs) >= 4 and len(msgs) % 5 == 0:
                from src.memory.long_term import extract_and_save_memories
                history = [{"role": m["role"], "content": m["content"]} for m in msgs]
                await extract_and_save_memories(uid, history, model_id=model)
        except Exception:
            pass

    asyncio.create_task(_bg_memory_stream(session_id, user_id, ctx["model_id"]))


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
            "feedback":    body.rating,
            "feedback_at": "now()",
        }).eq("id", body.message_id).eq("role", "assistant").execute()

        if body.rating == "down":
            msg = _db().table("messages").select("content").eq("id", body.message_id).execute()
            if msg.data:
                bad_response = msg.data[0].get("content", "")[:200]
                _db().table("agent_memories").insert({
                    "user_id":     user_id,
                    "content":     f"User gave thumbs down on this type of response: '{bad_response[:100]}...' — avoid similar responses",
                    "memory_type": "feedback",
                    "importance":  0.8,
                    "is_active":   True,
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
        result  = _db().table("users").select("enabled_tools").eq("id", user_id).execute()
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