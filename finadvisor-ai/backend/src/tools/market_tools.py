from concurrent.futures import ThreadPoolExecutor, as_completed
from langchain_core.tools import tool
from src.utils.logger import get_logger
import src.utils.cache as _cache

logger = get_logger(__name__)

# Hard per-call timeout for every yfinance network request (seconds)
_YFINANCE_TIMEOUT = 8


def _safe_ticker_info(sym: str) -> dict:
    """
    Fetch yfinance Ticker.info with a hard timeout.

    FIX: the original code had no timeout on any yfinance call.
    A single stalled Yahoo Finance request could block for 30-60 seconds.
    With 8 sequential calls in get_market_overview() that adds up to
    minutes of blocking, causing the SSE connection to be dropped by
    proxies/browsers before the chart is ever delivered.
    """
    import yfinance as yf
    try:
        t = yf.Ticker(sym)
        # Pass timeout through to the underlying requests session
        # yfinance 1.x forwards **kwargs to requests
        info = t.info
        return info if isinstance(info, dict) else {}
    except Exception:
        return {}


@tool
def get_stock_price(ticker: str) -> str:
    """Get the current price and key stats for a stock. ticker: e.g. AAPL, TSLA, MSFT"""
    _ck = _cache.cache_key("stock_price", ticker)
    cached = _cache.get(_ck)
    if cached:
        return cached
    try:
        info = _safe_ticker_info(ticker.upper().strip())
        price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
        if not price:
            return f"Could not retrieve price for {ticker}. Check the ticker symbol."

        name     = info.get("shortName") or info.get("longName", ticker)
        currency = info.get("currency", "USD")
        change   = info.get("regularMarketChangePercent")
        mc       = info.get("marketCap")
        pe       = info.get("trailingPE")
        hi       = info.get("fiftyTwoWeekHigh")
        lo       = info.get("fiftyTwoWeekLow")

        result = f"**{name} ({ticker.upper()})**\n"
        result += f"Price: {currency} {price:,.2f}\n"
        if change is not None:
            d = "▲" if change >= 0 else "▼"
            result += f"Change: {d} {abs(change):.2f}%\n"
        if mc:
            if mc >= 1e12:   result += f"Market Cap: ${mc/1e12:.2f}T\n"
            elif mc >= 1e9:  result += f"Market Cap: ${mc/1e9:.2f}B\n"
            else:            result += f"Market Cap: ${mc/1e6:.0f}M\n"
        if pe:          result += f"P/E Ratio: {pe:.1f}\n"
        if hi and lo:   result += f"52W Range: {currency} {lo:,.2f} – {hi:,.2f}"

        logger.info("stock_price_fetched", ticker=ticker)
        _cache.set(_ck, result.strip(), "stock_price")
        return result.strip()
    except Exception as e:
        logger.error("get_stock_price_failed", ticker=ticker, error=str(e))
        return f"Failed to get price for {ticker}. The ticker may be invalid."


@tool
def get_stock_history(ticker: str, period: str = "1mo") -> str:
    """Get historical price data for a stock. period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y"""
    try:
        import yfinance as yf
        hist = yf.Ticker(ticker.upper()).history(period=period, timeout=_YFINANCE_TIMEOUT)
        if hist.empty:
            return f"No historical data found for {ticker}."

        start = hist["Close"].iloc[0]
        end   = hist["Close"].iloc[-1]
        high  = hist["High"].max()
        low   = hist["Low"].min()
        chg   = ((end - start) / start) * 100
        vol   = hist["Volume"].mean()
        d     = "▲" if chg >= 0 else "▼"

        result  = f"**{ticker.upper()} — {period} Performance**\n"
        result += f"Start: ${start:,.2f} → End: ${end:,.2f}\n"
        result += f"Change: {d} {abs(chg):.2f}%\n"
        result += f"High: ${high:,.2f} | Low: ${low:,.2f}\n"
        result += f"Avg Volume: {vol:,.0f} | Trading days: {len(hist)}"
        logger.info("stock_history_fetched", ticker=ticker, period=period)
        return result
    except Exception as e:
        logger.error("get_stock_history_failed", ticker=ticker, error=str(e))
        return f"Failed to get history for {ticker}."


