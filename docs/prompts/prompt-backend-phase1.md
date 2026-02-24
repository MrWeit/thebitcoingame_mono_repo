# Prompt: Backend Service — Phase 1 (Authentication & User Management)

You are continuing to build the backend API service for **The Bitcoin Game** — a Bitcoin mining gamification platform. Phase 0 is complete: the FastAPI project at `services/api/` is running in Docker Compose alongside ckpool, Redis, and TimescaleDB. The middleware stack (CORS, rate limiting, request ID, error handling, structured logging) is working. Health endpoints pass. Alembic is configured with a baseline migration. The existing database has the `users` table with columns: `id`, `btc_address`, `display_name`, `country_code`, `created_at`, `last_seen`, `is_verified`.

This phase implements the entire authentication system with **two authentication methods**: (1) Bitcoin message signing — users prove they own a Bitcoin address by signing a challenge message with their private key, and (2) Email + password — users register with an email address, a password, and their BTC wallet address, then log in with email and password. Both methods issue RS256 JWT tokens. This phase also builds an email service for verification and password reset, user profile CRUD, wallet address management, user settings, and API key management. Every user — regardless of auth method — MUST have a BTC wallet address on file, because it is required for stratum authorization and worker naming.

---

## IMPORTANT CONSTRAINTS

1. **Phase 0 is already complete.** The FastAPI app is running. Docker Compose works. Middleware is configured. Health endpoints respond. Do NOT recreate any Phase 0 infrastructure.
2. **Do not touch `dashboard/`** — the frontend is complete. Do not modify anything in the dashboard directory.
3. **Do not touch `services/ckpool/` or `services/event-collector/`** — they are working. Only modify `services/api/` and `services/docker-compose.yml`.
4. **Two authentication methods: Bitcoin wallet signing AND email + password.** Wallet signing is frictionless (sign message, auto-create account). Email + password requires registration with a BTC wallet address. Both methods produce the same JWT tokens.
5. **Every user MUST have a `btc_address`.** For wallet-auth users, the address comes from the signing process. For email-auth users, the address is required at registration. This address is used for stratum authorize and worker naming. It is non-negotiable.
6. **RS256 JWT only.** Not HS256. Asymmetric signing means the public key can verify tokens without the private key — essential for microservices.
7. **Generate RSA key pair during development.** The keys go in `services/api/keys/` (gitignored). Docker Compose mounts them as a volume. Production will use secrets management.
8. **coincurve for secp256k1 operations.** Not python-bitcoinlib, not ecdsa library. coincurve wraps libsecp256k1 (the same library Bitcoin Core uses).
9. **argon2id for ALL password and API key hashing.** Not bcrypt. Not scrypt. argon2id is the winner of the Password Hashing Competition.
10. **Email service uses a provider abstraction.** Default to SMTP. Support Resend and AWS SES as configurable alternatives. The interface MUST be the same regardless of provider.
11. **mypy strict with zero errors.** Every function annotated. No `Any` types.
12. **Tests are NON-NEGOTIABLE.** 90%+ coverage on auth module, 85%+ coverage on users module. Every test class and method listed in this prompt MUST be implemented.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Sections 4.1 (Authentication Flow), 5 (Database Schema — Auth Tables), 6 (API Design — Authentication + Users endpoints), 10 (Security). These are your primary references.
2. `docs/backend-service/roadmap/phase-01-authentication.md` — **The detailed specification for Phase 1.** Contains complete code for bitcoin.py, jwt.py, auth router, user router, API key module, database schema, test vectors, and test code. Read it cover to cover. You will extend it with email auth and password flows.
3. `docs/backend-service/roadmap/phase-00-foundation.md` — Phase 0 deliverables, especially the middleware and database modules you will build on.
4. `services/api/src/tbg/config.py` — Current configuration. You will add JWT, auth, email service, and password-related settings.
5. `services/api/src/tbg/database.py` — Database module. You will use `get_session` dependency.
6. `services/api/src/tbg/redis_client.py` — Redis module. You will use `get_redis()` for nonce storage and login attempt tracking.
7. `services/api/src/tbg/db/models.py` — Existing SQLAlchemy models. You will extend `User` and add new models.
8. `services/event-collector/sql/init.sql` — Existing schema. Your Alembic migration adds columns and tables.

Read ALL of these before writing any code.

---

## What You Are Building

### Part 1: Bitcoin Message Signing Verification

Create `src/tbg/auth/bitcoin.py` — the core signature verification module. This is the heart of the wallet-based auth.

**Supported address types:**

| Type | Prefix | Encoding | Signature | Library Function |
|---|---|---|---|---|
| P2PKH | `1...` | Base58Check | ECDSA (recoverable) | `coincurve.PublicKey.from_signature_and_message` |
| P2WPKH | `bc1q...` | Bech32 | ECDSA (recoverable) | Same as P2PKH, different address derivation |
| P2TR | `bc1p...` | Bech32m | Schnorr (BIP-340) | `coincurve.PublicKeyXOnly.verify` |
| Testnet P2WPKH | `tb1q...` | Bech32 | ECDSA | Same, testnet HRP |
| Testnet P2TR | `tb1p...` | Bech32m | Schnorr | Same, testnet HRP |

**Key functions:**

```python
def verify_bitcoin_signature(address: str, message: str, signature_base64: str) -> bool:
    """Verify a Bitcoin signed message. Returns True if valid."""

def _message_hash(message: str) -> bytes:
    """Bitcoin message hash: SHA256(SHA256(prefix + varint(len) + message))."""

def _detect_address_type(address: str) -> AddressType:
    """Detect P2PKH, P2WPKH, or P2TR from address prefix."""

def _verify_ecdsa(address: str, msg_hash: bytes, sig_bytes: bytes, addr_type: AddressType) -> bool:
    """ECDSA recovery + address derivation for P2PKH/P2WPKH."""

def _verify_schnorr(address: str, msg_hash: bytes, sig_bytes: bytes) -> bool:
    """BIP-340 Schnorr verification for P2TR."""

def _pubkey_to_p2pkh(pub_bytes: bytes) -> str:
    """Public key -> P2PKH address (SHA256 -> RIPEMD160 -> Base58Check)."""

def _pubkey_to_p2wpkh(pub_bytes: bytes) -> str:
    """Public key -> P2WPKH bech32 address."""
```

Also create `src/tbg/auth/_bech32.py` — a minimal bech32/bech32m encoder/decoder (BIP173/BIP350). This is a pure Python module with `encode(hrp, version, data)` and `decode(address)` functions.

Create `src/tbg/auth/address_validation.py` — BTC address format validator used by both auth methods:

```python
def validate_btc_address(address: str, network: str = "mainnet") -> bool:
    """
    Validate a Bitcoin address format.
    Supports P2PKH (1...), P2WPKH (bc1q...), and P2TR (bc1p...) on mainnet.
    Supports tb1q... and tb1p... on testnet/signet.
    Returns True if the address format is valid.
    """

def get_address_type(address: str) -> str:
    """Return the address type string: 'p2pkh', 'p2wpkh', or 'p2tr'."""
```

This module is used during email registration to validate the wallet address before account creation.

See `docs/backend-service/roadmap/phase-01-authentication.md` Section 1.3 for the complete bitcoin.py implementation.

### Part 2: Email + Password Authentication

Create `src/tbg/auth/password.py` — password hashing and validation module using argon2id.

```python
"""
services/api/src/tbg/auth/password.py — Password hashing and validation.

Uses argon2id (the winner of the Password Hashing Competition).
"""
import argon2

_hasher = argon2.PasswordHasher(
    time_cost=2,
    memory_cost=65536,     # 64 MB
    parallelism=1,
    hash_len=32,
    salt_len=16,
    type=argon2.Type.ID,   # argon2id
)


def hash_password(password: str) -> str:
    """Hash a password using argon2id. Returns the full hash string."""
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """
    Verify a password against its argon2id hash.
    Returns True if the password matches.
    Handles rehashing if the hash parameters have changed.
    """
    try:
        return _hasher.verify(password_hash, password)
    except argon2.exceptions.VerifyMismatchError:
        return False


def check_needs_rehash(password_hash: str) -> bool:
    """Check if the hash needs to be updated (params changed)."""
    return _hasher.check_needs_rehash(password_hash)


class PasswordStrengthError(ValueError):
    """Raised when a password does not meet strength requirements."""
    pass


def validate_password_strength(password: str) -> None:
    """
    Validate password meets minimum strength requirements.
    Raises PasswordStrengthError if the password is too weak.

    Requirements:
    - Minimum 8 characters
    - Maximum 128 characters (prevent DoS via huge passwords)
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - Must not be empty or whitespace-only
    """
    if not password or not password.strip():
        raise PasswordStrengthError("Password cannot be empty")
    if len(password) < 8:
        raise PasswordStrengthError("Password must be at least 8 characters")
    if len(password) > 128:
        raise PasswordStrengthError("Password must not exceed 128 characters")
    if not any(c.isupper() for c in password):
        raise PasswordStrengthError("Password must contain at least one uppercase letter")
    if not any(c.islower() for c in password):
        raise PasswordStrengthError("Password must contain at least one lowercase letter")
    if not any(c.isdigit() for c in password):
        raise PasswordStrengthError("Password must contain at least one digit")
```

**Email Registration — POST /api/v1/auth/register:**

Create the registration endpoint in the auth router. The request body MUST include:

