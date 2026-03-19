from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import asyncio
from concurrent.futures import ThreadPoolExecutor
import yfinance as yf

from src.auth.dependencies import get_current_user
from src.database.operations import (
    get_watchlist, add_to_watchlist, remove_from_watchlist
)
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

_executor = ThreadPoolExecutor(max_workers=10)


class WatchlistAdd(BaseModel):
    ticker: str
    asset_type: str = "stock"


def _get_live_price(ticker: str) -> dict:
    """
    Always fetch the freshest price available from yfinance.
    During market hours: returns live intraday price.
    Outside hours: returns last close price.
    """
    try:
        t = yf.Ticker(ticker)

        # 1m intraday — freshest data, not cached by yfinance
        hist = t.history(period='1d', interval='1m', prepost=True)

        if hist is not None and not hist.empty:
            price = float(hist['Close'].iloc[-1])
            open_price = float(hist['Open'].iloc[0])
            change_pct = ((price - open_price) / open_price * 100) if open_price > 0 else 0
            return {
                "price": round(price, 4),
                "change_pct": round(change_pct, 2),
                "currency": "USD",
            }

        # Fallback: fast_info when no intraday data
        info = t.fast_info
        price = getattr(info, 'last_price', None) or getattr(info, 'previous_close', None)
        prev = getattr(info, 'previous_close', None)
        change_pct = ((price - prev) / prev * 100) if price and prev and prev > 0 else 0
        return {
            "price": round(float(price), 4) if price else None,
            "change_pct": round(change_pct, 2),
            "currency": getattr(info, 'currency', 'USD'),
        }

    except Exception as e:
        logger.warning("price_fetch_failed", ticker=ticker, error=str(e))
        return {"price": None, "change_pct": 0, "currency": "USD"}


@router.get("")
async def get_user_watchlist(user=Depends(get_current_user)):
    items = get_watchlist(user["user_id"])
    if not items:
        return {"watchlist": []}

    loop = asyncio.get_running_loop()
    prices = await asyncio.gather(
        *[loop.run_in_executor(_executor, _get_live_price, item["ticker"]) for item in items],
        return_exceptions=True
    )

    enriched = []
    for item, price_data in zip(items, prices):
        if isinstance(price_data, Exception):
            price_data = {"price": None, "change_pct": 0, "currency": "USD"}
        enriched.append({**item, **price_data})

    return {"watchlist": enriched}


@router.post("")
async def add_watchlist_item(body: WatchlistAdd, user=Depends(get_current_user)):
    result = add_to_watchlist(user["user_id"], body.ticker, body.asset_type)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to add to watchlist")
    return {"success": True, "item": result}


@router.delete("/{ticker}")
async def remove_watchlist_item(ticker: str, user=Depends(get_current_user)):
    success = remove_from_watchlist(user["user_id"], ticker)
    return {"success": success}