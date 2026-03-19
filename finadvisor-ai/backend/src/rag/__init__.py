"""
RAG subsystem — Retrieval-Augmented Generation for FinAdvisor AI.

Pipeline:
    Upload  → document_processor  → embeddings  → vector_store
    Query   → embeddings           → vector_store → retriever → agent

Backends:
    Embeddings:   OpenAI text-embedding-3-small (primary) | sentence-transformers (fallback)
    Vector store: Supabase pgvector (primary)             | ChromaDB (local fallback)

Public API:
    from src.rag.document_processor import process_document
    from src.rag.embeddings         import embed_text, embed_batch
    from src.rag.vector_store       import store_chunks, similarity_search, get_user_documents
    from src.rag.retriever          import retrieve_chunks, retrieve_for_query
    from src.rag.ab_testing         import run_ab_test
"""

from src.rag.document_processor import process_document
from src.rag.embeddings         import embed_text, embed_batch, get_backend as get_embedding_backend
from src.rag.vector_store       import store_chunks, similarity_search, get_user_documents, delete_document
from src.rag.retriever          import retrieve_chunks, retrieve_for_query, user_has_documents

__all__ = [
    "process_document",
    "embed_text",
    "embed_batch",
    "get_embedding_backend",
    "store_chunks",
    "similarity_search",
    "get_user_documents",
    "delete_document",
    "retrieve_chunks",
    "retrieve_for_query",
    "user_has_documents",
]
