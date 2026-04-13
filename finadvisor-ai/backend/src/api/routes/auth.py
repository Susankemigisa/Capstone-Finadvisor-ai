from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr, field_validator
import secrets
import hashlib
import string
from datetime import datetime, timedelta

from src.auth.password import hash_password, verify_password, is_password_strong
from src.auth.jwt_handler import create_access_token, create_refresh_token, decode_refresh_token
from src.auth.dependencies import get_current_user
from src.database.operations import get_user_by_email, get_user_by_id, create_user, update_user
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

# In-memory reset code store: {code_hash: {user_id, expires_at}}
_reset_tokens: dict = {}


# ── Request Models ────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""

    @field_validator("password")
    @classmethod
    def password_must_be_strong(cls, v):
        is_valid, reason = is_password_strong(v)
        if not is_valid:
            raise ValueError(reason)
        return v

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v):
        return v.strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UpdateProfileRequest(BaseModel):
    full_name: str = None
    preferred_name: str = None
    preferred_model: str = None
    preferred_currency: str = None
    preferred_language: str = None
    temperature: float = None
    top_p: float = None
    onboarding_complete: bool = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str          # 6-digit code from email
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_must_be_strong(cls, v):
        is_valid, reason = is_password_strong(v)
        if not is_valid:
            raise ValueError(reason)
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_must_be_strong(cls, v):
        is_valid, reason = is_password_strong(v)
        if not is_valid:
            raise ValueError(reason)
        return v


# ── Helpers ───────────────────────────────────────────────────

def _safe_user(user: dict) -> dict:
    return {
        "id": str(user.get("id", "")),
        "email": user.get("email", ""),
        "full_name": user.get("full_name") or "",
        "preferred_name": user.get("preferred_name") or "",
        "tier": user.get("tier", "free"),
        "preferred_model": user.get("preferred_model", "gpt-4o-mini"),
        "temperature": user.get("temperature", 0.3),
        "top_p": user.get("top_p", 1.0),
        "preferred_currency": user.get("preferred_currency", "USD"),
        "preferred_language": user.get("preferred_language", "en"),
        "onboarding_complete": user.get("onboarding_complete", False),
        "created_at": str(user.get("created_at", "")),
    }


def _token_response(user: dict) -> dict:
    return {
        "access_token": create_access_token(str(user["id"]), user["email"]),
        "refresh_token": create_refresh_token(str(user["id"]), user["email"]),
        "token_type": "bearer",
        "user": _safe_user(user),
    }


def _generate_6digit_code() -> str:
    """Cryptographically random 6-digit numeric code."""
    return ''.join(secrets.choice(string.digits) for _ in range(6))


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _purge_expired():
    now = datetime.utcnow()
    for k in [k for k, v in list(_reset_tokens.items()) if v["expires_at"] < now]:
        del _reset_tokens[k]


# ── Routes (unchanged from your original) ────────────────────

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    existing = get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")
    try:
        hashed = hash_password(body.password)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to process password. Please try again.")
    try:
        user = create_user(email=body.email, password_hash=hashed, full_name=body.full_name)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create account. Please try again.")
    if not user:
        raise HTTPException(status_code=500, detail="Failed to create account. Please try again.")
    logger.info("user_registered", user_id=str(user["id"]))
    return _token_response(user)


@router.post("/login")
async def login(body: LoginRequest):
    user = get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    logger.info("user_logged_in", user_id=str(user["id"]))
    return _token_response(user)