```python
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    btc_address: str                    # REQUIRED — for stratum auth + worker naming
    display_name: str | None = None     # Optional, can set later
    country_code: str | None = None     # Optional ISO 3166-1 alpha-2

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower().strip()
```

Implementation steps:
1. Validate password strength via `validate_password_strength()`.
2. Validate BTC address format via `validate_btc_address()`.
3. Check that email is not already registered (case-insensitive, normalized to lowercase).
4. Hash the password with `hash_password()`.
5. Create the user record with `auth_method = "email"`, `email`, `password_hash`, and `btc_address`.
6. Generate an email verification token (32-byte random hex, stored hashed in DB with 24h TTL).
7. Send verification email via the email service.
8. Issue access + refresh tokens (the user can use the app immediately, but some features may require verified email later).
9. Return the token pair and user object.

**Email Login — POST /api/v1/auth/login:**

```python
class LoginRequest(BaseModel):
    email: EmailStr
    password: str
```

Implementation steps:
1. Look up user by email (case-insensitive).
2. If user not found, return 401 "Invalid email or password" (do NOT reveal whether the email exists).
3. Check account lockout: if 10+ failed login attempts in the last 15 minutes, return 429 "Account temporarily locked. Try again in N minutes."
4. Verify password via `verify_password()`.
5. If password wrong, increment failed login counter in Redis (`login_attempts:{user_id}`, TTL 15 min), return 401.
6. If password correct, clear the failed login counter, update `last_login` and `login_count`.
7. Check if user is banned — return 403 if so.
8. Issue access + refresh tokens.
9. If `check_needs_rehash()` returns True, rehash the password and update the DB.
10. Return the token pair and user object.

**Account lockout details:**
- Track failed login attempts in Redis: key `login_attempts:{user_id}`, value is the count, TTL 15 minutes.
- After 10 consecutive failed attempts, the account is locked for 15 minutes.
- Successful login clears the counter.
- The lockout is per-user, NOT per-IP. An attacker trying many passwords against one account gets locked out.

**Email Verification — POST /api/v1/auth/verify-email:**

```python
class VerifyEmailRequest(BaseModel):
    token: str
```

Implementation steps:
1. Hash the incoming token with SHA-256.
2. Look up the token hash in `email_verification_tokens` table.
3. If not found, return 400 "Invalid or expired verification token."
4. If expired (older than 24 hours), return 400 "Verification token has expired."
5. If already used (`used_at IS NOT NULL`), return 400 "Token has already been used."
6. Mark the token as used (`used_at = NOW()`).
7. Set `email_verified = TRUE` on the user record.
8. Return 200 `{ "status": "email_verified" }`.

**Resend Verification Email — POST /api/v1/auth/resend-verification:**

Requires authentication. Rate limited to 1 per 5 minutes per user.
1. Check that the user's email is not already verified.
2. Invalidate any existing unused verification tokens for this user.
3. Generate a new token and send a new verification email.
4. Return 200 `{ "status": "verification_email_sent" }`.

**Forgot Password — POST /api/v1/auth/forgot-password:**

```python
class ForgotPasswordRequest(BaseModel):
    email: EmailStr
```

Implementation steps:
1. Look up user by email.
2. **Always return 200** regardless of whether the email exists (prevent email enumeration).
3. If user exists and auth_method is "email":
   a. Generate a password reset token (32-byte random hex, stored hashed in DB with 1 hour TTL).
   b. Invalidate any existing unused reset tokens for this user.
   c. Send password reset email.
4. Return 200 `{ "status": "If that email exists, a reset link has been sent." }`.

**Reset Password — POST /api/v1/auth/reset-password:**

```python
class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
```

Implementation steps:
1. Hash the incoming token with SHA-256.
2. Look up the token hash in `password_reset_tokens` table.
3. If not found, return 400 "Invalid or expired reset token."
4. If expired (older than 1 hour), return 400 "Reset token has expired."
5. If already used, return 400 "Token has already been used."
6. Validate new password strength.
7. Hash the new password and update the user record.
8. Mark the token as used.
9. **Revoke ALL refresh tokens for this user** (force re-login on all devices).
10. Return 200 `{ "status": "password_reset_complete" }`.

**Change Password — POST /api/v1/auth/change-password:**

Requires authentication. Only for email-auth users.

```python
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
```

Implementation steps:
1. Verify that the authenticated user's `auth_method` is "email".
2. Verify the current password.
3. Validate new password strength.
4. Hash the new password and update the user record.
5. Revoke all OTHER refresh tokens (keep the current session alive).
6. Send "password changed" notification email.
7. Return 200 `{ "status": "password_changed" }`.

### Part 3: Email Service

Create `src/tbg/email/__init__.py` and `src/tbg/email/service.py` — the email service abstraction layer.

```python
"""
services/api/src/tbg/email/service.py — Email service with provider abstraction.

Supports: SMTP (default), Resend, AWS SES.
The provider is configured via EMAIL_PROVIDER env var.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum


class EmailProvider(str, Enum):
    SMTP = "smtp"
    RESEND = "resend"
    SES = "ses"


@dataclass
class EmailMessage:
    to: str
    subject: str
    html_body: str
    text_body: str
    from_address: str | None = None  # Uses default if None
    reply_to: str | None = None


class BaseEmailProvider(ABC):
    """Abstract base class for email providers."""

    @abstractmethod
    async def send(self, message: EmailMessage) -> bool:
        """Send an email. Returns True on success, False on failure."""
        ...


class SMTPProvider(BaseEmailProvider):
    """SMTP email provider using aiosmtplib."""

    def __init__(self, host: str, port: int, username: str, password: str, use_tls: bool = True) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.use_tls = use_tls

    async def send(self, message: EmailMessage) -> bool:
        """Send via SMTP using aiosmtplib."""
        ...


class ResendProvider(BaseEmailProvider):
    """Resend email provider (resend.com)."""

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    async def send(self, message: EmailMessage) -> bool:
        """Send via Resend HTTP API."""
        ...


class SESProvider(BaseEmailProvider):
    """AWS SES email provider."""

    def __init__(self, region: str, access_key: str, secret_key: str) -> None:
        self.region = region
        self.access_key = access_key
        self.secret_key = secret_key

    async def send(self, message: EmailMessage) -> bool:
        """Send via AWS SES using aioboto3."""
        ...


class EmailService:
    """
    Main email service. Wraps a provider and adds:
    - Rate limiting (max 5 emails per address per hour)
    - Template rendering
    - Logging
    - Error handling
    """

    def __init__(self, provider: BaseEmailProvider, default_from: str) -> None:
        self.provider = provider
        self.default_from = default_from

    async def send_email(
        self,
        to: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> bool:
        """
        Send an email with rate limiting.
        Rate limit: max 5 emails per recipient address per hour.
        Track in Redis: email_rate:{address} with TTL 3600.
        Returns True if sent, False if rate limited or failed.
        """
        ...

    async def send_template(
        self,
        to: str,
        template_name: str,
        context: dict[str, str],
    ) -> bool:
        """Render a template and send. See EmailTemplates for available templates."""
        ...


def get_email_service() -> EmailService:
    """Factory function. Reads config and returns the configured EmailService."""
    ...
```

Create `src/tbg/email/templates.py` — HTML email templates with The Bitcoin Game branding.

```python
"""
services/api/src/tbg/email/templates.py — Email templates for The Bitcoin Game.

All templates follow a consistent brand style:
- Background: #06080C (canvas dark)
- Accent: #F7931A (Bitcoin Orange — used sparingly for CTAs)
- Text: #E6EDF3 (light gray on dark)
- Font: system-ui, sans-serif
- Logo: The Bitcoin Game wordmark at top
- Footer: unsubscribe link, company info

Each template function returns (subject, html_body, text_body).
"""


def welcome_email(display_name: str | None, verify_url: str) -> tuple[str, str, str]:
    """
    Sent after email registration.
    Subject: "Welcome to The Bitcoin Game"
    Contains: greeting, verify email CTA button, what to expect.
    """
    ...


def verify_email(verify_url: str, expires_hours: int = 24) -> tuple[str, str, str]:
    """
    Sent when user requests email verification or re-verification.
    Subject: "Verify your email address"
    Contains: verification link/button, expiry notice.
    """
    ...


def password_reset(reset_url: str, expires_minutes: int = 60) -> tuple[str, str, str]:
    """
    Sent when user requests a password reset.
    Subject: "Reset your password"
    Contains: reset link/button, expiry notice, "if you didn't request this" note.
    """
    ...


def password_changed(display_name: str | None) -> tuple[str, str, str]:
    """
    Sent after a successful password change.
    Subject: "Your password has been changed"
    Contains: confirmation, "if this wasn't you, contact support" note.
    """
    ...
```

