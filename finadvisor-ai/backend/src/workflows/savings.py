"""
savings_workflow.py

Durable savings automation — one workflow instance per savings rule.

A savings rule is something like:
  "Move UGX 50,000 from my main account to my Emergency Fund pocket every Friday"

With APScheduler this would require a cron job that must be re-registered on
every server restart.  With Restate, the workflow sleeps durably between
transfers and resumes automatically — even after a deployment or OOM kill.

WORKFLOW LIFECYCLE
------------------
  Created  → workflow starts, runs first transfer immediately if due
  Running  → sleeps until next transfer date, wakes, transfers, sleeps again
  Paused   → user pauses the rule; workflow checks is_active flag each cycle
  Deleted  → Restate cancel is called; workflow exits on next wake
"""

from __future__ import annotations

from datetime import datetime, timedelta

import restate
from restate import Service, Context

from src.utils.logger import get_logger

logger = get_logger(__name__)

savings_svc = Service("savings-automation")


@savings_svc.handler()
async def run_rule(ctx: Context, payload: dict) -> None:
    """
    Durable savings rule executor.

    payload keys:
        rule_id      : str   — DB savings_rules row id (Restate workflow key)
        user_id      : str
        pocket_id    : str   — destination savings pocket
        amount       : float — amount to transfer each cycle
        currency     : str   — e.g. "UGX"
        frequency    : str   — "daily" | "weekly" | "biweekly" | "monthly"
        user_email   : str
        user_name    : str
    """
    rule_id   = payload["rule_id"]
    user_id   = payload["user_id"]
    pocket_id = payload["pocket_id"]
    amount    = float(payload["amount"])
    currency  = payload.get("currency", "UGX")
    frequency = payload.get("frequency", "monthly")
    user_email = payload.get("user_email", "")
    user_name  = payload.get("user_name", "there")

    interval = _frequency_to_interval(frequency)

    # Run indefinitely until the rule is deleted (Restate cancels the workflow)
    while True:
        # Check the rule is still active before each transfer
        is_active = await ctx.run(
            "check-rule-active",
            lambda: _is_rule_active(rule_id),
        )
        if not is_active:
            logger.info("savings_rule_deactivated", rule_id=rule_id)
            return

        # Perform the transfer
        success = await ctx.run(
            "transfer",
            lambda: _execute_transfer(rule_id, user_id, pocket_id, amount, currency),
        )

        if success:
            # Notify user via email
            await ctx.run(
                "notify",
                lambda: _send_savings_email(
                    user_email, user_name, amount, currency, frequency, pocket_id
                ),
            )
            logger.info(
                "savings_transfer_completed",
                rule_id=rule_id,
                amount=amount,
                currency=currency,
            )

        # Durable sleep until next cycle — survives server restarts
        await ctx.sleep(interval)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _frequency_to_interval(frequency: str) -> timedelta:
    return {
        "daily":     timedelta(days=1),
        "weekly":    timedelta(weeks=1),
        "biweekly":  timedelta(weeks=2),
        "monthly":   timedelta(days=30),
    }.get(frequency, timedelta(days=30))


def _is_rule_active(rule_id: str) -> bool:
    try:
        from src.database.operations import _db
        result = _db().table("savings_rules").select("is_active").eq("id", rule_id).execute()
        if result.data:
            return result.data[0].get("is_active", False)
        return False  # rule deleted
    except Exception:
        return True   # assume active on DB error (don't kill the workflow)


def _execute_transfer(
    rule_id:   str,
    user_id:   str,
    pocket_id: str,
    amount:    float,
    currency:  str,
) -> bool:
    """
    Record the automated transfer in the savings_transactions table and
    update the pocket balance.  Returns True on success.
    """
    try:
        from src.database.operations import _db
        db = _db()

        # Get current pocket balance
        pocket = db.table("savings_pockets").select("balance").eq("id", pocket_id).execute()
        if not pocket.data:
            logger.error("savings_pocket_not_found", pocket_id=pocket_id)
            return False

        current_balance = float(pocket.data[0]["balance"])
        new_balance     = current_balance + amount

        # Update pocket balance
        db.table("savings_pockets").update({
            "balance":    new_balance,
            "updated_at": "now()",
        }).eq("id", pocket_id).execute()

        # Log the transaction
        db.table("savings_transactions").insert({
            "pocket_id":   pocket_id,
            "user_id":     user_id,
            "rule_id":     rule_id,
            "amount":      amount,
            "currency":    currency,
            "type":        "auto_transfer",
            "description": "Automated savings transfer",
            "created_at":  "now()",
        }).execute()

        # Update rule last_run
        db.table("savings_rules").update({
            "last_run_at": "now()",
        }).eq("id", rule_id).execute()

        return True

    except Exception as e:
        logger.error("savings_transfer_failed", rule_id=rule_id, error=str(e))
        return False


def _send_savings_email(
    user_email: str,
    user_name:  str,
    amount:     float,
    currency:   str,
    frequency:  str,
    pocket_id:  str,
) -> None:
    import asyncio
    from src.api.routes.notifications import _send_email

    html = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;
                background: #0a0c10; color: #e8e0d0; border-radius: 12px;">
        <h2 style="color: #c9a84c;">💰 Automatic Savings Transfer</h2>
        <p>Hi {user_name},</p>
        <p>Your {frequency} savings automation just ran successfully.</p>
        <div style="background: #1a1c22; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <div style="font-size: 24px; font-weight: 700; color: #4ade80;">
                + {currency} {amount:,.0f}
            </div>
            <div style="color: #888; font-size: 13px; margin-top: 4px;">
                Added to your savings pocket
            </div>
        </div>
        <a href="https://finadvisor-ai-app-two.vercel.app/savings"
           style="display: inline-block; background: #c9a84c; color: #0a0c10;
                  padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            View Savings →
        </a>
        <p style="color: #555; font-size: 11px; margin-top: 24px;">
            FinAdvisor AI · Manage automations in Settings
        </p>
    </div>
    """
    asyncio.get_event_loop().run_until_complete(
        _send_email(
            to=user_email,
            subject=f"💰 {currency} {amount:,.0f} saved automatically",
            html=html,
        )
    )
