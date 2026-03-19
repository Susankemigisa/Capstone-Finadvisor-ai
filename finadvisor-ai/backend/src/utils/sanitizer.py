import re
from src.utils.logger import get_logger

logger = get_logger(__name__)

# Patterns that must never reach the client
_SENSITIVE_PATTERNS = [
    # API keys
    (r"sk-[a-zA-Z0-9\-_]{20,}", "[OPENAI_KEY_REDACTED]"),
    (r"sk-ant-[a-zA-Z0-9\-_]{20,}", "[ANTHROPIC_KEY_REDACTED]"),
    (r"gsk_[a-zA-Z0-9\-_]{20,}", "[GROQ_KEY_REDACTED]"),
    (r"AIza[a-zA-Z0-9\-_]{30,}", "[GOOGLE_KEY_REDACTED]"),
    (r"eyJ[a-zA-Z0-9\-_\.]{50,}", "[JWT_REDACTED]"),
    (r"sb_(publishable|secret|anon)_[a-zA-Z0-9\-_]{20,}", "[SUPABASE_KEY_REDACTED]"),
    # File paths
    (r"[A-Za-z]:\\[^\s\"']+", "[PATH_REDACTED]"),
    (r"/home/[^\s\"']+", "[PATH_REDACTED]"),
    (r"/usr/[^\s\"']+", "[PATH_REDACTED]"),
    # Database connection strings
    (r"postgresql://[^\s\"']+", "[DB_URL_REDACTED]"),
    (r"postgres://[^\s\"']+", "[DB_URL_REDACTED]"),
    # IP addresses (internal)
    (r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}", "[INTERNAL_IP_REDACTED]"),
    (r"192\.168\.\d{1,3}\.\d{1,3}", "[INTERNAL_IP_REDACTED]"),
]

# User-friendly messages for common error types
_ERROR_MESSAGES = {
    "connection": "Unable to connect to a required service. Please try again later.",
    "timeout": "The request took too long. Please try again.",
    "rate_limit": "Too many requests. Please wait a moment and try again.",
    "not_found": "The requested resource was not found.",
    "unauthorized": "Authentication required. Please log in.",
    "forbidden": "You don't have permission to perform this action.",
    "validation": "Invalid input. Please check your request and try again.",
    "default": "An unexpected error occurred. Please try again.",
}


def sanitize_error(error: Exception) -> str:
    """
    Convert an exception into a safe user-facing message.
    Strips all sensitive information before returning.
    """
    raw_message = str(error)

    # Log the real error internally (safe — never sent to client)
    logger.error(
        "internal_error",
        error_type=type(error).__name__,
        raw_message=raw_message,
    )

    # Apply all redaction patterns to the raw message
    sanitized = raw_message
    for pattern, replacement in _SENSITIVE_PATTERNS:
        sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)

    # Map to friendly messages based on error type name or content
    error_name = type(error).__name__.lower()
    message_lower = sanitized.lower()

    if "connection" in message_lower or "connect" in error_name:
        return _ERROR_MESSAGES["connection"]
    elif "timeout" in message_lower or "timed out" in message_lower:
        return _ERROR_MESSAGES["timeout"]
    elif "rate" in message_lower and "limit" in message_lower:
        return _ERROR_MESSAGES["rate_limit"]
    elif "not found" in message_lower or "404" in message_lower:
        return _ERROR_MESSAGES["not_found"]
    elif "unauthorized" in message_lower or "401" in message_lower:
        return _ERROR_MESSAGES["unauthorized"]
    elif "forbidden" in message_lower or "403" in message_lower:
        return _ERROR_MESSAGES["forbidden"]
    elif "validation" in error_name or "invalid" in message_lower:
        return _ERROR_MESSAGES["validation"]

    # If the sanitized message is short and safe, return it
    if len(sanitized) < 200 and "[REDACTED]" not in sanitized:
        return sanitized

    return _ERROR_MESSAGES["default"]


def sanitize_dict(data: dict) -> dict:
    """
    Recursively sanitize a dictionary, redacting sensitive values.
    Safe to log or return in API responses.
    """
    sanitized = {}
    sensitive_keys = {
        "password", "password_hash", "api_key", "secret", "token",
        "access_token", "refresh_token", "authorization", "key",
    }

    for k, v in data.items():
        if any(sk in k.lower() for sk in sensitive_keys):
            sanitized[k] = "[REDACTED]"
        elif isinstance(v, dict):
            sanitized[k] = sanitize_dict(v)
        elif isinstance(v, str):
            redacted = v
            for pattern, replacement in _SENSITIVE_PATTERNS:
                redacted = re.sub(pattern, replacement, redacted, flags=re.IGNORECASE)
            sanitized[k] = redacted
        else:
            sanitized[k] = v

    return sanitized