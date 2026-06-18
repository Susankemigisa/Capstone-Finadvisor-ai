"""
price_alert_workflow.py

Durable price alert monitor — one workflow instance per user alert.

THE PROBLEM WITH APSCHEDULER
-----------------------------
The existing scheduler.py polls ALL alerts every 5 minutes in a single job.
If the server restarts mid-check, the entire batch is lost and won't run again
until the next 5-minute tick — which also requires the server to be up.

THE RESTATE APPROACH
--------------------
Each price alert gets its own durable workflow instance with its own sleep
timer.  The timer state is persisted by Restate, so:

  - Server restarts mid-sleep → workflow resumes from the sleep, not from scratch
  - Alert triggered → workflow marks itself done and exits cleanly
  - Alert deleted by user → workflow is cancelled via Restate's cancel API

HOW IT WORKS
------------
  1. User creates an alert via POST /alerts
  2. The route starts a Restate workflow: restate_client.send("price-alert/monitor", ...)
  3. The workflow wakes every CHECK_INTERVAL_MINUTES, fetches the price, checks threshold
  4. On trigger: updates DB, sends email, exits
  5. On timeout (MAX_RUNTIME_DAYS): exits silently (alert would be stale)

WORKFLOW ID
-----------
We use the alert's DB id as the Restate workflow key.  This means:
  - Exactly one workflow per alert (idempotent)
  - We can cancel it by key when the user deletes the alert
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

import restate
from restate import Service, Context

from src.utils.logger import get_logger

logger = get_logger(__name__)

price_alert_svc = Service("price-alert")

CHECK_INTERVAL_MINUTES = 5        # how often to poll the price
MAX_RUNTIME_DAYS       = 90       # give up after 90 days (alert is probably stale)


@price_alert_svc.handler()
async def monitor(ctx: Context, payload: dict) -> None:
    """
    Durable price alert monitor.

    payload keys:
        alert_id    : str   — DB row id (also used as the Restate workflow key)
        ticker      : str   — e.g. "AAPL" or "BTC"
        asset_type  : str   — "stock" or "crypto"
        condition   : str   — "above" or "below"
        target_price: float
        user_id     : str
        user_email  : str
        user_name   : str
    """
    alert_id     = payload["alert_id"]
    ticker       = payload["ticker"]
    asset_type   = payload.get("asset_type", "stock")
    condition    = payload["condition"]
    target_price = float(payload["target_price"])
    user_id      = payload["user_id"]
    user_email   = payload["user_email"]
    user_name    = payload.get("user_name", "there")

    max_checks = (MAX_RUNTIME_DAYS * 24 * 60) // CHECK_INTERVAL_MINUTES

    for _ in range(max_checks):
        # ── Fetch current price (ctx.run makes this durable / idempotent) ──
        price = await ctx.run(
            f"fetch-price-{ticker}",
            lambda: _fetch_price(ticker, asset_type),
        )

        if price is not None:
            triggered = (
                (condition == "above" and price >= target_price) or
                (condition == "below" and price <= target_price)
            )

            if triggered:
                # Mark alert as triggered in DB
                await ctx.run(
                    "mark-triggered",
                    lambda: _mark_triggered(alert_id, price),
                )
                # Send email notification
                await ctx.run(
                    "send-email",
                    lambda: _send_alert_email(
                        user_email, user_name, ticker, condition, target_price, price
                    ),
                )
                logger.info(
                    "price_alert_triggered",
                    alert_id=alert_id,
                    ticker=ticker,
                    price=price,
                    target=target_price,
                )
                return  # workflow complete — exits cleanly

        # ── Durable sleep — survives server restarts ──
        await ctx.sleep(timedelta(minutes=CHECK_INTERVAL_MINUTES))

    # Reached max runtime without triggering — exit silently
    logger.info("price_alert_expired", alert_id=alert_id, ticker=ticker)


# ── Helper functions (called inside ctx.run for durability) ──────────────────

def _fetch_price(ticker: str, asset_type: str) -> float | None:
    """Fetch current price synchronously (ctx.run executes in a thread)."""
    try:
        import yfinance as yf
        sym  = f"{ticker}-USD" if asset_type == "crypto" else ticker
        info = yf.Ticker(sym).info
        return info.get("regularMarketPrice") or info.get("currentPrice")
    except Exception as e:
        logger.warning("price_fetch_failed", ticker=ticker, error=str(e))
        return None


def _mark_triggered(alert_id: str, price: float) -> None:
    from src.database.operations import _db
    _db().table("price_alerts").update({
        "triggered":       True,
        "triggered_price": price,
        "triggered_at":    "now()",
    }).eq("id", alert_id).execute()


def _send_alert_email(
    user_email: str,
    user_name:  str,
    ticker:     str,
    condition:  str,
    target:     float,
    price:      float,
) -> None:
    import asyncio
    from src.api.routes.notifications import _send_email

    direction = "risen above" if condition == "above" else "fallen below"
    arrow     = "📈" if condition == "above" else "📉"
    html = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;
                background: #0a0c10; color: #e8e0d0; border-radius: 12px;">
        <h2 style="color: #c9a84c;">{arrow} Price Alert Triggered!</h2>
        <p>Hi {user_name},</p>
        <p>Your price alert for <strong style="color: #c9a84c">{ticker}</strong> has triggered.</p>
        <div style="background: #1a1c22; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <div style="font-size: 28px; font-weight: 700; color: #c9a84c;">${price:,.2f}</div>
            <div style="color: #888; font-size: 13px; margin-top: 4px;">
                Has {direction} your target of <strong>${target:,.2f}</strong>
            </div>
        </div>
        <a href="https://finadvisor-ai-app-two.vercel.app/alerts"
           style="display: inline-block; background: #c9a84c; color: #0a0c10;
                  padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            View Alerts →
        </a>
        <p style="color: #555; font-size: 11px; margin-top: 24px;">
            FinAdvisor AI · Unsubscribe from alerts in Settings
        </p>
    </div>
    """
    # _send_email is async — run it from this sync ctx.run context
    asyncio.get_event_loop().run_until_complete(
        _send_email(
            to=user_email,
            subject=f"{arrow} {ticker} alert triggered — ${price:,.2f}",
            html=html,
        )
    )
