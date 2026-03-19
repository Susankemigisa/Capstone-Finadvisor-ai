"""
RAG tool — search_documents LangChain tool for the agent.

Replaces the stub that returned a hardcoded placeholder string.
Now calls the real retriever and returns formatted context to the agent.
"""

from langchain_core.tools import tool
from src.utils.logger import get_logger

logger = get_logger(__name__)


@tool
def search_documents(query: str) -> str:
    """
    Search the user's uploaded financial documents for information
    relevant to their query. Use this when the user asks about a
    document they have uploaded, references a report or statement,
    or when their question might be answered by their own files.

    Args:
        query: The search query — what to look for in the documents.

    Returns:
        Relevant excerpts from the user's documents with source labels,
        or a message indicating no relevant content was found.
    """
    # The user_id is injected via a closure when tools are built per-request.
    # We retrieve it from the tool's invocation context via LangChain's
    # RunnableConfig. If not available (e.g. in tests), we return a safe message.
    try:
        from langchain_core.runnables.config import get_executor_for_config
        from langchain_core.runnables import RunnableConfig
    except ImportError:
        pass

    # Extract user_id from the tool call context (set by the planner)
    user_id = _get_user_id_from_context()
    if not user_id:
        return "Document search is not available in this context."

    try:
        from src.rag.retriever import retrieve_for_query, user_has_documents

        # Quick check before embedding
        if not user_has_documents(user_id):
            return (
                "You haven't uploaded any documents yet. "
                "Upload a PDF, Word doc, or CSV from the chat input to get started."
            )

        result = retrieve_for_query(query=query, user_id=user_id, k=5)
        logger.info("search_documents_tool_called", user_id=user_id, query=query[:60])
        return result

    except Exception as e:
        logger.error("search_documents_tool_failed", error=str(e))
        return "I couldn't search your documents right now. Please try again in a moment."


def _get_user_id_from_context() -> str:
    """
    Attempt to retrieve the current user_id from LangChain's context vars.

    The planner sets this via a ContextVar before invoking tools.
    Falls back to empty string if not available.
    """
    try:
        from contextvars import copy_context
        import src.tools._context as ctx
        return ctx.current_user_id.get("")
    except Exception:
        return ""


def build_search_documents_for_user(user_id: str):
    """
    Build a user-scoped version of search_documents.

    The planner calls this to create a tool instance that has the
    user_id baked in, avoiding the need for context var injection.

    Usage in planner.py:
        tools = get_all_tools(enabled_tool_ids=enabled)
        # Replace generic search_documents with user-scoped version
        tools = [build_search_documents_for_user(user_id)
                 if t.name == "search_documents" else t
                 for t in tools]
    """
    @tool
    def search_documents_scoped(query: str) -> str:
        """
        Search the user's uploaded financial documents for information
        relevant to their query. Use when the user asks about an uploaded
        document, report, or statement.
        """
        try:
            from src.rag.retriever import retrieve_for_query, user_has_documents

            if not user_has_documents(user_id):
                return (
                    "You haven't uploaded any documents yet. "
                    "Upload a PDF, Word doc, or CSV from the chat input to get started."
                )

            return retrieve_for_query(query=query, user_id=user_id, k=5)

        except Exception as e:
            logger.error("search_documents_scoped_failed", user_id=user_id, error=str(e))
            return "I couldn't search your documents right now. Please try again in a moment."

    # Preserve the tool name so the registry stays consistent
    search_documents_scoped.name = "search_documents"
    return search_documents_scoped
