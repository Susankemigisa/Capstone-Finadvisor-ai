from typing import Any
from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

# Cost per 1000 tokens in USD
MODEL_COSTS = {
    "gpt-4o":                     {"input": 0.0025,   "output": 0.010},
    "gpt-4o-mini":                {"input": 0.00015,  "output": 0.0006},
    "llama-3.3-70b-versatile":    {"input": 0.00059,  "output": 0.00079},
    "llama-3.1-8b-instant":       {"input": 0.00005,  "output": 0.00008},
    "gemini-1.5-flash":           {"input": 0.000075, "output": 0.0003},
    "gemini-1.5-pro":             {"input": 0.00125,  "output": 0.005},
    "claude-3-5-sonnet-20241022": {"input": 0.003,    "output": 0.015},
}


def get_model(model_id: str = None, temperature: float = 0.3, top_p: float = 1.0) -> Any:
    """
    Returns a LangChain chat model instance for the given model ID.
    Falls back to the first available model if none specified.
    Auto-detects the provider from the model ID.
    """
    if not model_id:
        model_id = _get_default_model()

    provider = _detect_provider(model_id)
    logger.info("loading_model", model=model_id, provider=provider, temperature=temperature, top_p=top_p)

    if provider == "openai":
        return _get_openai_model(model_id, temperature, top_p)
    elif provider == "groq":
        return _get_groq_model(model_id, temperature, top_p)
    elif provider == "google":
        return _get_google_model(model_id, temperature, top_p)
    elif provider == "anthropic":
        return _get_anthropic_model(model_id, temperature, top_p)
    else:
        raise ValueError(f"Unknown model: {model_id}. Check your model ID.")


def calculate_cost(model_id: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Calculate the USD cost for a model call."""
    costs = MODEL_COSTS.get(model_id, {"input": 0.001, "output": 0.002})
    input_cost = (prompt_tokens / 1000) * costs["input"]
    output_cost = (completion_tokens / 1000) * costs["output"]
    return round(input_cost + output_cost, 8)


def _detect_provider(model_id: str) -> str:
    """Detect provider from model ID string."""
    if model_id.startswith("gpt-"):
        return "openai"
    elif model_id.startswith(("llama-", "mixtral-", "gemma-")):
        return "groq"
    elif model_id.startswith("gemini-"):
        return "google"
    elif model_id.startswith("claude-"):
        return "anthropic"
    return "openai"


def _get_default_model() -> str:
    """Return first available model based on configured API keys."""
    if settings.OPENAI_API_KEY:
        return settings.OPENAI_DEFAULT_MODEL
    if settings.GROQ_API_KEY:
        return settings.GROQ_DEFAULT_MODEL
    if settings.GOOGLE_API_KEY:
        return settings.GOOGLE_DEFAULT_MODEL
    if settings.ANTHROPIC_API_KEY:
        return settings.ANTHROPIC_DEFAULT_MODEL
    raise RuntimeError("No LLM API keys configured. Set at least one in .env")


def _get_openai_model(model_id: str, temperature: float = 0.3, top_p: float = 1.0) -> Any:
    if not settings.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not set in .env")
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=model_id,
        api_key=settings.OPENAI_API_KEY,
        temperature=temperature,
        model_kwargs={"top_p": top_p} if top_p < 1.0 else {},
        streaming=True,
    )


def _get_groq_model(model_id: str, temperature: float = 0.3, top_p: float = 1.0) -> Any:
    if not settings.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not set in .env")
    from langchain_groq import ChatGroq
    return ChatGroq(
        model=model_id,
        api_key=settings.GROQ_API_KEY,
        temperature=temperature,
        streaming=True,
    )


def _get_google_model(model_id: str, temperature: float = 0.3, top_p: float = 1.0) -> Any:
    if not settings.GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY not set in .env")
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(
        model=model_id,
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=temperature,
        top_p=top_p,
        streaming=True,
    )


def _get_anthropic_model(model_id: str, temperature: float = 0.3, top_p: float = 1.0) -> Any:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY not set in .env")
    from langchain_anthropic import ChatAnthropic
    return ChatAnthropic(
        model=model_id,
        api_key=settings.ANTHROPIC_API_KEY,
        temperature=temperature,
        top_p=top_p,
        streaming=True,
    )