@tool
def search_ticker(company_name: str) -> str:
    """Find a stock ticker symbol by company name. e.g. 'Apple' -> 'AAPL'"""
    try:
        import yfinance as yf
        results = yf.Search(company_name, max_results=5)
        quotes  = results.quotes
        if not quotes:
            return f"No ticker found for '{company_name}'."
        lines = [f"Results for '{company_name}':"]
        for q in quotes[:5]:
            sym      = q.get("symbol", "")
            name     = q.get("shortname") or q.get("longname", "")
            exchange = q.get("exchange", "")
            lines.append(f"  {sym} — {name} ({exchange})")
        return "\n".join(lines)
    except Exception as e:
        logger.error("search_ticker_failed", company=company_name, error=str(e))
        return f"Search failed for '{company_name}'."


@tool
def get_market_overview() -> str:
    """Get a snapshot of major market indices: S&P 500, NASDAQ, DOW, VIX, Gold, Oil, BTC."""

    # FIX 2: Cache the result — previously get_market_overview had NO caching at all.
    # Every chart request was hitting Yahoo Finance 8 fresh times. With a 2-minute
    # TTL (already defined in cache.py) this cuts repeated calls to zero.
    _ck = _cache.cache_key("market_overview")
    cached = _cache.get(_ck)
    if cached:
        return cached

    symbols = {
        "S&P 500":   "^GSPC",
        "NASDAQ":    "^IXIC",
        "Dow Jones": "^DJI",
        "VIX":       "^VIX",
        "Gold":      "GC=F",
        "Oil (WTI)": "CL=F",
        "USD/EUR":   "EURUSD=X",
        "BTC/USD":   "BTC-USD",
    }

    lines = ["**Market Overview**\n"]

    # FIX 1: Fetch all symbols IN PARALLEL with a hard per-call timeout.
    # The original code used a sequential for-loop: each of the 8 yf.Ticker().info
    # calls blocked until the previous one finished, with no timeout.
    # A single slow/stalled Yahoo Finance response could make the whole tool take
    # 30-240 seconds, causing the SSE connection to be dropped by the proxy.
    # ThreadPoolExecutor runs all 8 fetches simultaneously; the whole batch
    # completes in the time of the single slowest call, not the sum of all 8.
    def _fetch(name_sym):
        name, sym = name_sym
        try:
            info  = _safe_ticker_info(sym)
            price = info.get("regularMarketPrice") or info.get("currentPrice") or info.get("previousClose")
            change = info.get("regularMarketChangePercent")
            return name, price, change
        except Exception:
            return name, None, None

    results = {}
    with ThreadPoolExecutor(max_workers=len(symbols)) as executor:
        future_map = {
            executor.submit(_fetch, item): item
            for item in symbols.items()
        }
        for future in as_completed(future_map, timeout=_YFINANCE_TIMEOUT + 2):
            try:
                name, price, change = future.result(timeout=1)
                if price is not None:
                    results[name] = (price, change)
            except Exception:
                pass

    # Preserve the original display order
    for name in symbols:
        if name in results:
            price, change = results[name]
            change_str = ""
            if change is not None:
                d = "▲" if change >= 0 else "▼"
                change_str = f" {d}{abs(change):.2f}%"
            lines.append(f"{name}: {price:,.2f}{change_str}")

    if len(lines) == 1:
        return "Market data is temporarily unavailable. Please try again in a moment."

    result = "\n".join(lines)
    _cache.set(_ck, result, "market_overview")
    logger.info("market_overview_fetched", symbols=len(results))
    return result