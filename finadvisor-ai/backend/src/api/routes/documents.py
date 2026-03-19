"""
Documents API — upload, list, and delete user documents for RAG.

Endpoints:
    POST   /documents/upload          Upload a document (PDF, DOCX, TXT, CSV)
    GET    /documents                 List all documents for current user
    DELETE /documents/{document_id}   Delete a document and its chunks
    POST   /documents/ab-test         Run A/B retrieval test (admin / dev only)

Upload pipeline:
    1. Validate file type and size
    2. process_document()  — extract text + split into chunks
    3. embed_batch()        — generate embeddings for all chunks
    4. store_chunks()       — persist to pgvector or ChromaDB
    5. Return document metadata to the frontend
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.auth.dependencies import get_current_user
from src.rag.document_processor import process_document, SUPPORTED_EXTENSIONS
from src.rag.embeddings          import embed_batch, get_backend as get_embedding_backend
from src.rag.vector_store        import (
    store_chunks,
    get_user_documents,
    delete_document,
    get_backend as get_vector_backend,
)
from src.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])


# ── Upload ────────────────────────────────────────────────────

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    user: dict       = Depends(get_current_user),
):
    """
    Upload a financial document to the user's RAG knowledge base.

    Supported formats: PDF, DOCX, TXT, MD, CSV
    Max size: 20 MB

    The document is immediately processed and embedded — subsequent
    chat messages can reference it via the search_documents tool.
    """
    user_id = user["user_id"]

    # ── Validate ──────────────────────────────────────────────
    filename     = file.filename or "uploaded_file"
    content_type = file.content_type or ""
    ext          = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"File type '{ext}' is not supported. "
                f"Supported formats: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
            ),
        )

    # ── Read file bytes ───────────────────────────────────────
    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read the uploaded file. Please try again.",
        )

    # ── Process document ──────────────────────────────────────
    try:
        chunks = process_document(
            file_bytes=file_bytes,
            filename=filename,
            content_type=content_type,
        )
    except ValueError as e:
        # File too large or other validation error
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(e))
    except Exception as e:
        logger.error("document_processing_failed", filename=filename, user_id=user_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract text from this file. Please check the file is not corrupted.",
        )

    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No readable text was found in this file.",
        )

    # ── Generate embeddings ───────────────────────────────────
    texts = [c["content"] for c in chunks]
    try:
        embeddings = embed_batch(texts)
    except Exception as e:
        logger.error("embedding_failed", filename=filename, user_id=user_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The embedding service is temporarily unavailable. Please try again shortly.",
        )

    # ── Store in vector database ──────────────────────────────
    document_id = str(uuid.uuid4())
    file_type   = ext.lstrip(".")

    # Register document in the documents table (pgvector only)
    _register_document(
        document_id=document_id,
        user_id=user_id,
        filename=filename,
        file_type=file_type,
        file_size=len(file_bytes),
        chunk_count=len(chunks),
    )

    try:
        stored = store_chunks(
            chunks=chunks,
            embeddings=embeddings,
            user_id=user_id,
            document_id=document_id,
            filename=filename,
            file_type=file_type,
            file_size=len(file_bytes),
        )
    except Exception as e:
        logger.error("vector_store_failed", filename=filename, user_id=user_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to store document. Please try again shortly.",
        )

    logger.info(
        "document_uploaded",
        user_id=user_id,
        document_id=document_id,
        filename=filename,
        chunks=stored,
        embedding_backend=get_embedding_backend(),
        vector_backend=get_vector_backend(),
    )

    return {
        "document_id": document_id,
        "filename":    filename,
        "file_type":   file_type,
        "chunk_count": stored,
        "file_size":   len(file_bytes),
        "message":     f"'{filename}' uploaded successfully. {stored} sections indexed.",
        "created_at":  datetime.utcnow().isoformat(),
    }


# ── List ──────────────────────────────────────────────────────

@router.get("")
async def list_documents(user: dict = Depends(get_current_user)):
    """
    List all documents uploaded by the current user.
    Returns document metadata — not the chunk content.
    """
    user_id = user["user_id"]
    docs = get_user_documents(user_id)
    return {"documents": docs, "count": len(docs)}


# ── Delete ────────────────────────────────────────────────────

@router.delete("/{document_id}", status_code=status.HTTP_200_OK)
async def delete_user_document(
    document_id: str,
    user:        dict = Depends(get_current_user),
):
    """
    Delete a document and all its indexed chunks.
    The user can no longer reference this document in chat.
    """
    user_id = user["user_id"]
    success = delete_document(document_id=document_id, user_id=user_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or you don't have permission to delete it.",
        )

    logger.info("document_deleted", user_id=user_id, document_id=document_id)
    return {"message": "Document deleted successfully.", "document_id": document_id}


# ── A/B Test (dev/admin) ──────────────────────────────────────

class ABTestRequest(BaseModel):
    query: str


@router.post("/ab-test")
async def ab_test_retrieval(
    request: ABTestRequest,
    user:    dict = Depends(get_current_user),
):
    """
    Run an A/B retrieval comparison for a query against the user's documents.
    Returns side-by-side metrics for both strategies.

    Useful for evaluating whether the diversity re-ranking strategy
    outperforms the baseline for financial document queries.
    """
    from src.rag.ab_testing import run_ab_test
    report = await run_ab_test(query=request.query, user_id=user["user_id"])
    return report


# ── Helpers ───────────────────────────────────────────────────

def _register_document(
    document_id: str,
    user_id:     str,
    filename:    str,
    file_type:   str,
    file_size:   int,
    chunk_count: int,
) -> None:
    """Insert document metadata row (pgvector backend only)."""
    try:
        from src.database.client import get_supabase_safe
        db = get_supabase_safe()
        if not db:
            return
        db.table("documents").insert({
            "id":          document_id,
            "user_id":     user_id,
            "filename":    filename,
            "file_type":   file_type,
            "file_size":   file_size,
            "chunk_count": chunk_count,
        }).execute()
    except Exception as e:
        # Non-fatal — chunks will still be stored even if this fails
        logger.warning("document_register_failed", document_id=document_id, error=str(e))
