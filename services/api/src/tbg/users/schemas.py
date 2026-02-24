"""Request/response schemas for user endpoints.

Re-exports from auth schemas for convenience.
"""

from tbg.auth.schemas import (
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyResponse,
    ProfileUpdateRequest,
    PublicUserResponse,
    SettingsResponse,
    SettingsUpdateRequest,
    UserResponse,
    WalletUpdateRequest,
    WalletUpdateResponse,
)

__all__ = [
    "ApiKeyCreateRequest",
    "ApiKeyCreateResponse",
    "ApiKeyResponse",
    "ProfileUpdateRequest",
    "PublicUserResponse",
    "SettingsResponse",
    "SettingsUpdateRequest",
    "UserResponse",
    "WalletUpdateRequest",
    "WalletUpdateResponse",
]
