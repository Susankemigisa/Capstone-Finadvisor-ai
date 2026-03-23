from typing import Optional
from datetime import date

from src.utils.logger import get_logger
from src.utils.sanitizer import sanitize_error

logger = get_logger(__name__)


def _db():
    """Get Supabase client lazily — only connects when first called."""
    from src.database.client import get_supabase
    return get_supabase()


# ── USER OPERATIONS ───────────────────────────────────────────

def get_user_by_email(email: str) -> Optional[dict]:
    try:
        result = _db().table("users").select("*").eq("email", email.lower().strip()).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("get_user_by_email_failed", email=email, error=sanitize_error(e))
        return None


def get_user_by_id(user_id: str) -> Optional[dict]:
    try:
        result = _db().table("users").select("*").eq("id", user_id).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("get_user_by_id_failed", user_id=user_id, error=sanitize_error(e))
        return None


def create_user(email: str, password_hash: str, full_name: str = "") -> Optional[dict]:
    try:
        result = _db().table("users").insert({
            "email": email.lower().strip(),
            "password_hash": password_hash,
            "full_name": full_name,
        }).execute()
        if result.data:
            logger.info("user_created", email=email)
            return result.data[0]
        return None
    except Exception as e:
        logger.error("create_user_failed", email=email, error=sanitize_error(e))
        return None


def update_user(user_id: str, updates: dict) -> Optional[dict]:
    # Allow password_hash updates (for password reset/change flows)
    try:
        result = _db().table("users").update(updates).eq("id", user_id).execute()

        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("update_user_failed", user_id=user_id, error=sanitize_error(e))
        return None


