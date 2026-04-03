"""
FinAdvisor AI — FastAPI application entry point.

Startup order:
    1. LangSmith tracing (if configured)
    2. Middleware stack: AuthMiddleware → SlowAPI (rate limiter) → CORS
    3. Error handlers: HTTP, validation, unhandled exceptions
    4. Route registration
    5. APScheduler (price alerts background job)
"""

import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config.settings import settings
from src.utils.logger import get_logger
from src.utils.sanitizer import sanitize_error

# Middleware imports
from src.api.middleware import (
    AuthMiddleware,
    SlowAPIMiddleware,
    get_limiter,
    rate_limit_handler,
    register_error_handlers,
)
from slowapi.errors import RateLimitExceeded

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────
    logger.info("starting_up", app=settings.APP_NAME, env=settings.APP_ENV, debug=settings.DEBUG)

    # Configure LangSmith tracing
    if settings.LANGCHAIN_TRACING_V2 and settings.LANGCHAIN_API_KEY:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"]    = settings.LANGCHAIN_API_KEY
        os.environ["LANGCHAIN_ENDPOINT"]   = settings.LANGCHAIN_ENDPOINT
        os.environ["LANGCHAIN_PROJECT"]    = settings.LANGCHAIN_PROJECT
        logger.info("langsmith_enabled", project=settings.LANGCHAIN_PROJECT)
    else:
        os.environ["LANGCHAIN_TRACING_V2"] = "false"
        logger.info("langsmith_disabled")

    logger.info("available_models", models=[m["name"] for m in settings.get_available_models()])

    # Start background scheduler (price alerts)
    from src.scheduler import start_scheduler
    start_scheduler()

    yield

    # ── Shutdown ──────────────────────────────────────────────
    from src.scheduler import stop_scheduler
    stop_scheduler()
    logger.info("shutting_down", app=settings.APP_NAME)


# ── App ───────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "AI-powered financial advisor — multi-LLM, RAG, real-time market data, "
        "portfolio tracking, and 32 financial tools."
    ),
    version="1.0.0",
    docs_url="/docs"  if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# ── Rate limiter ──────────────────────────────────────────────
limiter = get_limiter()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

# ── Middleware stack (applied bottom-up by Starlette) ─────────
# Registration order matters: last registered = outermost wrapper.
# Effective order: CORS → SlowAPI → Auth → route handler

# 1. Auth middleware — security headers + structured log context
app.add_middleware(AuthMiddleware)

# 2. Rate limiting
app.add_middleware(SlowAPIMiddleware)

# 3. CORS
_origins = settings.get_allowed_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
)

# ── Error handlers ────────────────────────────────────────────
register_error_handlers(app)

# ── Request logging ───────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response   = await call_next(request)
    duration_ms = round((time.time() - start_time) * 1000)
    logger.info(
        "request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=duration_ms,
    )
    return response

# ── Routes ────────────────────────────────────────────────────
from src.api.routes import (
    auth, chat, portfolio, documents, market, analytics,
    billing, notifications, alerts, watchlist, goals, budget, tax, exports,
)

app.include_router(auth.router,          prefix="/auth",          tags=["Authentication"])
app.include_router(chat.router,          prefix="/chat",          tags=["Chat"])
app.include_router(portfolio.router,     prefix="/portfolio",     tags=["Portfolio"])
app.include_router(documents.router,                              tags=["Documents"])
app.include_router(market.router,        prefix="/market",        tags=["Market Data"])
app.include_router(analytics.router,     prefix="/analytics",     tags=["Analytics"])
app.include_router(billing.router,       prefix="/billing",       tags=["Billing"])
app.include_router(notifications.router, prefix="/notifications",  tags=["Notifications"])
app.include_router(alerts.router,                                 tags=["Price Alerts"])
app.include_router(watchlist.router,     prefix="/watchlist",     tags=["Watchlist"])
app.include_router(goals.router,         prefix="/goals",         tags=["Financial Goals"])
app.include_router(budget.router,        prefix="/budget",        tags=["Budget"])
app.include_router(tax.router,           prefix="/tax",           tags=["Tax Records"])
app.include_router(exports.router,       prefix="/export",        tags=["Exports"])


# ── System endpoints ──────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    """
    Uptime and configuration health check.
    Safe to call without authentication — used by Render / Vercel monitors.
    """
    return {
        "status":           "healthy",
        "app":              settings.APP_NAME,
        "env":              settings.APP_ENV,
        "available_models": settings.get_available_models(),
    }


@app.get("/", tags=["System"])
async def root():
    return {
        "message": f"Welcome to {settings.APP_NAME} API",
        "docs":    "/docs" if settings.DEBUG else "disabled in production",
        "health":  "/health",
    }
