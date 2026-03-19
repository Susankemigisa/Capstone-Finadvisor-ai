from passlib.context import CryptContext
from src.utils.logger import get_logger

logger = get_logger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """
    Hash a plain text password using bcrypt.
    Truncates to 72 bytes max (bcrypt limit) before hashing.
    Never store plain passwords.
    """
    # bcrypt silently truncates at 72 bytes — we do it explicitly
    # so behavior is predictable and consistent
    encoded = plain_password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
    return pwd_context.hash(encoded)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against a bcrypt hash.
    Returns True if they match, False otherwise.
    """
    try:
        encoded = plain_password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
        return pwd_context.verify(encoded, hashed_password)
    except Exception:
        logger.warning("password_verification_error")
        return False


def is_password_strong(password: str) -> tuple[bool, str]:
    """
    Validate password strength before hashing.
    Returns (is_valid, error_message).
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if len(password) > 72:
        return False, "Password must be 72 characters or fewer."
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter."
    if not any(c.islower() for c in password):
        return False, "Password must contain at least one lowercase letter."
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number."
    return True, ""