def check_user_message_limit(user_id: str) -> dict:
    """
    Rolling window rate limit.
    Free: 10 messages per 3-hour window (resets every 3h, not midnight)
    Pro: unlimited
    Returns dict: { allowed: bool, messages_left: int, resets_in_minutes: int }
    """
    from datetime import datetime, timezone
    try:
        user = get_user_by_id(user_id)
        if not user:
            return {"allowed": False, "messages_left": 0, "resets_in_minutes": 180}

        tier = user.get("tier", "free")
        if tier != "free":
            return {"allowed": True, "messages_left": 999, "resets_in_minutes": 0}

        # Rolling 3-hour window: 10 messages per window
        WINDOW_HOURS = 3
        WINDOW_LIMIT = 10

        now = datetime.now(timezone.utc)
        window_start = now.replace(
            hour=(now.hour // WINDOW_HOURS) * WINDOW_HOURS,
            minute=0, second=0, microsecond=0
        )
        window_end = window_start.replace(hour=window_start.hour + WINDOW_HOURS) if window_start.hour + WINDOW_HOURS < 24 else window_start.replace(hour=0, minute=0) + __import__('datetime').timedelta(days=1)

        # Count messages in current window
        result = _db().table("usage_logs").select("id").eq("user_id", user_id).gte("created_at", window_start.isoformat()).execute()
        count = len(result.data) if result.data else 0

        messages_left = max(0, WINDOW_LIMIT - count)
        resets_in_minutes = int((window_end - now).total_seconds() / 60)

        return {
            "allowed": count < WINDOW_LIMIT,
            "messages_left": messages_left,
            "resets_in_minutes": resets_in_minutes,
            "window_hours": WINDOW_HOURS,
            "window_limit": WINDOW_LIMIT,
        }
    except Exception as e:
        logger.error("check_message_limit_failed", user_id=user_id, error=sanitize_error(e))
        return {"allowed": True, "messages_left": 10, "resets_in_minutes": 180}


def increment_message_count(user_id: str) -> None:
    try:
        user = get_user_by_id(user_id)
        if not user:
            return
        today = date.today()
        last_date = user.get("last_message_date")
        count = user.get("message_count_today", 0)
        if str(last_date) != str(today):
            count = 0
        _db().table("users").update({
            "message_count_today": count + 1,
            "last_message_date": str(today),
        }).eq("id", user_id).execute()
    except Exception as e:
        logger.error("increment_message_count_failed", user_id=user_id, error=sanitize_error(e))


# ── CHAT SESSION OPERATIONS ───────────────────────────────────

def create_chat_session(session_id: str, user_id: str, model: str = "") -> Optional[dict]:
    try:
        result = _db().table("chat_sessions").insert({
            "id": session_id,
            "user_id": user_id,
            "model_used": model,
            "title": "New Chat",
        }).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("create_session_failed", error=sanitize_error(e))
        return None


def get_user_sessions(user_id: str, limit: int = 1000) -> list:
    try:
        result = (
            _db().table("chat_sessions")
            .select("*, messages(count)")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        sessions = []
        for s in (result.data or []):
            # Supabase returns the relation as [{"count": N}]
            count_data = s.pop("messages", None)
            if isinstance(count_data, list) and count_data:
                s["message_count"] = count_data[0].get("count", 0)
            else:
                s["message_count"] = 0
            sessions.append(s)
        return sessions
    except Exception as e:
        logger.error("get_sessions_failed", user_id=user_id, error=sanitize_error(e))
        return []


def update_session_title(session_id: str, title: str) -> None:
    try:
        _db().table("chat_sessions").update({"title": title}).eq("id", session_id).execute()
    except Exception as e:
        logger.error("update_session_title_failed", error=sanitize_error(e))


def update_session_tokens(session_id: str, tokens: int, cost: float) -> None:
    try:
        session = (
            _db().table("chat_sessions")
            .select("total_tokens,total_cost_usd")
            .eq("id", session_id)
            .execute()
        )
        if session.data:
            current_tokens = session.data[0].get("total_tokens", 0)
            current_cost = float(session.data[0].get("total_cost_usd", 0))
            _db().table("chat_sessions").update({
                "total_tokens": current_tokens + tokens,
                "total_cost_usd": current_cost + cost,
            }).eq("id", session_id).execute()
    except Exception as e:
        logger.error("update_session_tokens_failed", error=sanitize_error(e))


def delete_session(session_id: str, user_id: str) -> bool:
    try:
        _db().table("chat_sessions").delete().eq("id", session_id).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        logger.error("delete_session_failed", error=sanitize_error(e))
        return False


# ── MESSAGE OPERATIONS ────────────────────────────────────────

def save_message(
    session_id: str,
    role: str,
    content: str,
    model_used: str = None,
    tool_calls: list = None,
    tool_name: str = None,
    tool_result: dict = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> Optional[dict]:
    try:
        result = _db().table("messages").insert({
            "session_id": session_id,
            "role": role,
            "content": content,
            "model_used": model_used,
            "tool_calls": tool_calls or [],
            "tool_name": tool_name,
            "tool_result": tool_result,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
        }).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("save_message_failed", error=sanitize_error(e))
        return None


def get_session_messages(session_id: str) -> list:
    try:
        result = (
            _db().table("messages")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at", desc=False)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("get_messages_failed", session_id=session_id, error=sanitize_error(e))
        return []


# ── PORTFOLIO OPERATIONS ──────────────────────────────────────

def get_portfolio(user_id: str) -> list:
    try:
        result = (
            _db().table("portfolio_positions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("get_portfolio_failed", user_id=user_id, error=sanitize_error(e))
        return []


def add_portfolio_position(
    user_id: str,
    ticker: str,
    asset_type: str,
    shares: float,
    avg_buy_price: float,
    currency: str = "USD",
    notes: str = None,
) -> Optional[dict]:
    try:
        result = _db().table("portfolio_positions").insert({
            "user_id": user_id,
            "ticker": ticker.upper(),
            "asset_type": asset_type,
            "shares": shares,
            "avg_buy_price": avg_buy_price,
            "currency": currency,
            "notes": notes,
        }).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("add_position_failed", ticker=ticker, error=sanitize_error(e))
        return None


def remove_portfolio_position(position_id: str, user_id: str) -> bool:
    try:
        _db().table("portfolio_positions").delete().eq("id", position_id).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        logger.error("remove_position_failed", position_id=position_id, error=sanitize_error(e))
        return False


def update_portfolio_position(position_id: str, user_id: str, updates: dict) -> Optional[dict]:
    try:
        result = (
            _db().table("portfolio_positions")
            .update(updates)
            .eq("id", position_id)
            .eq("user_id", user_id)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("update_position_failed", error=sanitize_error(e))
        return None


# ── BUDGET OPERATIONS ─────────────────────────────────────────

def add_budget_entry(
    user_id: str,
    category: str,
    amount: float,
    entry_type: str,
    description: str = "",
    entry_date: str = None,
    subcategory: str = None,
) -> Optional[dict]:
    try:
        result = _db().table("budget_entries").insert({
            "user_id": user_id,
            "category": category,
            "subcategory": subcategory,
            "amount": amount,
            "entry_type": entry_type,
            "description": description,
            "entry_date": entry_date or str(date.today()),
        }).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("add_budget_entry_failed", error=sanitize_error(e))
        return None


def get_budget_entries(user_id: str, month: str = None) -> list:
    try:
        query = (
            _db().table("budget_entries")
            .select("*")
            .eq("user_id", user_id)
            .order("entry_date", desc=True)
        )
        if month:
            query = query.gte("entry_date", f"{month}-01").lte("entry_date", f"{month}-31")
        result = query.execute()
        return result.data or []
    except Exception as e:
        logger.error("get_budget_entries_failed", user_id=user_id, error=sanitize_error(e))
        return []


# ── FINANCIAL GOALS OPERATIONS ────────────────────────────────

def get_financial_goals(user_id: str) -> list:
    try:
        result = (
            _db().table("financial_goals")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("get_goals_failed", user_id=user_id, error=sanitize_error(e))
        return []


def create_financial_goal(
    user_id: str,
    goal_name: str,
    goal_type: str,
    target_amount: float,
    target_date: str = None,
    notes: str = "",
) -> Optional[dict]:
    try:
        result = _db().table("financial_goals").insert({
            "user_id": user_id,
            "goal_name": goal_name,
            "goal_type": goal_type,
            "target_amount": target_amount,
            "target_date": target_date,
            "notes": notes,
        }).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("create_goal_failed", error=sanitize_error(e))
        return None


def update_goal_progress(goal_id: str, user_id: str, current_amount: float) -> Optional[dict]:
    try:
        result = (
            _db().table("financial_goals")
            .update({"current_amount": current_amount})
            .eq("id", goal_id)
            .eq("user_id", user_id)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("update_goal_failed", error=sanitize_error(e))
        return None


# ── MEMORY OPERATIONS ─────────────────────────────────────────

def save_memory(user_id: str, memory_type: str, content: str, importance: int = 5) -> Optional[dict]:
    try:
        result = _db().table("agent_memories").insert({
            "user_id": user_id,
            "memory_type": memory_type,
            "content": content,
            "importance": importance,
        }).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("save_memory_failed", error=sanitize_error(e))
        return None


def get_user_memories(user_id: str, memory_type: str = None) -> list:
    try:
        query = (
            _db().table("agent_memories")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("importance", desc=True)
        )
        if memory_type:
            query = query.eq("memory_type", memory_type)
        result = query.execute()
        return result.data or []
    except Exception as e:
        logger.error("get_memories_failed", user_id=user_id, error=sanitize_error(e))
        return []


# ── WATCHLIST OPERATIONS ──────────────────────────────────────

def get_watchlist(user_id: str) -> list:
    try:
        result = (
            _db().table("watchlist")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("get_watchlist_failed", user_id=user_id, error=sanitize_error(e))
        return []


def add_to_watchlist(user_id: str, ticker: str, asset_type: str = "stock") -> Optional[dict]:
    try:
        result = _db().table("watchlist").upsert({
            "user_id": user_id,
            "ticker": ticker.upper(),
            "asset_type": asset_type,
        }).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("add_watchlist_failed", ticker=ticker, error=sanitize_error(e))
        return None


def remove_from_watchlist(user_id: str, ticker: str) -> bool:
    try:
        _db().table("watchlist").delete().eq("user_id", user_id).eq("ticker", ticker.upper()).execute()
        return True
    except Exception as e:
        logger.error("remove_watchlist_failed", ticker=ticker, error=sanitize_error(e))
        return False


# ── USAGE LOG OPERATIONS ──────────────────────────────────────

def log_usage(
    user_id: str,
    session_id: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost_usd: float,
    tools_used: list = None,
    response_time_ms: int = 0,
) -> None:
    try:
        _db().table("usage_logs").insert({
            "user_id": user_id,
            "session_id": session_id,
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "cost_usd": cost_usd,
            "tools_used": tools_used or [],
            "response_time_ms": response_time_ms,
        }).execute()
    except Exception as e:
        logger.error("log_usage_failed", error=sanitize_error(e))


def get_usage_summary(user_id: str) -> dict:
    try:
        result = _db().table("usage_logs").select("*").eq("user_id", user_id).execute()
        rows = result.data or []
        total_tokens = sum((r.get("prompt_tokens", 0) + r.get("completion_tokens", 0)) for r in rows)
        total_cost = sum(float(r.get("cost_usd", 0)) for r in rows)
        return {
            "total_requests": len(rows),
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 6),
        }
    except Exception as e:
        logger.error("get_usage_summary_failed", user_id=user_id, error=sanitize_error(e))
        return {"total_requests": 0, "total_tokens": 0, "total_cost_usd": 0}


def get_usage_by_model(user_id: str) -> list:
    try:
        result = _db().table("usage_logs").select("*").eq("user_id", user_id).execute()
        rows = result.data or []
        model_stats: dict = {}
        for row in rows:
            model = row.get("model", "unknown")
            if model not in model_stats:
                model_stats[model] = {"model": model, "requests": 0, "tokens": 0, "cost_usd": 0}
            model_stats[model]["requests"] += 1
            model_stats[model]["tokens"] += row.get("prompt_tokens", 0) + row.get("completion_tokens", 0)
            model_stats[model]["cost_usd"] += float(row.get("cost_usd", 0))
        return list(model_stats.values())
    except Exception as e:
        logger.error("get_usage_by_model_failed", user_id=user_id, error=sanitize_error(e))
        return []


# ── TAX RECORDS ───────────────────────────────────────────────

def get_tax_records(user_id: str) -> list:
    try:
        result = (
            _db().table("tax_records")
            .select("*")
            .eq("user_id", user_id)
            .order("tax_year", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error("get_tax_records_failed", user_id=user_id, error=sanitize_error(e))
        return []


def save_tax_record(user_id: str, tax_year: int, data: dict) -> Optional[dict]:
    try:
        result = _db().table("tax_records").upsert({
            "user_id": user_id,
            "tax_year": tax_year,
            **data,
        }).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error("save_tax_record_failed", error=sanitize_error(e))
        return None