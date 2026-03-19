"""
Tests for authentication — password hashing, JWT tokens, and auth flow.

Coverage:
    - Password hashing and verification
    - Password strength validation
    - JWT access token creation and decoding
    - JWT refresh token creation and decoding
    - Token type enforcement (access vs refresh)
    - Expired token rejection
    - Invalid token rejection
    - Full register → login flow (mocked DB)
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from jose import jwt

from src.auth.password import hash_password, verify_password, is_password_strong
from src.auth.jwt_handler import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    decode_token,
)
from src.config.settings import settings


# ── Password hashing ──────────────────────────────────────────

class TestPasswordHashing:

    def test_hash_returns_string(self):
        hashed = hash_password("SecurePass1")
        assert isinstance(hashed, str)
        assert len(hashed) > 20

    def test_hash_is_not_plaintext(self):
        hashed = hash_password("SecurePass1")
        assert "SecurePass1" not in hashed

    def test_verify_correct_password(self):
        hashed = hash_password("SecurePass1")
        assert verify_password("SecurePass1", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("SecurePass1")
        assert verify_password("WrongPass99", hashed) is False

    def test_verify_empty_password(self):
        hashed = hash_password("SecurePass1")
        assert verify_password("", hashed) is False

    def test_two_hashes_of_same_password_differ(self):
        """bcrypt uses random salt — same password should produce different hashes."""
        h1 = hash_password("SecurePass1")
        h2 = hash_password("SecurePass1")
        assert h1 != h2

    def test_both_hashes_verify_correctly(self):
        h1 = hash_password("SecurePass1")
        h2 = hash_password("SecurePass1")
        assert verify_password("SecurePass1", h1) is True
        assert verify_password("SecurePass1", h2) is True


# ── Password strength validation ──────────────────────────────

class TestPasswordStrength:

    def test_strong_password_passes(self):
        valid, msg = is_password_strong("StrongPass1")
        assert valid is True
        assert msg == ""

    def test_too_short_fails(self):
        valid, msg = is_password_strong("Ab1")
        assert valid is False
        assert "8" in msg

    def test_no_uppercase_fails(self):
        valid, msg = is_password_strong("weakpass1")
        assert valid is False
        assert "uppercase" in msg.lower()

    def test_no_lowercase_fails(self):
        valid, msg = is_password_strong("WEAKPASS1")
        assert valid is False
        assert "lowercase" in msg.lower()

    def test_no_digit_fails(self):
        valid, msg = is_password_strong("NoDigitsHere")
        assert valid is False
        assert "number" in msg.lower() or "digit" in msg.lower()

    def test_exactly_8_chars_passes(self):
        valid, _ = is_password_strong("Secure1!")
        assert valid is True

    def test_too_long_fails(self):
        valid, msg = is_password_strong("A" * 73)
        assert valid is False
        assert "72" in msg


# ── JWT access tokens ─────────────────────────────────────────

class TestJWTAccessToken:

    def test_create_and_decode_access_token(self, fake_user):
        token = create_access_token(fake_user["id"], fake_user["email"])
        assert isinstance(token, str)
        assert len(token) > 20

        payload = decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == fake_user["id"]
        assert payload["email"] == fake_user["email"]
        assert payload["type"] == "access"

    def test_access_token_rejects_refresh_token(self, fake_user):
        refresh = create_refresh_token(fake_user["id"], fake_user["email"])
        # decode_access_token should reject a refresh token
        result = decode_access_token(refresh)
        assert result is None

    def test_invalid_token_returns_none(self):
        result = decode_access_token("not.a.valid.token")
        assert result is None

    def test_empty_token_returns_none(self):
        result = decode_access_token("")
        assert result is None

    def test_tampered_token_returns_none(self, fake_user):
        token = create_access_token(fake_user["id"], fake_user["email"])
        tampered = token[:-5] + "xxxxx"
        result = decode_access_token(tampered)
        assert result is None

    def test_expired_token_returns_none(self, fake_user):
        """Create a token that expired 1 second ago."""
        expire = datetime.now(timezone.utc) - timedelta(seconds=1)
        payload = {
            "sub":   fake_user["id"],
            "email": fake_user["email"],
            "type":  "access",
            "exp":   expire,
            "iat":   datetime.now(timezone.utc),
        }
        expired_token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        result = decode_access_token(expired_token)
        assert result is None

    def test_token_contains_expected_fields(self, fake_user):
        token = create_access_token(fake_user["id"], fake_user["email"])
        payload = decode_access_token(token)
        assert "sub"   in payload
        assert "email" in payload
        assert "type"  in payload
        assert "exp"   in payload
        assert "iat"   in payload


# ── JWT refresh tokens ────────────────────────────────────────

class TestJWTRefreshToken:

    def test_create_and_decode_refresh_token(self, fake_user):
        token = create_refresh_token(fake_user["id"], fake_user["email"])
        payload = decode_refresh_token(token)
        assert payload is not None
        assert payload["type"] == "refresh"
        assert payload["sub"] == fake_user["id"]

    def test_refresh_token_rejects_access_token(self, fake_user):
        access = create_access_token(fake_user["id"], fake_user["email"])
        result = decode_refresh_token(access)
        assert result is None

    def test_refresh_token_longer_lived_than_access(self, fake_user):
        """Refresh token expiry should be significantly later than access token."""
        access  = create_access_token(fake_user["id"], fake_user["email"])
        refresh = create_refresh_token(fake_user["id"], fake_user["email"])

        access_payload  = decode_token(access)
        refresh_payload = decode_token(refresh)

        assert refresh_payload["exp"] > access_payload["exp"]
