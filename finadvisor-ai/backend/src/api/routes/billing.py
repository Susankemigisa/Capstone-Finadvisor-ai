"""
billing.py — Subscription payments via MTN Mobile Money & Airtel Money Uganda.

Bugs fixed:
    1. Callback reference mismatch — store both ref AND ext_id, look up by both
    2. Phone number formatting — proper 256 prefix for all number formats
    3. Token caching — MTN + Airtel tokens cached, not refetched every call
    4. Callback security — validate X-Reference-Id header presence
    5. Idempotency — check existing status before activating to prevent doubles
    6. Airtel error handling — raise proper HTTP errors on bad responses
    7. Currency — EUR in MTN sandbox (required), UGX in production
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel

from src.auth.dependencies import get_current_user
from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ── Plans ─────────────────────────────────────────────────────
PLANS = {
    "pro_monthly": {
        "name": "Pro Monthly",
        "amount_ugx": 50000,
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
        "amount_ugx": 480000,
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


# ── FIX #3: Token caches ──────────────────────────────────────
_mtn_token_cache: dict = {"token": None, "expires": None}
_airtel_token_cache: dict = {"token": None, "expires": None}


# ── FIX #2: Phone formatting ──────────────────────────────────
def _format_phone(phone: str) -> str:
    """
    Normalize any Ugandan number to 256XXXXXXXXX format.
        0771234567    → 256771234567
        +256771234567 → 256771234567
        256771234567  → 256771234567
        771234567     → 256771234567
    """
    clean = phone.replace(" ", "").replace("+", "").replace("-", "")
    if clean.startswith("256"):
        return clean
    if clean.startswith("0"):
        return "256" + clean[1:]
    if len(clean) == 9:
        return "256" + clean
    return clean


# ── MTN MoMo helpers ─────────────────────────────────────────

async def _mtn_get_token() -> str:
    """FIX #3: cached token, only refetch when expired."""
    import base64
    now = datetime.now(timezone.utc)
    if _mtn_token_cache["token"] and _mtn_token_cache["expires"] and _mtn_token_cache["expires"] > now:
        return _mtn_token_cache["token"]

    if not settings.MOMO_API_USER or not settings.MOMO_API_KEY:
        raise HTTPException(503, "MTN MoMo credentials not set. Add MOMO_API_USER and MOMO_API_KEY to .env")

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
        if r.status_code != 200:
            raise HTTPException(502, f"MTN token error: {r.text}")
        token = r.json()["access_token"]
        _mtn_token_cache["token"] = token
        _mtn_token_cache["expires"] = now + timedelta(minutes=50)
        return token


async def _mtn_request_to_pay(amount: int, phone: str, ext_id: str, callback_url: str) -> str:
    """
    Push payment to user's phone. Returns X-Reference-Id.
    FIX #2: uses _format_phone.
    FIX #7: EUR in sandbox, UGX in production.
    """
    token = await _mtn_get_token()
    ref = str(uuid.uuid4())
    is_sandbox = settings.MOMO_TARGET_ENVIRONMENT == "sandbox"
    base = "https://sandbox.momodeveloper.mtn.com" if is_sandbox else "https://proxy.momoapi.mtn.com"
    currency = "EUR" if is_sandbox else "UGX"
    msisdn = "46733123450" if is_sandbox else _format_phone(phone)

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
                "currency": currency,
                "externalId": ext_id,
                "payer": {"partyIdType": "MSISDN", "partyId": msisdn},
                "payerMessage": "FinAdvisor Pro Subscription",
                "payeeNote": "Thank you for subscribing to FinAdvisor",
            },
        )
        if r.status_code not in (200, 202):
            raise HTTPException(502, f"MTN MoMo error: {r.text}")
        return ref


async def _mtn_check_status(ref: str) -> dict:
    token = await _mtn_get_token()
    is_sandbox = settings.MOMO_TARGET_ENVIRONMENT == "sandbox"
    base = "https://sandbox.momodeveloper.mtn.com" if is_sandbox else "https://proxy.momoapi.mtn.com"
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
    """FIX #3: cached token."""
    now = datetime.now(timezone.utc)
    if _airtel_token_cache["token"] and _airtel_token_cache["expires"] and _airtel_token_cache["expires"] > now:
        return _airtel_token_cache["token"]

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://openapi.airtel.africa/auth/oauth2/token",
            json={
                "client_id": settings.AIRTEL_CLIENT_ID,
                "client_secret": settings.AIRTEL_CLIENT_SECRET,
                "grant_type": "client_credentials",
            },
        )
        if r.status_code != 200:
            raise HTTPException(502, f"Airtel token error: {r.text}")
        data = r.json()
        token = data["access_token"]
        expires_in = int(data.get("expires_in", 3600))
        _airtel_token_cache["token"] = token
        _airtel_token_cache["expires"] = now + timedelta(seconds=expires_in - 300)
        return token


async def _airtel_request_payment(amount: int, phone: str, reference: str) -> dict:
    """FIX #2: _format_phone. FIX #6: raise on bad response."""
    token = await _airtel_get_token()
    msisdn = _format_phone(phone)
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
                "subscriber": {"country": "UG", "currency": "UGX", "msisdn": msisdn},
                "transaction": {"amount": amount, "country": "UG", "currency": "UGX", "id": reference},
            },
        )
        if r.status_code not in (200, 202):
            raise HTTPException(502, f"Airtel error: {r.text}")
        return r.json()


