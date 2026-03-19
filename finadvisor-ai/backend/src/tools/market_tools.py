from langchain_core.tools import tool
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from src.utils.logger import get_logger
import src.utils.cache as _cache

logger = get_logger(__name__)


@tool
def get_stock_price(ticker: str) -> str:
    """Get the current price and key stats for a stock. ticker: e.g. AAPL, TSLA, MSFT"""
    _ck = _cache.cache_key("stock_price", ticker)
    cached = _cache.get(_ck)
    if cached: return cached
    try:
        import yfinance as yf
        t = yf.Ticker(ticker.upper().strip())
        info = t.info
        price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
        if not price:
            return f"Could not retrieve price for {ticker}. Check the ticker symbol."

        name = info.get("shortName") or info.get("longName", ticker)
        currency = info.get("currency", "USD")
        change = info.get("regularMarketChangePercent")
        mc = info.get("marketCap")
        pe = info.get("trailingPE")
        hi = info.get("fiftyTwoWeekHigh")
        lo = info.get("fiftyTwoWeekLow")

        result = f"**{name} ({ticker.upper()})**\n"
        result += f"Price: {currency} {price:,.2f}\n"
        if change is not None:
            d = "▲" if change >= 0 else "▼"
            result += f"Change: {d} {abs(change):.2f}%\n"
        if mc:
            if mc >= 1e12: result += f"Market Cap: ${mc/1e12:.2f}T\n"
            elif mc >= 1e9: result += f"Market Cap: ${mc/1e9:.2f}B\n"
            else: result += f"Market Cap: ${mc/1e6:.0f}M\n"
        if pe: result += f"P/E Ratio: {pe:.1f}\n"
        if hi and lo: result += f"52W Range: {currency} {lo:,.2f} – {hi:,.2f}"

        logger.info("stock_price_fetched", ticker=ticker)
        _cache.set(_ck, result, "stock_price")
        return result.strip()
    except Exception as e:
        logger.error("get_stock_price_failed", ticker=ticker, error=str(e))
        return f"Failed to get price for {ticker}. The ticker may be invalid."


@tool
def get_stock_history(ticker: str, period: str = "1mo") -> str:
    """Get historical price data for a stock. period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y"""
    try:
        import yfinance as yf
        hist = yf.Ticker(ticker.upper()).history(period=period)
        if hist.empty:
            return f"No historical data found for {ticker}."

        start = hist["Close"].iloc[0]
        end = hist["Close"].iloc[-1]
        high = hist["High"].max()
        low = hist["Low"].min()
        chg = ((end - start) / start) * 100
        vol = hist["Volume"].mean()
        d = "▲" if chg >= 0 else "▼"

        result = f"**{ticker.upper()} — {period} Performance**\n"
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
        quotes = results.quotes
        if not quotes:
            return f"No ticker found for '{company_name}'."
        lines = [f"Results for '{company_name}':"]
        for q in quotes[:5]:
            sym = q.get("symbol", "")
            name = q.get("shortname") or q.get("longname", "")
            exchange = q.get("exchange", "")
            lines.append(f"  {sym} — {name} ({exchange})")
        return "\n".join(lines)
    except Exception as e:
        logger.error("search_ticker_failed", company=company_name, error=str(e))
        return f"Search failed for '{company_name}'."


@tool
def get_market_overview() -> str:
    """Get a snapshot of major market indices: S&P 500, NASDAQ, DOW, VIX, Gold, Oil, BTC."""
    try:
        import yfinance as yf
        symbols = {
            "S&P 500": "^GSPC", "NASDAQ": "^IXIC", "Dow Jones": "^DJI",
            "VIX": "^VIX", "Gold": "GC=F", "Oil (WTI)": "CL=F",
            "USD/EUR": "EURUSD=X", "BTC/USD": "BTC-USD",
        }
        lines = ["**Market Overview**\n"]
        for name, sym in symbols.items():
            try:
                info = yf.Ticker(sym).info
                price = info.get("regularMarketPrice") or info.get("currentPrice") or info.get("previousClose")
                change = info.get("regularMarketChangePercent")
                if price:
                    change_str = ""
                    if change is not None:
                        d = "▲" if change >= 0 else "▼"
                        change_str = f" {d}{abs(change):.2f}%"
                    lines.append(f"{name}: {price:,.2f}{change_str}")
            except Exception:
                pass
        return "\n".join(lines)
    except Exception as e:
        logger.error("market_overview_failed", error=str(e))
        return "Failed to fetch market overview."