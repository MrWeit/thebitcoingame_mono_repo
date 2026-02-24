"""FastAPI authentication dependencies."""

from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.auth.jwt import verify_token
from tbg.auth.service import get_user_by_id
from tbg.database import get_session
from tbg.db.models import User

_bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
    db: AsyncSession = Depends(get_session),
) -> User:
    """
    Extract and verify JWT, return User model.

    Works identically for both wallet-auth and email-auth users.
    Raises 401/403 on failure.
    """
    try:
        payload = verify_token(credentials.credentials, expected_type="access")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    user = await get_user_by_id(db, int(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Account is banned")
    return user


async def get_current_email_user(
    user: User = Depends(get_current_user),
) -> User:
    """
    Same as get_current_user but additionally verifies auth_method='email'.

    Used for password-change and other email-auth-only endpoints.
    """
    if user.auth_method != "email":
        raise HTTPException(status_code=400, detail="This endpoint is only for email-authenticated users")
    return user
