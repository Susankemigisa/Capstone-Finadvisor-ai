from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from src.auth.dependencies import get_current_user
from src.database.operations import (
    get_portfolio, add_portfolio_position,
    remove_portfolio_position, update_portfolio_position
)
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


class AddPositionRequest(BaseModel):
    ticker: str
    shares: float
    avg_buy_price: float
    asset_type: str = "stock"
    notes: str = ""


class UpdatePositionRequest(BaseModel):
    shares: float = None
    avg_buy_price: float = None
    notes: str = None


async def _enrich_positions(positions: list) -> dict:
    """Fetch live prices for all positions and compute P&L."""
    import yfinance as yf

    total_invested = 0.0
    total_value = 0.0
    enriched = []

    for pos in positions:
        ticker = pos["ticker"]
        shares = float(pos["shares"])
        avg_price = float(pos["avg_buy_price"])
        asset_type = pos.get("asset_type", "stock")
        cost_basis = shares * avg_price
        total_invested += cost_basis

        # Fetch live price
        current_price = avg_price
        day_change = 0.0
        day_change_pct = 0.0
        try:
            sym = f"{ticker}-USD" if asset_type == "crypto" else ticker
            t = yf.Ticker(sym)
            info = t.info
            current_price = float(
                info.get("regularMarketPrice") or
                info.get("currentPrice") or
                avg_price
            )
            prev_close = float(info.get("regularMarketPreviousClose") or current_price)
            day_change = current_price - prev_close
            day_change_pct = (day_change / prev_close * 100) if prev_close else 0
        except Exception:
            pass

        current_value = shares * current_price
        total_value += current_value
        pnl = current_value - cost_basis
        pnl_pct = (pnl / cost_basis * 100) if cost_basis > 0 else 0

        enriched.append({
            "id": str(pos["id"]),
            "ticker": ticker,
            "asset_type": asset_type,
            "shares": shares,
            "avg_buy_price": avg_price,
            "current_price": round(current_price, 4),
            "cost_basis": round(cost_basis, 2),
            "current_value": round(current_value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
            "day_change": round(day_change, 4),
            "day_change_pct": round(day_change_pct, 2),
            "notes": pos.get("notes", ""),
            "created_at": str(pos.get("created_at", "")),
        })

    total_pnl = total_value - total_invested
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0

    # Sort by current value descending
    enriched.sort(key=lambda x: x["current_value"], reverse=True)

    return {
        "positions": enriched,
        "summary": {
            "total_invested": round(total_invested, 2),
            "total_value": round(total_value, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "position_count": len(enriched),
        }
    }


@router.get("/")
async def get_portfolio_route(current_user: dict = Depends(get_current_user)):
    """Get full portfolio with live prices and P&L."""
    user_id = str(current_user["user_id"])
    try:
        positions = get_portfolio(user_id)
        data = await _enrich_positions(positions)
        logger.info("portfolio_fetched", user_id=user_id, count=len(positions))
        return data
    except Exception as e:
        logger.error("portfolio_fetch_failed", user_id=user_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/positions")
async def add_position_route(
    body: AddPositionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Add a new position to the portfolio."""
    user_id = str(current_user["user_id"])
    result = add_portfolio_position(
        user_id=user_id,
        ticker=body.ticker.upper(),
        asset_type=body.asset_type,
        shares=body.shares,
        avg_buy_price=body.avg_buy_price,
    )
    if not result:
        raise HTTPException(status_code=400, detail="Failed to add position")
    return {"success": True, "position": result}


@router.delete("/positions/{position_id}")
async def remove_position_route(
    position_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove a position from the portfolio."""
    user_id = str(current_user["user_id"])
    success = remove_portfolio_position(position_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"success": True}


@router.patch("/positions/{position_id}")
async def update_position_route(
    position_id: str,
    body: UpdatePositionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update shares or avg price of a position."""
    user_id = str(current_user["user_id"])
    updates = {k: v for k, v in body.dict().items() if v is not None}
    result = update_portfolio_position(position_id, user_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"success": True, "position": result}