**Template requirements:**
- Every HTML template MUST have a plain text fallback (the `text_body` return value).
- Templates use inline CSS (no external stylesheets — email clients strip them).
- The Bitcoin Orange (#F7931A) is used ONLY for the primary CTA button.
- Templates MUST be self-contained — no external image URLs, no tracking pixels.
- Include an unsubscribe/preferences link in the footer.

**Rate limiting:**
- Maximum 5 emails per recipient address per hour.
- Track in Redis: `email_rate:{normalized_email}` — increment on each send, TTL 3600 seconds.
- If the limit is reached, log a warning and return False (do NOT raise an exception).

### Part 4: JWT Token Management

Create `src/tbg/auth/jwt.py` — RS256 JWT token creation and verification.

**Token types:**

| Type | Lifetime | Contains | Storage |
|---|---|---|---|
| Access token | 1 hour | `sub` (user_id), `address` (btc_address), `auth_method` ("wallet" \| "email"), `type: "access"` | Client only (Authorization header) |
| Refresh token | 7 days | `sub`, `address`, `auth_method`, `jti` (unique ID), `type: "refresh"` | DB (token_hash) + client |

**Key functions:**

```python
def create_access_token(user_id: int, btc_address: str, auth_method: str) -> str:
    """
    Create RS256 JWT with 1h expiry.
    The auth_method claim MUST be either "wallet" or "email".
    """

def create_refresh_token(user_id: int, btc_address: str, auth_method: str, token_id: str) -> str:
    """
    Create RS256 JWT with 7d expiry and jti claim.
    The auth_method claim MUST be either "wallet" or "email".
    """

def verify_token(token: str, expected_type: str = "access") -> dict:
    """Verify JWT signature, expiry, and type. Raises on invalid."""
```

**Important:** The `auth_method` claim is included in every token. This allows downstream services and middleware to know how the user authenticated without a database lookup. The value is either `"wallet"` (Bitcoin message signing) or `"email"` (email + password).

**RSA key pair generation (dev setup):**

```bash
mkdir -p services/api/keys
openssl genrsa -out services/api/keys/jwt_private.pem 2048
openssl rsa -in services/api/keys/jwt_private.pem -pubout -out services/api/keys/jwt_public.pem
echo "keys/" >> services/api/.gitignore
```

Add `jwt_private_key_path` and `jwt_public_key_path` to the Settings class. Docker Compose mounts `./api/keys:/app/keys:ro`.

### Part 5: Challenge-Response Authentication Flow (Wallet Auth)

Create `src/tbg/auth/router.py` with these endpoints:

**POST /api/v1/auth/challenge**

- Input: `{ "btc_address": "bc1q..." }`
- Generate random 16-byte hex nonce
- Store in Redis: `SET auth:nonce:{btc_address} = {nonce}` with 5-minute TTL
- Return challenge message, nonce, and `expires_in: 300`

**Challenge message format (displayed by wallet):**

```
Sign this message to log in to The Bitcoin Game.

Nonce: a1b2c3d4e5f6a7b8
Timestamp: 2026-03-15T14:30:00Z
Address: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
```

**POST /api/v1/auth/verify**

- Input: `{ "btc_address", "nonce", "signature", "timestamp" }`
- Verify nonce exists in Redis and matches (then DELETE — one-time use)
- Reconstruct expected message from nonce + timestamp + address
- Verify Bitcoin signature using `verify_bitcoin_signature()`
- Auto-create user if new (`get_or_create_user` with `auth_method="wallet"`)
- Issue access token (1h) + refresh token (7d) — both include `auth_method: "wallet"`
- Store refresh token hash (SHA-256) in `refresh_tokens` table
- Return: `{ "access_token", "refresh_token", "token_type": "bearer", "expires_in": 3600, "user": {...} }`

**POST /api/v1/auth/refresh**

- Input: `{ "refresh_token" }`
- Verify JWT signature and type
- Look up token by `jti` in `refresh_tokens` table
- Verify not revoked, not expired
- Rotate: revoke old token, create new token pair
- Return new access + refresh tokens

**POST /api/v1/auth/logout**

- Input: `{ "refresh_token" }`
- Revoke the specific refresh token

**POST /api/v1/auth/logout-all** (requires auth)

- Revoke ALL refresh tokens for the current user

### Part 6: Auth Dependencies

Create `src/tbg/auth/dependencies.py`:

```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(HTTPBearer()),
    db: AsyncSession = Depends(get_session),
) -> User:
    """
    Extract and verify JWT, return User model. Raises 401/403.
    Works identically for both wallet-auth and email-auth users.
    The auth_method claim is in the token but does NOT affect access control.
    """
    payload = verify_token(credentials.credentials, expected_type="access")
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
    Same as get_current_user but additionally verifies the user has auth_method='email'.
    Used for password-change and other email-auth-only endpoints.
    """
    if user.auth_method != "email":
        raise HTTPException(status_code=400, detail="This endpoint is only for email-authenticated users")
    return user
```

This dependency is used by EVERY protected endpoint in all subsequent phases.

### Part 7: Database Schema (Alembic Migration 002)

Create `alembic/versions/002_auth_tables.py` that:

1. **Extends `users` table** — add columns:
   - `email` (VARCHAR 320, nullable, unique where not null) — for email-auth users
   - `email_verified` (BOOLEAN DEFAULT FALSE) — email verification status
   - `password_hash` (VARCHAR 256, nullable) — argon2id hash, only for email-auth users
   - `auth_method` (VARCHAR 16, NOT NULL, DEFAULT 'wallet') — either "wallet" or "email"
   - `display_name_normalized` (VARCHAR 64) — case-insensitive uniqueness
   - `avatar_url` (TEXT)
   - `bio` (VARCHAR 280)
   - `is_banned` (BOOLEAN DEFAULT FALSE)
   - `last_login` (TIMESTAMPTZ)
   - `login_count` (INTEGER DEFAULT 0)
   - `failed_login_attempts` (INTEGER DEFAULT 0)
   - `locked_until` (TIMESTAMPTZ, nullable) — account lockout timestamp

   Add unique index on `email` where not null. Add unique index on `display_name_normalized` where not null. Add CHECK constraint: `auth_method IN ('wallet', 'email')`. Add CHECK constraint: if `auth_method = 'email'` then `email IS NOT NULL AND password_hash IS NOT NULL`. Add trigger to auto-normalize display_name to lowercase.

2. **Creates `refresh_tokens` table** — `id` (UUID PK), `user_id` (FK users), `token_hash` (VARCHAR 128), `issued_at`, `expires_at`, `revoked_at`, `ip_address` (INET), `user_agent` (VARCHAR 512), `is_revoked` (BOOLEAN DEFAULT FALSE), `replaced_by` (UUID FK self).

3. **Creates `api_keys` table** — `id` (UUID PK), `user_id` (FK users), `key_prefix` (VARCHAR 16), `key_hash` (VARCHAR 256, argon2), `name` (VARCHAR 128), `permissions` (JSONB DEFAULT '["read"]'), `last_used_at`, `created_at`, `expires_at`, `is_revoked` (BOOLEAN), `revoked_at`.

4. **Creates `user_settings` table** — `user_id` (PK, FK users), `notifications` (JSONB), `privacy` (JSONB), `mining` (JSONB), `sound` (JSONB), `updated_at` (TIMESTAMPTZ with auto-update trigger).

5. **Creates `email_verification_tokens` table:**
   ```sql
   CREATE TABLE IF NOT EXISTS email_verification_tokens (
       id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       token_hash      VARCHAR(128) NOT NULL,          -- SHA-256 hash of the token
       created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at      TIMESTAMPTZ NOT NULL,            -- 24 hours after creation
       used_at         TIMESTAMPTZ                      -- set when verified
   );

   CREATE INDEX IF NOT EXISTS idx_email_verification_token_hash
       ON email_verification_tokens(token_hash) WHERE used_at IS NULL;
   CREATE INDEX IF NOT EXISTS idx_email_verification_user
       ON email_verification_tokens(user_id);
   ```

6. **Creates `password_reset_tokens` table:**
   ```sql
   CREATE TABLE IF NOT EXISTS password_reset_tokens (
       id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       token_hash      VARCHAR(128) NOT NULL,          -- SHA-256 hash of the token
       created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at      TIMESTAMPTZ NOT NULL,            -- 1 hour after creation
       used_at         TIMESTAMPTZ,                     -- set when used
       ip_address      INET                             -- IP that requested the reset
   );

   CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash
       ON password_reset_tokens(token_hash) WHERE used_at IS NULL;
   CREATE INDEX IF NOT EXISTS idx_password_reset_user
       ON password_reset_tokens(user_id);
   ```

See `docs/backend-service/roadmap/phase-01-authentication.md` Sections 1.5.1 through 1.5.4 for the SQL of existing tables (refresh_tokens, api_keys, user_settings).

### Part 8: User Profile CRUD

Create `src/tbg/users/router.py` with these endpoints:

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/users/me` | Get own full profile | Yes |
| PATCH | `/api/v1/users/me` | Update profile (display_name, avatar_url, bio, country_code) | Yes |
| GET | `/api/v1/users/me/settings` | Get settings (notifications, privacy, mining, sound) | Yes |
| PATCH | `/api/v1/users/me/settings` | Deep-merge update settings (JSONB) | Yes |
| PATCH | `/api/v1/users/me/wallet` | Update BTC wallet address | Yes |
| POST | `/api/v1/users/me/api-keys` | Create API key (returns full key ONCE) | Yes |
| GET | `/api/v1/users/me/api-keys` | List API keys (prefix only, never full key) | Yes |
| DELETE | `/api/v1/users/me/api-keys/{id}` | Revoke API key | Yes |
| GET | `/api/v1/users/{btc_address}` | Get public profile (respects privacy settings) | No |

**Display name uniqueness:** Case-insensitive via `display_name_normalized` column. Trigger auto-lowercases. "SatoshiHunter" and "satoshihunter" cannot both exist.

**Settings deep merge:** When updating `{"notifications": {"email_enabled": true}}`, only the `email_enabled` field changes — all other notification fields remain unchanged. Use PostgreSQL `jsonb_deep_merge` or application-level merge.

### Part 9: API Key Management

Create `src/tbg/auth/api_keys.py`:

```python
KEY_PREFIX = "sk-tbg-"

def generate_api_key() -> tuple[str, str, str]:
    """Returns (full_key, prefix, argon2_hash). Full key shown once, never stored."""
    random_part = secrets.token_hex(32)
    full_key = f"{KEY_PREFIX}{random_part}"
    prefix = full_key[:14]  # "sk-tbg-a1b2c3"
    key_hash = argon2_hasher.hash(full_key)
    return full_key, prefix, key_hash

def verify_api_key(full_key: str, stored_hash: str) -> bool:
    """Verify an API key against its stored argon2 hash."""
```

The full key is returned to the user ONCE at creation time. After that, only the prefix is displayed. The stored hash is argon2id.

### Part 10: Wallet Address Management

Create the wallet management endpoint in the users router. This is critical because the BTC wallet address is used for stratum authorization and worker naming.

**PATCH /api/v1/users/me/wallet**

```python
class WalletUpdateRequest(BaseModel):
    btc_address: str    # New BTC wallet address

class WalletUpdateResponse(BaseModel):
    btc_address: str
    previous_address: str
    address_type: str   # "p2pkh", "p2wpkh", or "p2tr"
    warning: str        # "Mining workers using the old address will need to reconnect."
```

Implementation steps:
1. Validate the new address format using `validate_btc_address()`.
2. Verify the new address is different from the current one.
3. Update the `btc_address` column on the user record.
4. Return the response with a warning about mining reconnection.

**Important considerations:**
- Wallet-auth users CAN change their address. Their auth is still tied to their JWT, not the address. On next wallet-auth login, they would authenticate with whatever address they use.
- Email-auth users CAN change their address at any time.
- Changing the wallet address means existing stratum connections using the old address as the worker name will need to reconnect. The response MUST include this warning.
- Address format validation MUST support P2PKH (`1...`), P2WPKH (`bc1q...`), and P2TR (`bc1p...`). Reject P2SH (`3...`) and any invalid format.

### Part 11: Configuration Updates

Extend `Settings` in `config.py` with:

```python
# JWT
jwt_private_key_path: str = "keys/jwt_private.pem"
jwt_public_key_path: str = "keys/jwt_public.pem"
jwt_algorithm: str = "RS256"
jwt_access_token_expire_minutes: int = 60
jwt_refresh_token_expire_days: int = 7
jwt_issuer: str = "thebitcoingame.com"

# Bitcoin auth
btc_network: str = "signet"  # mainnet, testnet, signet
btc_challenge_expire_seconds: int = 300

# Email auth
password_min_length: int = 8
password_max_length: int = 128
account_lockout_threshold: int = 10          # failed attempts before lockout
account_lockout_duration_minutes: int = 15   # lockout duration

# Email service
email_provider: str = "smtp"                 # "smtp", "resend", "ses"
email_from_address: str = "noreply@thebitcoingame.com"
email_from_name: str = "The Bitcoin Game"
smtp_host: str = "localhost"
smtp_port: int = 587
smtp_username: str = ""
smtp_password: str = ""
smtp_use_tls: bool = True
resend_api_key: str = ""
ses_region: str = "us-east-1"
ses_access_key: str = ""
ses_secret_key: str = ""
email_rate_limit_per_hour: int = 5           # max emails per address per hour
email_verification_token_ttl_hours: int = 24
password_reset_token_ttl_minutes: int = 60
frontend_base_url: str = "https://thebitcoingame.com"   # for email link generation

# Rate limits (override per endpoint group in Phase 1)
rate_limit_auth: int = 5  # per minute
```

---

## Complete Endpoints Table

| Method | Path | Description | Auth | Auth Method |
|---|---|---|---|---|
| POST | `/api/v1/auth/challenge` | Request a wallet signing challenge nonce | No | Wallet |
| POST | `/api/v1/auth/verify` | Verify wallet signature and get tokens | No | Wallet |
| POST | `/api/v1/auth/register` | Register with email + password + wallet address | No | Email |
| POST | `/api/v1/auth/login` | Login with email + password | No | Email |
| POST | `/api/v1/auth/verify-email` | Verify email address with token | No | Email |
| POST | `/api/v1/auth/resend-verification` | Resend verification email | Yes | Email |
| POST | `/api/v1/auth/forgot-password` | Request password reset email | No | Email |
| POST | `/api/v1/auth/reset-password` | Reset password with token | No | Email |
| POST | `/api/v1/auth/change-password` | Change password (current + new) | Yes | Email |
| POST | `/api/v1/auth/refresh` | Rotate refresh token | No | Both |
| POST | `/api/v1/auth/logout` | Revoke refresh token | No | Both |
| POST | `/api/v1/auth/logout-all` | Revoke all sessions | Yes | Both |
| GET | `/api/v1/users/me` | Get own full profile | Yes | Both |
| PATCH | `/api/v1/users/me` | Update profile | Yes | Both |
| GET | `/api/v1/users/me/settings` | Get settings | Yes | Both |
| PATCH | `/api/v1/users/me/settings` | Update settings (deep merge) | Yes | Both |
| PATCH | `/api/v1/users/me/wallet` | Update BTC wallet address | Yes | Both |
| POST | `/api/v1/users/me/api-keys` | Create API key | Yes | Both |
| GET | `/api/v1/users/me/api-keys` | List API keys | Yes | Both |
| DELETE | `/api/v1/users/me/api-keys/{id}` | Revoke API key | Yes | Both |
| GET | `/api/v1/users/{btc_address}` | Get public profile | No | N/A |

---

## Testing Requirements

These tests are **NON-NEGOTIABLE**. Every test class and every test method listed below MUST be implemented and MUST pass before Phase 1 is complete.

### Bitcoin Signature Tests (`tests/auth/test_bitcoin.py`)

```python
class TestAddressDetection:
    def test_p2pkh(self) -> None:           # "1A1zP1..." -> AddressType.P2PKH
        ...
    def test_p2wpkh(self) -> None:          # "bc1qw508d6..." -> AddressType.P2WPKH
        ...
    def test_p2tr(self) -> None:            # "bc1p5cyxn..." -> AddressType.P2TR
        ...
    def test_testnet_p2wpkh(self) -> None:  # "tb1q..." -> AddressType.P2WPKH
        ...
    def test_testnet_p2tr(self) -> None:    # "tb1p..." -> AddressType.P2TR
        ...
    def test_unsupported(self) -> None:     # "3J98t1..." -> ValueError
        ...

class TestMessageHash:
    def test_deterministic(self) -> None:   # Same message -> same hash
        ...
    def test_different_messages(self) -> None:  # Different messages -> different hashes
        ...
    def test_hash_length(self) -> None:     # Output is 32 bytes (SHA256)
        ...

class TestSignatureVerification:
    # Use known test vectors from bitcoin-core signmessage RPC
    def test_valid_p2pkh_signature(self) -> None:
        ...
    def test_wrong_message_rejects(self) -> None:
        ...
    def test_invalid_signature_length_rejects(self) -> None:
        ...
    def test_malformed_base64_rejects(self) -> None:
        ...
```

### Password Tests (`tests/auth/test_password.py`)

```python
class TestPasswordHashing:
    def test_hash_and_verify(self) -> None:
        """Hash a password, then verify it returns True."""
        password = "SecureP@ss1"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True

    def test_wrong_password_rejected(self) -> None:
        """Verify with wrong password returns False, does NOT raise."""
        hashed = hash_password("CorrectP@ss1")
        assert verify_password("WrongP@ss1", hashed) is False

    def test_password_strength_validation(self) -> None:
        """Valid password passes strength check without raising."""
        validate_password_strength("StrongP@ss1")  # Should not raise

    def test_empty_password_rejected(self) -> None:
        """Empty string raises PasswordStrengthError."""
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("")

    def test_short_password_rejected(self) -> None:
        """Password shorter than 8 chars raises PasswordStrengthError."""
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("Short1")

    def test_no_uppercase_rejected(self) -> None:
        """Password without uppercase raises PasswordStrengthError."""
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("nouppercase1")

    def test_no_lowercase_rejected(self) -> None:
        """Password without lowercase raises PasswordStrengthError."""
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("NOLOWERCASE1")

    def test_no_digit_rejected(self) -> None:
        """Password without digit raises PasswordStrengthError."""
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("NoDigitHere")

    def test_too_long_password_rejected(self) -> None:
        """Password over 128 chars raises PasswordStrengthError."""
        with pytest.raises(PasswordStrengthError):
            validate_password_strength("A" * 129 + "a1")

    def test_hash_is_argon2id(self) -> None:
        """Verify the hash string starts with $argon2id$."""
        hashed = hash_password("TestP@ss1")
        assert hashed.startswith("$argon2id$")

    def test_check_needs_rehash(self) -> None:
        """check_needs_rehash returns False for freshly hashed password."""
        hashed = hash_password("TestP@ss1")
        assert check_needs_rehash(hashed) is False
```

### Email Registration Tests (`tests/auth/test_email_registration.py`)

```python
class TestEmailRegistration:
    async def test_register_success(self, client: AsyncClient) -> None:
        """Register with valid email, password, and wallet address. Returns tokens and user."""
        response = await client.post("/api/v1/auth/register", json={
            "email": "miner@example.com",
            "password": "SecureP@ss1",
            "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == "miner@example.com"
        assert data["user"]["btc_address"] == "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
        assert data["user"]["auth_method"] == "email"

    async def test_register_duplicate_email_rejected(self, client: AsyncClient) -> None:
        """Registering with an already-used email returns 409 Conflict."""
        payload = {
            "email": "duplicate@example.com",
            "password": "SecureP@ss1",
            "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        }
        await client.post("/api/v1/auth/register", json=payload)
        response = await client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 409

    async def test_register_missing_wallet_address(self, client: AsyncClient) -> None:
        """Registration without btc_address returns 422 validation error."""
        response = await client.post("/api/v1/auth/register", json={
            "email": "nowallet@example.com",
            "password": "SecureP@ss1",
            # btc_address intentionally omitted
        })
        assert response.status_code == 422

    async def test_register_invalid_wallet_address(self, client: AsyncClient) -> None:
        """Registration with an invalid BTC address format returns 400."""
        response = await client.post("/api/v1/auth/register", json={
            "email": "badwallet@example.com",
            "password": "SecureP@ss1",
            "btc_address": "not_a_real_address",
        })
        assert response.status_code == 400
        assert "address" in response.json()["detail"].lower()

    async def test_register_weak_password_rejected(self, client: AsyncClient) -> None:
        """Registration with a weak password returns 400."""
        response = await client.post("/api/v1/auth/register", json={
            "email": "weakpass@example.com",
            "password": "short",
            "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        })
        assert response.status_code == 400
        assert "password" in response.json()["detail"].lower()

    async def test_register_sends_verification_email(
        self, client: AsyncClient, mock_email_service: MagicMock
    ) -> None:
        """Registration triggers a welcome/verification email."""
        await client.post("/api/v1/auth/register", json={
            "email": "verify@example.com",
            "password": "SecureP@ss1",
            "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        })
        mock_email_service.send_template.assert_called_once()
        call_args = mock_email_service.send_template.call_args
        assert call_args[1]["to"] == "verify@example.com" or call_args[0][0] == "verify@example.com"

    async def test_register_returns_tokens(self, client: AsyncClient) -> None:
        """Registration returns valid JWT access and refresh tokens."""
        response = await client.post("/api/v1/auth/register", json={
            "email": "tokens@example.com",
            "password": "SecureP@ss1",
            "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        })
        data = response.json()
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 3600
        # Verify access token is decodable
        payload = verify_token(data["access_token"], expected_type="access")
        assert payload["auth_method"] == "email"

    async def test_register_email_case_insensitive(self, client: AsyncClient) -> None:
        """Email is normalized to lowercase. 'Miner@Example.COM' == 'miner@example.com'."""
        await client.post("/api/v1/auth/register", json={
            "email": "CasE@Example.COM",
            "password": "SecureP@ss1",
            "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        })
        response = await client.post("/api/v1/auth/register", json={
            "email": "case@example.com",
            "password": "SecureP@ss1",
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        assert response.status_code == 409  # Duplicate
```

### Email Login Tests (`tests/auth/test_email_login.py`)

```python
class TestEmailLogin:
    async def test_login_success(self, client: AsyncClient, registered_email_user: dict) -> None:
        """Login with valid email + password returns tokens."""
        response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["auth_method"] == "email"

    async def test_login_wrong_password(self, client: AsyncClient, registered_email_user: dict) -> None:
        """Login with wrong password returns 401."""
        response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": "WrongP@ssword1",
        })
        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower()

    async def test_login_nonexistent_email(self, client: AsyncClient) -> None:
        """Login with unknown email returns 401 (same as wrong password — no enumeration)."""
        response = await client.post("/api/v1/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "AnyP@ssword1",
        })
        assert response.status_code == 401

    async def test_login_banned_user(
        self, client: AsyncClient, registered_email_user: dict, db_session: AsyncSession
    ) -> None:
        """Banned user gets 403 on login."""
        # Ban the user in DB
        user = await get_user_by_email(db_session, registered_email_user["email"])
        user.is_banned = True
        await db_session.commit()

        response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],
        })
        assert response.status_code == 403

    async def test_login_unverified_email_allowed(
        self, client: AsyncClient, registered_email_user: dict
    ) -> None:
        """Users with unverified email CAN still log in."""
        response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],
        })
        assert response.status_code == 200

    async def test_account_lockout_after_10_failures(
        self, client: AsyncClient, registered_email_user: dict
    ) -> None:
        """After 10 failed login attempts, account is locked for 15 minutes."""
        for i in range(10):
            await client.post("/api/v1/auth/login", json={
                "email": registered_email_user["email"],
                "password": f"WrongP@ss{i}",
            })

        # 11th attempt should be rate limited
        response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],  # Even correct password
        })
        assert response.status_code == 429
        assert "locked" in response.json()["detail"].lower()

    async def test_successful_login_clears_lockout(
        self, client: AsyncClient, registered_email_user: dict, redis_client
    ) -> None:
        """Successful login resets the failed attempt counter."""
        # Add some failed attempts
        for i in range(3):
            await client.post("/api/v1/auth/login", json={
                "email": registered_email_user["email"],
                "password": f"WrongP@ss{i}",
            })

        # Successful login
        await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],
        })

        # Check Redis counter was cleared
        user = await get_user_by_email(db_session, registered_email_user["email"])
        count = await redis_client.get(f"login_attempts:{user.id}")
        assert count is None or int(count) == 0

    async def test_login_updates_last_login(
        self, client: AsyncClient, registered_email_user: dict, db_session: AsyncSession
    ) -> None:
        """Successful login updates last_login timestamp and login_count."""
        await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],
        })
        user = await get_user_by_email(db_session, registered_email_user["email"])
        assert user.last_login is not None
        assert user.login_count >= 1
