"""
monthly_report_workflow.py

Durable monthly financial report generator.

Generates and emails a personalised financial report on the 1st of every month.
Runs forever per user until they opt out.

Without Restate this would require a cron job that:
  - Must be re-registered after every restart
  - Has no way to know if it already ran this month (risks duplicate emails)

Restate's durable sleep handles both problems:
  - Sleep wakes at exactly the right time regardless of restarts
  - Each wake corresponds to exactly one month — no duplicates
"""

from __future__ import annotations

from datetime import datetime, timedelta

import restate
from restate import Service, Context

from src.utils.logger import get_logger

logger = get_logger(__name__)

monthly_report_svc = Service("monthly-report")


@monthly_report_svc.handler()
async def generate_monthly(ctx: Context, payload: dict) -> None:
    """
    Monthly report workflow — runs on the 1st of every month per user.

    payload keys:
        user_id    : str
        user_email : str
        user_name  : str
    """
    user_id    = payload["user_id"]
    user_email = payload["user_email"]
    user_name  = payload.get("user_name", "there")

    while True:
        # ── Calculate sleep until 1st of next month at 08:00 user local time ──
        now  = datetime.utcnow()
        if now.month == 12:
            next_run = datetime(now.year + 1, 1, 1, 8, 0, 0)
        else:
            next_run = datetime(now.year, now.month + 1, 1, 8, 0, 0)

        sleep_duration = next_run - now
        await ctx.sleep(sleep_duration)

        # ── Generate report (durable — won't re-run if server restarts here) ──
        report_data = await ctx.run(
            f"gather-report-data-{now.strftime('%Y-%m')}",
            lambda: _gather_report_data(user_id),
        )

        # ── Send email ────────────────────────────────────────────────────────
        month_label = next_run.strftime("%B %Y")
        await ctx.run(
            f"send-report-{now.strftime('%Y-%m')}",
            lambda: _send_report_email(user_email, user_name, month_label, report_data),
        )

        logger.info("monthly_report_sent", user_id=user_id, month=month_label)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _gather_report_data(user_id: str) -> dict:
    """
    Pull summary data from the DB for the report.
    Returns a dict with budget, savings, portfolio, and goal progress.
    """
    try:
        from src.database.operations import _db
        db = _db()

        # Budget: total spent this month across all categories
        budget_result = db.table("budget_transactions") \
            .select("amount, category") \
            .eq("user_id", user_id) \
            .gte("created_at", _first_of_month()) \
            .execute()
        transactions = budget_result.data or []
        total_spent  = sum(float(t.get("amount", 0)) for t in transactions)

        # Savings: total across all pockets
        savings_result = db.table("savings_pockets") \
            .select("name, balance, currency") \
            .eq("user_id", user_id) \
            .execute()
        pockets = savings_result.data or []
        total_saved = sum(float(p.get("balance", 0)) for p in pockets)

        # Goals: count active vs completed
        goals_result = db.table("goals") \
            .select("title, target_amount, current_amount, is_completed") \
            .eq("user_id", user_id) \
            .execute()
        goals = goals_result.data or []
        completed_goals = sum(1 for g in goals if g.get("is_completed"))

        return {
            "total_spent":      total_spent,
            "total_saved":      total_saved,
            "pocket_count":     len(pockets),
            "goal_count":       len(goals),
            "completed_goals":  completed_goals,
            "transaction_count": len(transactions),
        }
    except Exception as e:
        logger.error("report_data_gather_failed", user_id=user_id, error=str(e))
        return {}


def _first_of_month() -> str:
    now = datetime.utcnow()
    return datetime(now.year, now.month, 1).isoformat()


def _send_report_email(
    user_email:  str,
    user_name:   str,
    month_label: str,
    data:        dict,
) -> None:
    import asyncio
    from src.api.routes.notifications import _send_email

    spent    = data.get("total_spent", 0)
    saved    = data.get("total_saved", 0)
    txn_count = data.get("transaction_count", 0)
    goals    = data.get("goal_count", 0)
    done     = data.get("completed_goals", 0)

    html = f"""
    <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 24px;
                background: #0a0c10; color: #e8e0d0; border-radius: 12px;">
        <h2 style="color: #c9a84c;">📊 Your {month_label} Financial Report</h2>
        <p>Hi {user_name}, here's your monthly summary:</p>

        <table style="width:100%; border-collapse:collapse; margin: 20px 0;">
            <tr style="background:#1a1c22;">
                <td style="padding:14px 16px; border-radius:8px 0 0 8px; color:#888; font-size:13px;">Total Spent</td>
                <td style="padding:14px 16px; border-radius:0 8px 8px 0; font-size:20px; font-weight:700; color:#f87171; text-align:right;">
                    ${spent:,.2f}
                </td>
            </tr>
            <tr><td colspan="2" style="height:8px;"></td></tr>
            <tr style="background:#1a1c22;">
                <td style="padding:14px 16px; border-radius:8px 0 0 8px; color:#888; font-size:13px;">Total Saved</td>
                <td style="padding:14px 16px; border-radius:0 8px 8px 0; font-size:20px; font-weight:700; color:#4ade80; text-align:right;">
                    ${saved:,.2f}
                </td>
            </tr>
            <tr><td colspan="2" style="height:8px;"></td></tr>
            <tr style="background:#1a1c22;">
                <td style="padding:14px 16px; border-radius:8px 0 0 8px; color:#888; font-size:13px;">Transactions</td>
                <td style="padding:14px 16px; border-radius:0 8px 8px 0; font-size:20px; font-weight:700; color:#c9a84c; text-align:right;">
                    {txn_count}
                </td>
            </tr>
            <tr><td colspan="2" style="height:8px;"></td></tr>
            <tr style="background:#1a1c22;">
                <td style="padding:14px 16px; border-radius:8px 0 0 8px; color:#888; font-size:13px;">Goals Completed</td>
                <td style="padding:14px 16px; border-radius:0 8px 8px 0; font-size:20px; font-weight:700; color:#c9a84c; text-align:right;">
                    {done} / {goals}
                </td>
            </tr>
        </table>

        <a href="https://finadvisor-ai-app-two.vercel.app/analytics"
           style="display:inline-block; background:#c9a84c; color:#0a0c10;
                  padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600;">
            View Full Analytics →
        </a>
        <p style="color:#555; font-size:11px; margin-top:24px;">
            FinAdvisor AI · Manage report preferences in Settings
        </p>
    </div>
    """
    asyncio.get_event_loop().run_until_complete(
        _send_email(
            to=user_email,
            subject=f"📊 Your {month_label} Financial Report — FinAdvisor AI",
            html=html,
        )
    )
