import structlog
import logging
import sys
from src.config.settings import settings


def setup_logging() -> None:
    """Configure structlog for the entire application."""

    log_level = logging.DEBUG if settings.DEBUG else logging.INFO

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.DEBUG:
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True)
        ]
    else:
        processors = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),  # ✅ FIX
        cache_logger_on_first_use=True,
    )

def get_logger(name: str = __name__) -> structlog.BoundLogger:
    """Get a bound logger instance for a module."""
    return structlog.get_logger(name)


# Call setup on import
setup_logging()

# Root logger for the application
logger = get_logger("finadvisor")