```

### Password Reset Tests (`tests/auth/test_password_reset.py`)

```python
class TestPasswordReset:
    async def test_forgot_password_sends_email(
        self, client: AsyncClient, registered_email_user: dict, mock_email_service: MagicMock
    ) -> None:
        """Forgot password with existing email sends a reset email."""
        response = await client.post("/api/v1/auth/forgot-password", json={
            "email": registered_email_user["email"],
        })
        assert response.status_code == 200
        mock_email_service.send_template.assert_called_once()

    async def test_forgot_password_unknown_email_200(
        self, client: AsyncClient, mock_email_service: MagicMock
    ) -> None:
        """Forgot password with unknown email STILL returns 200 (no enumeration)."""
        response = await client.post("/api/v1/auth/forgot-password", json={
            "email": "ghost@example.com",
        })
        assert response.status_code == 200
        mock_email_service.send_template.assert_not_called()

    async def test_reset_password_success(
        self, client: AsyncClient, registered_email_user: dict, db_session: AsyncSession
    ) -> None:
        """Reset password with valid token changes the password."""
        # Create a reset token in DB
        token = secrets.token_hex(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        # Insert into password_reset_tokens...

        response = await client.post("/api/v1/auth/reset-password", json={
            "token": token,
            "new_password": "NewSecureP@ss1",
        })
        assert response.status_code == 200

        # Verify new password works
        login_response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": "NewSecureP@ss1",
        })
        assert login_response.status_code == 200

    async def test_reset_password_expired_token(self, client: AsyncClient) -> None:
        """Reset with expired token returns 400."""
        # Create a token that expired 2 hours ago...
        response = await client.post("/api/v1/auth/reset-password", json={
            "token": "expired_token_hex",
            "new_password": "NewSecureP@ss1",
        })
        assert response.status_code == 400
        assert "expired" in response.json()["detail"].lower()

    async def test_reset_password_used_token_rejected(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Reset with already-used token returns 400."""
        # Create a token that has used_at set...
        response = await client.post("/api/v1/auth/reset-password", json={
            "token": "used_token_hex",
            "new_password": "NewSecureP@ss1",
        })
        assert response.status_code == 400

    async def test_reset_invalidates_all_sessions(
        self, client: AsyncClient, registered_email_user: dict, db_session: AsyncSession
    ) -> None:
        """Password reset revokes ALL refresh tokens for the user."""
        # Login to create refresh tokens
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],
        })
        refresh_token = login_resp.json()["refresh_token"]

        # Reset password
        # ... (create token, call reset endpoint)

        # Old refresh token should be revoked
        response = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": refresh_token,
        })
        assert response.status_code == 401

    async def test_reset_password_weak_password_rejected(self, client: AsyncClient) -> None:
        """Reset with a weak new password returns 400."""
        response = await client.post("/api/v1/auth/reset-password", json={
            "token": "valid_token_hex",
            "new_password": "weak",
        })
        assert response.status_code == 400
        assert "password" in response.json()["detail"].lower()
```

### Email Verification Tests (`tests/auth/test_email_verification.py`)

```python
class TestEmailVerification:
    async def test_verify_email_success(
        self, client: AsyncClient, registered_email_user: dict, db_session: AsyncSession
    ) -> None:
        """Verify email with valid token sets email_verified=True."""
        # Retrieve the verification token from DB for the registered user...
        response = await client.post("/api/v1/auth/verify-email", json={
            "token": verification_token,
        })
        assert response.status_code == 200
        assert response.json()["status"] == "email_verified"

        # Verify the user's email_verified flag in DB
        user = await get_user_by_email(db_session, registered_email_user["email"])
        assert user.email_verified is True

    async def test_verify_email_expired_token(self, client: AsyncClient) -> None:
        """Expired verification token returns 400."""
        # Create a token that expired...
        response = await client.post("/api/v1/auth/verify-email", json={
            "token": "expired_token_hex",
        })
        assert response.status_code == 400
        assert "expired" in response.json()["detail"].lower()

    async def test_verify_email_used_token(self, client: AsyncClient) -> None:
        """Already-used verification token returns 400."""
        # Create a token with used_at set...
        response = await client.post("/api/v1/auth/verify-email", json={
            "token": "used_token_hex",
        })
        assert response.status_code == 400

    async def test_resend_verification_email(
        self, authed_email_client: AsyncClient, mock_email_service: MagicMock
    ) -> None:
        """Resend verification sends a new email."""
        response = await authed_email_client.post("/api/v1/auth/resend-verification")
        assert response.status_code == 200
        mock_email_service.send_template.assert_called_once()

    async def test_resend_already_verified_rejected(
        self, authed_email_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Resend for already-verified email returns 400."""
        # Set email_verified=True in DB...
        response = await authed_email_client.post("/api/v1/auth/resend-verification")
        assert response.status_code == 400
```

### Wallet Management Tests (`tests/auth/test_wallet_management.py`)

```python
class TestWalletManagement:
    async def test_update_wallet_success(self, authed_client: AsyncClient) -> None:
        """Update wallet address with valid P2WPKH address succeeds."""
        response = await authed_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["btc_address"] == "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
        assert "warning" in data
        assert "reconnect" in data["warning"].lower()

    async def test_update_wallet_invalid_address(self, authed_client: AsyncClient) -> None:
        """Update wallet with invalid address returns 400."""
        response = await authed_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "definitely_not_a_bitcoin_address",
        })
        assert response.status_code == 400

    async def test_wallet_required_on_registration(self, client: AsyncClient) -> None:
        """Email registration without btc_address returns 422."""
        response = await client.post("/api/v1/auth/register", json={
            "email": "noaddr@example.com",
            "password": "SecureP@ss1",
        })
        assert response.status_code == 422

    async def test_wallet_address_format_validation(self, authed_client: AsyncClient) -> None:
        """Wallet update validates address format for all supported types."""
        # P2PKH should work
        r1 = await authed_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
        })
        assert r1.status_code == 200

        # P2WPKH should work
        r2 = await authed_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        assert r2.status_code == 200

        # P2TR should work
        r3 = await authed_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "bc1p5cyxnuxmeuwuvkwfem96lqzszee2457nxwprkfw",
        })
        assert r3.status_code == 200

        # P2SH should be rejected
        r4 = await authed_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
        })
        assert r4.status_code == 400

    async def test_update_wallet_same_address_rejected(self, authed_client: AsyncClient) -> None:
        """Updating to the same address the user already has returns 400."""
        # First get current address
        profile = await authed_client.get("/api/v1/users/me")
        current_addr = profile.json()["btc_address"]

        response = await authed_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": current_addr,
        })
        assert response.status_code == 400

    async def test_update_wallet_returns_previous_address(self, authed_client: AsyncClient) -> None:
        """Wallet update response includes the previous address."""
        response = await authed_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        assert response.status_code == 200
        assert "previous_address" in response.json()
