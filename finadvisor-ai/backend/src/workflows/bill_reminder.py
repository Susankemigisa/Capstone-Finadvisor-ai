"""
bill_reminder_workflow.py

Durable bill reminder — one workflow instance per bill per user.

Sends a reminder email N days before the bill's due date, then waits for
the user to mark it paid (or the due date passes) before exiting.

This is a genuinely new capability the app didn't have before — APScheduler
couldn't implement it cleanly because it would need to know about every bill's
specific due date and store that state durably across restarts.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import restate
from restate import Service, Context

from src.utils.logger import get_logger

logger = get_logger(__name__)

bill_reminder_svc = Service("bill-reminder")

REMINDER_DAYS_BEFORE = 3   # send reminder 3 days before due date by default


@bill_reminder_svc.handler()
async def remind(ctx: Context, payload: dict) -> None:
    """
    Bill reminder workflow.

    payload keys:
        bill_id      : str            — DB bill row id (Restate workflow key)
        user_id      : str
        user_email   : str
        user_name    : str
        bill_name    : str            — e.g. "Rent", "UMEME", "DStv"
        amount       : float
        currency     : str
        due_date     : str            — ISO date, e.g. "2026-07-01"
        remind_days  : int (optional) — days before due date to send reminder
    """
    bill_id     = payload["bill_id"]
    user_id     = payload["user_id"]
    user_email  = payload["user_email"]
    user_name   = payload.get("user_name", "there")
    bill_name   = payload["bill_name"]
    amount      = float(payload["amount"])
    currency    = payload.get("currency", "UGX")
    due_date    = datetime.fromisoformat(payload["due_date"])
    remind_days = int(payload.get("remind_days", REMINDER_DAYS_BEFORE))

    remind_at = due_date - timedelta(days=remind_days)
    now       = datetime.utcnow()

    # ── Sleep until the reminder date ────────────────────────────────────────
    if remind_at > now:
        await ctx.sleep(remind_at - now)

    # Check the bill hasn't been marked paid already
    is_paid = await ctx.run(
        "check-paid",
        lambda: _is_bill_paid(bill_id),
    )
    if is_paid:
        logger.info("bill_already_paid", bill_id=bill_id)
        return

    # ── Send reminder email ───────────────────────────────────────────────────
    await ctx.run(
        "send-reminder",
        lambda: _send_reminder_email(
            user_email, user_name, bill_name, amount, currency, due_date, remind_days
        ),
    )
    logger.info("bill_reminder_sent", bill_id=bill_id, bill_name=bill_name)

    # ── Sleep until due date, then send overdue notice if still unpaid ───────
    if due_date > datetime.utcnow():
        await ctx.sleep(due_date - datetime.utcnow())

    is_paid_now = await ctx.run(
        "check-paid-final",
        lambda: _is_bill_paid(bill_id),
    )
    if not is_paid_now:
        await ctx.run(
            "send-overdue",
            lambda: _send_overdue_email(
                user_email, user_name, bill_name, amount, currency
            ),
        )
        logger.info("bill_overdue_notice_sent", bill_id=bill_id)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_bill_paid(bill_id: str) -> bool:
    try:
        from src.database.operations import _db
        result = _db().table("bills").select("is_paid").eq("id", bill_id).execute()
        if result.data:
            return result.data[0].get("is_paid", False)
        return True   # bill deleted — treat as done
    except Exception:
        return False


def _send_reminder_email(
    user_email:  str,
    user_name:   str,
    bill_name:   str,
    amount:      float,
    currency:    str,
    due_date:    datetime,
    remind_days: int,
) -> None:
    import asyncio
    from src.api.routes.notifications import _send_email

    due_str = due_date.strftime("%A, %d %B %Y")
    html = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;
                background: #0a0c10; color: #e8e0d0; border-radius: 12px;">
        <h2 style="color: #c9a84c;">🔔 Bill Due in {remind_days} Days</h2>
        <p>Hi {user_name},</p>
        <p>This is a reminder that your bill is coming up:</p>
        <div style="background: #1a1c22; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <div style="font-size: 20px; font-weight: 700; color: #c9a84c;">{bill_name}</div>
            <div style="font-size: 24px; font-weight: 700; margin-top: 8px;">
                {currency} {amount:,.2f}
            </div>
            <div style="color: #888; font-size: 13px; margin-top: 6px;">Due: {due_str}</div>
        </div>
        <a href="https://finadvisor-ai-app-two.vercel.app/budget"
           style="display:inline-block; background:#c9a84c; color:#0a0c10;
                  padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600;">
            Mark as Paid →
        </a>
        <p style="color:#555; font-size:11px; margin-top:24px;">
            FinAdvisor AI · Manage bills in Budget
        </p>
    </div>
    """
    asyncio.get_event_loop().run_until_complete(
        _send_email(
            to=user_email,
            subject=f"🔔 {bill_name} due in {remind_days} days — {currency} {amount:,.2f}",
            html=html,
        )
    )


def _send_overdue_email(
    user_email: str,
    user_name:  str,
    bill_name:  str,
    amount:     float,
    currency:   str,
) -> None:
    import asyncio
    from src.api.routes.notifications import _send_email

    html = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;
                background: #0a0c10; color: #e8e0d0; border-radius: 12px;">
        <h2 style="color: #f87171;">⚠️ Bill Overdue</h2>
        <p>Hi {user_name},</p>
        <p>Your bill <strong style="color:#c9a84c">{bill_name}</strong> was due today
           and hasn't been marked as paid yet.</p>
        <div style="background: #1a1c22; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <div style="font-size: 24px; font-weight: 700; color: #f87171;">
                {currency} {amount:,.2f}
            </div>
        </div>
        <a href="https://finadvisor-ai-app-two.vercel.app/budget"
           style="display:inline-block; background:#c9a84c; color:#0a0c10;
                  padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600;">
            Mark as Paid →
        </a>
        <p style="color:#555; font-size:11px; margin-top:24px;">FinAdvisor AI</p>
    </div>
    """
    asyncio.get_event_loop().run_until_complete(
        _send_email(
            to=user_email,
            subject=f"⚠️ {bill_name} is overdue — {currency} {amount:,.2f}",
            html=html,
        )
    )
