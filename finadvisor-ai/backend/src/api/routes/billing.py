"""
billing.py — Subscription payments via MTN Mobile Money & Airtel Money Uganda.

No Stripe. No Payoneer. No international payout issues.
Money goes directly from user's MoMo wallet → your merchant MoMo number.

Flow:
    1. User picks a plan and enters their MoMo number
    2. Backend calls MTN/Airtel API → pushes a payment prompt to their phone
    3. User approves on their phone (enters MoMo PIN)
    4. MTN/Airtel sends a callback to /billing/callback/mtn or /billing/callback/airtel
    5. Backend verifies → sets user tier='pro'
    6. Monthly: scheduler re-runs the charge automatically on renewal date

Plans are priced in UGX. No currency conversion needed.
Your money lands directly in your MTN/Airtel merchant wallet, then you
withdraw to your Equity/Stanbic bank account via normal MoMo withdrawal.
"""

import uuid
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel

from src.auth.dependencies import get_current_user
from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ── Plans (priced in UGX) ─────────────────────────────────────
PLANS = {
    "pro_monthly": {
        "name": "Pro Monthly",
        "amount_ugx": 50000,        # UGX 50,000/month (~$13 USD)
        "interval_days": 30,
        "interval_label": "month",
        "features": [
            "Unlimited messages",
            "All AI models",
            "Advanced analytics",
            "Export to PDF & Excel",
            "Priority support",
            "Early access to new features",
        ],
    },
    "pro_yearly": {
        "name": "Pro Yearly",
        "amount_ugx": 480000,       # UGX 480,000/year (saves UGX 120,000 vs monthly)
        "interval_days": 365,
        "interval_label": "year",
        "features": [
            "Everything in Monthly",
            "Save UGX 120,000 vs monthly",
            "Early access to new features",
        ],
    },
}


# ── DB helper ─────────────────────────────────────────────────
def _db():
    from src.database.client import get_supabase
    return get_supabase()


# ── MTN MoMo helpers ─────────────────────────────────────────

async def _mtn_get_token() -> str:
    import base64
    credentials = base64.b64encode(
        f"{settings.MOMO_API_USER}:{settings.MOMO_API_KEY}".encode()
    ).decode()
    base = "https://sandbox.momodeveloper.mtn.com" if settings.MOMO_TARGET_ENVIRONMENT == "sandbox" \
        else "https://proxy.momoapi.mtn.com"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{base}/collection/token/",
            headers={
                "Authorization": f"Basic {credentials}",
                "Ocp-Apim-Subscription-Key": settings.MOMO_SUBSCRIPTION_KEY,
            },
        )
        r.raise_for_status()
        return r.json()["access_token"]


async def _mtn_request_to_pay(amount: int, phone: str, ext_id: str, callback_url: str) -> str:
    token = await _mtn_get_token()
    ref = str(uuid.uuid4())
    base = "https://sandbox.momodeveloper.mtn.com" if settings.MOMO_TARGET_ENVIRONMENT == "sandbox" \
        else "https://proxy.momoapi.mtn.com"
    clean = phone.lstrip("+").lstrip("0").replace(" ", "")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{base}/collection/v1_0/requesttopay",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Reference-Id": ref,
                "X-Target-Environment": settings.MOMO_TARGET_ENVIRONMENT,
                "X-Callback-Url": callback_url,
                "Ocp-Apim-Subscription-Key": settings.MOMO_SUBSCRIPTION_KEY,
                "Content-Type": "application/json",
            },
            json={
                "amount": str(amount),
                "currency": "UGX",
                "externalId": ext_id,
                "payer": {"partyIdType": "MSISDN", "partyId": clean},
                "payerMessage": "FinAdvisor Pro Subscription",
                "payeeNote": "Thank you for subscribing to FinAdvisor",
            },
        )
        if r.status_code not in (200, 202):
            raise HTTPException(status_code=502, detail=f"MTN MoMo error: {r.text}")
        return ref


async def _mtn_check_status(ref: str) -> dict:
    token = await _mtn_get_token()
    base = "https://sandbox.momodeveloper.mtn.com" if settings.MOMO_TARGET_ENVIRONMENT == "sandbox" \
        else "https://proxy.momoapi.mtn.com"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{base}/collection/v1_0/requesttopay/{ref}",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Target-Environment": settings.MOMO_TARGET_ENVIRONMENT,
                "Ocp-Apim-Subscription-Key": settings.MOMO_SUBSCRIPTION_KEY,
            },
        )
        return r.json()


# ── Airtel Money helpers ──────────────────────────────────────

