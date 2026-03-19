from fastapi import APIRouter, Depends
from src.auth.dependencies import get_current_user
from src.database.operations import (
    get_usage_summary, get_user_sessions, get_session_messages
)
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

MODEL_COSTS = {
    "gpt-4o-mini": {"prompt": 0.00015, "completion": 0.0006},
    "gpt-4o": {"prompt": 0.005, "completion": 0.015},
    "claude-haiku-4-5-20251001": {"prompt": 0.00025, "completion": 0.00125},
    "claude-sonnet-4-20250514": {"prompt": 0.003, "completion": 0.015},
    "claude-opus-4-6": {"prompt": 0.015, "completion": 0.075},
    "gemini-1.5-flash": {"prompt": 0.000075, "completion": 0.0003},
    "gemini-1.5-pro": {"prompt": 0.00125, "completion": 0.005},
}


@router.get("/usage")
async def get_usage(current_user: dict = Depends(get_current_user)):
    """Full usage stats — tokens, cost, model breakdown, daily activity."""
    user_id = current_user["user_id"]
    try:
        from src.database.operations import _db
        rows = _db().table("usage_logs").select("*").eq("user_id", user_id).order("created_at", desc=True).execute().data or []

        if not rows:
            return {
                "total_requests": 0, "total_tokens": 0, "total_cost_usd": 0,
                "prompt_tokens": 0, "completion_tokens": 0,
                "by_model": {}, "daily": [], "tools_used": {},
                "avg_response_ms": 0, "sessions_count": 0,
            }

        total_prompt = sum(r.get("prompt_tokens", 0) for r in rows)
        total_completion = sum(r.get("completion_tokens", 0) for r in rows)
        total_cost = sum(float(r.get("cost_usd", 0)) for r in rows)
        avg_ms = sum(r.get("response_time_ms", 0) for r in rows) // max(len(rows), 1)

        # Per-model breakdown
        by_model = {}
        for r in rows:
            m = r.get("model", "unknown")
            if m not in by_model:
                by_model[m] = {"requests": 0, "tokens": 0, "cost": 0}
            by_model[m]["requests"] += 1
            by_model[m]["tokens"] += r.get("prompt_tokens", 0) + r.get("completion_tokens", 0)
            by_model[m]["cost"] = round(by_model[m]["cost"] + float(r.get("cost_usd", 0)), 6)

        # Daily activity (last 30 days)
        from collections import defaultdict
        daily = defaultdict(lambda: {"requests": 0, "tokens": 0, "cost": 0})
        for r in rows:
            day = str(r.get("created_at", ""))[:10]
            if day:
                daily[day]["requests"] += 1
                daily[day]["tokens"] += r.get("prompt_tokens", 0) + r.get("completion_tokens", 0)
                daily[day]["cost"] = round(daily[day]["cost"] + float(r.get("cost_usd", 0)), 6)
        daily_list = sorted([{"date": k, **v} for k, v in daily.items()], key=lambda x: x["date"])[-30:]

        # Tools used
        tools_count = defaultdict(int)
        for r in rows:
            for tool in (r.get("tools_used") or []):
                tools_count[tool] += 1

        sessions = get_user_sessions(user_id, limit=200)

        # LangSmith status
        from src.config.settings import settings
        langsmith_enabled = bool(settings.LANGCHAIN_TRACING_V2 and settings.LANGCHAIN_API_KEY)

        # Cache stats
        from src.utils.cache import stats as cache_stats
        cache_info = cache_stats()

        return {
            "total_requests": len(rows),
            "langsmith_enabled": langsmith_enabled,
            "langsmith_project": settings.LANGCHAIN_PROJECT if langsmith_enabled else None,
            "cache_stats": cache_info,
            "total_tokens": total_prompt + total_completion,
            "prompt_tokens": total_prompt,
            "completion_tokens": total_completion,
            "total_cost_usd": round(total_cost, 6),
            "avg_response_ms": avg_ms,
            "sessions_count": len(sessions),
            "by_model": by_model,
            "daily": daily_list,
            "tools_used": dict(sorted(tools_count.items(), key=lambda x: x[1], reverse=True)),
        }
    except Exception as e:
        logger.error("analytics_usage_failed", error=str(e))
        return {"error": str(e)}


@router.get("/export/chat")
async def export_chat(
    format: str = "json",
    current_user: dict = Depends(get_current_user)
):
    """Export all chat history as JSON or CSV."""
    from fastapi.responses import Response
    import json, csv, io

    user_id = current_user["user_id"]
    sessions = get_user_sessions(user_id, limit=500)

    all_messages = []
    for s in sessions:
        msgs = get_session_messages(s["id"])
        for m in msgs:
            all_messages.append({
                "session_id": s["id"],
                "session_title": s.get("title", "Untitled"),
                "role": m.get("role", ""),
                "content": m.get("content", ""),
                "created_at": str(m.get("created_at", "")),
            })

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=["session_id", "session_title", "role", "content", "created_at"])
        writer.writeheader()
        writer.writerows(all_messages)
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=finadvisor_chat_history.csv"}
        )

    return Response(
        content=json.dumps({"exported_at": str(__import__("datetime").datetime.utcnow()), "messages": all_messages}, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=finadvisor_chat_history.json"}
    )