async def _airtel_check_status(txn_id: str) -> dict:
    """FIX #6: error handling."""
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
        if r.status_code != 200:
            raise HTTPException(502, f"Airtel status error: {r.text}")
        return r.json()


# ── Subscription helpers ──────────────────────────────────────

def _activate_subscription(user_id: str, plan: str, provider: str, phone: str = "") -> None:
    """FIX #5: idempotency — skip if already Pro."""
    from src.database.operations import get_user_by_id, update_user
    user = get_user_by_id(user_id)
    if user and user.get("tier") == "pro":
        logger.info("skip_already_pro", user_id=user_id)
        return
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


def _save_pending(user_id: str, plan: str, provider: str, phone: str, ref: str, ext_id: str, amount: int):
    """FIX #1: store both ref (X-Reference-Id) and ext_id (externalId)."""
    try:
        _db().table("pending_payments").upsert({
            "id": ref,
            "external_id": ext_id,
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


def _lookup_payment(ref: Optional[str], ext_id: Optional[str]) -> Optional[dict]:
    """FIX #1: look up by X-Reference-Id first, then externalId as fallback."""
    try:
        if ref:
            r = _db().table("pending_payments").select("*").eq("id", ref).execute()
            if r.data:
                return r.data[0]
        if ext_id:
            r = _db().table("pending_payments").select("*").eq("external_id", ext_id).execute()
            if r.data:
                return r.data[0]
    except Exception as e:
        logger.error("lookup_payment_failed", error=str(e))
    return None


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/plans")
async def get_plans():
    return {"plans": PLANS}


class InitiateRequest(BaseModel):
    plan: str
    provider: str
    phone_number: str


@router.post("/initiate")
async def initiate_payment(body: InitiateRequest, current_user: dict = Depends(get_current_user)):
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

        # FIX #1: pass both ref and ext_id
        _save_pending(user_id, body.plan, body.provider, body.phone_number, ref, ext_id, amount)
        logger.info("payment_initiated", user_id=user_id, plan=body.plan, provider=body.provider)
        return {
            "reference_id": ref,
            "message": f"Check your phone — enter your {body.provider.upper()} MoMo PIN to approve.",
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

    if p["status"] == "successful":
        return {"status": "successful", "plan": p["plan"]}
    if p["status"] == "failed":
        return {"status": "failed"}

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
    except HTTPException:
        raise
    except Exception as e:
        logger.error("poll_failed", error=str(e))

    return {"status": "pending"}


@router.post("/callback/mtn")
async def mtn_callback(request: Request, background_tasks: BackgroundTasks):
    """
    FIX #1: look up by referenceId OR externalId.
    FIX #4: require X-Reference-Id header.
    FIX #5: skip if already processed.
    """
    # FIX #4: MTN always sends this header — reject if missing
    header_ref = request.headers.get("X-Reference-Id")
    if not header_ref:
        logger.warning("mtn_callback_missing_header")
        raise HTTPException(403, "Unauthorized callback")

    try:
        payload = await request.json()
        ref = payload.get("referenceId") or header_ref
        ext_id = payload.get("externalId")
        status = payload.get("status", "").upper()

        logger.info("mtn_callback", ref=ref, ext_id=ext_id, status=status)

        # FIX #1: dual lookup
        p = _lookup_payment(ref, ext_id)
        if not p:
            logger.warning("mtn_callback_unmatched", ref=ref, ext_id=ext_id)
            return {"received": True}

        # FIX #5: idempotency
        if p["status"] == "successful":
            return {"received": True}

        if status == "SUCCESSFUL":
            background_tasks.add_task(
                _activate_subscription, p["user_id"], p["plan"], "mtn", p.get("phone_number", "")
            )
            _db().table("pending_payments").update({"status": "successful"}).eq("id", p["id"]).execute()
        elif status == "FAILED":
            _db().table("pending_payments").update({"status": "failed"}).eq("id", p["id"]).execute()

    except HTTPException:
        raise
    except Exception as e:
        logger.error("mtn_callback_error", error=str(e))

    return {"received": True}


@router.post("/callback/airtel")
async def airtel_callback(request: Request, background_tasks: BackgroundTasks):
    """FIX #5: idempotency guard."""
    try:
        payload = await request.json()
        txn = payload.get("transaction", {})
        ref = txn.get("id", "")
        status = txn.get("status", "").upper()

        logger.info("airtel_callback", ref=ref, status=status)

        p = _lookup_payment(ref, ref)
        if not p:
            logger.warning("airtel_callback_unmatched", ref=ref)
            return {"received": True}

        # FIX #5: idempotency
        if p["status"] == "successful":
            return {"received": True}

        if status in ("TS", "SUCCESS"):
            background_tasks.add_task(
                _activate_subscription, p["user_id"], p["plan"], "airtel", p.get("phone_number", "")
            )
            _db().table("pending_payments").update({"status": "successful"}).eq("id", p["id"]).execute()
        elif status in ("TF", "FAILED", "EXPIRED"):
            _db().table("pending_payments").update({"status": "failed"}).eq("id", p["id"]).execute()

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