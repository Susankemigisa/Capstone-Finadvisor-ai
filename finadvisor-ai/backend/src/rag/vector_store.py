"""
Vector store — dual-backend storage for document embeddings.

Primary:  Supabase pgvector  (production — persists across restarts)
Fallback: ChromaDB           (local dev — no Supabase needed)

The active backend is chosen automatically:
    - pgvector  if DATABASE_URL is set in .env
    - ChromaDB  otherwise (stored in ./chroma_db/)

Both backends expose the same interface so the retriever and ingestion
pipeline are fully decoupled from storage technology.

pgvector table schema (add to SUPABASE_MIGRATION.sql):
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS document_chunks (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        document_id  uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        filename     text        NOT NULL,
        chunk_index  int         NOT NULL,
        content      text        NOT NULL,
        embedding    vector(1536),
        metadata     jsonb       NOT NULL DEFAULT '{}',
        created_at   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_user_id    ON document_chunks(user_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_doc_id     ON document_chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_embedding  ON document_chunks
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

    CREATE TABLE IF NOT EXISTS documents (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename     text        NOT NULL,
        file_type    text        NOT NULL,
        file_size    int         NOT NULL DEFAULT 0,
        chunk_count  int         NOT NULL DEFAULT 0,
        created_at   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
"""

from __future__ import annotations

import os
import uuid
from typing import Literal

from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

VectorBackend = Literal["pgvector", "chroma"]


def get_backend() -> VectorBackend:
    """Return which vector store backend is active."""
    return "pgvector" if settings.DATABASE_URL else "chroma"


# ── Public API ────────────────────────────────────────────────

def store_chunks(
    chunks:      list[dict],
    embeddings:  list[list[float]],
    user_id:     str,
    document_id: str,
    filename:    str,
    file_type:   str,
    file_size:   int = 0,
) -> int:
    """
    Persist chunks + their embeddings to the active vector store.

    Args:
        chunks:       Output of document_processor.process_document()
        embeddings:   Parallel list of vectors from embeddings.embed_batch()
        user_id:      Owner user UUID
        document_id:  Document UUID (created before calling this)
        filename:     Original filename
        file_type:    "pdf" | "docx" | "txt" | "csv"
        file_size:    File size in bytes

    Returns:
        Number of chunks actually stored.
    """
    if len(chunks) != len(embeddings):
        raise ValueError(
            f"chunks ({len(chunks)}) and embeddings ({len(embeddings)}) must have the same length"
        )

    backend = get_backend()
    logger.info(
        "storing_chunks",
        backend=backend,
        document_id=document_id,
        user_id=user_id,
        count=len(chunks),
    )

    if backend == "pgvector":
        return _store_pgvector(chunks, embeddings, user_id, document_id, filename)
    return _store_chroma(chunks, embeddings, user_id, document_id, filename)


def similarity_search(
    query_embedding: list[float],
    user_id:         str,
    k:               int = 10,
) -> list[dict]:
    """
    Find the k most similar chunks to query_embedding for a user.

    Returns list of dicts:
        content, filename, chunk_index, score (0–1), document_id
    Ordered by score descending (most similar first).
    """
    backend = get_backend()
    if backend == "pgvector":
        return _search_pgvector(query_embedding, user_id, k)
    return _search_chroma(query_embedding, user_id, k)


def delete_document(document_id: str, user_id: str) -> bool:
    """
    Delete all chunks for a document from the vector store.
    Also removes the document record from the documents table (pgvector).
    Returns True on success.
    """
    backend = get_backend()
    try:
        if backend == "pgvector":
            return _delete_pgvector(document_id, user_id)
        return _delete_chroma(document_id, user_id)
    except Exception as e:
        logger.error("delete_document_failed", document_id=document_id, error=str(e))
        return False


def get_user_documents(user_id: str) -> list[dict]:
    """
    Return metadata for all documents uploaded by a user.
    Shape: { id, filename, file_type, chunk_count, created_at }
    """
    backend = get_backend()
    try:
        if backend == "pgvector":
            return _list_documents_pgvector(user_id)
        return _list_documents_chroma(user_id)
    except Exception as e:
        logger.error("list_documents_failed", user_id=user_id, error=str(e))
        return []


# ── pgvector backend ──────────────────────────────────────────

def _store_pgvector(
    chunks:      list[dict],
    embeddings:  list[list[float]],
    user_id:     str,
    document_id: str,
    filename:    str,
) -> int:
    from src.database.client import get_supabase_safe
    db = get_supabase_safe()
    if not db:
        return 0

    rows = [
        {
            "id":          str(uuid.uuid4()),
            "user_id":     user_id,
            "document_id": document_id,
            "filename":    filename,
            "chunk_index": chunk["chunk_index"],
            "content":     chunk["content"],
            "embedding":   embedding,
            "metadata":    chunk.get("metadata", {}),
        }
        for chunk, embedding in zip(chunks, embeddings)
    ]

    # Insert in batches of 50 to avoid payload size limits
    saved = 0
    for i in range(0, len(rows), 50):
        try:
            db.table("document_chunks").insert(rows[i : i + 50]).execute()
            saved += len(rows[i : i + 50])
        except Exception as e:
            logger.error("pgvector_insert_failed", batch_start=i, error=str(e))

    return saved


