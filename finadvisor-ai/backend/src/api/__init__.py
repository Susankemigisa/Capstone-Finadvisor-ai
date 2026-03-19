"""
API package — FastAPI routers and middleware for FinAdvisor AI.

Structure:
    api/
    ├── middleware/          HTTP-layer concerns (auth headers, rate limiting, errors)
    │   ├── auth_middleware  Security headers + structured log context
    │   ├── rate_limiter     Per-user/IP request throttling via slowapi
    │   └── error_handler    Global exception → clean JSON response
    └── routes/              Feature routers, one file per domain
        ├── auth             Register, login, OAuth, password reset
        ├── chat             SSE streaming chat + HITL resume
        ├── portfolio        Positions + P&L
        ├── watchlist        Ticker monitoring
        ├── goals            Financial goal tracking
        ├── budget           Income & expense logging
        ├── tax              Tax record management
        ├── alerts           Price alert CRUD + scheduler
        ├── documents        RAG document upload / list / delete
        ├── analytics        Usage stats
        ├── market           Live market data
        ├── billing          Stripe subscription management
        ├── notifications    User notification centre
        └── exports          CSV / JSON data export
"""