async def _airtel_get_token() -> str:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://openapi.airtel.africa/auth/oauth2/token",
            json={
                "client_id": settings.AIRTEL_CLIENT_ID,
                "client_secret": settings.AIRTEL_CLIENT_SECRET,
                "grant_type": "client_credentials",
            },
        )
        r.raise_for_status()
        return r.json()["access_token"]


async def _airtel_request_payment(amount: int, phone: str, reference: str) -> dict:
    token = await _airtel_get_token()
    clean = phone.lstrip("+").lstrip("0").replace(" ", "")
    if not clean.startswith("256"):
        clean = f"256{clean}"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://openapi.airtel.africa/merchant/v1/payments/",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "X-Country": "UG",
                "X-Currency": "UGX",
            },
            json={
                "reference": reference,
                "subscriber": {"country": "UG", "currency": "UGX", "msisdn": clean},
                "transaction": {"amount": amount, "country": "UG", "currency": "UGX", "id": reference},
            },
        )
        return r.json()


async def _airtel_check_status(txn_id: str) -> dict:
    token = await _airtel_get_token()
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"https://openapi.airtel.africa/standard/v1/payments/{txn_id}",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Country": "UG",
                "X-Currency": "UGX",
            },
        )
        return r.json()


# ── Subscription helpers ──────────────────────────────────────

def _activate_subscription(user_id: str, plan: str, provider: str, phone: str = "") -> None:
    from src.database.operations import update_user
    expires_at = datetime.now(timezone.utc) + timedelta(days=PLANS[plan]["interval_days"])
    update_user(user_id, {
        "tier": "pro",
        "momo_plan": plan,
        "momo_provider": provider,
        "momo_phone": phone,
        "subscription_expires_at": expires_at.isoformat(),
    })
    logger.info("subscription_activated", user_id=user_id, plan=plan, provider=provider)


def _cancel_subscription(user_id: str) -> None:
    from src.database.operations import update_user
    update_user(user_id, {
        "tier": "free",
        "momo_plan": None,
        "momo_provider": None,
        "subscription_expires_at": None,
    })
    logger.info("subscription_cancelled", user_id=user_id)


