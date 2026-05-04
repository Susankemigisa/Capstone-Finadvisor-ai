"""
webhooks.py — Incoming webhook handlers for bank and mobile money providers.

Supported providers:
    Mono          — African bank connections (Stanbic UG, DFCU, Centenary, Equity)
    MTN MoMo      — MTN Mobile Money Uganda
    Airtel Money  — Airtel Money Uganda
    Flutterwave   — Card payments and bank transfers across Africa
    Manual        — Users can manually log a transaction (no provider)

Flow for every incoming webhook:
    1. Verify the webhook signature (provider-specific HMAC)
    2. Log the raw event to webhook_events table
    3. Find the connected_account that matches
    4. Find the user who owns that account
    5. Check if any savings_rules apply to this transaction
    6. If yes, execute each rule → create savings_transaction → update pocket balance
    7. Log the income to budget_entries (so it shows in budget tracking too)
    8. Return 200 immediately (providers retry on non-200)
"""

import asyncio
import hashlib
import hmac
import json
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel

from src.auth.dependencies import get_current_user
from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ── DB helpers ────────────────────────────────────────────────

def _db():
    from src.database.client import get_supabase
    return get_supabase()


def _get_account_by_provider_id(provider: str, provider_account_id: str) -> Optional[dict]:
    try:
        r = _db().table("connected_accounts") \
            .select("*") \
            .eq("provider", provider) \
            .eq("provider_account_id", provider_account_id) \
            .eq("is_active", True) \
            .execute()
        return r.data[0] if r.data else None
    except Exception as e:
        logger.error("get_account_by_provider_failed", error=str(e))
        return None


def _get_active_rules(user_id: str, account_id: str) -> list:
    """Return all active savings rules for this user/account."""
    try:
        r = _db().table("savings_rules") \
            .select("*, savings_pockets(*)") \
            .eq("user_id", user_id) \
            .eq("is_active", True) \
            .execute()
        rules = r.data or []
        # Filter to rules that match this account (or apply to all accounts)
        return [
            rule for rule in rules
            if rule.get("source_account_id") is None
            or rule.get("source_account_id") == account_id
        ]
    except Exception as e:
        logger.error("get_active_rules_failed", error=str(e))
        return []


# Descriptions that indicate a reversal, internal transfer, or non-real-income credit.
# These should NOT trigger savings rules — the money isn't really arriving.
_SKIP_KEYWORDS = (
    "reversal", "reversed", "reverse", "refund", "returned",
    "transfer to", "own transfer", "internal", "correction",
    "charge back", "chargeback",
)

# Minimum amount (in base currency units) to trigger savings rules.
# Prevents saving 20% of a UGX 500 airtime top-up.
_MIN_TRIGGER_AMOUNT = 1_000  # UGX 1,000


def _is_noise_transaction(description: str, amount: float) -> bool:
    """
    Return True for transactions that should NOT trigger savings rules:
    - Reversals, refunds, corrections (money isn't really staying)
    - Very small credits like airtime top-ups
    """
    desc_lower = description.lower()
    if any(kw in desc_lower for kw in _SKIP_KEYWORDS):
        return True
    if amount < _MIN_TRIGGER_AMOUNT:
        return True
    return False


def _already_saved_for_transaction(source_transaction_id: str) -> bool:
    """
    Deduplication guard — return True if we already processed this transaction.
    Prevents double-saving if two webhooks fire for the same underlying event
    (e.g. a bank webhook AND a Mono webhook for the same credit).
    """
    try:
        r = _db().table("savings_transactions") \
            .select("id") \
            .eq("source_transaction_id", source_transaction_id) \
            .eq("source", "rule_auto") \
            .limit(1) \
            .execute()
        return bool(r.data)
    except Exception:
        return False


