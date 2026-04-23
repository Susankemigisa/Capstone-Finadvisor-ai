"""
connections.py — Connected Bank & Mobile Money Accounts CRUD.

Endpoints
---------
GET    /savings/accounts                     – list connected accounts
POST   /savings/accounts                     – link a new account
DELETE /savings/accounts/{account_id}        – disconnect (soft-delete) an account

These endpoints power the /connections frontend page.  The actual webhook
processing that USES these accounts lives in webhooks.py.

Supported providers
-------------------
mtn_momo     — MTN Mobile Money Uganda
airtel_money — Airtel Money Uganda
mono         — African bank connections (Stanbic, DFCU, Centenary, Equity)
flutterwave  — Card / bank transfers via Flutterwave
manual       — No live sync; user manages balance manually

Security note
-------------
We never store raw account credentials.  For mobile money we store
the phone number (so we can match incoming webhooks).  For Mono we
store the account ID returned by the Mono Connect widget.  For
Flutterwave we store the customer email.  Account numbers are masked
to the last 4 digits before storage.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.auth.dependencies import get_current_user
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

ALLOWED_PROVIDERS = {
    "mtn_momo", "airtel_money", "mono", "flutterwave", "manual",
}
ALLOWED_ACCOUNT_TYPES = {
    "bank", "mobile_money", "card", "manual",
}


# ── DB helper ─────────────────────────────────────────────────

def _db():
    from src.database.client import get_supabase
    return get_supabase()


# ── Pydantic models ───────────────────────────────────────────

class ConnectAccountRequest(BaseModel):
    provider: str               # mtn_momo | airtel_money | mono | flutterwave | manual
    account_name: str           # user-chosen label, e.g. "My MTN MoMo"
    account_type: str           # bank | mobile_money | card | manual
    bank_name: str = ""         # e.g. "Stanbic Bank Uganda"
    account_number: str = ""    # full number — we mask before storage
    currency: str = "UGX"
    provider_account_id: str = ""  # MoMo number / email / Mono account ID


# ── GET /savings/accounts ─────────────────────────────────────

@router.get("/accounts")
async def get_connected_accounts(current_user: dict = Depends(get_current_user)):
    """Return all active connected accounts for the authenticated user."""
    user_id = current_user["user_id"]
    try:
        r = (
            _db()
            .table("connected_accounts")
            .select(
                "id, provider, account_name, account_type, bank_name, "
                "account_number_masked, currency, current_balance, "
                "last_synced_at, is_active, created_at"
            )
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("created_at", desc=False)
            .execute()
        )
        return {"accounts": r.data or []}
    except Exception as e:
        logger.error("get_accounts_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch accounts")


# ── POST /savings/accounts ────────────────────────────────────

@router.post("/accounts")
async def connect_account(
    body: ConnectAccountRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Link a bank or mobile money account.

    - For MTN/Airtel: provider_account_id is the user's phone number.
    - For Mono: provider_account_id is the account ID from the Connect widget.
    - For Flutterwave: provider_account_id is the email address.
    - For manual: just a label; no live sync occurs.
    """
    user_id = current_user["user_id"]

    if body.provider not in ALLOWED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"provider must be one of: {', '.join(sorted(ALLOWED_PROVIDERS))}",
        )
    if body.account_type not in ALLOWED_ACCOUNT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"account_type must be one of: {', '.join(sorted(ALLOWED_ACCOUNT_TYPES))}",
        )

    # Check for duplicate — don't let a user connect the same MoMo number twice
    if body.provider_account_id or body.account_number:
        pid = body.provider_account_id or body.account_number
        dup = (
            _db()
            .table("connected_accounts")
            .select("id")
            .eq("user_id", user_id)
            .eq("provider", body.provider)
            .eq("provider_account_id", pid)
            .eq("is_active", True)
            .execute()
        )
        if dup.data:
            raise HTTPException(
                status_code=409,
                detail="This account is already connected",
            )

    # Mask account number — keep only last 4 digits
    masked = None
    if body.account_number:
        clean = body.account_number.replace(" ", "").replace("-", "")
        masked = f"****{clean[-4:]}" if len(clean) >= 4 else "****"

    try:
        r = _db().table("connected_accounts").insert({
            "user_id":               user_id,
            "provider":              body.provider,
            "provider_account_id":   body.provider_account_id or body.account_number,
            "account_name":          body.account_name,
            "account_type":          body.account_type,
            "bank_name":             body.bank_name,
            "account_number_masked": masked,
            "currency":              body.currency.upper(),
        }).execute()

        if not r.data:
            raise HTTPException(status_code=500, detail="Failed to save account")

        logger.info(
            "account_connected",
            user_id=user_id,
            provider=body.provider,
            account_name=body.account_name,
        )
        return {
            "account": r.data[0],
            "message": f"{body.account_name} connected successfully!",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("connect_account_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to connect account")


# ── DELETE /savings/accounts/{account_id} ─────────────────────

@router.delete("/accounts/{account_id}")
async def disconnect_account(
    account_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Soft-delete (disconnect) a linked account.

    Sets is_active = False so webhook events already stored in
    webhook_events still reference a valid account row.  Any savings
    rules restricted to this account are also paused automatically.
    """
    user_id = current_user["user_id"]
    try:
        check = (
            _db()
            .table("connected_accounts")
            .select("id, account_name")
            .eq("id", account_id)
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
        )
        if not check.data:
            raise HTTPException(status_code=404, detail="Account not found")

        account_name = check.data[0].get("account_name", "Account")

        _db().table("connected_accounts").update({
            "is_active":  False,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", account_id).eq("user_id", user_id).execute()

        # Pause rules tied to this specific account
        try:
            _db().table("savings_rules").update({
                "is_active":  False,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("source_account_id", account_id).eq("user_id", user_id).execute()
        except Exception:
            pass  # Non-critical

        logger.info(
            "account_disconnected",
            user_id=user_id,
            account_id=account_id,
        )
        return {"message": f"'{account_name}' disconnected"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("disconnect_account_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to disconnect account")
