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
    """Send a test email to the user."""
    from src.config.settings import settings
    email = current_user["email"]

    if not settings.SENDGRID_API_KEY and not settings.SMTP_HOST:
        return {"sent": False, "reason": "No email provider configured. Add SENDGRID_API_KEY or SMTP_HOST to .env"}

    try:
        await _send_email(
            to=email,
            subject="FinAdvisor AI — Test Notification",
            html=f"""
            <div style="font-family: monospace; max-width: 500px; margin: 0 auto; background: #0a0c10; color: #e8e3d6; padding: 32px; border-radius: 8px;">
              <div style="color: #c9a84c; font-size: 12px; letter-spacing: 0.1em; margin-bottom: 20px;">◆ FINADVISOR AI</div>
              <h2 style="font-size: 20px; font-weight: 400; margin-bottom: 12px;">Test notification</h2>
              <p style="color: #9a9590; font-size: 14px;">Email notifications are working correctly for <strong style="color: #e8e3d6;">{email}</strong>.</p>
            </div>
            """
        )
        logger.info("test_email_sent", email=email)
        return {"sent": True}
    except Exception as e:
        logger.error("test_email_failed", error=str(e))
        return {"sent": False, "reason": str(e)}


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