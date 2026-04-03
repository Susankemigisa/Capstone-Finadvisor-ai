from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
from functools import lru_cache


class Settings(BaseSettings):
    # ── APP ────────────────────────────────────────────────
    APP_NAME: str = "FinAdvisor AI"
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = True

    # ── SECURITY ───────────────────────────────────────────
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── LLM PROVIDERS ──────────────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_DEFAULT_MODEL: str = "gpt-4o-mini"

    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_DEFAULT_MODEL: str = "claude-3-5-sonnet-20241022"

    GROQ_API_KEY: str = ""
    GROQ_DEFAULT_MODEL: str = "llama-3.3-70b-versatile"

    GOOGLE_API_KEY: str = ""
    GOOGLE_DEFAULT_MODEL: str = "gemini-1.5-flash"

    # ── SUPABASE ───────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    DATABASE_URL: str = ""

    # ── LANGSMITH ──────────────────────────────────────────
    LANGCHAIN_TRACING_V2: bool = False
    LANGCHAIN_ENDPOINT: str = "https://api.smith.langchain.com"
    LANGCHAIN_API_KEY: str = ""
    LANGCHAIN_PROJECT: str = "finadvisor-ai"

    # ── FINANCIAL DATA ─────────────────────────────────────
    ALPHA_VANTAGE_API_KEY: str = ""

    # ── EMAIL ──────────────────────────────────────────────
    SENDGRID_API_KEY: str = ""
    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "onboarding@resend.dev"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # ── STRIPE ─────────────────────────────────────────────
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    FRONTEND_URL: str = "https://capstone-finadvisor-ai.vercel.app"

    # ── RATE LIMITING ──────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 30
    RATE_LIMIT_PER_HOUR: int = 300

    # ── CORS ───────────────────────────────────────────────
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,https://capstone-finadvisor-ai.vercel.app"

    # ── EMBEDDINGS ─────────────────────────────────────────
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSION: int = 1536

    # ── RAG ────────────────────────────────────────────────
    CHUNK_SIZE: int = 800
    CHUNK_OVERLAP: int = 150
    MAX_RETRIEVAL_DOCS: int = 5

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_must_be_set(cls, v):
        if not v or len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return v

    def get_allowed_origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    def get_available_models(self) -> List[dict]:
        """Return only models whose API keys are configured."""
        models = []
        if self.OPENAI_API_KEY:
            models.extend([
                {"id": "gpt-4o", "name": "GPT-4o", "provider": "openai"},
                {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "provider": "openai"},
            ])
        if self.GROQ_API_KEY:
            models.extend([
                {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B", "provider": "groq"},
                {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B (Fast)", "provider": "groq"},
            ])
        if self.GOOGLE_API_KEY:
            models.extend([
                {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "provider": "google"},
                {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "provider": "google"},
            ])
        if self.ANTHROPIC_API_KEY:
            models.extend([
                {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "provider": "anthropic"},
            ])
        return models

    model_config = {"env_file": ".env", "case_sensitive": True, "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()