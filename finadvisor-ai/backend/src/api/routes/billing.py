from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from src.auth.dependencies import get_current_user
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


def _get_stripe():
    import stripe
    from src.config.settings import settings
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured. Add STRIPE_SECRET_KEY to .env")
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


PLANS = {
    "pro_monthly": {
        "name": "Pro Monthly",
        "price_usd": 19.00,
        "interval": "month",
        "features": ["Unlimited messages", "All AI models", "Priority support", "Export history", "Advanced analytics"]
    },
    "pro_yearly": {
        "name": "Pro Yearly",
        "price_usd": 159.00,
        "interval": "year",
        "features": ["Everything in Monthly", "Save 30%", "Early access to new features"]
    }
}


@router.get("/plans")
async def get_plans():
    return {"plans": PLANS}


@router.post("/checkout")
async def create_checkout(
    plan: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a Stripe checkout session for upgrading to Pro."""
    from src.config.settings import settings

    logger.info("checkout_attempt", plan=plan, user=current_user["user_id"])

    if plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {plan}. Must be one of: {list(PLANS.keys())}")

    stripe = _get_stripe()
    plan_data = PLANS[plan]

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"FinAdvisor {plan_data['name']}"},
                    "unit_amount": int(plan_data["price_usd"] * 100),
                    "recurring": {"interval": plan_data["interval"]},
                },
                "quantity": 1,
            }],
            mode="subscription",
            success_url=f"{settings.FRONTEND_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/billing",
            customer_email=current_user["email"],
            metadata={"user_id": current_user["user_id"], "plan": plan},
        )
        logger.info("checkout_created", user_id=current_user["user_id"], plan=plan)
        return {"checkout_url": session.url, "session_id": session.id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("checkout_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events (subscription activated, cancelled, etc)."""
    from src.config.settings import settings
    from src.database.operations import update_user, get_user_by_id

    stripe = _get_stripe()
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig, settings.STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("user_id")
        if user_id:
            update_user(user_id, {"tier": "pro", "stripe_customer_id": session.get("customer")})
            logger.info("user_upgraded", user_id=user_id)

    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.paused"):
        customer_id = event["data"]["object"].get("customer")
        if customer_id:
            from src.database.operations import _db
            users = _db().table("users").select("id").eq("stripe_customer_id", customer_id).execute().data
            if users:
                update_user(users[0]["id"], {"tier": "free"})
                logger.info("user_downgraded", customer_id=customer_id)

    return {"received": True}


@router.get("/status")
async def billing_status(current_user: dict = Depends(get_current_user)):
    """Get current user's subscription status."""
    from src.database.operations import get_user_by_id
    user = get_user_by_id(current_user["user_id"])
    return {
        "tier": user.get("tier", "free"),
        "is_pro": user.get("tier") == "pro",
        "stripe_customer_id": user.get("stripe_customer_id"),
    }