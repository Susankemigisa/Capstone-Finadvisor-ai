from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)


def create_access_token(user_id: str, email: str) -> str:
    """Create a short-lived JWT access token."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(user_id: str, email: str) -> str:
    """Create a long-lived JWT refresh token."""
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": user_id,
        "email": email,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate any JWT token. Returns payload or None."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except JWTError as e:
        logger.warning("jwt_decode_failed", reason=str(e))
        return None


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate an access token specifically."""
    payload = decode_token(token)
    if not payload:
        return None
    if payload.get("type") != "access":
        logger.warning("wrong_token_type", expected="access", got=payload.get("type"))
        return None
    return payload


def decode_refresh_token(token: str) -> Optional[dict]:
    """Decode and validate a refresh token specifically."""
    payload = decode_token(token)
    if not payload:
        return None
    if payload.get("type") != "refresh":
        logger.warning("wrong_token_type", expected="refresh", got=payload.get("type"))
        return None
    return payload