```

### Change Password Tests (`tests/auth/test_change_password.py`)

```python
class TestChangePassword:
    async def test_change_password_success(
        self, authed_email_client: AsyncClient, registered_email_user: dict
    ) -> None:
        """Change password with correct current password succeeds."""
        response = await authed_email_client.post("/api/v1/auth/change-password", json={
            "current_password": registered_email_user["password"],
            "new_password": "NewSecureP@ss2",
        })
        assert response.status_code == 200

    async def test_change_password_wrong_current(self, authed_email_client: AsyncClient) -> None:
        """Change password with wrong current password returns 401."""
        response = await authed_email_client.post("/api/v1/auth/change-password", json={
            "current_password": "WrongCurrent1",
            "new_password": "NewSecureP@ss2",
        })
        assert response.status_code == 401

    async def test_change_password_weak_new_password(
        self, authed_email_client: AsyncClient, registered_email_user: dict
    ) -> None:
        """Change password with weak new password returns 400."""
        response = await authed_email_client.post("/api/v1/auth/change-password", json={
            "current_password": registered_email_user["password"],
            "new_password": "weak",
        })
        assert response.status_code == 400

    async def test_change_password_wallet_user_rejected(self, authed_client: AsyncClient) -> None:
        """Wallet-auth user cannot use change-password endpoint."""
        response = await authed_client.post("/api/v1/auth/change-password", json={
            "current_password": "N/A",
            "new_password": "NewSecureP@ss2",
        })
        assert response.status_code == 400
        assert "email" in response.json()["detail"].lower()

    async def test_change_password_sends_notification_email(
        self, authed_email_client: AsyncClient, registered_email_user: dict, mock_email_service: MagicMock
    ) -> None:
        """Password change sends a 'password changed' notification email."""
        await authed_email_client.post("/api/v1/auth/change-password", json={
            "current_password": registered_email_user["password"],
            "new_password": "NewSecureP@ss2",
        })
        mock_email_service.send_template.assert_called_once()
