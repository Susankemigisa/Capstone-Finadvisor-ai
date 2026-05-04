"""
Background scheduler — runs inside the FastAPI process.
- Checks price alerts every 5 minutes and sends email notifications.
- Checks watchlist tickers every 30 minutes and emails users about significant moves (≥ 2%).
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from src.utils.logger import get_logger

logger = get_logger(__name__)
scheduler = AsyncIOScheduler()

# Minimum % move on a watchlist ticker to trigger an email notification.
_WATCHLIST_MOVE_THRESHOLD_PCT = 2.0


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


async def check_watchlist_moves():
    """
    Check all watchlist tickers every 30 minutes.
    Emails users when a ticker moves ≥ 2% from the previous close.
    Uses the `email_watchlist_alerts` notification preference.
    """
    try:
        import yfinance as yf
        from src.database.operations import _db
        from src.api.routes.notifications import send_notification_email

        # Get all distinct watchlist items with user emails
        result = _db().table("watchlist_items").select("*, users(email, preferred_name, full_name)").eq("is_active", True).execute()
        items = result.data or []

        if not items:
            return

        # Group tickers to avoid duplicate API calls
        ticker_data: dict = {}
        unique_tickers = list({item["ticker"] for item in items})
        for ticker in unique_tickers:
            try:
                info = yf.Ticker(ticker).info
                price = info.get("regularMarketPrice") or info.get("currentPrice")
                prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
                ticker_data[ticker] = {"price": price, "prev_close": prev_close}
            except Exception:
                ticker_data[ticker] = {"price": None, "prev_close": None}

        # Group notifiable items by user to send one email per user (not per ticker)
        user_alerts: dict[str, list] = {}
        for item in items:
            ticker = item["ticker"]
            td = ticker_data.get(ticker, {})
            price = td.get("price")
            prev_close = td.get("prev_close")

            if not price or not prev_close or prev_close == 0:
                continue

            pct_change = ((price - prev_close) / prev_close) * 100
            if abs(pct_change) < _WATCHLIST_MOVE_THRESHOLD_PCT:
                continue

            user_id = item["user_id"]
            if user_id not in user_alerts:
                user_alerts[user_id] = []
            user_alerts[user_id].append({
                "ticker":     ticker,
                "price":      price,
                "prev_close": prev_close,
                "pct_change": pct_change,
                "item":       item,
            })

        logger.info("watchlist_check_complete", users_with_moves=len(user_alerts))

        for user_id, moves in user_alerts.items():
            try:
                rows = []
                for m in moves:
                    arrow   = "📈" if m["pct_change"] > 0 else "📉"
                    color   = "#4ade80" if m["pct_change"] > 0 else "#f87171"
                    sign    = "+" if m["pct_change"] > 0 else ""
                    rows.append(
                        f"<tr>"
                        f"<td style='padding:10px 8px; font-weight:600; color:#c9a84c;'>{arrow} {m['ticker']}</td>"
                        f"<td style='padding:10px 8px;'>${m['price']:,.2f}</td>"
                        f"<td style='padding:10px 8px; color:{color}; font-weight:600;'>{sign}{m['pct_change']:.2f}%</td>"
                        f"</tr>"
                    )
                rows_html = "\n".join(rows)
                summary_line = f"{len(moves)} watchlist ticker{'s' if len(moves) != 1 else ''} moved ≥{_WATCHLIST_MOVE_THRESHOLD_PCT:.0f}% today"

                html = f"""
                <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #0a0c10; color: #e8e0d0; border-radius: 12px;">
                    <h2 style="color: #c9a84c; font-size: 18px;">📊 Watchlist Movement Alert</h2>
                    <p style="color: #9a9590; font-size: 14px; margin-bottom: 16px;">{summary_line}</p>
                    <table style="width:100%; border-collapse:collapse; background:#1a1c22; border-radius:8px; overflow:hidden;">
                        <thead>
                            <tr style="color:#666; font-size:12px; text-transform:uppercase;">
                                <th style="padding:8px; text-align:left;">Ticker</th>
                                <th style="padding:8px; text-align:left;">Price</th>
                                <th style="padding:8px; text-align:left;">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows_html}
                        </tbody>
                    </table>
                    <a href="https://finadvisor-ai-app-two.vercel.app/watchlist"
                       style="display:inline-block; background:#c9a84c; color:#0a0c10; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600; margin-top:20px;">
                        View Watchlist →
                    </a>
                    <p style="color:#555; font-size:11px; margin-top:24px;">FinAdvisor AI · Manage notifications in Settings</p>
                </div>
                """
                await send_notification_email(
                    user_id=user_id,
                    pref_field="email_watchlist_alerts",
                    subject=f"📊 {moves[0]['ticker']} {'and others' if len(moves) > 1 else ''} moved significantly today",
                    html=html,
                )
            except Exception as e:
                logger.error("watchlist_email_failed", user_id=user_id, error=str(e))

    except Exception as e:
        logger.error("watchlist_check_failed", error=str(e))


def start_scheduler():
    """Start the background scheduler."""
    scheduler.add_job(
        check_all_price_alerts,
        trigger="interval",
        minutes=5,
        id="price_alert_checker",
        replace_existing=True,
    )
    scheduler.add_job(
        check_watchlist_moves,
        trigger="interval",
        minutes=30,
        id="watchlist_move_checker",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("scheduler_started", jobs=["price_alert_checker (every 5 min)", "watchlist_move_checker (every 30 min)"])


def stop_scheduler():
    """Stop the background scheduler."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("scheduler_stopped")