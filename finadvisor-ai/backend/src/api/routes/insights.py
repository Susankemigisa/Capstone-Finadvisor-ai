"""
insights.py — Financial Insights API (replaces /analytics for the Insights page).

The frontend /insights page aggregates data from portfolio, budget, goals,
and savings in a single call rather than four separate round trips.  This
endpoint does all the joining server-side and returns a pre-computed
financial health score.

Endpoints
---------
GET /insights          – full insights payload
GET /insights/score    – just the health score (lightweight polling)

Health score algorithm (max 100)
---------------------------------
savings_rate >= 20%          → +30 pts
savings_rate 10–19%          → +20 pts
savings_rate  5–9%           → +10 pts
savings_rate  1–4%           → +5  pts
goal_progress >= 75%         → +25 pts
goal_progress 50–74%         → +18 pts
goal_progress 25–49%         → +10 pts
goal_progress  1–24%         → +5  pts
has_emergency_fund           → +20 pts
budget_entries >= 10         → +15 pts
budget_entries  5–9          → +10 pts
budget_entries  1–4          → +5  pts
debt_ratio == 0              → +10 pts   (future — placeholder at 0)
"""

from fastapi import APIRouter, Depends, HTTPException
from src.auth.dependencies import get_current_user
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ── DB helper ─────────────────────────────────────────────────

def _db():
    from src.database.client import get_supabase
    return get_supabase()


# ── Internal helpers ──────────────────────────────────────────

def _calc_health_score(
    savings_rate: float,
    goal_progress: float,
    has_emergency_fund: bool,
    budget_entry_count: int,
    debt_ratio: float = 0.0,
) -> int:
    score = 0

    # Savings rate component (max 30)
    if savings_rate >= 20:   score += 30
    elif savings_rate >= 10: score += 20
    elif savings_rate >= 5:  score += 10
    elif savings_rate > 0:   score += 5

    # Goal progress component (max 25)
    if goal_progress >= 75:   score += 25
    elif goal_progress >= 50: score += 18
    elif goal_progress >= 25: score += 10
    elif goal_progress > 0:   score += 5

    # Emergency fund (max 20)
    if has_emergency_fund:    score += 20

    # Budget tracking habit (max 15)
    if budget_entry_count >= 10:  score += 15
    elif budget_entry_count >= 5: score += 10
    elif budget_entry_count >= 1: score += 5

    # Debt ratio (max 10 — reserved for future debt tracking feature)
    if debt_ratio == 0:       score += 10
    elif debt_ratio < 0.2:    score += 7
    elif debt_ratio < 0.4:    score += 3

    return min(round(score), 100)


def _get_portfolio_value(user_id: str) -> float:
    """Fetch portfolio total_value without live prices (use stored avg_buy_price for speed)."""
    try:
        r = _db().table("portfolio_positions") \
            .select("shares, avg_buy_price") \
            .eq("user_id", user_id) \
            .execute()
        return sum(float(p["shares"]) * float(p["avg_buy_price"]) for p in (r.data or []))
    except Exception:
        return 0.0


def _get_budget_summary(user_id: str) -> dict:
    """Return income, expenses, net, and entries for the current calendar month."""
    try:
        from datetime import date
        month = date.today().strftime("%Y-%m")
        r = _db().table("budget_entries") \
            .select("amount, entry_type, category") \
            .eq("user_id", user_id) \
            .like("entry_date", f"{month}%") \
            .execute()
        entries = r.data or []
        income   = sum(float(e["amount"]) for e in entries if e["entry_type"] == "income")
        expenses = sum(float(e["amount"]) for e in entries if e["entry_type"] == "expense")

        # Spending by category
        by_cat: dict[str, float] = {}
        for e in entries:
            if e["entry_type"] == "expense":
                cat = e.get("category") or "Other"
                by_cat[cat] = by_cat.get(cat, 0) + float(e["amount"])

        return {
            "income":           round(income, 2),
            "expenses":         round(expenses, 2),
            "net":              round(income - expenses, 2),
            "entry_count":      len(entries),
            "spending_by_category": dict(
                sorted(by_cat.items(), key=lambda x: x[1], reverse=True)
            ),
        }
    except Exception as e:
        logger.warning("budget_summary_failed", error=str(e))
        return {"income": 0, "expenses": 0, "net": 0, "entry_count": 0, "spending_by_category": {}}


def _get_goals_summary(user_id: str) -> dict:
    """Return goals list and average progress percentage."""
    try:
        r = _db().table("financial_goals") \
            .select("id, goal_name, goal_type, target_amount, current_amount, target_date, is_completed") \
            .eq("user_id", user_id) \
            .order("created_at", desc=False) \
            .execute()
        goals = r.data or []
        if not goals:
            return {"goals": [], "avg_progress": 0.0}

        total_progress = 0.0
        for g in goals:
            target = float(g.get("target_amount") or 0)
            current = float(g.get("current_amount") or 0)
            pct = min(current / target * 100, 100) if target > 0 else 0
            g["progress_pct"] = round(pct, 1)
            total_progress += pct

        avg = total_progress / len(goals)
        return {"goals": goals, "avg_progress": round(avg, 1)}
    except Exception as e:
        logger.warning("goals_summary_failed", error=str(e))
        return {"goals": [], "avg_progress": 0.0}