```

### Email Service Tests (`tests/email/test_email_service.py`)

```python
class TestEmailService:
    async def test_send_email_success(self, email_service: EmailService) -> None:
        """Send an email through the service successfully."""
        result = await email_service.send_email(
            to="test@example.com",
            subject="Test",
            html_body="<h1>Test</h1>",
            text_body="Test",
        )
        assert result is True

    async def test_rate_limiting(self, email_service: EmailService, redis_client) -> None:
        """Sending more than 5 emails per hour to same address is blocked."""
        for i in range(5):
            result = await email_service.send_email(
                to="flood@example.com",
                subject=f"Test {i}",
                html_body=f"<h1>Test {i}</h1>",
                text_body=f"Test {i}",
            )
            assert result is True

        # 6th email should be rate limited
        result = await email_service.send_email(
            to="flood@example.com",
            subject="Test 6",
            html_body="<h1>Test 6</h1>",
            text_body="Test 6",
        )
        assert result is False

    async def test_send_template(self, email_service: EmailService) -> None:
        """Send a templated email."""
        result = await email_service.send_template(
            to="test@example.com",
            template_name="welcome",
            context={"display_name": "SatoshiHunter", "verify_url": "https://example.com/verify?token=abc"},
        )
        assert result is True

    async def test_invalid_template_name(self, email_service: EmailService) -> None:
        """Unknown template name raises ValueError."""
        with pytest.raises(ValueError, match="Unknown template"):
            await email_service.send_template(
                to="test@example.com",
                template_name="nonexistent",
                context={},
            )


class TestEmailTemplates:
    def test_welcome_email_has_all_parts(self) -> None:
        """Welcome template returns subject, html, and text."""
        subject, html, text = welcome_email("TestUser", "https://example.com/verify")
        assert "Welcome" in subject
        assert "https://example.com/verify" in html
        assert "https://example.com/verify" in text
        assert "TestUser" in html

    def test_verify_email_template(self) -> None:
        """Verify email template includes the URL and expiry."""
        subject, html, text = verify_email("https://example.com/verify")
        assert "Verify" in subject or "verify" in subject
        assert "https://example.com/verify" in html
        assert "24" in html  # expiry hours

    def test_password_reset_template(self) -> None:
        """Password reset template includes URL, expiry, and safety note."""
        subject, html, text = password_reset("https://example.com/reset")
        assert "Reset" in subject or "reset" in subject
        assert "https://example.com/reset" in html
        assert "60" in html or "1 hour" in html.lower()
        assert "didn" in text.lower() or "not you" in text.lower()

    def test_password_changed_template(self) -> None:
        """Password changed template has confirmation and safety note."""
        subject, html, text = password_changed("TestUser")
        assert "changed" in subject.lower()
        assert "wasn" in text.lower() or "not you" in text.lower()

    def test_all_templates_have_plain_text_fallback(self) -> None:
        """Every template returns a non-empty text_body."""
        for func, args in [
            (welcome_email, ("User", "https://example.com")),
            (verify_email, ("https://example.com",)),
            (password_reset, ("https://example.com",)),
            (password_changed, ("User",)),
        ]:
            _, _, text = func(*args)
            assert len(text.strip()) > 0
```

### JWT Tests (`tests/auth/test_jwt.py`) — Updated with auth_method

```python
class TestAccessToken:
    def test_create_and_verify(self) -> None:
        token = create_access_token(user_id=1, btc_address="bc1q...", auth_method="wallet")
        payload = verify_token(token, expected_type="access")
        assert payload["sub"] == "1"
        assert payload["address"] == "bc1q..."
        assert payload["auth_method"] == "wallet"
        assert payload["type"] == "access"

    def test_email_auth_method(self) -> None:
        token = create_access_token(user_id=2, btc_address="bc1q...", auth_method="email")
        payload = verify_token(token, expected_type="access")
        assert payload["auth_method"] == "email"

    def test_expired_token_rejected(self) -> None:
        """Use freezegun to simulate expiry."""
        ...

    def test_wrong_type_rejected(self) -> None:
        token = create_refresh_token(user_id=1, btc_address="bc1q...", auth_method="wallet", token_id="test")
        with pytest.raises(jwt.InvalidTokenError, match="Expected token type"):
            verify_token(token, expected_type="access")

