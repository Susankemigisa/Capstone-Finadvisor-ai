from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

_client = None


def get_supabase():
    """
    Returns a Supabase client using the service role key.
    Lazy — only connects on first actual use, not on import.
    """
    global _client

    if _client is not None:
        return _client

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
        )

    from supabase import create_client
    _client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
    )
    logger.info("supabase_client_created", url=settings.SUPABASE_URL)
    return _client


def get_supabase_safe():
    """Returns None instead of raising if Supabase is not configured."""
    try:
        return get_supabase()
    except Exception as e:
        logger.warning("supabase_unavailable", error=str(e))
        return None