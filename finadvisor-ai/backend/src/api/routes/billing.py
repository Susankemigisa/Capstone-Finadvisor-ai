"""
billing.py — Stripe subscription management for FinAdvisor AI.

Handles:
    - Checkout session creation (monthly + yearly Pro plans)
    - Stripe webhook processing (payment success, renewal, cancellation, failure)
    - Customer portal (let users manage/cancel their own subscription)
    - Billing status endpoint

IMPORTANT — Stripe Price IDs:
    Do NOT use price_data (creates a new product on every checkout call).
    Create your products ONCE in the Stripe dashboard, then paste the
    Price IDs into the PLANS dict below. See the setup guide for details.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from src.auth.dependencies import get_current_user
from src.utils.logger import get_logger
from src.config.settings import settings

logger = get_logger(__name__)
router = APIRouter()


# ── Stripe Price IDs ──────────────────────────────────────────
# After creating products in your Stripe dashboard, paste the
# Price IDs here. They look like: price_1ABCDEFGHijklmnop
# Dashboard → Products → click your product → copy the Price ID

PLANS = {
    "pro_monthly": {
        "name": "Pro Monthly",
        "price_id": "price_1TJsOSCSe8IvcwViufJbWGZr",  
        "price_usd": 19.00,
        "interval": "month",
        "features": [
            "Unlimited messages",
            "All AI models",
            "Advanced analytics",
            "Export to PDF & Excel",
            "Priority support",
            "Early access to new features",
        ]
    },
    "pro_yearly": {
        "name": "Pro Yearly",
        "price_id": "price_1TJsZPCSe8IvcwVihJFnQxt3",    # ← paste from Stripe
        "price_usd": 159.00,
        "interval": "year",
        "features": [
            "Everything in Monthly",
            "Save 30% vs monthly",
            "Early access to new features",
        ]
    },
}


def _stripe():
    """Get configured Stripe client. Raises clear error if key missing."""
    import stripe
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="Stripe not configured. Add STRIPE_SECRET_KEY to your .env file."
        )
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


# ── Plans ─────────────────────────────────────────────────────

@router.get("/plans")
async def get_plans():
    """Return available subscription plans (no auth needed)."""
    return {"plans": PLANS}


# ── Checkout ──────────────────────────────────────────────────

@router.post("/checkout")
async def create_checkout(
    plan: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Create a Stripe Checkout session and return the redirect URL.
    The frontend redirects the user to Stripe's hosted payment page.
    On success Stripe redirects back to /billing/success.
    """
    if plan not in PLANS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid plan '{plan}'. Choose from: {list(PLANS.keys())}"
        )

    plan_data = PLANS[plan]
    stripe = _stripe()
    user_id = current_user["user_id"]
    user_email = current_user.get("email", "")

    try:
        # If user already has a Stripe customer ID, reuse it so their
        # payment history and saved cards carry over
        from src.database.operations import get_user_by_id
        user = get_user_by_id(user_id)
        existing_customer = user.get("stripe_customer_id") if user else None

        session_params = {
            "payment_method_types": ["card"],
            "line_items": [{"price": plan_data["price_id"], "quantity": 1}],
            "mode": "subscription",
            "success_url": f"{settings.FRONTEND_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": f"{settings.FRONTEND_URL}/billing",
            "metadata": {"user_id": user_id, "plan": plan},
            "subscription_data": {"metadata": {"user_id": user_id, "plan": plan}},
            # Allow promo codes entered on the checkout page
            "allow_promotion_codes": True,
        }

        if existing_customer:
            session_params["customer"] = existing_customer
        else:
            session_params["customer_email"] = user_email

        session = stripe.checkout.Session.create(**session_params)

        logger.info("checkout_created", user_id=user_id, plan=plan)
        return {"checkout_url": session.url, "session_id": session.id}

    except Exception as e:
        logger.error("checkout_failed", user_id=user_id, plan=plan, error=str(e))
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")


# ── Customer Portal ───────────────────────────────────────────

