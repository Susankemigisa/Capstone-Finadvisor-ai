"""
API routes — all FastAPI routers in one place.

Imported by main.py:
    from src.api.routes import (
        auth, chat, portfolio, documents, market, analytics,
        billing, notifications, alerts, watchlist, goals,
        budget, tax, exports,
    )
"""

from src.api.routes import (
    auth,
    chat,
    portfolio,
    documents,
    market,
    analytics,
    billing,
    notifications,
    alerts,
    watchlist,
    goals,
    budget,
    tax,
    exports,
)

__all__ = [
    "auth", "chat", "portfolio", "documents", "market",
    "analytics", "billing", "notifications", "alerts",
    "watchlist", "goals", "budget", "tax", "exports",
]