@router.post("/refresh")
async def refresh(body: RefreshRequest):
    payload = decode_refresh_token(body.refresh_token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token. Please log in again.")
    user = get_user_by_id(payload.get("sub"))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists.")
    return _token_response(user)


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = get_user_by_id(current_user["user_id"])
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return _safe_user(user)


@router.patch("/me")
async def update_me(body: UpdateProfileRequest, current_user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    updated = update_user(current_user["user_id"], updates)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update profile.")
    logger.info("profile_updated", user_id=current_user["user_id"])
    return _safe_user(updated)


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    logger.info("user_logged_out", user_id=current_user["user_id"])
    return {"message": "Logged out successfully. Please delete your tokens."}


# ── OAuth (unchanged) ─────────────────────────────────────────

class OAuthRequest(BaseModel):
    provider_token: str
    email: str
    full_name: str = ""
    provider: str = "google"


@router.post("/oauth")
async def oauth_login(body: OAuthRequest):
    import base64, json, time

    try:
        parts = body.provider_token.split('.')
        if len(parts) != 3:
            raise HTTPException(status_code=401, detail="Malformed OAuth token")
        payload_b64 = parts[1] + '=' * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        if payload.get('exp', 0) < time.time():
            raise HTTPException(status_code=401, detail="OAuth token has expired — please sign in again")
        verified_email = (payload.get('email') or body.email or '').lower().strip()
        if not verified_email:
            raise HTTPException(status_code=400, detail="No email found in OAuth token")
        meta = payload.get('user_metadata', {})
        full_name = (body.full_name or meta.get('full_name') or meta.get('name') or verified_email.split('@')[0])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Could not decode OAuth token")

    user = get_user_by_email(verified_email)
    if not user:
        user = create_user(email=verified_email, password_hash="__oauth__", full_name=full_name)
        if not user:
            raise HTTPException(status_code=500, detail="Failed to create user account")
        logger.info("oauth_user_created", email=verified_email, provider=body.provider)
    else:
        logger.info("oauth_user_login", email=verified_email, provider=body.provider)

    return {
        "access_token": create_access_token(str(user["id"]), verified_email),
        "refresh_token": create_refresh_token(str(user["id"]), verified_email),
        "token_type": "bearer",
        "user": _safe_user(user),
    }


# ── Password Reset (UPDATED) ──────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """
    Generates a 6-digit code, stores its hash, emails it via Resend.
    Never returns the code in the response.
    """
    _purge_expired()

    user = get_user_by_email(body.email)
    if not user:
        # Don't reveal whether email is registered
        return {"success": True, "email_sent": True, "message": "If that email is registered, a reset code has been sent."}

    # Generate 6-digit code — store only the hash
    code = _generate_6digit_code()
    code_hash = _hash_code(code)
    _reset_tokens[code_hash] = {
        "user_id": str(user["id"]),
        "expires_at": datetime.utcnow() + timedelta(minutes=10),
    }

    logger.info("password_reset_code_generated", user_id=str(user["id"]))

    # Send via Resend
    from src.config.settings import settings
    import httpx

    resend_key = getattr(settings, "RESEND_API_KEY", None)
    if not resend_key:
        # Remove code — can't deliver it
        del _reset_tokens[code_hash]
        logger.error("password_reset_no_resend_key")
        raise HTTPException(status_code=500, detail="Email service not configured. Please contact support.")

    from_email = getattr(settings, "FROM_EMAIL", "onboarding@resend.dev")

    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0c10;color:#e8e3d6;padding:48px 32px;max-width:480px;margin:0 auto;border-radius:16px;border:1px solid #2a2820;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="color:#c9a84c;font-size:11px;letter-spacing:0.18em;font-family:monospace;margin-bottom:8px;">&#9670; FINADVISOR AI</div>
        <h1 style="color:#e8e3d6;font-size:22px;font-weight:400;font-style:italic;margin:0;font-family:Georgia,serif;">Reset your password</h1>
      </div>
      <p style="color:#9a9590;font-size:14px;line-height:1.7;text-align:center;margin-bottom:32px;">
        Enter this 6-digit code in the app to reset your password.
      </p>
      <div style="background:#141618;border:1px solid #c9a84c;border-radius:12px;padding:28px 20px;text-align:center;margin-bottom:28px;">
        <div style="letter-spacing:18px;font-size:40px;font-weight:700;color:#c9a84c;font-family:'Courier New',monospace;padding-left:18px;">
          {code}
        </div>
      </div>
      <p style="color:#6b6860;font-size:13px;text-align:center;margin-bottom:8px;">
        This code expires in <strong style="color:#e8e3d6;">10 minutes</strong>.
      </p>
      <div style="border-top:1px solid #2a2820;margin-top:32px;padding-top:20px;text-align:center;">
        <p style="color:#4a4840;font-size:12px;margin:0;">If you did not request this, you can safely ignore this email.</p>
      </div>
    </div>
    """

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                json={
                    "from": f"FINADVISOR AI <{from_email}>",
                    "to": [body.email],
                    "subject": "Your FINADVISOR AI password reset code",
                    "html": html,
                },
            )
        if r.status_code not in (200, 201):
            raise Exception(f"Resend returned {r.status_code}: {r.text}")
    except Exception as e:
        del _reset_tokens[code_hash]
        logger.error("password_reset_email_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to send reset code. Please try again.")

    return {
        "success": True,
        "email_sent": True,
        "message": "A 6-digit reset code has been sent to your email.",
    }


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """Verify 6-digit code and set new password."""
    code = body.token.strip().replace(" ", "")

    if len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Please enter the 6-digit code from your email.")

    code_hash = _hash_code(code)
    record = _reset_tokens.get(code_hash)

    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code. Please request a new one.")

    if datetime.utcnow() > record["expires_at"]:
        del _reset_tokens[code_hash]
        raise HTTPException(status_code=400, detail="This code has expired. Please request a new one.")

    updated = update_user(record["user_id"], {"password_hash": hash_password(body.new_password)})
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update password. Please try again.")

    del _reset_tokens[code_hash]
    logger.info("password_reset_completed", user_id=record["user_id"])
    return {"success": True, "message": "Password updated successfully."}


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    user = get_user_by_id(current_user["user_id"])
    if not user or not verify_password(body.current_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    updated = update_user(current_user["user_id"], {"password_hash": hash_password(body.new_password)})
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update password.")
    logger.info("password_changed", user_id=current_user["user_id"])
    return {"success": True, "message": "Password changed successfully."}