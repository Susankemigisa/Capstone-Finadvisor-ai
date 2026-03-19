"""
Background scheduler — runs inside the FastAPI process.
Checks price alerts every 5 minutes and sends email notifications.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from src.utils.logger import get_logger

logger = get_logger(__name__)
scheduler = AsyncIOScheduler()


async def check_all_price_alerts():
    """Check all active price alerts for all users and send emails if triggered."""
    try:
        import yfinance as yf
        from src.database.operations import _db
        from src.config.settings import settings

        # Get all active, untriggered alerts
        result = _db().table("price_alerts").select("*, users(email, full_name)").eq("is_active", True).eq("triggered", False).execute()
        alerts = result.data or []

        if not alerts:
            return

        logger.info("alert_check_started", count=len(alerts))

        # Group by ticker to avoid duplicate API calls
        ticker_prices = {}
        for alert in alerts:
            ticker = alert["ticker"]
            asset_type = alert.get("asset_type", "stock")
            if ticker not in ticker_prices:
                try:
                    sym = f"{ticker}-USD" if asset_type == "crypto" else ticker
                    info = yf.Ticker(sym).info
                    price = info.get("regularMarketPrice") or info.get("currentPrice")
                    ticker_prices[ticker] = price
                except Exception:
                    ticker_prices[ticker] = None

        # Check each alert
        triggered_count = 0
        for alert in alerts:
            ticker = alert["ticker"]
            price = ticker_prices.get(ticker)
            if not price:
                continue

            condition = alert["condition"]
            target = float(alert["target_price"])
            hit = (condition == "above" and price >= target) or \
                  (condition == "below" and price <= target)

            if hit:
                # Mark as triggered
                _db().table("price_alerts").update({
                    "triggered": True,
                    "triggered_price": price,
                    "triggered_at": "now()",
                }).eq("id", alert["id"]).execute()

                # Send email notification
                try:
                    user_data = alert.get("users", {})
                    user_email = user_data.get("email") if user_data else None
                    user_name = (user_data.get("full_name") or "").split()[0] if user_data else "there"

                    # Check if user wants email alerts
                    prefs_result = _db().table("notification_prefs").select("email_market_alerts").eq("user_id", alert["user_id"]).execute()
                    prefs = prefs_result.data[0] if prefs_result.data else {}
                    wants_email = prefs.get("email_market_alerts", True)

                    if user_email and wants_email:
                        direction = "risen above" if condition == "above" else "fallen below"
                        arrow = "📈" if condition == "above" else "📉"
                        html = f"""
                        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #0a0c10; color: #e8e0d0; border-radius: 12px;">
                            <h2 style="color: #c9a84c; font-size: 20px;">{arrow} Price Alert Triggered!</h2>
                            <p>Hi {user_name},</p>
                            <p>Your price alert for <strong style="color: #c9a84c">{ticker}</strong> has triggered.</p>
                            <div style="background: #1a1c22; border-radius: 8px; padding: 16px; margin: 16px 0;">
                                <div style="font-size: 28px; font-weight: 700; color: #c9a84c;">${price:,.2f}</div>
                                <div style="color: #888; font-size: 13px; margin-top: 4px;">
                                    Has {direction} your target of <strong>${target:,.2f}</strong>
                                </div>
                            </div>
                            <a href="https://finadvisor-ai-app-two.vercel.app/alerts" 
                               style="display: inline-block; background: #c9a84c; color: #0a0c10; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 8px;">
                                View Alerts →
                            </a>
                            <p style="color: #555; font-size: 11px; margin-top: 24px;">FinAdvisor AI · Unsubscribe from alerts in Settings</p>
                        </div>
                        """
                        from src.api.routes.notifications import _send_email
                        await _send_email(
                            to=user_email,
                            subject=f"{arrow} {ticker} alert triggered — ${price:,.2f}",
                            html=html
                        )
                        triggered_count += 1
                        logger.info("alert_triggered_email_sent", ticker=ticker, price=price, email=user_email)
                except Exception as e:
                    logger.error("alert_email_failed", ticker=ticker, error=str(e))

        if triggered_count:
            logger.info("alerts_processed", triggered=triggered_count)

    except Exception as e:
        logger.error("alert_check_failed", error=str(e))


def start_scheduler():
    """Start the background scheduler."""
    scheduler.add_job(
        check_all_price_alerts,
        trigger="interval",
        minutes=5,
        id="price_alert_checker",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("scheduler_started", jobs=["price_alert_checker (every 5 min)"])


def stop_scheduler():
    """Stop the background scheduler."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("scheduler_stopped")