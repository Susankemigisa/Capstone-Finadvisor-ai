"""
Auth middleware — lightweight request-level authentication logging
and security header injection.

This is NOT a blocking auth middleware — individual routes use the
get_current_user() dependency for that. This middleware sits at the
HTTP layer and handles two concerns:

1. Security headers — adds hardened HTTP headers to every response:
       X-Content-Type-Options:  nosniff
       X-Frame-Options:         DENY
       X-XSS-Protection:        1; mode=block
       Referrer-Policy:         strict-origin-when-cross-origin
       Permissions-Policy:      camera=(), microphone=(), geolocation=()

2. Request context logging — attaches user_id to the structlog context
   for the duration of the request so every log line in that request
   automatically includes the authenticated user's ID.

Why not block in middleware?
FastAPI's dependency injection (Depends) is the right place to enforce
auth on specific routes. A blanket middleware auth check would break
public endpoints (login, register, health) and is harder to configure
per-route. This middleware is purely additive — it enhances observability
and security posture without touching auth logic.

Registered in main.py via:
    from src.api.middleware.auth_middleware import AuthMiddleware
    app.add_middleware(AuthMiddleware)
"""

from __future__ import annotations

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.utils.logger import get_logger

logger = get_logger(__name__)

# Security headers added to every HTTP response
_SECURITY_HEADERS = {
    "X-Content-Type-Options":  "nosniff",
    "X-Frame-Options":         "DENY",
    "X-XSS-Protection":        "1; mode=block",
    "Referrer-Policy":         "strict-origin-when-cross-origin",
    "Permissions-Policy":      "camera=(), microphone=(), geolocation=()",
}

# Paths where we skip user context injection (they have no auth header)
_PUBLIC_PATHS = {
    "/health", "/", "/docs", "/redoc", "/openapi.json",
    "/auth/login", "/auth/register", "/auth/forgot-password",
    "/auth/reset-password", "/auth/refresh", "/auth/oauth",
}


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Starlette middleware that adds security headers and injects
    authenticated user context into the structlog context vars.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Clear any leftover context from previous requests in this thread
        structlog.contextvars.clear_contextvars()

        # Inject user context if authenticated
        user_id = _extract_user_id(request)
        if user_id:
            structlog.contextvars.bind_contextvars(user_id=user_id)

        # Always bind request metadata for structured logs
        structlog.contextvars.bind_contextvars(
            method=request.method,
            path=str(request.url.path),
        )

        # Process the request
        response: Response = await call_next(request)

        # Inject security headers into every response
        for header, value in _SECURITY_HEADERS.items():
            response.headers[header] = value

        # Clear context after response (defensive cleanup)
        structlog.contextvars.clear_contextvars()

        return response


def _extract_user_id(request: Request) -> str | None:
    """
    Extract the user_id from the Bearer token if present.

    Returns None for unauthenticated requests without raising —
    public routes don't have auth headers and that's expected.
    """
    if request.url.path in _PUBLIC_PATHS:
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header[7:]
    try:
        from src.auth.jwt_handler import decode_access_token
        payload = decode_access_token(token)
        return payload.get("sub") if payload else None
    except Exception:
        return None
