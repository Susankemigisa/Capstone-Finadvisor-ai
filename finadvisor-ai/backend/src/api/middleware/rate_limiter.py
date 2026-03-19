"""
Rate limiter middleware — protects all API endpoints from abuse.

Uses slowapi (a FastAPI-native wrapper around limits) with an in-memory
backend. For multi-process/multi-instance deployments, swap the backend
for Redis by changing _get_limiter() — no other code changes needed.

Two limits applied globally:
    - Per minute:  settings.RATE_LIMIT_PER_MINUTE  (default 30)
    - Per hour:    settings.RATE_LIMIT_PER_HOUR    (default 300)

Key function: identifies requests by authenticated user_id if a valid
JWT is present, otherwise falls back to IP address. This means:
    - Authenticated users get their own quota (fair per-user limiting)
    - Unauthenticated requests (login, register) share the IP quota

Certain paths are exempt from rate limiting:
    - GET /health          (uptime monitoring)
    - GET /                (root)

Registered in main.py via:
    from src.api.middleware.rate_limiter import get_limiter, rate_limit_handler
    limiter = get_limiter()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
    app.add_middleware(SlowAPIMiddleware)
"""

from __future__ import annotations

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware  # noqa: F401 — re-exported for main.py

from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

# Paths that skip rate limiting entirely
_EXEMPT_PATHS = {"/health", "/", "/docs", "/redoc", "/openapi.json"}


def _identify_request(request: Request) -> str:
    """
    Rate limit key function.

    Returns the authenticated user_id if the request carries a valid
    Bearer token, otherwise returns the client IP address.

    Using user_id as the key means a user can't bypass their quota by
    switching IP addresses (e.g. via VPN), and multiple users behind
    the same NAT/proxy don't share a quota.
    """
    # Try to extract user_id from Authorization header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            from src.auth.jwt_handler import decode_access_token
            payload = decode_access_token(token)
            if payload and payload.get("sub"):
                return f"user:{payload['sub']}"
        except Exception:
            pass  # Fall through to IP-based limiting

    # Fall back to IP address for unauthenticated requests
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # X-Forwarded-For can be a comma-separated list — take the first (real client)
        return f"ip:{forwarded_for.split(',')[0].strip()}"

    client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}"


def get_limiter() -> Limiter:
    """
    Build and return the configured Limiter instance.

    Uses in-memory storage by default. To switch to Redis:
        storage_uri = "redis://localhost:6379"
        return Limiter(key_func=_identify_request, storage_uri=storage_uri)
    """
    return Limiter(
        key_func=_identify_request,
        default_limits=[
            f"{settings.RATE_LIMIT_PER_MINUTE}/minute",
            f"{settings.RATE_LIMIT_PER_HOUR}/hour",
        ],
        headers_enabled=True,   # Adds X-RateLimit-* headers to responses
        swallow_errors=True,    # Don't crash if storage backend fails
    )


async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """
    Exception handler for rate limit violations.

    Returns a clear 429 response with a retry hint. Logs the violation
    so we can detect abuse patterns.
    """
    key = _identify_request(request)
    logger.warning(
        "rate_limit_exceeded",
        key=key,
        path=str(request.url.path),
        limit=str(exc.detail),
    )

    # Parse the limit string to give a useful retry message
    limit_str  = str(exc.detail) if exc.detail else ""
    retry_hint = _parse_retry_hint(limit_str)

    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "detail":  f"Too many requests. {retry_hint}",
            "status":  "rate_limited",
            "limit":   limit_str,
        },
        headers={"Retry-After": _retry_after_seconds(limit_str)},
    )


def is_exempt(path: str) -> bool:
    """Return True if the path should skip rate limiting."""
    return path in _EXEMPT_PATHS


# ── Helpers ───────────────────────────────────────────────────

def _parse_retry_hint(limit_str: str) -> str:
    """Convert a slowapi limit string like '30/minute' into a user hint."""
    if "minute" in limit_str:
        return "Please wait a minute before trying again."
    if "hour" in limit_str:
        return "You have reached your hourly limit. Please try again later."
    return "Please wait a moment before trying again."


def _retry_after_seconds(limit_str: str) -> str:
    """Return the Retry-After header value in seconds."""
    if "minute" in limit_str:
        return "60"
    if "hour" in limit_str:
        return "3600"
    return "60"