@router.post("/portal")
async def create_portal_session(current_user: dict = Depends(get_current_user)):
    """
    Create a Stripe Customer Portal session.
    This lets the user manage their own subscription — change plan,
    update card, download invoices, or cancel — without you building any UI.
    The portal is hosted entirely by Stripe.
    """
    stripe = _stripe()
    user_id = current_user["user_id"]

    from src.database.operations import get_user_by_id
    user = get_user_by_id(user_id)
    customer_id = user.get("stripe_customer_id") if user else None

    if not customer_id:
        raise HTTPException(
            status_code=400,
            detail="No active subscription found. Please subscribe first."
        )

    try:
        portal = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{settings.FRONTEND_URL}/billing",
        )
        return {"portal_url": portal.url}
    except Exception as e:
        logger.error("portal_failed", user_id=user_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")


# ── Stripe Webhook ────────────────────────────────────────────

@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Receives all Stripe events and updates user subscription status.

    Events handled:
        checkout.session.completed      — new subscription started → set tier=pro
        invoice.payment_succeeded       — monthly/yearly renewal confirmed → keep tier=pro
        invoice.payment_failed          — payment failed → notify, keep pro for now (Stripe retries)
        customer.subscription.deleted   — cancelled or expired → set tier=free
        customer.subscription.paused    — paused → set tier=free
        customer.subscription.updated   — plan change → update stored plan

    IMPORTANT: Register this URL in your Stripe dashboard → Webhooks:
        URL: https://your-backend.koyeb.app/billing/webhook
        Events: checkout.session.completed, invoice.payment_succeeded,
                invoice.payment_failed, customer.subscription.deleted,
                customer.subscription.paused, customer.subscription.updated
    """
    stripe = _stripe()
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    # Verify the webhook came from Stripe (not a fake request)
    try:
        event = stripe.Webhook.construct_event(
            payload, sig, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        logger.warning("stripe_invalid_webhook_signature")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    from src.database.operations import update_user, _db as get_db

    event_type = event["type"]
    data = event["data"]["object"]

    logger.info("stripe_webhook_received", event_type=event_type)

    # ── New subscription activated ────────────────────────────
    if event_type == "checkout.session.completed":
        user_id = data.get("metadata", {}).get("user_id")
        customer_id = data.get("customer")
        subscription_id = data.get("subscription")
        plan = data.get("metadata", {}).get("plan", "pro_monthly")

        if user_id:
            update_user(user_id, {
                "tier": "pro",
                "stripe_customer_id": customer_id,
                "stripe_subscription_id": subscription_id,
                "stripe_plan": plan,
            })
            logger.info("user_upgraded_to_pro", user_id=user_id, plan=plan)

    # ── Subscription renewal paid ─────────────────────────────
    elif event_type == "invoice.payment_succeeded":
        customer_id = data.get("customer")
        subscription_id = data.get("subscription")
        amount = data.get("amount_paid", 0) / 100  # Stripe stores in cents
        currency = data.get("currency", "usd").upper()

        if customer_id:
            try:
                db = get_db()
                users = db().table("users").select("id") \
                    .eq("stripe_customer_id", customer_id).execute().data
                if users:
                    user_id = users[0]["id"]
                    # Keep them on Pro and log the renewal
                    update_user(user_id, {"tier": "pro"})
                    logger.info(
                        "subscription_renewed",
                        user_id=user_id,
                        amount=amount,
                        currency=currency,
                    )
            except Exception as e:
                logger.error("renewal_update_failed", error=str(e))

    # ── Payment failed (card declined, insufficient funds, etc.) ──
    elif event_type == "invoice.payment_failed":
        customer_id = data.get("customer")
        attempt_count = data.get("attempt_count", 1)
        next_attempt = data.get("next_payment_attempt")

        # Stripe automatically retries failed payments up to 4 times over ~2 weeks.
        # We keep the user on Pro during this grace period and only downgrade
        # when the subscription is fully cancelled (customer.subscription.deleted).
        # You could send them an email here to update their card.
        logger.warning(
            "payment_failed",
            customer_id=customer_id,
            attempt=attempt_count,
            next_attempt=next_attempt,
        )
        # TODO: send an email to user asking them to update their card

    # ── Subscription cancelled or expired ─────────────────────
    elif event_type in ("customer.subscription.deleted", "customer.subscription.paused"):
        customer_id = data.get("customer")

        if customer_id:
            try:
                db = get_db()
                users = db().table("users").select("id") \
                    .eq("stripe_customer_id", customer_id).execute().data
                if users:
                    user_id = users[0]["id"]
                    update_user(user_id, {
                        "tier": "free",
                        "stripe_subscription_id": None,
                        "stripe_plan": None,
                    })
                    logger.info("user_downgraded_to_free", user_id=user_id, event=event_type)
            except Exception as e:
                logger.error("downgrade_failed", error=str(e))

    # ── Subscription plan changed ─────────────────────────────
    elif event_type == "customer.subscription.updated":
        customer_id = data.get("customer")
        subscription_id = data.get("id")
        status = data.get("status")  # 'active', 'past_due', 'canceled', etc.

        if customer_id and status == "active":
            try:
                db = get_db()
                users = db().table("users").select("id") \
                    .eq("stripe_customer_id", customer_id).execute().data
                if users:
                    update_user(users[0]["id"], {
                        "tier": "pro",
                        "stripe_subscription_id": subscription_id,
                    })
            except Exception as e:
                logger.error("subscription_update_failed", error=str(e))

    # Always return 200 — Stripe will retry if we return anything else
    return {"received": True}


# ── Billing Status ────────────────────────────────────────────

@router.get("/status")
async def billing_status(current_user: dict = Depends(get_current_user)):
    """Return the user's current subscription tier and details."""
    from src.database.operations import get_user_by_id
    user = get_user_by_id(current_user["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_pro = user.get("tier") == "pro"

    return {
        "tier": user.get("tier", "free"),
        "is_pro": is_pro,
        "stripe_customer_id": user.get("stripe_customer_id"),
        "stripe_plan": user.get("stripe_plan"),
        "stripe_subscription_id": user.get("stripe_subscription_id"),
    }