class TestRefreshToken:
    def test_create_includes_jti(self) -> None:
        token = create_refresh_token(user_id=1, btc_address="bc1q...", auth_method="wallet", token_id="abc-123")
        payload = verify_token(token, expected_type="refresh")
        assert payload["jti"] == "abc-123"
        assert payload["type"] == "refresh"
        assert payload["auth_method"] == "wallet"
```

### Auth Flow Integration Tests (`tests/auth/test_auth_flow.py`) — Keep + Extend

```python
# --- Wallet auth flow tests (keep from current) ---
async def test_challenge_returns_nonce(client: AsyncClient) -> None: ...
async def test_challenge_stores_nonce_in_redis(client: AsyncClient, redis_client) -> None: ...
async def test_duplicate_challenge_replaces_nonce(client: AsyncClient) -> None: ...
async def test_verify_with_expired_nonce_fails(client: AsyncClient) -> None: ...
async def test_verify_with_wrong_nonce_fails(client: AsyncClient, redis_client) -> None: ...
async def test_verify_with_invalid_signature_fails(client: AsyncClient, redis_client) -> None: ...
async def test_refresh_token_rotation(authed_client: AsyncClient) -> None: ...
async def test_revoked_refresh_token_rejected(authed_client: AsyncClient) -> None: ...
async def test_logout_revokes_token(authed_client: AsyncClient) -> None: ...
async def test_logout_all_revokes_all(authed_client: AsyncClient) -> None: ...
async def test_banned_user_gets_403(authed_client: AsyncClient, db_session: AsyncSession) -> None: ...

# --- Cross-auth-method tests (NEW) ---
async def test_wallet_and_email_users_coexist(client: AsyncClient) -> None:
    """A wallet user and an email user can both exist with the same btc_address."""
    ...

async def test_refresh_token_works_for_email_user(authed_email_client: AsyncClient) -> None:
    """Email-auth user can refresh tokens just like wallet-auth user."""
    ...

async def test_logout_all_works_for_email_user(authed_email_client: AsyncClient) -> None:
    """Email-auth user can logout-all and invalidate all sessions."""
    ...
```

### Profile & Settings Tests (`tests/users/test_profile.py`) — Keep

```python
async def test_get_profile_unauthorized(client: AsyncClient) -> None: ...
async def test_get_profile_authorized(authed_client: AsyncClient) -> None: ...
async def test_update_display_name(authed_client: AsyncClient) -> None: ...
async def test_display_name_case_insensitive_unique(authed_client: AsyncClient, second_authed_client: AsyncClient) -> None: ...
async def test_settings_deep_merge(authed_client: AsyncClient) -> None: ...
async def test_public_profile_respects_privacy(client: AsyncClient, authed_client: AsyncClient) -> None: ...
```

### API Key Tests (`tests/auth/test_api_keys.py`) — Keep

```python
async def test_create_api_key_returns_full_key(authed_client: AsyncClient) -> None: ...
async def test_list_api_keys_shows_prefix_only(authed_client: AsyncClient) -> None: ...
async def test_revoke_api_key(authed_client: AsyncClient) -> None: ...
async def test_revoked_key_not_listed(authed_client: AsyncClient) -> None: ...
async def test_key_prefix_format(authed_client: AsyncClient) -> None:  # "sk-tbg-..."
    ...
```

### Test Fixtures (conftest.py)

The test suite requires these fixtures:

```python
@pytest.fixture
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    """Unauthenticated async HTTP client."""
    ...

@pytest.fixture
async def authed_client(client, db_session) -> AsyncClient:
    """Client authenticated via WALLET (Bitcoin signing). JWT in Authorization header."""
    ...

@pytest.fixture
async def registered_email_user(client) -> dict:
    """
    Register a user via email+password. Returns dict with:
    {"email": ..., "password": ..., "btc_address": ..., "user_id": ..., "access_token": ..., "refresh_token": ...}
    """
    ...

@pytest.fixture
async def authed_email_client(client, registered_email_user) -> AsyncClient:
    """Client authenticated via EMAIL. JWT with auth_method='email' in Authorization header."""
    ...

@pytest.fixture
def mock_email_service(monkeypatch) -> MagicMock:
    """Mock the email service to prevent actual email sending in tests."""
    ...

@pytest.fixture
async def redis_client() -> AsyncGenerator:
    """Direct Redis client for test assertions."""
    ...

