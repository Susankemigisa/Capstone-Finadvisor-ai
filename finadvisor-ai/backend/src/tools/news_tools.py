from langchain_core.tools import tool
from src.utils.logger import get_logger

logger = get_logger(__name__)


@tool
def get_financial_news(topic: str = "markets") -> str:
    """
    Get the latest financial news headlines.
    topic: markets, economy, crypto, earnings, fed, tech, energy
    """
    try:
        import yfinance as yf

        topic_tickers = {
            "markets":  "^GSPC",
            "economy":  "^TNX",
            "crypto":   "BTC-USD",
            "earnings": "^GSPC",
            "fed":      "^TNX",
            "tech":     "QQQ",
            "energy":   "XLE",
        }
        ticker_sym = topic_tickers.get(topic.lower(), "^GSPC")
        t = yf.Ticker(ticker_sym)
        news = t.news

        if not news:
            return f"No news found for topic '{topic}'."

        lines = [f"**Latest {topic.title()} News**\n"]
        for item in news[:7]:
            title = item.get("title", "")
            publisher = item.get("publisher", "")
            link = item.get("link", "")
            if title:
                lines.append(f"• {title}")
                if publisher:
                    lines.append(f"  Source: {publisher}")
                if link:
                    lines.append(f"  {link}")
                lines.append("")

        logger.info("financial_news_fetched", topic=topic)
        return "\n".join(lines).strip()

    except Exception as e:
        logger.error("get_financial_news_failed", topic=topic, error=str(e))
        return f"Failed to fetch news for '{topic}'."


@tool
def get_stock_news(ticker: str) -> str:
    """
    Get recent news articles for a specific stock.
    ticker: Stock symbol e.g. AAPL, TSLA, MSFT
    """
    try:
        import yfinance as yf
        t = yf.Ticker(ticker.upper().strip())
        news = t.news

        if not news:
            return f"No recent news found for {ticker}."

        info = t.info
        name = info.get("shortName", ticker.upper())
        lines = [f"**Recent News: {name} ({ticker.upper()})**\n"]

        for item in news[:6]:
            title = item.get("title", "")
            publisher = item.get("publisher", "")
            link = item.get("link", "")
            if title:
                lines.append(f"• {title}")
                if publisher:
                    lines.append(f"  Source: {publisher}")
                if link:
                    lines.append(f"  {link}")
                lines.append("")

        logger.info("stock_news_fetched", ticker=ticker)
        return "\n".join(lines).strip()

    except Exception as e:
        logger.error("get_stock_news_failed", ticker=ticker, error=str(e))
        return f"Failed to fetch news for {ticker}."