def _save_pending(user_id: str, plan: str, provider: str, phone: str, ref: str, amount: int):
    try:
        _db().table("pending_payments").upsert({
            "id": ref,
            "user_id": user_id,
            "plan": plan,
            "provider": provider,
            "phone_number": phone,
            "amount_ugx": amount,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        logger.error("save_pending_failed", error=str(e))


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/plans")
async def get_plans():
    return {"plans": PLANS}


class InitiateRequest(BaseModel):
    plan: str           # 'pro_monthly' or 'pro_yearly'
    provider: str       # 'mtn' or 'airtel'
    phone_number: str   # e.g. '0771234567'


@router.post("/initiate")
async def initiate_payment(body: InitiateRequest, current_user: dict = Depends(get_current_user)):
    """
    Push a payment prompt to the user's phone.
    They see 'FinAdvisor Pro - UGX 50,000' and enter their PIN to approve.
    """
    if body.plan not in PLANS:
        raise HTTPException(400, f"Invalid plan. Choose: {list(PLANS.keys())}")
    if body.provider not in ("mtn", "airtel"):
        raise HTTPException(400, "Provider must be 'mtn' or 'airtel'")

    user_id = current_user["user_id"]
    amount = PLANS[body.plan]["amount_ugx"]
    ext_id = str(uuid.uuid4())
    callback_url = f"{settings.BACKEND_URL}/billing/callback/{body.provider}"

    try:
        if body.provider == "mtn":
            ref = await _mtn_request_to_pay(amount, body.phone_number, ext_id, callback_url)
        else:
            result = await _airtel_request_payment(amount, body.phone_number, ext_id)
            ref = result.get("data", {}).get("transaction", {}).get("id", ext_id)

        _save_pending(user_id, body.plan, body.provider, body.phone_number, ref, amount)

        return {
            "reference_id": ref,
            "message": f"Check your phone — enter your {body.provider.upper()} MoMo PIN to complete payment.",
            "amount_ugx": amount,
            "plan": body.plan,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("initiate_failed", error=str(e))
        raise HTTPException(500, f"Payment initiation failed: {str(e)}")


@router.get("/poll/{reference_id}")
async def poll_payment(reference_id: str, current_user: dict = Depends(get_current_user)):
    """
    Frontend polls this every 3 seconds after initiating payment.
    Returns: pending | successful | failed
    """
    user_id = current_user["user_id"]
    try:
        r = _db().table("pending_payments").select("*") \
            .eq("id", reference_id).eq("user_id", user_id).execute()
        if not r.data:
            raise HTTPException(404, "Payment not found")
        p = r.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

    # Already confirmed via callback
    if p["status"] == "successful":
        return {"status": "successful", "plan": p["plan"]}
    if p["status"] == "failed":
        return {"status": "failed"}

    # Poll provider directly
    try:
        if p["provider"] == "mtn":
            result = await _mtn_check_status(reference_id)
            raw = result.get("status", "PENDING").upper()
            if raw == "SUCCESSFUL":
                _activate_subscription(user_id, p["plan"], "mtn", p.get("phone_number", ""))
                _db().table("pending_payments").update({"status": "successful"}).eq("id", reference_id).execute()
                return {"status": "successful", "plan": p["plan"]}
            if raw == "FAILED":
                _db().table("pending_payments").update({"status": "failed"}).eq("id", reference_id).execute()
                return {"status": "failed", "reason": result.get("reason", "Declined")}
        else:
            result = await _airtel_check_status(reference_id)
            raw = result.get("data", {}).get("transaction", {}).get("status", "").upper()
            if raw in ("TS", "SUCCESS"):
                _activate_subscription(user_id, p["plan"], "airtel", p.get("phone_number", ""))
                _db().table("pending_payments").update({"status": "successful"}).eq("id", reference_id).execute()
                return {"status": "successful", "plan": p["plan"]}
            if raw in ("TF", "FAILED", "EXPIRED"):
                _db().table("pending_payments").update({"status": "failed"}).eq("id", reference_id).execute()
                return {"status": "failed"}
    except Exception as e:
        logger.error("poll_failed", error=str(e))

    return {"status": "pending"}


@router.post("/callback/mtn")
async def mtn_callback(request: Request, background_tasks: BackgroundTasks):
    """MTN calls this automatically when user approves/rejects payment."""
    try:
        payload = await request.json()
        ref = payload.get("externalId") or payload.get("referenceId", "")
        status = payload.get("status", "").upper()
        r = _db().table("pending_payments").select("*").eq("id", ref).execute()
        if r.data:
            p = r.data[0]
            if status == "SUCCESSFUL":
                background_tasks.add_task(_activate_subscription, p["user_id"], p["plan"], "mtn", p.get("phone_number", ""))
                _db().table("pending_payments").update({"status": "successful"}).eq("id", ref).execute()
            elif status == "FAILED":
                _db().table("pending_payments").update({"status": "failed"}).eq("id", ref).execute()
    except Exception as e:
        logger.error("mtn_callback_error", error=str(e))
    return {"received": True}


@router.post("/callback/airtel")
async def airtel_callback(request: Request, background_tasks: BackgroundTasks):
    """Airtel calls this automatically when payment completes."""
    try:
        payload = await request.json()
        txn = payload.get("transaction", {})
        ref = txn.get("id", "")
        status = txn.get("status", "").upper()
        r = _db().table("pending_payments").select("*").eq("id", ref).execute()
        if r.data:
            p = r.data[0]
            if status in ("TS", "SUCCESS"):
                background_tasks.add_task(_activate_subscription, p["user_id"], p["plan"], "airtel", p.get("phone_number", ""))
                _db().table("pending_payments").update({"status": "successful"}).eq("id", ref).execute()
            elif status in ("TF", "FAILED", "EXPIRED"):
                _db().table("pending_payments").update({"status": "failed"}).eq("id", ref).execute()
    except Exception as e:
        logger.error("airtel_callback_error", error=str(e))
    return {"received": True}


@router.post("/cancel")
async def cancel_subscription(current_user: dict = Depends(get_current_user)):
    _cancel_subscription(current_user["user_id"])
    return {"message": "Subscription cancelled successfully."}


@router.get("/status")
async def billing_status(current_user: dict = Depends(get_current_user)):
    from src.database.operations import get_user_by_id
    user = get_user_by_id(current_user["user_id"])
    if not user:
        raise HTTPException(404, "User not found")

    is_pro = user.get("tier") == "pro"
    expires_at = user.get("subscription_expires_at")

    # Auto-expire if subscription date has passed
    if is_pro and expires_at:
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if exp < datetime.now(timezone.utc):
                _cancel_subscription(current_user["user_id"])
                is_pro = False
        except Exception:
            pass

    return {
        "tier": "pro" if is_pro else "free",
        "is_pro": is_pro,
        "plan": user.get("momo_plan"),
        "provider": user.get("momo_provider"),
        "expires_at": expires_at,
    }