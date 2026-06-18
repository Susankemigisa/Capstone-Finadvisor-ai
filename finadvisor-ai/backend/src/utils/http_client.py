"""
http_client.py — Shared async HTTPX client for the entire backend.

WHY A SHARED CLIENT?
--------------------
Creating a new httpx.AsyncClient() on every tool call means a fresh TCP
connection is opened and closed each time.  A shared client reuses the
underlying connection pool (keep-alive), which is significantly faster for
tools that hit the same host repeatedly (CoinGecko, market APIs, etc.).

USAGE
-----
    from src.utils.http_client import get_http_client

    async def my_tool():
        client = get_http_client()
        resp = await client.get("https://api.example.com/data")
        resp.raise_for_status()
        return resp.json()

LIFECYCLE
---------
Call startup_http_client() in main.py lifespan startup and
shutdown_http_client() in lifespan shutdown so the client is properly closed.
"""

import httpx
from src.utils.logger import get_logger

logger = get_logger(__name__)

# Module-level singleton — one client for the entire process lifetime.
_client: httpx.AsyncClient | None = None

# Sensible defaults for a financial data app:
#   connect=5s   — fail fast if the host is unreachable
#   read=15s     — market APIs can be slow but shouldn't hang forever
#   write=10s    — for POST bodies (image downloads, payment APIs)
#   pool=5s      — don't block waiting for a connection slot
DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=10.0, pool=5.0)

# Retry policy — httpx doesn't retry by default.
# We use a transport with retries for transient network errors.
RETRY_TRANSPORT = httpx.AsyncHTTPTransport(retries=2)


def get_http_client() -> httpx.AsyncClient:
    """
    Return the shared async HTTPX client.
    Raises RuntimeError if startup_http_client() hasn't been called yet.
    """
    if _client is None:
        raise RuntimeError(
            "HTTP client not initialised. "
            "Call startup_http_client() in your app lifespan startup handler."
        )
    return _client


async def startup_http_client() -> None:
    """Call once at application startup (in FastAPI lifespan)."""
    global _client
    _client = httpx.AsyncClient(
        timeout=DEFAULT_TIMEOUT,
        transport=RETRY_TRANSPORT,
        headers={
            # Polite default User-Agent so APIs don't reject us
            "User-Agent": "FinAdvisorAI/1.0 (financial assistant; +https://finadvisor.ai)"
        },
        follow_redirects=True,
    )
    logger.info("http_client_started")


async def shutdown_http_client() -> None:
    """Call once at application shutdown (in FastAPI lifespan)."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
        logger.info("http_client_closed")
