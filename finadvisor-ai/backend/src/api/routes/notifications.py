from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from src.auth.dependencies import get_current_user
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict  # {p256dh, auth}


class NotificationPrefs(BaseModel):
    email_market_alerts: bool = True
    email_portfolio_summary: bool = True
    email_weekly_report: bool = True
    email_savings_rules: bool = True       # auto-save rule fired
    email_transactions: bool = True        # bank / MoMo income received
    email_watchlist_alerts: bool = True    # watchlist ticker moved ≥ 2%
    push_enabled: bool = False
    push_price_alerts: bool = True


@router.post("/push/subscribe")
async def subscribe_push(
    sub: PushSubscription,
    current_user: dict = Depends(get_current_user)
):
    """Save browser push subscription for a user."""
    try:
        from src.database.operations import _db
        user_id = current_user["user_id"]
        _db().table("push_subscriptions").upsert({
            "user_id": user_id,
            "endpoint": sub.endpoint,
            "p256dh": sub.keys.get("p256dh"),
            "auth": sub.keys.get("auth"),
        }).execute()
        logger.info("push_subscribed", user_id=user_id)
        return {"subscribed": True}
    except Exception as e:
        logger.error("push_subscribe_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/push/unsubscribe")
async def unsubscribe_push(current_user: dict = Depends(get_current_user)):
    try:
        from src.database.operations import _db
        _db().table("push_subscriptions").delete().eq("user_id", current_user["user_id"]).execute()
        return {"unsubscribed": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preferences")
async def get_prefs(current_user: dict = Depends(get_current_user)):
    try:
        from src.database.operations import _db, get_user_by_id
        user_id = current_user["user_id"]
        rows = _db().table("notification_prefs").select("*").eq("user_id", user_id).execute().data
        if rows:
            return rows[0]
        # Return defaults
        return NotificationPrefs().dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preferences")
async def save_prefs(
    prefs: NotificationPrefs,
    current_user: dict = Depends(get_current_user)
):
    try:
        from src.database.operations import _db
        user_id = current_user["user_id"]
        # Check if record exists first
        existing = _db().table("notification_prefs").select("id").eq("user_id", user_id).execute().data
        if existing:
            _db().table("notification_prefs").update(prefs.dict()).eq("user_id", user_id).execute()
        else:
            _db().table("notification_prefs").insert({"user_id": user_id, **prefs.dict()}).execute()
        return {"saved": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-email")
async def send_test_email(current_user: dict = Depends(get_current_user)):
    """
    Send a test email and return a detailed diagnosis.
    Useful for confirming your SENDGRID_API_KEY / SMTP settings are working.
    """
    from src.config.settings import settings
    email = current_user["email"]

    # Diagnose which provider is configured
    has_sendgrid = bool(settings.SENDGRID_API_KEY)
    has_smtp = bool(settings.SMTP_HOST and settings.SMTP_USER)

    if not has_sendgrid and not has_smtp:
        return {
            "sent": False,
            "provider": None,
            "reason": (
                "No email provider configured. "
                "Set SENDGRID_API_KEY in your .env (recommended), "
                "or set SMTP_HOST + SMTP_USER + SMTP_PASSWORD for SMTP."
            ),
            "from_email": settings.FROM_EMAIL or "(not set)",
            "to": email,
        }

    provider = "SendGrid" if has_sendgrid else "SMTP"

    try:
        await _send_email(
            to=email,
            subject="FinAdvisor AI — Test Notification ✅",
            html=f"""
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #0a0c10; color: #e8e3d6; padding: 32px; border-radius: 12px;">
              <div style="color: #c9a84c; font-size: 12px; letter-spacing: 0.1em; margin-bottom: 20px;">◆ FINADVISOR AI</div>
              <h2 style="font-size: 20px; font-weight: 400; margin-bottom: 12px;">Test notification ✅</h2>
              <p style="color: #9a9590; font-size: 14px; margin-bottom: 8px;">
                Email notifications are working correctly via <strong style="color:#c9a84c">{provider}</strong>.
              </p>
              <p style="color: #9a9590; font-size: 14px;">
                Delivered to: <strong style="color: #e8e3d6;">{email}</strong>
              </p>
              <hr style="border-color: #333; margin: 24px 0;">
              <p style="color: #555; font-size: 11px;">
                You will receive emails for: price alerts, auto-save rules, bank/MoMo income, and watchlist movements — based on your notification settings.
              </p>
            </div>
            """
        )
        logger.info("test_email_sent", email=email, provider=provider)
        return {"sent": True, "provider": provider, "to": email}
    except Exception as e:
        logger.error("test_email_failed", error=str(e))
        return {"sent": False, "provider": provider, "to": email, "reason": str(e)}


async def _send_email(to: str, subject: str, html: str):
    """Send email via SendGrid or SMTP."""
    from src.config.settings import settings

    if settings.SENDGRID_API_KEY:
        import httpx
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={"Authorization": f"Bearer {settings.SENDGRID_API_KEY}"},
                json={
                    "personalizations": [{"to": [{"email": to}]}],
                    "from": {"email": settings.FROM_EMAIL or "noreply@finadvisor.ai", "name": "FinAdvisor AI"},
                    "subject": subject,
                    "content": [{"type": "text/html", "value": html}]
                }
            )
            if r.status_code not in (200, 202):
                raise Exception(f"SendGrid error: {r.text}")

    elif settings.SMTP_HOST:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"FinAdvisor AI <{settings.SMTP_USER}>"
        msg["To"] = to
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, to, msg.as_string())

    else:
        raise Exception("No email provider configured. Add SENDGRID_API_KEY or SMTP_HOST to .env")


def _get_user_email_and_prefs(user_id: str) -> tuple[str | None, dict]:
    """
    Return (email, prefs_dict) for a user.
    Prefs default to True (opt-in) when no row exists yet.
    Used by background tasks and webhook handlers that need to check
    notification preferences before sending email.
    """
    try:
        from src.database.operations import _db, get_user_by_id
        user = get_user_by_id(user_id)
        email = user.get("email") if user else None
        rows = _db().table("notification_prefs").select("*").eq("user_id", user_id).execute().data
        prefs = rows[0] if rows else {}
        return email, prefs
    except Exception as e:
        logger.error("get_user_email_prefs_failed", user_id=user_id, error=str(e))
        return None, {}


async def send_notification_email(
    user_id: str,
    pref_field: str,
    subject: str,
    html: str,
) -> bool:
    """
    Check the user's notification preference for `pref_field` and — if enabled
    (or no preference row exists yet, defaulting to opt-in) — send the email.

    Returns True if the email was sent, False if skipped or failed.

    Usage:
        await send_notification_email(
            user_id=user_id,
            pref_field="email_savings_rules",
            subject="Auto-save fired: UGX 20,000 moved to Emergency Fund",
            html=html_body,
        )
    """
    email, prefs = _get_user_email_and_prefs(user_id)
    if not email:
        logger.warning("send_notification_no_email", user_id=user_id, pref_field=pref_field)
        return False

    # Default to True (opt-in) when the pref row doesn't exist yet
    wants_email = prefs.get(pref_field, True)
    if not wants_email:
        logger.info("send_notification_skipped_pref", user_id=user_id, pref_field=pref_field)
        return False

    try:
        await _send_email(to=email, subject=subject, html=html)
        logger.info("notification_email_sent", user_id=user_id, pref_field=pref_field, subject=subject)
        return True
    except Exception as e:
        logger.error("notification_email_failed", user_id=user_id, pref_field=pref_field, error=str(e))
        return False