def _search_pgvector(
    query_embedding: list[float],
    user_id:         str,
    k:               int,
) -> list[dict]:
    from src.database.client import get_supabase_safe
    db = get_supabase_safe()
    if not db:
        return []

    try:
        # Use pgvector's <=> cosine distance operator via RPC
        result = db.rpc(
            "match_document_chunks",
            {
                "query_embedding": query_embedding,
                "match_user_id":   user_id,
                "match_count":     k,
            },
        ).execute()

        return [
            {
                "content":     row["content"],
                "filename":    row["filename"],
                "chunk_index": row["chunk_index"],
                "document_id": row["document_id"],
                "score":       1 - row.get("distance", 1.0),  # cosine distance → similarity
            }
            for row in (result.data or [])
        ]
    except Exception as e:
        logger.error("pgvector_search_failed", user_id=user_id, error=str(e))
        return []


def _delete_pgvector(document_id: str, user_id: str) -> bool:
    from src.database.client import get_supabase_safe
    db = get_supabase_safe()
    if not db:
        return False
    db.table("document_chunks").delete().eq("document_id", document_id).eq("user_id", user_id).execute()
    db.table("documents").delete().eq("id", document_id).eq("user_id", user_id).execute()
    return True


def _list_documents_pgvector(user_id: str) -> list[dict]:
    from src.database.client import get_supabase_safe
    db = get_supabase_safe()
    if not db:
        return []
    result = (
        db.table("documents")
        .select("id, filename, file_type, chunk_count, file_size, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


# ── ChromaDB backend ──────────────────────────────────────────

_chroma_client  = None
_chroma_collection = None
_CHROMA_DIR = "./chroma_db"


def _get_chroma_collection():
    global _chroma_client, _chroma_collection
    if _chroma_collection is not None:
        return _chroma_collection
    try:
        import chromadb
        _chroma_client = chromadb.PersistentClient(path=_CHROMA_DIR)
        _chroma_collection = _chroma_client.get_or_create_collection(
            name="finadvisor_documents",
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("chroma_collection_ready", path=_CHROMA_DIR)
        return _chroma_collection
    except ImportError:
        logger.error("chromadb_not_installed", hint="pip install chromadb")
        return None


def _store_chroma(
    chunks:      list[dict],
    embeddings:  list[list[float]],
    user_id:     str,
    document_id: str,
    filename:    str,
) -> int:
    col = _get_chroma_collection()
    if col is None:
        return 0

    ids        = [f"{document_id}_{c['chunk_index']}" for c in chunks]
    documents  = [c["content"] for c in chunks]
    metadatas  = [
        {**c.get("metadata", {}), "user_id": user_id, "document_id": document_id, "filename": filename}
        for c in chunks
    ]

    try:
        col.add(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)
        return len(chunks)
    except Exception as e:
        logger.error("chroma_store_failed", error=str(e))
        return 0


def _search_chroma(
    query_embedding: list[float],
    user_id:         str,
    k:               int,
) -> list[dict]:
    col = _get_chroma_collection()
    if col is None:
        return []

    try:
        results = col.query(
            query_embeddings=[query_embedding],
            n_results=k,
            where={"user_id": user_id},
            include=["documents", "metadatas", "distances"],
        )
        chunks = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            chunks.append({
                "content":     doc,
                "filename":    meta.get("filename", ""),
                "chunk_index": meta.get("chunk_index", 0),
                "document_id": meta.get("document_id", ""),
                "score":       round(1 - dist, 4),  # cosine distance → similarity
            })
        return chunks
    except Exception as e:
        logger.error("chroma_search_failed", user_id=user_id, error=str(e))
        return []


def _delete_chroma(document_id: str, user_id: str) -> bool:
    col = _get_chroma_collection()
    if col is None:
        return False
    try:
        col.delete(where={"document_id": document_id, "user_id": user_id})
        return True
    except Exception as e:
        logger.error("chroma_delete_failed", document_id=document_id, error=str(e))
        return False


def _list_documents_chroma(user_id: str) -> list[dict]:
    col = _get_chroma_collection()
    if col is None:
        return []
    try:
        results = col.get(where={"user_id": user_id}, include=["metadatas"])
        seen: dict[str, dict] = {}
        for meta in results.get("metadatas", []):
            doc_id = meta.get("document_id", "")
            if doc_id and doc_id not in seen:
                seen[doc_id] = {
                    "id":          doc_id,
                    "filename":    meta.get("filename", ""),
                    "file_type":   meta.get("file_type", ""),
                    "chunk_count": 0,
                    "created_at":  "",
                }
            if doc_id in seen:
                seen[doc_id]["chunk_count"] += 1
        return list(seen.values())
    except Exception as e:
        logger.error("chroma_list_failed", user_id=user_id, error=str(e))
        return []
