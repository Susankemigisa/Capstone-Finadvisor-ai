from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from src.auth.dependencies import get_current_user
from src.utils.logger import get_logger

router = APIRouter(prefix="/alerts", tags=["alerts"])
logger = get_logger(__name__)


class AlertCreate(BaseModel):
    ticker: str
    condition: str   # "above" or "below"
    target_price: float
    asset_type: str = "stock"


@router.get("")
async def get_alerts(current_user: dict = Depends(get_current_user)):
    from src.database.operations import _db
    user_id = current_user["user_id"]
    result = _db().table("price_alerts").select("*").eq("user_id", user_id).eq("is_active", True).order("created_at", desc=True).execute()
    return {"alerts": result.data or []}


@router.post("")
async def create_alert(body: AlertCreate, current_user: dict = Depends(get_current_user)):
    from src.database.operations import _db
    user_id = current_user["user_id"]
    result = _db().table("price_alerts").insert({
        "user_id": user_id,
        "ticker": body.ticker.upper(),
        "condition": body.condition,
        "target_price": body.target_price,
        "asset_type": body.asset_type,
        "is_active": True,
        "triggered": False,
    }).execute()
    return {"alert": result.data[0] if result.data else {}, "status": "created"}


@router.delete("/{alert_id}")
async def delete_alert(alert_id: str, current_user: dict = Depends(get_current_user)):
    from src.database.operations import _db
    user_id = current_user["user_id"]
    _db().table("price_alerts").update({"is_active": False}).eq("id", alert_id).eq("user_id", user_id).execute()
    return {"status": "deleted"}


@router.get("/all")
async def get_all_alerts(current_user: dict = Depends(get_current_user)):
    """Get all alerts including triggered ones."""
    from src.database.operations import _db
    user_id = current_user["user_id"]
    result = _db().table("price_alerts").select("*").eq("user_id", user_id).eq("is_active", True).order("created_at", desc=True).execute()
    return {"alerts": result.data or []}


@router.post("/check")
async def check_alerts(current_user: dict = Depends(get_current_user)):
    """Check all active alerts and return any that have triggered."""
    import yfinance as yf
    from src.database.operations import _db
    user_id = current_user["user_id"]
    result = _db().table("price_alerts").select("*").eq("user_id", user_id).eq("is_active", True).eq("triggered", False).execute()
    alerts = result.data or []
    triggered = []

    for alert in alerts:
        try:
            sym = f"{alert['ticker']}-USD" if alert["asset_type"] == "crypto" else alert["ticker"]
            info = yf.Ticker(sym).info
            price = info.get("regularMarketPrice") or info.get("currentPrice")
            if not price:
                continue
            hit = (alert["condition"] == "above" and price >= alert["target_price"]) or \
                  (alert["condition"] == "below" and price <= alert["target_price"])
            if hit:
                _db().table("price_alerts").update({"triggered": True, "triggered_price": price}).eq("id", alert["id"]).execute()
                triggered.append({**alert, "current_price": price})
        except Exception as e:
            logger.error("alert_check_failed", ticker=alert["ticker"], error=str(e))

    return {"triggered": triggered, "checked": len(alerts)}