def _apply_savings_rules(
    user_id: str,
    account_id: str,
    amount: float,
    currency: str,
    description: str,
    source_transaction_id: str,
) -> int:
    """
    Apply all active savings rules to an incoming credit transaction.
    Returns the number of rules triggered.

    Rules fire on ANY incoming credit — no keyword filter required.
    The keyword field is optional and acts as an ADDITIONAL filter only
    when explicitly set (e.g. user only wants to save from salary, not
    from random peer-to-peer transfers).

    Noise transactions (reversals, tiny amounts, internal transfers) are
    automatically skipped so users don't save 20% of a UGX 500 airtime
    refund or a same-account correction entry.
    """
    # Skip reversals, refunds, and tiny amounts universally
    if _is_noise_transaction(description, amount):
        logger.info("savings_skipped_noise", description=description, amount=amount)
        return 0

    # Deduplication: don't process the same transaction twice
    if source_transaction_id and _already_saved_for_transaction(source_transaction_id):
        logger.info("savings_skipped_duplicate", source_transaction_id=source_transaction_id)
        return 0

    rules = _get_active_rules(user_id, account_id)
    triggered = 0

    for rule in rules:
        try:
            if rule["trigger_type"] != "income_received":
                continue

            # Keyword filter is OPTIONAL — only applied when the user set one.
            # When empty, the rule fires on ALL incoming credits (the default behaviour).
            keyword = rule.get("trigger_keyword", "").lower().strip()
            if keyword and keyword not in description.lower():
                continue

            # Minimum amount filter — user can set their own threshold per rule
            # (e.g. "only save when income >= UGX 100,000")
            min_amount = rule.get("trigger_amount_min")
            if min_amount and amount < float(min_amount):
                continue

            # Calculate the amount to save
            if rule["rule_type"] == "percentage":
                save_amount = round(amount * float(rule["amount_value"]) / 100, 2)
            else:
                save_amount = float(rule["amount_value"])

            if save_amount <= 0:
                continue

            pocket_id = rule["pocket_id"]

            # Get current pocket balance
            pocket_r = _db().table("savings_pockets") \
                .select("current_amount, currency") \
                .eq("id", pocket_id) \
                .execute()
            if not pocket_r.data:
                continue

            current_balance = float(pocket_r.data[0]["current_amount"])
            new_balance = current_balance + save_amount

            # Update pocket balance
            _db().table("savings_pockets").update({
                "current_amount": new_balance,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("id", pocket_id).execute()

            # Record the savings transaction
            _db().table("savings_transactions").insert({
                "user_id": user_id,
                "pocket_id": pocket_id,
                "rule_id": rule["id"],
                "transaction_type": "deposit",
                "amount": save_amount,
                "currency": currency,
                "note": f"Auto-saved 20% from: {description}",
                "source": "rule_auto",
                "source_transaction_id": source_transaction_id,
                "balance_after": new_balance,
            }).execute()

            # Update rule stats
            _db().table("savings_rules").update({
                "last_triggered_at": datetime.utcnow().isoformat(),
                "times_triggered": rule.get("times_triggered", 0) + 1,
                "total_saved": float(rule.get("total_saved", 0)) + save_amount,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("id", rule["id"]).execute()

            logger.info(
                "savings_rule_triggered",
                rule_id=rule["id"],
                user_id=user_id,
                amount_received=amount,
                save_amount=save_amount,
                pocket_id=pocket_id,
                description=description,
            )
            triggered += 1

            # Email notification — fire-and-forget (non-blocking)
            try:
                from src.api.routes.notifications import send_notification_email
                pocket_name = rule.get("savings_pockets", {}).get("name", "your savings pocket") if isinstance(rule.get("savings_pockets"), dict) else "your savings pocket"
                rule_name   = rule.get("name", "Auto-save rule")
                rule_type   = rule.get("rule_type", "fixed")
                rule_val    = rule.get("amount_value", 0)
                rule_display = f"{rule_val}%" if rule_type == "percentage" else f"{currency} {float(rule_val):,.0f}"
                html = f"""
                <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #0a0c10; color: #e8e0d0; border-radius: 12px;">
                    <h2 style="color: #c9a84c; font-size: 18px;">💰 Auto-Save Completed</h2>
                    <p>Your rule <strong style="color:#c9a84c">"{rule_name}"</strong> just fired.</p>
                    <div style="background:#1a1c22; border-radius:8px; padding:16px; margin:16px 0;">
                        <div style="font-size:26px; font-weight:700; color:#c9a84c;">{currency} {save_amount:,.0f}</div>
                        <div style="color:#888; font-size:13px; margin-top:4px;">Saved to <strong>{pocket_name}</strong> ({rule_display} of income)</div>
                        <div style="color:#666; font-size:12px; margin-top:8px;">New balance: {currency} {new_balance:,.0f}</div>
                    </div>
                    <div style="color:#777; font-size:12px; border-top:1px solid #333; padding-top:12px; margin-top:8px;">
                        Triggered by: {description}
                    </div>
                    <a href="https://finadvisor-ai-app-two.vercel.app/savings"
                       style="display:inline-block; background:#c9a84c; color:#0a0c10; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600; margin-top:16px;">
                        View Savings →
                    </a>
                    <p style="color:#555; font-size:11px; margin-top:24px;">FinAdvisor AI · Manage notifications in Settings</p>
                </div>
                """
                asyncio.ensure_future(send_notification_email(
                    user_id=user_id,
                    pref_field="email_savings_rules",
                    subject=f"💰 Auto-saved {currency} {save_amount:,.0f} to {pocket_name}",
                    html=html,
                ))
            except Exception as email_err:
                logger.error("savings_rule_email_failed", rule_id=rule.get("id"), error=str(email_err))

        except Exception as e:
            logger.error("apply_rule_failed", rule_id=rule.get("id"), error=str(e))

    return triggered


def _log_income_to_budget(user_id: str, amount: float, currency: str, description: str, source: str):
    """Auto-log the incoming transaction to the budget tracker."""
    try:
        from src.database.operations import add_budget_entry
        add_budget_entry(
            user_id=user_id,
            category="Income",
            subcategory=source,
            amount=amount,
            entry_type="income",
            description=description,
            entry_date=str(datetime.utcnow().date()),
        )
    except Exception as e:
        logger.error("log_income_to_budget_failed", error=str(e))


def _log_webhook_event(
    provider: str,
    event_type: str,
    payload: dict,
    account_id: Optional[str] = None,
    user_id: Optional[str] = None,
    amount: Optional[float] = None,
    currency: Optional[str] = None,
    description: Optional[str] = None,
) -> str:
    """Log the raw webhook event and return its ID."""
    try:
        r = _db().table("webhook_events").insert({
            "provider": provider,
            "event_type": event_type,
            "account_id": account_id,
            "user_id": user_id,
            "payload": payload,
            "amount": amount,
            "currency": currency,
            "description": description,
        }).execute()
        return r.data[0]["id"] if r.data else str(uuid.uuid4())
    except Exception as e:
        logger.error("log_webhook_event_failed", error=str(e))
        return str(uuid.uuid4())


def _mark_webhook_processed(event_id: str, rules_triggered: int, error: str = None):
    try:
        _db().table("webhook_events").update({
            "processed": True,
            "processed_at": datetime.utcnow().isoformat(),
            "rules_triggered": rules_triggered,
            "error": error,
        }).eq("id", event_id).execute()
    except Exception as e:
        logger.error("mark_webhook_processed_failed", error=str(e))


# ── Signature verification helpers ───────────────────────────

def _verify_mono_signature(request_body: bytes, signature: str, secret: str) -> bool:
    """Mono uses HMAC-SHA512 with the webhook secret."""
    try:
        expected = hmac.new(
            secret.encode("utf-8"),
            request_body,
            hashlib.sha512,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False


def _verify_flutterwave_signature(request_body: bytes, signature: str, secret: str) -> bool:
    """Flutterwave uses HMAC-SHA256."""
    try:
        expected = hmac.new(
            secret.encode("utf-8"),
            request_body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False


# ── Background processor ─────────────────────────────────────

async def _process_income_event(
    provider: str,
    event_type: str,
    provider_account_id: str,
    amount: float,
    currency: str,
    description: str,
    source_transaction_id: str,
    raw_payload: dict,
):
    """
    Common processor for all income events regardless of provider.
    Runs in the background so the webhook endpoint returns 200 immediately.
    """
    # Look up the connected account
    account = _get_account_by_provider_id(provider, provider_account_id)
    if not account:
        logger.warning("webhook_no_account_found", provider=provider, provider_account_id=provider_account_id)
        return

    user_id = account["user_id"]
    account_id = account["id"]

    # Log the raw event
    event_id = _log_webhook_event(
        provider=provider,
        event_type=event_type,
        payload=raw_payload,
        account_id=account_id,
        user_id=user_id,
        amount=amount,
        currency=currency,
        description=description,
    )

    # Update account last_synced_at and balance if provided
    try:
        _db().table("connected_accounts").update({
            "last_synced_at": datetime.utcnow().isoformat(),
        }).eq("id", account_id).execute()
    except Exception:
        pass

    # Log to budget tracker
    _log_income_to_budget(user_id, amount, currency, description, provider)

    # Apply savings rules
    rules_triggered = _apply_savings_rules(
        user_id=user_id,
        account_id=account_id,
        amount=amount,
        currency=currency,
        description=description,
        source_transaction_id=source_transaction_id,
    )

    _mark_webhook_processed(event_id, rules_triggered)

    logger.info(
        "webhook_processed",
        provider=provider,
        amount=amount,
        currency=currency,
        rules_triggered=rules_triggered,
        user_id=user_id,
    )

    # Email: income received notification
    try:
        from src.api.routes.notifications import send_notification_email
        provider_label = {
            "mtn_momo": "MTN MoMo",
            "airtel": "Airtel Money",
            "mono": "Bank",
            "flutterwave": "Flutterwave",
            "manual": "Manual entry",
        }.get(provider, provider.replace("_", " ").title())
        rules_note = f" · {rules_triggered} auto-save rule{'s' if rules_triggered != 1 else ''} fired" if rules_triggered else ""
        html = f"""
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #0a0c10; color: #e8e0d0; border-radius: 12px;">
            <h2 style="color: #c9a84c; font-size: 18px;">📥 Income Received</h2>
            <div style="background:#1a1c22; border-radius:8px; padding:16px; margin:16px 0;">
                <div style="font-size:26px; font-weight:700; color:#c9a84c;">{currency} {amount:,.0f}</div>
                <div style="color:#888; font-size:13px; margin-top:4px;">via {provider_label}{rules_note}</div>
            </div>
            <div style="color:#777; font-size:12px; border-top:1px solid #333; padding-top:12px;">
                {description}
            </div>
            <a href="https://finadvisor-ai-app-two.vercel.app/insights"
               style="display:inline-block; background:#c9a84c; color:#0a0c10; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600; margin-top:16px;">
                View Insights →
            </a>
            <p style="color:#555; font-size:11px; margin-top:24px;">FinAdvisor AI · Manage notifications in Settings</p>
        </div>
        """
        asyncio.ensure_future(send_notification_email(
            user_id=user_id,
            pref_field="email_transactions",
            subject=f"📥 {currency} {amount:,.0f} received via {provider_label}",
            html=html,
        ))
    except Exception as email_err:
        logger.error("income_email_failed", provider=provider, error=str(email_err))


# ── MONO WEBHOOK ─────────────────────────────────────────────

@router.post("/webhooks/mono")
async def mono_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Receives transaction events from Mono (African bank connections).
    Covers: Stanbic Bank Uganda, DFCU Bank, Centenary Bank, Equity Bank Uganda.

    Mono sends events like:
      mono.transaction.created — new credit/debit on linked account
      mono.account.updated     — balance update

    Setup in Mono dashboard:
      Webhook URL: https://your-backend.com/webhooks/mono
      Events: mono.transaction.created
    """
    body = await request.body()
    payload = json.loads(body)

    # Verify Mono signature (from X-Mono-Signature header)
    signature = request.headers.get("X-Mono-Signature", "")
    mono_secret = getattr(settings, "MONO_WEBHOOK_SECRET", "")
    if mono_secret and signature:
        if not _verify_mono_signature(body, signature, mono_secret):
            logger.warning("mono_invalid_signature")
            raise HTTPException(status_code=401, detail="Invalid signature")

    event_type = payload.get("event", "")

    # Only process credit (money coming IN) transactions
    if "transaction" not in event_type:
        return {"status": "ignored", "reason": "not a transaction event"}

    data = payload.get("data", {})
    txn = data.get("transaction", data)
    amount_raw = txn.get("amount", 0)

    # Mono amounts are in kobo/cents for some currencies — amounts in UGX are whole numbers
    amount = abs(float(amount_raw))
    txn_type = txn.get("type", "").lower()  # 'credit' or 'debit'

    if txn_type != "credit" or amount <= 0:
        return {"status": "ignored", "reason": "not a credit transaction"}

    currency = txn.get("currency", "UGX").upper()
    description = txn.get("narration") or txn.get("description") or "Bank credit"
    provider_account_id = data.get("account", {}).get("_id") or data.get("accountId", "")
    source_txn_id = txn.get("_id") or txn.get("id") or str(uuid.uuid4())

    background_tasks.add_task(
        _process_income_event,
        provider="mono",
        event_type=event_type,
        provider_account_id=str(provider_account_id),
        amount=amount,
        currency=currency,
        description=description,
        source_transaction_id=str(source_txn_id),
        raw_payload=payload,
    )

    return {"status": "received"}


# ── MTN MOMO WEBHOOK ─────────────────────────────────────────

@router.post("/webhooks/mtn-momo")
async def mtn_momo_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Receives payment notifications from MTN Mobile Money Uganda API.

    MTN MoMo sends a callback when a collection (payment received) completes.
    The notification body contains: externalId, amount, currency, payer details.

    Setup in MTN MoMo developer portal:
      Collection callback URL: https://your-backend.com/webhooks/mtn-momo
      Subscription key: set MOMO_SUBSCRIPTION_KEY in .env

    Note: MTN MoMo uses a different auth model — they send an X-Callback-Api-Key
    header. Store it as MOMO_CALLBACK_KEY in your .env.
    """
    body = await request.body()
    payload = json.loads(body)

    # Verify MTN callback key
    callback_key = request.headers.get("X-Callback-Api-Key", "")
    expected_key = getattr(settings, "MOMO_CALLBACK_KEY", "")
    if expected_key and callback_key != expected_key:
        logger.warning("mtn_momo_invalid_callback_key")
        raise HTTPException(status_code=401, detail="Invalid callback key")

    status = payload.get("status", "").upper()
    if status != "SUCCESSFUL":
        return {"status": "ignored", "reason": f"payment status: {status}"}

    amount = float(payload.get("amount", 0))
    if amount <= 0:
        return {"status": "ignored", "reason": "zero amount"}

    currency = payload.get("currency", "UGX").upper()
    payer = payload.get("payer", {})
    payer_number = payer.get("partyId", "")
    description = payload.get("payerMessage") or f"MTN MoMo payment from {payer_number}"
    external_id = payload.get("externalId") or payload.get("financialTransactionId") or str(uuid.uuid4())

    # For MTN MoMo, the provider_account_id is the recipient MoMo number
    # stored in connected_accounts when the user links their MoMo
    recipient_number = payload.get("payee", {}).get("partyId", "")

    background_tasks.add_task(
        _process_income_event,
        provider="mtn_momo",
        event_type="payment.received",
        provider_account_id=recipient_number,
        amount=amount,
        currency=currency,
        description=description,
        source_transaction_id=str(external_id),
        raw_payload=payload,
    )

    return {"status": "received"}


# ── AIRTEL MONEY WEBHOOK ──────────────────────────────────────

@router.post("/webhooks/airtel-money")
async def airtel_money_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Receives payment notifications from Airtel Money Uganda.

    Setup in Airtel Money developer portal:
      Callback URL: https://your-backend.com/webhooks/airtel-money
    """
    body = await request.body()
    payload = json.loads(body)

    # Airtel uses transaction status codes: TS for success
    txn = payload.get("transaction", payload)
    status = txn.get("status", {})
    status_code = status.get("code", "") if isinstance(status, dict) else str(status)

    if status_code not in ("TS", "SUCCESS", "200"):
        return {"status": "ignored", "reason": f"transaction status: {status_code}"}

    amount = float(txn.get("amount", 0))
    if amount <= 0:
        return {"status": "ignored", "reason": "zero amount"}

    currency = txn.get("currency", "UGX").upper()
    msisdn = txn.get("msisdn") or txn.get("airtel_money_id", "")
    description = txn.get("message") or f"Airtel Money from {msisdn}"
    txn_id = txn.get("id") or str(uuid.uuid4())

    # recipient is the user's Airtel number stored in connected_accounts
    recipient = payload.get("recipient", {}).get("msisdn", "") or txn.get("account", "")

    background_tasks.add_task(
        _process_income_event,
        provider="airtel_money",
        event_type="payment.received",
        provider_account_id=recipient,
        amount=amount,
        currency=currency,
        description=description,
        source_transaction_id=str(txn_id),
        raw_payload=payload,
    )

    return {"status": "received"}


# ── FLUTTERWAVE WEBHOOK ───────────────────────────────────────

@router.post("/webhooks/flutterwave")
async def flutterwave_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Receives payment events from Flutterwave.
    Covers card payments, bank transfers, mobile money across Africa.

    Setup in Flutterwave dashboard → Webhooks:
      URL: https://your-backend.com/webhooks/flutterwave
      Secret hash: set FLUTTERWAVE_WEBHOOK_SECRET in .env
    """
    body = await request.body()
    payload = json.loads(body)

    # Verify Flutterwave secret hash
    secret_hash = getattr(settings, "FLUTTERWAVE_WEBHOOK_SECRET", "")
    received_hash = request.headers.get("verif-hash", "")
    if secret_hash and received_hash != secret_hash:
        logger.warning("flutterwave_invalid_hash")
        raise HTTPException(status_code=401, detail="Invalid signature")

    event_type = payload.get("event", "")
    if "charge.completed" not in event_type and "transfer.completed" not in event_type:
        return {"status": "ignored", "reason": f"event: {event_type}"}

    data = payload.get("data", {})
    status = data.get("status", "").lower()
    if status != "successful":
        return {"status": "ignored", "reason": f"status: {status}"}

    amount = float(data.get("amount", 0))
    if amount <= 0:
        return {"status": "ignored", "reason": "zero amount"}

    currency = data.get("currency", "UGX").upper()
    customer = data.get("customer", {})
    customer_email = customer.get("email", "")
    description = data.get("narration") or data.get("payment_type") or "Flutterwave payment"
    txn_id = str(data.get("id") or data.get("tx_ref") or uuid.uuid4())

    # Find account by customer email stored in metadata
    background_tasks.add_task(
        _process_income_event,
        provider="flutterwave",
        event_type=event_type,
        provider_account_id=customer_email,  # stored as provider_account_id when linking
        amount=amount,
        currency=currency,
        description=description,
        source_transaction_id=txn_id,
        raw_payload=payload,
    )

    return {"status": "received"}


# ── CONNECTED ACCOUNTS API ───────────────────────────────────
# REST endpoints for managing linked accounts

@router.get("/savings/accounts")
async def get_connected_accounts(current_user: dict = Depends(get_current_user)):
    """Get all connected bank/MoMo accounts for the current user."""
    user_id = current_user["user_id"]
    try:
        r = _db().table("connected_accounts") \
            .select("id,provider,account_name,account_type,bank_name,account_number_masked,currency,current_balance,last_synced_at,is_active,created_at") \
            .eq("user_id", user_id) \
            .order("created_at", desc=False) \
            .execute()
        return {"accounts": r.data or []}
    except Exception as e:
        logger.error("get_accounts_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch accounts")


class ConnectAccountRequest(BaseModel):
    provider: str           # 'mono', 'mtn_momo', 'airtel_money', 'flutterwave', 'manual'
    account_name: str       # e.g. "Stanbic Bank - Salary Account"
    account_type: str       # 'bank', 'mobile_money', 'card', 'manual'
    bank_name: str = ""     # e.g. "Stanbic Bank Uganda"
    account_number: str = ""  # full number — we'll mask it before storing
    currency: str = "UGX"
    provider_account_id: str = ""  # MoMo number, email, Mono account ID, etc.


@router.post("/savings/accounts")
async def connect_account(body: ConnectAccountRequest, current_user: dict = Depends(get_current_user)):
    """
    Link a bank account or mobile money account.

    For Mono: the provider_account_id comes from the Mono Connect widget
    For MTN/Airtel: the provider_account_id is the user's phone number
    For manual: just a label, no live sync
    """
    user_id = current_user["user_id"]
    try:
        # Mask account number — store only last 4 digits
        masked = None
        if body.account_number:
            clean = body.account_number.replace(" ", "").replace("-", "")
            masked = f"****{clean[-4:]}" if len(clean) >= 4 else "****"

        r = _db().table("connected_accounts").insert({
            "user_id": user_id,
            "provider": body.provider,
            "provider_account_id": body.provider_account_id or body.account_number,
            "account_name": body.account_name,
            "account_type": body.account_type,
            "bank_name": body.bank_name,
            "account_number_masked": masked,
            "currency": body.currency.upper(),
        }).execute()

        if not r.data:
            raise HTTPException(status_code=500, detail="Failed to save account")

        logger.info("account_connected", provider=body.provider, user_id=user_id)
        return {"account": r.data[0], "message": f"{body.account_name} connected successfully!"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("connect_account_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to connect account")


@router.delete("/savings/accounts/{account_id}")
async def disconnect_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Disconnect (soft-delete) a linked account."""
    user_id = current_user["user_id"]
    try:
        _db().table("connected_accounts").update({"is_active": False}) \
            .eq("id", account_id).eq("user_id", user_id).execute()
        return {"message": "Account disconnected"}
    except Exception as e:
        logger.error("disconnect_account_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to disconnect account")


# ── SAVINGS POCKETS API ───────────────────────────────────────

@router.get("/savings/pockets")
async def get_pockets(current_user: dict = Depends(get_current_user)):
    """Get all savings pockets with their balances and progress."""
    user_id = current_user["user_id"]
    try:
        r = _db().table("savings_pockets") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("is_active", True) \
            .order("created_at", desc=False) \
            .execute()
        pockets = r.data or []
        # Add progress percentage
        for p in pockets:
            if p.get("target_amount") and float(p["target_amount"]) > 0:
                p["progress_pct"] = round(float(p["current_amount"]) / float(p["target_amount"]) * 100, 1)
            else:
                p["progress_pct"] = None
        return {"pockets": pockets}
    except Exception as e:
        logger.error("get_pockets_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch pockets")


class CreatePocketRequest(BaseModel):
    name: str
    description: str = ""
    target_amount: float = None
    currency: str = "UGX"
    icon: str = "💰"
    color: str = "#1A56DB"
    target_date: str = None


@router.post("/savings/pockets")
async def create_pocket(body: CreatePocketRequest, current_user: dict = Depends(get_current_user)):
    """Create a new savings pocket."""
    user_id = current_user["user_id"]
    try:
        r = _db().table("savings_pockets").insert({
            "user_id": user_id,
            "name": body.name,
            "description": body.description,
            "target_amount": body.target_amount,
            "currency": body.currency.upper(),
            "icon": body.icon,
            "color": body.color,
            "target_date": body.target_date,
        }).execute()
        return {"pocket": r.data[0], "message": f"'{body.name}' pocket created!"}
    except Exception as e:
        logger.error("create_pocket_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create pocket")


class PocketTransactionRequest(BaseModel):
    amount: float
    transaction_type: str   # 'deposit' or 'withdrawal'
    note: str = ""


@router.post("/savings/pockets/{pocket_id}/transact")
async def pocket_transaction(
    pocket_id: str,
    body: PocketTransactionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Manually deposit into or withdraw from a savings pocket."""
    user_id = current_user["user_id"]
    try:
        # Get current pocket
        r = _db().table("savings_pockets").select("*") \
            .eq("id", pocket_id).eq("user_id", user_id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail="Pocket not found")
        pocket = r.data[0]

        current = float(pocket["current_amount"])
        if body.transaction_type == "deposit":
            new_balance = current + body.amount
        elif body.transaction_type == "withdrawal":
            if body.amount > current:
                raise HTTPException(status_code=400, detail=f"Insufficient balance. Available: {current:,.2f}")
            new_balance = current - body.amount
        else:
            raise HTTPException(status_code=400, detail="transaction_type must be 'deposit' or 'withdrawal'")

        # Update pocket balance
        _db().table("savings_pockets").update({
            "current_amount": new_balance,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", pocket_id).execute()

        # Record transaction
        _db().table("savings_transactions").insert({
            "user_id": user_id,
            "pocket_id": pocket_id,
            "transaction_type": body.transaction_type,
            "amount": body.amount,
            "currency": pocket["currency"],
            "note": body.note,
            "source": "manual",
            "balance_after": new_balance,
        }).execute()

        action = "deposited into" if body.transaction_type == "deposit" else "withdrawn from"
        return {
            "message": f"{pocket['currency']} {body.amount:,.2f} {action} '{pocket['name']}'",
            "new_balance": new_balance,
            "pocket_name": pocket["name"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("pocket_transaction_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Transaction failed")


@router.get("/savings/pockets/{pocket_id}/history")
async def get_pocket_history(pocket_id: str, current_user: dict = Depends(get_current_user)):
    """Get transaction history for a savings pocket."""
    user_id = current_user["user_id"]
    try:
        r = _db().table("savings_transactions") \
            .select("*") \
            .eq("pocket_id", pocket_id) \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(50) \
            .execute()
        return {"transactions": r.data or []}
    except Exception as e:
        logger.error("get_pocket_history_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch history")


# ── SAVINGS RULES API ────────────────────────────────────────

@router.get("/savings/rules")
async def get_rules(current_user: dict = Depends(get_current_user)):
    """Get all savings rules for the current user."""
    user_id = current_user["user_id"]
    try:
        r = _db().table("savings_rules") \
            .select("*, savings_pockets(name, icon, currency), connected_accounts(account_name, bank_name)") \
            .eq("user_id", user_id) \
            .order("created_at", desc=False) \
            .execute()
        return {"rules": r.data or []}
    except Exception as e:
        logger.error("get_rules_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch rules")


class CreateRuleRequest(BaseModel):
    name: str
    pocket_id: str
    rule_type: str              # 'percentage' or 'fixed_amount'
    amount_value: float         # 20.0 for 20%, or 200000 for UGX 200,000
    trigger_keyword: str = ""   # Optional — leave EMPTY to save from ALL incoming money.
                                # Set to e.g. "salary" only if you want to restrict to specific sources.
    trigger_amount_min: float = None  # Optional — minimum amount to trigger (e.g. 50000 for UGX 50,000)
    source_account_id: str = None     # Optional — restrict to a specific linked account
    notify_on_trigger: bool = True


@router.post("/savings/rules")
async def create_rule(body: CreateRuleRequest, current_user: dict = Depends(get_current_user)):
    """
    Create an auto-savings rule.

    Default behaviour (trigger_keyword left empty):
      Save X% or a fixed amount from EVERY incoming credit on any linked account.
      Reversals, refunds, and tiny amounts (< UGX 1,000) are automatically skipped.

    Restricted behaviour (trigger_keyword set):
      Only save when the transaction description contains the keyword.
      Useful if you want to save from salary only, not from random transfers.
    """
    user_id = current_user["user_id"]
    try:
        r = _db().table("savings_rules").insert({
            "user_id": user_id,
            "name": body.name,
            "trigger_type": "income_received",
            "trigger_keyword": body.trigger_keyword.lower().strip(),
            "trigger_amount_min": body.trigger_amount_min,
            "source_account_id": body.source_account_id or None,
            "pocket_id": body.pocket_id,
            "rule_type": body.rule_type,
            "amount_value": body.amount_value,
            "notify_on_trigger": body.notify_on_trigger,
        }).execute()
        return {"rule": r.data[0], "message": f"Savings rule '{body.name}' created!"}
    except Exception as e:
        logger.error("create_rule_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create rule")


@router.patch("/savings/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    """Enable or disable a savings rule."""
    user_id = current_user["user_id"]
    try:
        r = _db().table("savings_rules").select("is_active") \
            .eq("id", rule_id).eq("user_id", user_id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail="Rule not found")
        current_state = r.data[0]["is_active"]
        _db().table("savings_rules").update({"is_active": not current_state}) \
            .eq("id", rule_id).execute()
        return {"is_active": not current_state, "message": f"Rule {'enabled' if not current_state else 'disabled'}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to toggle rule")


@router.delete("/savings/rules/{rule_id}")
async def delete_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    try:
        _db().table("savings_rules").delete() \
            .eq("id", rule_id).eq("user_id", user_id).execute()
        return {"message": "Rule deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete rule")


# ── SAVINGS SUMMARY ───────────────────────────────────────────

@router.get("/savings/summary")
async def savings_summary(current_user: dict = Depends(get_current_user)):
    """Get a full savings overview: total saved, pockets, recent activity."""
    user_id = current_user["user_id"]
    try:
        pockets_r = _db().table("savings_pockets").select("*") \
            .eq("user_id", user_id).eq("is_active", True).execute()
        pockets = pockets_r.data or []

        rules_r = _db().table("savings_rules").select("id,name,is_active,times_triggered,total_saved,currency") \
            .eq("user_id", user_id).execute()

        recent_r = _db().table("savings_transactions").select("*") \
            .eq("user_id", user_id).order("created_at", desc=True).limit(10).execute()

        accounts_r = _db().table("connected_accounts").select("id,account_name,bank_name,provider,is_active") \
            .eq("user_id", user_id).eq("is_active", True).execute()

        total_saved = sum(float(p["current_amount"]) for p in pockets)

        return {
            "total_saved": total_saved,
            "pocket_count": len(pockets),
            "pockets": pockets,
            "rules": rules_r.data or [],
            "recent_transactions": recent_r.data or [],
            "connected_accounts": accounts_r.data or [],
        }
    except Exception as e:
        logger.error("savings_summary_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch summary")