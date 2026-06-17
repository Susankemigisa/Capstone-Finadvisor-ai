"""
market.py — REST endpoints that expose the market data tools as HTTP routes.

Previously this file was empty (only `router = APIRouter()`), meaning every
call to /market/... returned 404.  These endpoints wrap the existing yfinance
tool functions so the frontend or external consumers can query market data
directly without going through the chat agent.

All endpoints are authenticated.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from src.auth.dependencies import get_current_user
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ── GET /market/overview ──────────────────────────────────────
@router.get("/overview")
async def market_overview(current_user: dict = Depends(get_current_user)):
    """
    Returns a live snapshot of major indices: S&P 500, NASDAQ, DOW,
    VIX, Gold, Oil (WTI), USD/EUR, and BTC/USD.
    Results are cached for 2 minutes (same TTL as the agent tool).
    """
    try:
        from src.tools.market_tools import get_market_overview
        result = get_market_overview.invoke({})
        return {"data": result}
    except Exception as e:
        logger.error("market_overview_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch market overview")


# ── GET /market/price?ticker=AAPL ────────────────────────────
@router.get("/price")
async def stock_price(
    ticker: str = Query(..., description="Stock ticker symbol, e.g. AAPL"),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns the current price, change %, market cap, P/E ratio, and
    52-week range for a given ticker.  Cached for 1 minute.
    """
    ticker = ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="ticker is required")
    try:
        from src.tools.market_tools import get_stock_price
        result = get_stock_price.invoke({"ticker": ticker})
        return {"ticker": ticker, "data": result}
    except Exception as e:
        logger.error("stock_price_failed", ticker=ticker, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to fetch price for {ticker}")


# ── GET /market/history?ticker=AAPL&period=1mo ───────────────
@router.get("/history")
async def stock_history(
    ticker: str = Query(..., description="Stock ticker symbol"),
    period: str = Query("1mo", description="Period: 1d 5d 1mo 3mo 6mo 1y 2y 5y"),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns OHLCV price history for charting.
    """
    valid_periods = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"}
    ticker = ticker.upper().strip()
    if period not in valid_periods:
        raise HTTPException(
            status_code=400,
            detail=f"period must be one of: {', '.join(sorted(valid_periods))}",
        )
    try:
        from src.tools.market_tools import get_stock_history
        result = get_stock_history.invoke({"ticker": ticker, "period": period})
        return {"ticker": ticker, "period": period, "data": result}
    except Exception as e:
        logger.error("stock_history_failed", ticker=ticker, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to fetch history for {ticker}")


# ── GET /market/search?q=Apple ───────────────────────────────
@router.get("/search")
async def search_ticker(
    q: str = Query(..., description="Company name to search, e.g. Apple"),
    current_user: dict = Depends(get_current_user),
):
    """
    Fuzzy-search for a ticker symbol by company name.
    Returns up to 5 matches.
    """
    if not q.strip():
        raise HTTPException(status_code=400, detail="q is required")
    try:
        from src.tools.market_tools import search_ticker as _search
        result = _search.invoke({"company_name": q.strip()})
        return {"query": q, "data": result}
    except Exception as e:
        logger.error("ticker_search_failed", query=q, error=str(e))
        raise HTTPException(status_code=500, detail="Ticker search failed")
