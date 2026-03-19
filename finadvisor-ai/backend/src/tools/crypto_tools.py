from langchain_core.tools import tool
from src.utils.logger import get_logger

logger = get_logger(__name__)

# CoinGecko ID map for common symbols
CRYPTO_IDS = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
    "BNB": "binancecoin", "XRP": "ripple", "ADA": "cardano",
    "DOGE": "dogecoin", "AVAX": "avalanche-2", "DOT": "polkadot",
    "MATIC": "matic-network", "LINK": "chainlink", "UNI": "uniswap",
    "LTC": "litecoin", "ATOM": "cosmos", "NEAR": "near",
    "APT": "aptos", "ARB": "arbitrum", "OP": "optimism",
}


def _get_coingecko_id(symbol: str) -> str:
    return CRYPTO_IDS.get(symbol.upper(), symbol.lower())


@tool
def get_crypto_price(symbol: str) -> str:
    """
    Get the current price and stats for a cryptocurrency.
    symbol: BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, DOT, MATIC, etc.
    Uses CoinGecko API (no API key required).
    """
    try:
        import httpx
        coin_id = _get_coingecko_id(symbol)
        url = f"https://api.coingecko.com/api/v3/coins/{coin_id}"
        params = {"localization": "false", "tickers": "false", "community_data": "false"}

        with httpx.Client(timeout=10) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        market = data.get("market_data", {})
        price = market.get("current_price", {}).get("usd")
        change_24h = market.get("price_change_percentage_24h")
        change_7d = market.get("price_change_percentage_7d")
        mc = market.get("market_cap", {}).get("usd")
        hi_24h = market.get("high_24h", {}).get("usd")
        lo_24h = market.get("low_24h", {}).get("usd")
        ath = market.get("ath", {}).get("usd")
        rank = data.get("market_cap_rank")
        name = data.get("name", symbol)

        if price is None:
            return f"Could not get price for {symbol}."

        result = f"**{name} ({symbol.upper()})**\n"
        result += f"Price: ${price:,.4f}\n" if price < 1 else f"Price: ${price:,.2f}\n"

        if change_24h is not None:
            d = "▲" if change_24h >= 0 else "▼"
            result += f"24h: {d} {abs(change_24h):.2f}%"
        if change_7d is not None:
            d = "▲" if change_7d >= 0 else "▼"
            result += f" | 7d: {d} {abs(change_7d):.2f}%"
        result += "\n"

        if hi_24h and lo_24h:
            result += f"24h Range: ${lo_24h:,.2f} – ${hi_24h:,.2f}\n"
        if mc:
            if mc >= 1e12: result += f"Market Cap: ${mc/1e12:.2f}T\n"
            elif mc >= 1e9: result += f"Market Cap: ${mc/1e9:.2f}B\n"
            else: result += f"Market Cap: ${mc/1e6:.0f}M\n"
        if rank: result += f"Rank: #{rank}\n"
        if ath: result += f"ATH: ${ath:,.2f}"

        logger.info("crypto_price_fetched", symbol=symbol)
        return result.strip()

    except Exception as e:
        logger.error("get_crypto_price_failed", symbol=symbol, error=str(e))
        # Fallback to yfinance
        try:
            import yfinance as yf
            t = yf.Ticker(f"{symbol.upper()}-USD")
            info = t.info
            price = info.get("regularMarketPrice") or info.get("currentPrice")
            if price:
                return f"**{symbol.upper()}/USD**\nPrice: ${price:,.2f}\n(via yfinance fallback)"
        except Exception:
            pass
        return f"Failed to get price for {symbol}. Try BTC, ETH, SOL etc."


@tool
def get_crypto_history(symbol: str, days: int = 30) -> str:
    """
    Get historical price data for a cryptocurrency over the last N days.
    symbol: BTC, ETH, SOL, etc.
    days: number of days of history (1, 7, 14, 30, 90, 180, 365)
    """
    try:
        import httpx
        coin_id = _get_coingecko_id(symbol)
        url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart"
        params = {"vs_currency": "usd", "days": days}

        with httpx.Client(timeout=10) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        prices = data.get("prices", [])
        if not prices:
            return f"No history found for {symbol}."

        start_price = prices[0][1]
        end_price = prices[-1][1]
        all_prices = [p[1] for p in prices]
        high = max(all_prices)
        low = min(all_prices)
        change = ((end_price - start_price) / start_price) * 100
        d = "▲" if change >= 0 else "▼"

        result = f"**{symbol.upper()} — {days}d Performance**\n"
        result += f"Start: ${start_price:,.2f} → Current: ${end_price:,.2f}\n"
        result += f"Change: {d} {abs(change):.2f}%\n"
        result += f"Period High: ${high:,.2f} | Period Low: ${low:,.2f}"

        logger.info("crypto_history_fetched", symbol=symbol, days=days)
        return result

    except Exception as e:
        logger.error("get_crypto_history_failed", symbol=symbol, error=str(e))
        return f"Failed to get history for {symbol}."