def _get_savings_summary(user_id: str) -> dict:
    """Return pockets, total saved, and emergency fund flag."""
    try:
        r = _db().table("savings_pockets") \
            .select("id, name, current_amount, target_amount, currency, icon, color") \
            .eq("user_id", user_id) \
            .eq("is_active", True) \
            .execute()
        pockets = r.data or []
        total = sum(float(p.get("current_amount", 0)) for p in pockets)
        has_emergency = any(
            "emergency" in (p.get("name") or "").lower() and float(p.get("current_amount", 0)) > 0
            for p in pockets
        )
        return {
            "pockets":          pockets,
            "total_saved":      round(total, 2),
            "has_emergency_fund": has_emergency,
        }
    except Exception as e:
        logger.warning("savings_summary_failed", error=str(e))
        return {"pockets": [], "total_saved": 0.0, "has_emergency_fund": False}


# ── GET /insights ─────────────────────────────────────────────

@router.get("")
async def get_insights(current_user: dict = Depends(get_current_user)):
    """
    Full financial insights payload — single endpoint for the Insights page.

    Aggregates portfolio, budget, goals, and savings data then computes
    a financial health score (0–100) and actionable insight messages.
    """
    user_id = current_user["user_id"]

    try:
        # Gather all data in parallel-ish (synchronous Supabase client)
        portfolio_value = _get_portfolio_value(user_id)
        budget          = _get_budget_summary(user_id)
        goals_data      = _get_goals_summary(user_id)
        savings         = _get_savings_summary(user_id)

        income   = budget["income"]
        expenses = budget["expenses"]
        net      = budget["net"]
        savings_rate = max((income - expenses) / income * 100, 0) if income > 0 else 0

        net_worth = portfolio_value + savings["total_saved"]

        health_score = _calc_health_score(
            savings_rate=savings_rate,
            goal_progress=goals_data["avg_progress"],
            has_emergency_fund=savings["has_emergency_fund"],
            budget_entry_count=budget["entry_count"],
        )

        # Build insight messages (keys match frontend translation keys)
        insight_keys: list[dict] = []
        if income > 0:
            if savings_rate >= 20:
                insight_keys.append({"type": "success", "key": "insightGoodSavings", "rate": round(savings_rate, 1)})
            elif savings_rate < 10:
                insight_keys.append({"type": "warning", "key": "insightLowSavings",  "rate": round(savings_rate, 1)})

        if savings["has_emergency_fund"]:
            insight_keys.append({"type": "success", "key": "insightHasEmergency"})
        else:
            insight_keys.append({"type": "warning", "key": "insightNoEmergency"})

        if income > 0 and expenses > income:
            insight_keys.append({
                "type": "danger",
                "key": "insightOverspending",
                "amount": round(expenses - income, 2),
            })

        if goals_data["goals"]:
            near = [
                g for g in goals_data["goals"]
                if g["progress_pct"] >= 80 and g["progress_pct"] < 100
            ]
            if near:
                insight_keys.append({
                    "type": "success",
                    "key": "insightNearGoal",
                    "goal": near[0].get("goal_name", ""),
                    "pct":  near[0]["progress_pct"],
                })
        else:
            insight_keys.append({"type": "info", "key": "insightNoGoals"})

        top_cats = list(budget["spending_by_category"].items())
        if top_cats and expenses > 0:
            cat, amt = top_cats[0]
            insight_keys.append({
                "type":     "info",
                "key":      "insightTopCategory",
                "category": cat,
                "pct":      round(amt / expenses * 100, 0),
            })

        return {
            # Aggregates
            "net_worth":       round(net_worth, 2),
            "portfolio_value": round(portfolio_value, 2),
            "savings_total":   savings["total_saved"],
            "health_score":    health_score,

            # This month
            "income":          income,
            "expenses":        expenses,
            "net":             net,
            "savings_rate":    round(savings_rate, 2),

            # Breakdowns
            "spending_by_category": budget["spending_by_category"],
            "pockets":              savings["pockets"],
            "goals":                goals_data["goals"],

            # Insight messages (frontend translates these using the key)
            "insights":             insight_keys,

            # Metadata
            "has_emergency_fund":   savings["has_emergency_fund"],
            "budget_entry_count":   budget["entry_count"],
            "goal_count":           len(goals_data["goals"]),
        }

    except Exception as e:
        logger.error("get_insights_failed", user_id=user_id, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to compute insights")


# ── GET /insights/score ───────────────────────────────────────

@router.get("/score")
async def get_health_score(current_user: dict = Depends(get_current_user)):
    """
    Lightweight health score endpoint — used for dashboard widgets
    that only need the number, not the full payload.
    """
    user_id = current_user["user_id"]
    try:
        budget  = _get_budget_summary(user_id)
        savings = _get_savings_summary(user_id)
        goals   = _get_goals_summary(user_id)

        income   = budget["income"]
        expenses = budget["expenses"]
        savings_rate = max((income - expenses) / income * 100, 0) if income > 0 else 0

        score = _calc_health_score(
            savings_rate=savings_rate,
            goal_progress=goals["avg_progress"],
            has_emergency_fund=savings["has_emergency_fund"],
            budget_entry_count=budget["entry_count"],
        )
        return {"health_score": score}
    except Exception as e:
        logger.error("get_health_score_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to compute health score")
