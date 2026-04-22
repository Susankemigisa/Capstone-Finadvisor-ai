import json
from datetime import date
from pathlib import Path
from jinja2 import Template
from langchain_core.messages import SystemMessage

from src.agent.state import AgentState
from src.models.model_manager import get_model, calculate_cost
from src.utils.logger import get_logger

logger = get_logger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "system_prompt.json"
_RAG_PROMPT_PATH = Path(__file__).parent / "prompts" / "rag_prompt.json"

LANGUAGE_NAMES = {
    "en": "English", "fr": "French", "es": "Spanish", "pt": "Portuguese",
    "de": "German", "ar": "Arabic", "sw": "Swahili", "yo": "Yoruba",
    "ha": "Hausa", "ig": "Igbo", "am": "Amharic", "zh": "Chinese",
    "hi": "Hindi", "ja": "Japanese", "ko": "Korean", "ru": "Russian",
}


# Cache compiled templates — reading + compiling Jinja on every message adds ~50ms
_PROMPT_CACHE: dict[Path, Template] = {}

def _load_prompt(path: Path) -> Template:
    if path not in _PROMPT_CACHE:
        data = json.loads(path.read_text(encoding="utf-8"))
        _PROMPT_CACHE[path] = Template(data["template"])
    return _PROMPT_CACHE[path]


def _build_system_prompt(state: AgentState) -> str:
    template = _load_prompt(_PROMPT_PATH)
    lang = state.get("preferred_language", "en")
    prompt = template.render(
        user_name=state.get("user_name", ""),
        preferred_currency=state.get("preferred_currency", "USD"),
        tier=state.get("tier", "free"),
        portfolio_summary=state.get("portfolio_summary", ""),
        memories=state.get("memories", []),
        current_date=str(date.today()),
        preferred_language=lang,
        preferred_language_name=LANGUAGE_NAMES.get(lang, lang),
    )
    rag_context = state.get("rag_context", [])
    if rag_context:
        rag_template = _load_prompt(_RAG_PROMPT_PATH)
        rag_section = rag_template.render(documents=rag_context)
        prompt = prompt + "\n\n" + rag_section
    return prompt


def planner_node(state: AgentState) -> dict:
    logger.info(
        "planner_node",
        user_id=state.get("user_id"),
        model=state.get("model_id"),
        message_count=len(state.get("messages", [])),
    )

    system_prompt = _build_system_prompt(state)
    model_id = state.get("model_id", "gpt-4o-mini")

    try:
        temperature = float(state.get("temperature", 0.3))
        top_p = float(state.get("top_p", 1.0))
        # Retry logic — try up to 3 times on transient failures
        import time as _time
        # Cache model instances — LangChain model init is expensive (~100-300ms first call)
        _model_cache_key = (model_id, temperature, top_p)
        if not hasattr(planner_node, '_model_cache'):
            planner_node._model_cache = {}
        llm = planner_node._model_cache.get(_model_cache_key)
        last_err = None
        if llm is None:
            for attempt in range(3):
                try:
                    llm = get_model(model_id, temperature=temperature, top_p=top_p)
                    planner_node._model_cache[_model_cache_key] = llm
                    break
                except Exception as e:
                    last_err = e
                    if attempt < 2:
                        _time.sleep(1.5 ** attempt)
        if llm is None:
            raise last_err
    except Exception as e:
        logger.error("model_load_failed", model=model_id, error=str(e))
        return {"error": f"Failed to load model {model_id}. Please try a different model.", "is_done": True}

    from src.tools import get_all_tools
    enabled_tools = state.get("enabled_tools", None)
    tools = get_all_tools(enabled_tool_ids=enabled_tools)
    llm_with_tools = llm.bind_tools(tools)

    messages = [SystemMessage(content=system_prompt)] + state.get("messages", [])

    try:
        response = llm_with_tools.invoke(messages)
    except Exception as e:
        logger.error("llm_call_failed", model=model_id, error=str(e))
        return {"error": "The AI model encountered an error. Please try again.", "is_done": True}

    prompt_tokens = 0
    completion_tokens = 0
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        prompt_tokens = response.usage_metadata.get("input_tokens", 0)
        completion_tokens = response.usage_metadata.get("output_tokens", 0)

    cost = calculate_cost(model_id, prompt_tokens, completion_tokens)

    logger.info(
        "planner_response",
        has_tool_calls=bool(response.tool_calls),
        tool_count=len(response.tool_calls) if response.tool_calls else 0,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cost_usd=cost,
    )

    return {
        "messages": [response],
        "prompt_tokens": state.get("prompt_tokens", 0) + prompt_tokens,
        "completion_tokens": state.get("completion_tokens", 0) + completion_tokens,
        "cost_usd": state.get("cost_usd", 0.0) + cost,
    }


def should_continue(state: AgentState) -> str:
    if state.get("error"):
        return "end"
    messages = state.get("messages", [])
    if not messages:
        return "end"
    last_message = messages[-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return "end"