"""
Memory subsystem — short-term and long-term memory for the FinAdvisor agent.

Short-term  (memory.short_term):
    In-session message history via LangGraph MemorySaver.
    Lives in RAM, scoped to a session_id (thread_id).
    Automatically managed by the graph checkpointer.

Long-term   (memory.long_term):
    Durable facts extracted from conversations, stored in Supabase.
    Persists across sessions and is injected into the system prompt
    as state["memories"] at the start of each new session.

Usage:
    from src.memory.short_term import get_checkpointer, get_session_config
    from src.memory.long_term  import get_memories, extract_and_save_memories
"""

from src.memory.short_term import get_checkpointer, get_session_config, get_session_history
from src.memory.long_term import get_memories, save_memories, extract_and_save_memories

__all__ = [
    "get_checkpointer",
    "get_session_config",
    "get_session_history",
    "get_memories",
    "save_memories",
    "extract_and_save_memories",
]