@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Direct database session for test assertions."""
    ...
```

### Coverage Targets

| Module | Target |
|---|---|
| `tbg.auth.bitcoin` | 95% |
| `tbg.auth.password` | 95% |
| `tbg.auth.jwt` | 95% |
| `tbg.auth.router` | 90% |
| `tbg.auth.service` | 90% |
| `tbg.auth.api_keys` | 90% |
| `tbg.auth.address_validation` | 95% |
| `tbg.email.service` | 90% |
| `tbg.email.templates` | 90% |
| `tbg.users.router` | 90% |
| `tbg.users.service` | 85% |
| **Phase 1 overall** | **90%+** |

---

## Rules

1. **Read the Phase 1 roadmap first.** `docs/backend-service/roadmap/phase-01-authentication.md` contains complete code for bitcoin.py, jwt.py, and the wallet auth flow. Adapt and extend it with the email auth features specified in this prompt.
2. **Two authentication methods: Bitcoin wallet signing AND email + password.** Both produce the same JWT tokens. Both require a BTC wallet address. Both go through the same `get_current_user` dependency.
3. **Every user MUST have a `btc_address`.** For wallet-auth, the address comes from the signing challenge. For email-auth, the address is a required registration field. This address is used for stratum authorize and worker naming. Reject registrations without it.
4. **coincurve is the secp256k1 library.** Not ecdsa, not python-bitcoinlib. coincurve wraps the same C library Bitcoin Core uses.
5. **RS256 JWT only.** Asymmetric signing. Private key signs, public key verifies. Generate a dev key pair during setup.
6. **Refresh token rotation.** When a refresh token is used, the old one is revoked and a new one is issued. If someone tries to use a revoked token, revoke ALL tokens for that user (compromise detection).
7. **Auto-create users on first wallet auth.** Zero friction. No registration form for wallet users. Sign a message, you have an account.
8. **argon2id for ALL hashing.** Passwords use argon2id. API keys use argon2id. No bcrypt, no scrypt, no plain SHA-256 for secrets.
9. **Tokens (email verification, password reset) are stored as SHA-256 hashes.** The raw token is sent to the user (via email link). Only the hash is stored in the database. This way, even if the DB is compromised, the tokens cannot be used.
10. **Email service uses a provider abstraction.** Default is SMTP. Support Resend and AWS SES. Switching providers MUST NOT require code changes — only config changes.
11. **Email rate limiting.** Maximum 5 emails per recipient address per hour. Tracked in Redis.
12. **Account lockout.** After 10 failed login attempts, the account is locked for 15 minutes. Tracked in Redis per user ID.
13. **Never reveal whether an email exists.** The `forgot-password` endpoint MUST always return 200. The `login` endpoint MUST return the same error for "email not found" and "wrong password".
14. **API key secrets are NEVER logged.** Only store the argon2 hash. Only show the prefix in listings. The full key is returned once at creation.
15. **All auth endpoints under `/api/v1/auth/`.** All user endpoints under `/api/v1/users/`.
16. **Use Alembic for ALL schema changes.** Never modify init.sql. Migration 002 adds auth tables and extends users.
17. **Test with real crypto.** Generate a test Bitcoin key pair in conftest.py, sign actual messages, verify them. Do not mock the crypto.
18. **Rate limit auth endpoints stricter.** 5 requests/minute to `/auth/challenge`, `/auth/verify`, `/auth/login`, and `/auth/register` per IP (configurable).
19. **Include `authed_client` AND `authed_email_client` fixtures.** Two separate fixtures for the two auth methods, for use in all subsequent phase tests.
20. **Password change sends a notification email.** Password reset revokes all sessions. These security measures are non-negotiable.

---

## Files to Create/Edit

| Action | File |
|---|---|
| CREATE | `services/api/src/tbg/auth/__init__.py` |
| CREATE | `services/api/src/tbg/auth/bitcoin.py` |
| CREATE | `services/api/src/tbg/auth/_bech32.py` |
| CREATE | `services/api/src/tbg/auth/password.py` |
| CREATE | `services/api/src/tbg/auth/address_validation.py` |
| CREATE | `services/api/src/tbg/auth/jwt.py` |
| CREATE | `services/api/src/tbg/auth/router.py` |
| CREATE | `services/api/src/tbg/auth/dependencies.py` |
| CREATE | `services/api/src/tbg/auth/service.py` |
| CREATE | `services/api/src/tbg/auth/api_keys.py` |
| CREATE | `services/api/src/tbg/auth/schemas.py` |
| CREATE | `services/api/src/tbg/email/__init__.py` |
| CREATE | `services/api/src/tbg/email/service.py` |
| CREATE | `services/api/src/tbg/email/templates.py` |
| CREATE | `services/api/src/tbg/users/__init__.py` |
| CREATE | `services/api/src/tbg/users/router.py` |
| CREATE | `services/api/src/tbg/users/service.py` |
| CREATE | `services/api/src/tbg/users/schemas.py` |
| CREATE | `services/api/alembic/versions/002_auth_tables.py` |
| CREATE | `services/api/keys/.gitkeep` |
| CREATE | `services/api/.gitignore` (or EDIT if exists) |
| CREATE | `services/api/tests/auth/__init__.py` |
| CREATE | `services/api/tests/auth/test_bitcoin.py` |
| CREATE | `services/api/tests/auth/test_jwt.py` |
| CREATE | `services/api/tests/auth/test_password.py` |
| CREATE | `services/api/tests/auth/test_email_registration.py` |
| CREATE | `services/api/tests/auth/test_email_login.py` |
| CREATE | `services/api/tests/auth/test_password_reset.py` |
| CREATE | `services/api/tests/auth/test_email_verification.py` |
| CREATE | `services/api/tests/auth/test_change_password.py` |
| CREATE | `services/api/tests/auth/test_wallet_management.py` |
| CREATE | `services/api/tests/auth/test_auth_flow.py` |
| CREATE | `services/api/tests/auth/test_api_keys.py` |
| CREATE | `services/api/tests/email/__init__.py` |
| CREATE | `services/api/tests/email/test_email_service.py` |
| CREATE | `services/api/tests/users/__init__.py` |
| CREATE | `services/api/tests/users/test_profile.py` |
| EDIT | `services/api/src/tbg/config.py` |
| EDIT | `services/api/src/tbg/main.py` |
| EDIT | `services/api/src/tbg/db/models.py` |
| EDIT | `services/api/tests/conftest.py` |
| EDIT | `services/docker-compose.yml` |
| EDIT | `services/api/pyproject.toml` (add aiosmtplib, argon2-cffi, pydantic[email] deps) |

---

## Definition of Done

1. **POST /api/v1/auth/challenge** returns a nonce and human-readable challenge message containing the Bitcoin address.
2. **POST /api/v1/auth/verify** with a valid P2WPKH (bc1q...) signature returns access + refresh tokens with `auth_method: "wallet"` and auto-creates the user.
3. **POST /api/v1/auth/verify** with a valid P2TR (bc1p...) signature works identically (Schnorr/BIP-340).
4. **POST /api/v1/auth/verify** with a valid P2PKH (1...) signature works identically (legacy ECDSA).
5. **POST /api/v1/auth/verify** with an invalid signature returns 401.
6. **POST /api/v1/auth/verify** with an expired nonce returns 400.
7. **POST /api/v1/auth/register** with valid email, password, and btc_address creates a user, sends a verification email, and returns tokens with `auth_method: "email"`.
8. **POST /api/v1/auth/register** without `btc_address` returns 422 (required field).
9. **POST /api/v1/auth/register** with a weak password returns 400 with a descriptive error.
10. **POST /api/v1/auth/register** with a duplicate email returns 409.
11. **POST /api/v1/auth/register** with an invalid BTC address format returns 400.
12. **POST /api/v1/auth/login** with valid email + password returns tokens with `auth_method: "email"`.
13. **POST /api/v1/auth/login** with wrong password returns 401 "Invalid email or password" (no enumeration).
14. **POST /api/v1/auth/login** with nonexistent email returns 401 with the same error message as wrong password.
15. **POST /api/v1/auth/login** returns 429 after 10 failed attempts for the same account within 15 minutes.
16. **POST /api/v1/auth/verify-email** with a valid token sets `email_verified = TRUE`.
17. **POST /api/v1/auth/verify-email** with an expired or used token returns 400.
18. **POST /api/v1/auth/resend-verification** sends a new verification email (rate limited to 1 per 5 minutes).
19. **POST /api/v1/auth/forgot-password** always returns 200 (no email enumeration). Sends reset email if email exists.
20. **POST /api/v1/auth/reset-password** with a valid token changes the password and revokes all sessions.
21. **POST /api/v1/auth/reset-password** with an expired or used token returns 400.
22. **POST /api/v1/auth/change-password** changes the password, revokes other sessions, and sends a notification email.
23. **POST /api/v1/auth/change-password** rejects wallet-auth users with 400.
24. **POST /api/v1/auth/refresh** rotates the refresh token (old one is revoked, new one issued). Works for both auth methods.
25. **POST /api/v1/auth/logout** revokes the refresh token. Subsequent use returns 401.
26. **POST /api/v1/auth/logout-all** revokes all refresh tokens for the user.
27. **GET /api/v1/users/me** returns the user profile when authenticated. Returns 401 without auth. Includes `auth_method`, `email` (if email user), `email_verified`, and `btc_address`.
28. **PATCH /api/v1/users/me** updates display name, avatar, bio, country code. Display name uniqueness is case-insensitive.
29. **PATCH /api/v1/users/me/wallet** updates the BTC wallet address after format validation. Returns a warning about mining reconnection.
30. **PATCH /api/v1/users/me/settings** deep-merges JSONB settings (changing one field does not reset others).
31. **POST /api/v1/users/me/api-keys** returns the full key once. Subsequent **GET** shows prefix only.
32. **DELETE /api/v1/users/me/api-keys/{id}** revokes the key.
33. **Alembic migration 002** successfully adds auth columns to `users` (including `email`, `password_hash`, `auth_method`, `email_verified`) and creates `refresh_tokens`, `api_keys`, `user_settings`, `email_verification_tokens`, `password_reset_tokens` tables.
34. Email service successfully sends emails through the configured provider with rate limiting (5 per address per hour).
35. All 4 email templates (welcome, verify_email, password_reset, password_changed) render correctly with HTML and plain text fallbacks.
36. All pytest tests pass with **90%+ coverage on auth module** and **85%+ on users module**.
37. `mypy --strict` passes with zero errors across all new files.

---

## Order of Implementation

### Week 1 — Bitcoin Auth Core + Password Module

1. **Generate RSA key pair** — Create `services/api/keys/` with `jwt_private.pem` and `jwt_public.pem`. Add to `.gitignore`. Update Docker Compose to mount keys.
2. **Configuration updates** — Add ALL new settings to `config.py` (JWT, auth, email, password). Test that keys are loadable.
3. **Bech32/Bech32m decoder** — Create `_bech32.py` with encode/decode. Test with known BIP173/BIP350 test vectors.
4. **Bitcoin signature verification** — Create `bitcoin.py`. Write unit tests for address detection, message hash, and P2PKH verification using known test vectors.
5. **Address validation module** — Create `address_validation.py` with `validate_btc_address()` and `get_address_type()`. Write unit tests.
6. **Password module** — Create `password.py` with hash, verify, strength validation. Write ALL `TestPasswordHashing` tests.
7. **JWT module** — Create `jwt.py` with `auth_method` claim. Write ALL `TestAccessToken` and `TestRefreshToken` tests.
8. **Alembic migration 002** — Create the migration with ALL tables (users extension, refresh_tokens, api_keys, user_settings, email_verification_tokens, password_reset_tokens). Run `alembic upgrade head`. Verify.
9. **SQLAlchemy models update** — Add all new models and extend `User` with email, password_hash, auth_method, email_verified columns.

### Week 2 — Auth Flows (Wallet + Email)

10. **Auth service** — Create `auth/service.py` with `store_refresh_token`, `rotate_refresh_token`, `revoke_refresh_token`, `get_or_create_user`, `register_email_user`, `authenticate_email_user`, account lockout functions.
11. **Auth router (wallet)** — Implement challenge, verify, refresh, logout, logout-all endpoints. Register in `main.py` under `/api/v1`.
12. **Auth router (email)** — Implement register, login, verify-email, resend-verification endpoints in the same router.
13. **Auth dependencies** — Create `get_current_user` and `get_current_email_user`. Write test that protected endpoint returns 401 without token.
14. **Write ALL wallet auth flow integration tests.**
15. **Write ALL email registration and login tests.**
16. **Write ALL account lockout tests.**

### Week 3 — Email Service + Password Recovery

17. **Email service** — Create `email/service.py` with provider abstraction (SMTP at minimum). Implement rate limiting.
18. **Email templates** — Create `email/templates.py` with all 4 templates. Write template tests.
19. **Password reset flow** — Implement forgot-password and reset-password endpoints. Write ALL `TestPasswordReset` tests.
20. **Email verification flow** — Implement verify-email and resend-verification. Write ALL `TestEmailVerification` tests.
21. **Change password flow** — Implement change-password endpoint. Write ALL `TestChangePassword` tests.
22. **Write ALL email service tests.**

### Week 4 — User Management, API Keys & Polish

23. **User service and router** — Create profile CRUD and settings CRUD. Register under `/api/v1`.
24. **Wallet management** — Implement PATCH /users/me/wallet. Write ALL `TestWalletManagement` tests.
25. **API key module** — Create `api_keys.py` with generate/verify. Create CRUD endpoints. Write ALL API key tests.
26. **`authed_client` and `authed_email_client` fixtures** — Create conftest fixtures for both auth methods.
27. **Cross-auth integration tests** — Write tests verifying both auth methods work through refresh, logout, profile, etc.
28. **Profile & settings tests** — Write ALL profile and settings tests.
29. **Token cleanup background task** — Implement expired token cleanup (runs hourly).
30. **Full verification** — `docker compose up --build`. Test all 21 endpoints manually via Swagger UI. Run full test suite. Verify 90%+ coverage. Verify mypy passes.

**Critical dependency chain:**
- Steps 1-5 (config, bech32, bitcoin, address validation) can run in parallel.
- Step 6 (password module) and Step 7 (JWT module) can run in parallel.
- Step 8 (migration) and Step 9 (models) MUST complete before Step 10 (auth service).
- Step 10 (auth service) MUST complete before Steps 11-13 (router and dependencies).
- Step 17 (email service) MUST complete before Steps 19-21 (password reset, verification, change password).
- Steps 23-25 (user management, wallet, API keys) can run in parallel after Steps 10-13.
