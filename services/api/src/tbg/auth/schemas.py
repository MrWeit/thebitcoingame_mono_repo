"""Request/response schemas for authentication endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator


# ---------------------------------------------------------------------------
# Wallet auth
# ---------------------------------------------------------------------------


class ChallengeRequest(BaseModel):
    """Request a wallet signing challenge."""

    btc_address: str = Field(..., min_length=26, max_length=62)


class ChallengeResponse(BaseModel):
    """Challenge response with nonce and message to sign."""

    nonce: str
    message: str
    expires_in: int


class VerifyRequest(BaseModel):
    """Verify a wallet signature."""

    btc_address: str
    signature: str
    nonce: str
    timestamp: str


# ---------------------------------------------------------------------------
# Email auth
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    """Email registration request. BTC wallet address is REQUIRED."""

    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)
    btc_address: str = Field(..., min_length=26, max_length=62)
    display_name: str | None = Field(None, min_length=3, max_length=64)
    country_code: str | None = Field(None, min_length=2, max_length=2)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        """Normalize email to lowercase."""
        return v.lower().strip()


class LoginRequest(BaseModel):
    """Login with email + password."""

    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        """Normalize email to lowercase."""
        return v.lower().strip()


class VerifyEmailRequest(BaseModel):
    """Verify email address with a token."""

    token: str


class ForgotPasswordRequest(BaseModel):
    """Request a password reset email."""

    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        """Normalize email to lowercase."""
        return v.lower().strip()


class ResetPasswordRequest(BaseModel):
    """Reset password with a valid token."""

    token: str
    new_password: str = Field(..., min_length=1, max_length=128)


class ChangePasswordRequest(BaseModel):
    """Change password (requires current password)."""

    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=1, max_length=128)


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------


class RefreshRequest(BaseModel):
    """Refresh token rotation request."""

    refresh_token: str


class LogoutRequest(BaseModel):
    """Logout (revoke refresh token)."""

    refresh_token: str


class TokenResponse(BaseModel):
    """Token response returned after successful auth."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 3600
    user: UserResponse


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


class UserResponse(BaseModel):
    """Full user profile response."""

    id: int
    btc_address: str
    auth_method: str
    email: str | None = None
    email_verified: bool = False
    display_name: str | None = None
    country_code: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    is_verified: bool = False
    created_at: datetime | None = None
    last_login: datetime | None = None
    login_count: int = 0

    model_config = {"from_attributes": True}


class PublicUserResponse(BaseModel):
    """Public-facing user profile (respects privacy settings)."""

    btc_address: str
    display_name: str | None = None
    country_code: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    is_verified: bool = False
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class WalletUpdateRequest(BaseModel):
    """Update BTC wallet address."""

    btc_address: str = Field(..., min_length=26, max_length=62)


class WalletUpdateResponse(BaseModel):
    """Response after wallet address update."""

    btc_address: str
    previous_address: str
    address_type: str
    warning: str


# ---------------------------------------------------------------------------
# API Keys
# ---------------------------------------------------------------------------


class ApiKeyCreateRequest(BaseModel):
    """Create a new API key."""

    name: str = Field(..., min_length=1, max_length=128)
    permissions: list[str] = Field(default=["read"])


class ApiKeyCreateResponse(BaseModel):
    """Response when creating an API key (full key shown ONCE)."""

    id: str
    key: str  # Full key — shown once, never again
    prefix: str
    name: str
    permissions: list[str]
    created_at: datetime


class ApiKeyResponse(BaseModel):
    """API key listing (prefix only, never full key)."""

    id: str
    prefix: str
    name: str
    permissions: list[str]
    last_used_at: datetime | None = None
    created_at: datetime
    is_revoked: bool = False

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


class ProfileUpdateRequest(BaseModel):
    """Update user profile fields."""

    display_name: str | None = Field(None, min_length=3, max_length=64)
    avatar_url: str | None = Field(None, max_length=512)
    bio: str | None = Field(None, max_length=280)
    country_code: str | None = Field(None, min_length=2, max_length=2)


class SettingsUpdateRequest(BaseModel):
    """Update user settings (deep merge)."""

    notifications: dict[str, Any] | None = None
    privacy: dict[str, Any] | None = None
    mining: dict[str, Any] | None = None
    sound: dict[str, Any] | None = None


class SettingsResponse(BaseModel):
    """User settings response."""

    notifications: dict[str, Any]
    privacy: dict[str, Any]
    mining: dict[str, Any]
    sound: dict[str, Any]


# Fix forward reference for TokenResponse
TokenResponse.model_rebuild()
