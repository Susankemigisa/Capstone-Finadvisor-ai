"""
Embeddings — converts text chunks into vector representations.

Primary:  OpenAI text-embedding-3-small (1536 dimensions)
Fallback: Sentence-Transformers all-MiniLM-L6-v2 (384 dimensions, local)

The fallback activates automatically when OPENAI_API_KEY is not set,
making the RAG pipeline work in local/offline development environments.

All public functions return plain Python lists of floats so they are
storage-backend agnostic (both pgvector and ChromaDB accept list[float]).
"""

from __future__ import annotations

import hashlib
from typing import Literal

from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

EmbeddingBackend = Literal["openai", "local"]

# Simple in-process cache: sha256(text) → embedding vector
# Avoids re-embedding identical chunks (e.g. on re-upload of same file).
# Capped at 2000 entries — sufficient for a typical session.
_CACHE: dict[str, list[float]] = {}
_CACHE_MAX = 2000


def get_backend() -> EmbeddingBackend:
    """Return which embedding backend will be used given current config."""
    return "openai" if settings.OPENAI_API_KEY else "local"


def embed_text(text: str) -> list[float]:
    """
    Embed a single string and return its vector.

    Uses cache to avoid redundant API calls.
    Raises RuntimeError if embedding fails on both backends.
    """
    cache_key = _cache_key(text)
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    backend = get_backend()
    try:
        vector = _embed_openai([text])[0] if backend == "openai" else _embed_local([text])[0]
    except Exception as e:
        logger.error("embed_text_failed", backend=backend, error=str(e))
        raise RuntimeError(f"Embedding failed ({backend}): {e}") from e

    _cache_set(cache_key, vector)
    return vector


def embed_batch(texts: list[str], batch_size: int = 100) -> list[list[float]]:
    """
    Embed a list of strings in batches.

    Checks the cache per item and only sends uncached texts to the API.
    Returns vectors in the same order as the input list.

    Args:
        texts:      List of strings to embed
        batch_size: API call batch size (OpenAI max is 2048, we use 100
                    to stay well within rate limits)

    Returns:
        List of float vectors, one per input string.
    """
    if not texts:
        return []

    results: list[list[float] | None] = [None] * len(texts)
    uncached_indices: list[int] = []
    uncached_texts:   list[str] = []

    # Check cache first
    for i, text in enumerate(texts):
        key = _cache_key(text)
        if key in _CACHE:
            results[i] = _CACHE[key]
        else:
            uncached_indices.append(i)
            uncached_texts.append(text)

    if uncached_texts:
        backend = get_backend()
        logger.info(
            "embedding_batch",
            backend=backend,
            total=len(texts),
            uncached=len(uncached_texts),
        )

        # Process in batches to respect rate limits
        all_vectors: list[list[float]] = []
        for start in range(0, len(uncached_texts), batch_size):
            batch = uncached_texts[start : start + batch_size]
            try:
                if backend == "openai":
                    vectors = _embed_openai(batch)
                else:
                    vectors = _embed_local(batch)
                all_vectors.extend(vectors)
            except Exception as e:
                logger.error("embed_batch_failed", backend=backend, batch_start=start, error=str(e))
                # Fill with zero vectors so the pipeline doesn't crash
                dim = settings.EMBEDDING_DIMENSION if backend == "openai" else 384
                all_vectors.extend([[0.0] * dim] * len(batch))

        # Place results and update cache
        for idx, (orig_idx, vector) in enumerate(zip(uncached_indices, all_vectors)):
            results[orig_idx] = vector
            _cache_set(_cache_key(uncached_texts[idx]), vector)

    return [v for v in results if v is not None]


def get_embedding_dimension() -> int:
    """Return the vector dimension for the active backend."""
    return settings.EMBEDDING_DIMENSION if get_backend() == "openai" else 384


# ── Backend implementations ───────────────────────────────────

def _embed_openai(texts: list[str]) -> list[list[float]]:
    """Call the OpenAI Embeddings API."""
    from langchain_openai import OpenAIEmbeddings
    embedder = OpenAIEmbeddings(
        model=settings.EMBEDDING_MODEL,
        openai_api_key=settings.OPENAI_API_KEY,
    )
    return embedder.embed_documents(texts)


def _embed_local(texts: list[str]) -> list[list[float]]:
    """
    Use sentence-transformers locally (no API key required).
    Falls back gracefully — logs a warning and returns zero vectors
    if the package is not installed.
    """
    try:
        from sentence_transformers import SentenceTransformer
        model = _get_local_model()
        vectors = model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
        return [v.tolist() for v in vectors]
    except ImportError:
        logger.warning(
            "sentence_transformers_not_installed",
            hint="pip install sentence-transformers  OR  set OPENAI_API_KEY",
        )
        return [[0.0] * 384] * len(texts)


_local_model = None

def _get_local_model():
    """Lazy-load the local SentenceTransformer (downloads on first use)."""
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("loading_local_embedding_model", model="all-MiniLM-L6-v2")
        _local_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _local_model


# ── Cache helpers ─────────────────────────────────────────────

def _cache_key(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _cache_set(key: str, vector: list[float]) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        # Evict the oldest 10% when full
        evict = list(_CACHE.keys())[: _CACHE_MAX // 10]
        for k in evict:
            del _CACHE[k]
    _CACHE[key] = vector
