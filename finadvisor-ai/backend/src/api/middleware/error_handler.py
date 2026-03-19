"""
Global error handler middleware — catches every unhandled exception and
returns a clean, safe JSON response.

Without this, FastAPI's default behaviour is to return a 500 with the raw
Python exception message — which can leak stack traces, file paths, database
connection strings, and API keys to the client.

This middleware:
    1. Catches ALL exceptions before they reach the client
    2. Logs the full error internally (structlog, LangSmith-friendly)
    3. Returns a sanitised user-facing message with no internal details
    4. Maps known HTTP exceptions to their correct status codes
    5. Adds a request_id to every error response for support tracing

Registered in main.py via:
    from src.api.middleware.error_handler import register_error_handlers
    register_error_handlers(app)
"""

from __future__ import annotations

import traceback
import uuid
from typing import Callable

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.utils.logger import get_logger
from src.utils.sanitizer import sanitize_error

logger = get_logger(__name__)


def register_error_handlers(app: FastAPI) -> None:
    """
    Register all error handlers on the FastAPI app instance.
    Call this once in main.py after creating the app object.
    """
    app.add_exception_handler(HTTPException,           _http_exception_handler)
    app.add_exception_handler(StarletteHTTPException,  _http_exception_handler)
    app.add_exception_handler(RequestValidationError,  _validation_exception_handler)
    app.add_exception_handler(Exception,               _unhandled_exception_handler)


# ── Handlers ──────────────────────────────────────────────────

async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """
    Handle FastAPI/Starlette HTTP exceptions (400, 401, 403, 404, etc.).

    These are intentionally raised by route handlers and are expected —
    we log them at INFO level and return the detail as-is since the
    route handler already chose a safe message.
    """
    request_id = _get_request_id(request)

    logger.info(
        "http_exception",
        request_id=request_id,
        method=request.method,
        path=str(request.url.path),
        status_code=exc.status_code,
        detail=str(exc.detail),
    )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail":     exc.detail,
            "status":     "error",
            "request_id": request_id,
        },
    )


async def _validation_exception_handler(
    request: Request,
    exc:     RequestValidationError,
) -> JSONResponse:
    """
    Handle Pydantic validation errors from request body/query params.

    Extracts the field-level error messages and returns them in a
    structured format the frontend can use to highlight specific fields.
    """
    request_id = _get_request_id(request)

    errors = []
    for err in exc.errors():
        field = " → ".join(str(loc) for loc in err.get("loc", []))
        msg   = err.get("msg", "Invalid value")
        errors.append({"field": field, "message": msg})

    logger.info(
        "validation_error",
        request_id=request_id,
        path=str(request.url.path),
        error_count=len(errors),
    )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail":     "Invalid request data. Please check the fields below.",
            "errors":     errors,
            "status":     "error",
            "request_id": request_id,
        },
    )


async def _unhandled_exception_handler(
    request: Request,
    exc:     Exception,
) -> JSONResponse:
    """
    Catch-all for any exception not handled by the routes.

    Logs the full traceback internally. Returns a safe generic message
    to the client — never the raw exception or any internal details.
    """
    request_id = _get_request_id(request)

    # Log full traceback for internal debugging / LangSmith
    logger.error(
        "unhandled_exception",
        request_id=request_id,
        method=request.method,
        path=str(request.url.path),
        exc_type=type(exc).__name__,
        traceback=traceback.format_exc(),
    )

    # Sanitise before returning — strips keys, paths, connection strings
    safe_message = sanitize_error(exc)

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail":     safe_message,
            "status":     "error",
            "request_id": request_id,
        },
    )


# ── Helpers ───────────────────────────────────────────────────

def _get_request_id(request: Request) -> str:
    """
    Return the request ID — either from the incoming X-Request-ID header
    (set by load balancers / API gateways) or generate a new one.

    The request_id is included in every error response so users can
    quote it in support requests and we can trace it in logs.
    """
    existing = request.headers.get("X-Request-ID")
    if existing:
        return existing
    # Generate a short ID — full UUID is verbose for error messages
    return str(uuid.uuid4())[:8]
