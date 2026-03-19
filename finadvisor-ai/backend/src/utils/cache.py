"""
Simple in-memory cache with TTL for expensive tool calls (stock prices, news etc.)
Avoids redundant API calls within a short window.
"""
import time
from typing import Any, Optional
from src.utils.logger import get_logger

logger = get_logger(__name__)

_cache: dict[str, tuple[Any, float]] = {}

# TTL in seconds per cache category
TTL = {
    "stock_price":    60,      # 1 minute
    "stock_history":  300,     # 5 minutes
    "crypto_price":   30,      # 30 seconds
    "crypto_history": 300,     # 5 minutes
    "market_overview":120,     # 2 minutes
    "news":           600,     # 10 minutes
    "default":        120,     # 2 minutes
}


def cache_key(category: str, *args) -> str:
    return f"{category}:{':'.join(str(a) for a in args)}"


def get(key: str) -> Optional[Any]:
    if key not in _cache:
        return None
    value, expires_at = _cache[key]
    if time.time() > expires_at:
        del _cache[key]
        return None
    logger.info("cache_hit", key=key)
    return value


def set(key: str, value: Any, category: str = "default") -> None:
    ttl = TTL.get(category, TTL["default"])
    _cache[key] = (value, time.time() + ttl)
    logger.info("cache_set", key=key, ttl=ttl)


def invalidate(prefix: str) -> None:
    """Remove all cache entries starting with prefix."""
    keys = [k for k in _cache if k.startswith(prefix)]
    for k in keys:
        del _cache[k]


def stats() -> dict:
    now = time.time()
    active = {k: v for k, v in _cache.items() if v[1] > now}
    return {"total": len(_cache), "active": len(active), "expired": len(_cache) - len(active)}