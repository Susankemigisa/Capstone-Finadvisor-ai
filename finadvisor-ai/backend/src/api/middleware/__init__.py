"""
API middleware — registered in main.py in this order:
    1. AuthMiddleware        — security headers + user context logging
    2. SlowAPIMiddleware     — rate limiting (via app.state.limiter)
    3. Error handlers        — clean JSON errors for all exceptions

Import pattern in main.py:
    from src.api.middleware import (
        AuthMiddleware,
        SlowAPIMiddleware,
        get_limiter,
        rate_limit_handler,
        register_error_handlers,
    )
"""

from src.api.middleware.auth_middleware import AuthMiddleware
from src.api.middleware.rate_limiter    import (
    get_limiter,
    rate_limit_handler,
    SlowAPIMiddleware,
)
from src.api.middleware.error_handler   import register_error_handlers

__all__ = [
    "AuthMiddleware",
    "SlowAPIMiddleware",
    "get_limiter",
    "rate_limit_handler",
    "register_error_handlers",
]
