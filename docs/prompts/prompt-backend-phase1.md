# Prompt: Backend Service — Phase 1 (Authentication & User Management)

You are continuing to build the backend API service for **The Bitcoin Game** — a Bitcoin mining gamification platform. Phase 0 is complete: the FastAPI project at `services/api/` is running in Docker Compose alongside ckpool, Redis, and TimescaleDB. The middleware stack (CORS, rate limiting, request ID, error handling, structured logging) is working. Health endpoints pass. Alembic is configured with a baseline migration. The existing database has the `users` table with columns: `id`, `btc_address`, `display_name`, `country_code`, `created_at`, `last_seen`, `is_verified`.

This phase implements the entire authentication system using Bitcoin message signing — no passwords, no emails, no OAuth. Users prove they own a Bitcoin address by signing a challenge message with their private key. The server verifies the signature, auto-creates the user on first login, and issues RS256 JWT tokens. This phase also builds user profile CRUD, user settings, and API key management.

---

## IMPORTANT CONSTRAINTS

1. **Phase 0 is already complete.** The FastAPI app is running. Docker Compose works. Middleware is configured. Health endpoints respond. Do NOT recreate any Phase 0 infrastructure.
2. **Do not touch `dashboard/`** — the frontend is complete. Do not modify anything in the dashboard directory.
3. **Do not touch `services/ckpool/` or `services/event-collector/`** — they are working. Only modify `services/api/` and `services/docker-compose.yml`.
4. **Bitcoin message signing is the ONLY auth method.** No passwords, no OAuth, no magic links, no email verification. A Bitcoin signature IS the identity proof.
5. **RS256 JWT only.** Not HS256. Asymmetric signing means the public key can verify tokens without the private key — essential for microservices.
6. **Generate RSA key pair during development.** The keys go in `services/api/keys/` (gitignored). Docker Compose mounts them as a volume. Production will use secrets management.
7. **coincurve for secp256k1 operations.** Not python-bitcoinlib, not ecdsa library. coincurve wraps libsecp256k1 (the same library Bitcoin Core uses).
8. **mypy strict with zero errors.** Every function annotated. No `Any` types.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Sections 4.1 (Authentication Flow), 5 (Database Schema — Auth Tables), 6 (API Design — Authentication + Users endpoints), 10 (Security). These are your primary references.
2. `docs/backend-service/roadmap/phase-01-authentication.md` — **The detailed specification for Phase 1.** Contains complete code for bitcoin.py, jwt.py, auth router, user router, API key module, database schema, test vectors, and test code. Read it cover to cover.
3. `docs/backend-service/roadmap/phase-00-foundation.md` — Phase 0 deliverables, especially the middleware and database modules you will build on.
4. `services/api/src/tbg/config.py` — Current configuration. You will add JWT and auth-related settings.
5. `services/api/src/tbg/database.py` — Database module. You will use `get_session` dependency.
6. `services/api/src/tbg/redis_client.py` — Redis module. You will use `get_redis()` for nonce storage.
7. `services/api/src/tbg/db/models.py` — Existing SQLAlchemy models. You will extend `User` and add new models.
8. `services/event-collector/sql/init.sql` — Existing schema. Your Alembic migration adds columns and tables.

Read ALL of these before writing any code.

---

## What You Are Building

### Part 1: Bitcoin Message Signing Verification

Create `src/tbg/auth/bitcoin.py` — the core signature verification module. This is the heart of the auth system.

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

See `docs/backend-service/roadmap/phase-01-authentication.md` Section 1.3 for the complete implementation.

### Part 2: JWT Token Management

Create `src/tbg/auth/jwt.py` — RS256 JWT token creation and verification.

**Token types:**

| Type | Lifetime | Contains | Storage |
|---|---|---|---|
| Access token | 1 hour | `sub` (user_id), `address` (btc_address), `type: "access"` | Client only (Authorization header) |
| Refresh token | 7 days | `sub`, `address`, `jti` (unique ID), `type: "refresh"` | DB (token_hash) + client |

**Key functions:**

```python
def create_access_token(user_id: int, btc_address: str) -> str:
    """Create RS256 JWT with 1h expiry."""

def create_refresh_token(user_id: int, btc_address: str, token_id: str) -> str:
    """Create RS256 JWT with 7d expiry and jti claim."""

def verify_token(token: str, expected_type: str = "access") -> dict:
    """Verify JWT signature, expiry, and type. Raises on invalid."""
```

**RSA key pair generation (dev setup):**

```bash
mkdir -p services/api/keys
openssl genrsa -out services/api/keys/jwt_private.pem 2048
openssl rsa -in services/api/keys/jwt_private.pem -pubout -out services/api/keys/jwt_public.pem
echo "keys/" >> services/api/.gitignore
```

Add `jwt_private_key_path` and `jwt_public_key_path` to the Settings class. Docker Compose mounts `./api/keys:/app/keys:ro`.

### Part 3: Challenge-Response Authentication Flow

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
- Auto-create user if new (`get_or_create_user`)
- Issue access token (1h) + refresh token (7d)
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

### Part 4: Auth Dependencies

Create `src/tbg/auth/dependencies.py`:

```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(HTTPBearer()),
    db: AsyncSession = Depends(get_session),
) -> User:
    """Extract and verify JWT, return User model. Raises 401/403."""
    payload = verify_token(credentials.credentials, expected_type="access")
    user = await get_user_by_id(db, int(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Account is banned")
    return user
```

This dependency is used by EVERY protected endpoint in all subsequent phases.

### Part 5: Database Schema (Alembic Migration 002)

Create `alembic/versions/002_auth_tables.py` that:

1. **Extends `users` table** — add columns: `display_name_normalized` (VARCHAR 64), `avatar_url` (TEXT), `bio` (VARCHAR 280), `is_banned` (BOOLEAN DEFAULT FALSE), `last_login` (TIMESTAMPTZ), `login_count` (INTEGER DEFAULT 0). Add unique index on `display_name_normalized` where not null. Add trigger to auto-normalize display_name to lowercase.

2. **Creates `refresh_tokens` table** — `id` (UUID PK), `user_id` (FK users), `token_hash` (VARCHAR 128), `issued_at`, `expires_at`, `revoked_at`, `ip_address` (INET), `user_agent` (VARCHAR 512), `is_revoked` (BOOLEAN DEFAULT FALSE), `replaced_by` (UUID FK self).

3. **Creates `api_keys` table** — `id` (UUID PK), `user_id` (FK users), `key_prefix` (VARCHAR 16), `key_hash` (VARCHAR 256, argon2), `name` (VARCHAR 128), `permissions` (JSONB DEFAULT '["read"]'), `last_used_at`, `created_at`, `expires_at`, `is_revoked` (BOOLEAN), `revoked_at`.

4. **Creates `user_settings` table** — `user_id` (PK, FK users), `notifications` (JSONB), `privacy` (JSONB), `mining` (JSONB), `sound` (JSONB), `updated_at` (TIMESTAMPTZ with auto-update trigger).

See `docs/backend-service/roadmap/phase-01-authentication.md` Sections 1.5.1 through 1.5.4 for the complete SQL.

### Part 6: User Profile CRUD

Create `src/tbg/users/router.py` with these endpoints:

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/users/me` | Get own full profile | Yes |
| PATCH | `/api/v1/users/me` | Update profile (display_name, avatar_url, bio, country_code) | Yes |
| GET | `/api/v1/users/me/settings` | Get settings (notifications, privacy, mining, sound) | Yes |
| PATCH | `/api/v1/users/me/settings` | Deep-merge update settings (JSONB) | Yes |
| POST | `/api/v1/users/me/api-keys` | Create API key (returns full key ONCE) | Yes |
| GET | `/api/v1/users/me/api-keys` | List API keys (prefix only, never full key) | Yes |
| DELETE | `/api/v1/users/me/api-keys/{id}` | Revoke API key | Yes |
| GET | `/api/v1/users/{btc_address}` | Get public profile (respects privacy settings) | No |

**Display name uniqueness:** Case-insensitive via `display_name_normalized` column. Trigger auto-lowercases. "SatoshiHunter" and "satoshihunter" cannot both exist.

**Settings deep merge:** When updating `{"notifications": {"email_enabled": true}}`, only the `email_enabled` field changes — all other notification fields remain unchanged. Use PostgreSQL `jsonb_deep_merge` or application-level merge.

### Part 7: API Key Management

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

### Part 8: Configuration Updates

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

# Rate limits (override per endpoint group in Phase 1)
rate_limit_auth: int = 5  # per minute
```

---

## Testing Requirements

These tests are **NON-NEGOTIABLE**. Every test must pass before Phase 1 is complete.

### Bitcoin Signature Tests (`tests/auth/test_bitcoin.py`)

```python
class TestAddressDetection:
    def test_p2pkh(self): ...           # "1A1zP1..." -> AddressType.P2PKH
    def test_p2wpkh(self): ...          # "bc1qw508d6..." -> AddressType.P2WPKH
    def test_p2tr(self): ...            # "bc1p5cyxn..." -> AddressType.P2TR
    def test_testnet_p2wpkh(self): ...  # "tb1q..." -> AddressType.P2WPKH
    def test_testnet_p2tr(self): ...    # "tb1p..." -> AddressType.P2TR
    def test_unsupported(self): ...     # "3J98t1..." -> ValueError

class TestMessageHash:
    def test_deterministic(self): ...   # Same message -> same hash
    def test_different_messages(self): ...  # Different messages -> different hashes
    def test_hash_length(self): ...     # Output is 32 bytes (SHA256)

class TestSignatureVerification:
    # Use known test vectors from bitcoin-core signmessage RPC
    def test_valid_p2pkh_signature(self): ...
    def test_wrong_message_rejects(self): ...
    def test_invalid_signature_length_rejects(self): ...
    def test_malformed_base64_rejects(self): ...
```

### JWT Tests (`tests/auth/test_jwt.py`)

```python
class TestAccessToken:
    def test_create_and_verify(self): ...      # Roundtrip works
    def test_expired_token_rejected(self): ...  # Use freezegun to simulate expiry
    def test_wrong_type_rejected(self): ...    # Refresh token rejected as access

class TestRefreshToken:
    def test_create_includes_jti(self): ...
    def test_verify_with_correct_type(self): ...
    def test_access_rejected_as_refresh(self): ...
```

### Auth Flow Integration Tests (`tests/auth/test_auth_flow.py`)

```python
async def test_challenge_returns_nonce(client): ...
async def test_challenge_stores_nonce_in_redis(client, redis_client): ...
async def test_duplicate_challenge_replaces_nonce(client): ...
async def test_verify_with_expired_nonce_fails(client): ...
async def test_verify_with_wrong_nonce_fails(client, redis_client): ...
async def test_verify_with_invalid_signature_fails(client, redis_client): ...
async def test_refresh_token_rotation(authed_client): ...
async def test_revoked_refresh_token_rejected(authed_client): ...
async def test_logout_revokes_token(authed_client): ...
async def test_logout_all_revokes_all(authed_client): ...
async def test_banned_user_gets_403(authed_client, db_session): ...
```

### Profile & Settings Tests (`tests/users/test_profile.py`)

```python
async def test_get_profile_unauthorized(client): ...
async def test_get_profile_authorized(authed_client): ...
async def test_update_display_name(authed_client): ...
async def test_display_name_case_insensitive_unique(authed_client, second_authed_client): ...
async def test_settings_deep_merge(authed_client): ...
async def test_public_profile_respects_privacy(client, authed_client): ...
```

### API Key Tests (`tests/auth/test_api_keys.py`)

```python
async def test_create_api_key_returns_full_key(authed_client): ...
async def test_list_api_keys_shows_prefix_only(authed_client): ...
async def test_revoke_api_key(authed_client): ...
async def test_revoked_key_not_listed(authed_client): ...
async def test_key_prefix_format(authed_client): ...  # "sk-tbg-..."
```

### Coverage Target: **90%+** on auth module, **85%+** on users module.

---

## Rules

1. **Read the Phase 1 roadmap first.** `docs/backend-service/roadmap/phase-01-authentication.md` contains complete code for every module. Adapt it to match the Phase 0 code structure.
2. **No passwords, no OAuth.** Bitcoin message signing is the ONLY authentication method. Period.
3. **coincurve is the secp256k1 library.** Not ecdsa, not python-bitcoinlib. coincurve wraps the same C library Bitcoin Core uses.
4. **RS256 JWT only.** Asymmetric signing. Private key signs, public key verifies. Generate a dev key pair during setup.
5. **Refresh token rotation.** When a refresh token is used, the old one is revoked and a new one is issued. If someone tries to use a revoked token, revoke ALL tokens for that user (compromise detection).
6. **Auto-create users on first auth.** Zero friction. No registration form. Sign a message, you have an account.
7. **API key secrets are NEVER logged.** Only store the argon2 hash. Only show the prefix in listings. The full key is returned once at creation.
8. **All auth endpoints under `/api/v1/auth/`.** All user endpoints under `/api/v1/users/`.
9. **Use Alembic for ALL schema changes.** Never modify init.sql. Migration 002 adds auth tables and extends users.
10. **Test with real crypto.** Generate a test Bitcoin key pair in conftest.py, sign actual messages, verify them. Do not mock the crypto.
11. **Rate limit auth endpoints stricter.** 5 requests/minute to `/auth/challenge` and `/auth/verify` per IP (configurable).
12. **Include `authed_client` fixture.** Create a pytest fixture that returns an `AsyncClient` with a valid JWT in the `Authorization: Bearer` header, for use in all subsequent phase tests.

---

## Files to Create/Edit

| Action | File |
|---|---|
| CREATE | `services/api/src/tbg/auth/__init__.py` |
| CREATE | `services/api/src/tbg/auth/bitcoin.py` |
| CREATE | `services/api/src/tbg/auth/_bech32.py` |
| CREATE | `services/api/src/tbg/auth/jwt.py` |
| CREATE | `services/api/src/tbg/auth/router.py` |
| CREATE | `services/api/src/tbg/auth/dependencies.py` |
| CREATE | `services/api/src/tbg/auth/service.py` |
| CREATE | `services/api/src/tbg/auth/api_keys.py` |
| CREATE | `services/api/src/tbg/auth/schemas.py` |
| CREATE | `services/api/src/tbg/users/__init__.py` |
| CREATE | `services/api/src/tbg/users/router.py` |
| CREATE | `services/api/src/tbg/users/service.py` |
| CREATE | `services/api/src/tbg/users/schemas.py` |
| CREATE | `services/api/alembic/versions/002_auth_tables.py` |
| CREATE | `services/api/keys/.gitkeep` |
| CREATE | `services/api/.gitignore` |
| CREATE | `services/api/tests/auth/__init__.py` |
| CREATE | `services/api/tests/auth/test_bitcoin.py` |
| CREATE | `services/api/tests/auth/test_jwt.py` |
| CREATE | `services/api/tests/auth/test_auth_flow.py` |
| CREATE | `services/api/tests/auth/test_api_keys.py` |
| CREATE | `services/api/tests/users/__init__.py` |
| CREATE | `services/api/tests/users/test_profile.py` |
| EDIT | `services/api/src/tbg/config.py` |
| EDIT | `services/api/src/tbg/main.py` |
| EDIT | `services/api/src/tbg/db/models.py` |
| EDIT | `services/api/tests/conftest.py` |
| EDIT | `services/docker-compose.yml` |

---

## Definition of Done

1. **POST /api/v1/auth/challenge** returns a nonce and human-readable challenge message containing the Bitcoin address.
2. **POST /api/v1/auth/verify** with a valid P2WPKH (bc1q...) signature returns access + refresh tokens and auto-creates the user.
3. **POST /api/v1/auth/verify** with a valid P2TR (bc1p...) signature works identically (Schnorr/BIP-340).
4. **POST /api/v1/auth/verify** with a valid P2PKH (1...) signature works identically (legacy ECDSA).
5. **POST /api/v1/auth/verify** with an invalid signature returns 401.
6. **POST /api/v1/auth/verify** with an expired nonce returns 400.
7. **POST /api/v1/auth/refresh** rotates the refresh token (old one is revoked, new one issued).
8. **POST /api/v1/auth/logout** revokes the refresh token. Subsequent use returns 401.
9. **GET /api/v1/users/me** returns the user profile when authenticated. Returns 401 without auth.
10. **PATCH /api/v1/users/me** updates display name, avatar, bio, country code. Display name uniqueness is case-insensitive.
11. **PATCH /api/v1/users/me/settings** deep-merges JSONB settings (changing one field does not reset others).
12. **POST /api/v1/users/me/api-keys** returns the full key once. Subsequent **GET** shows prefix only.
13. **DELETE /api/v1/users/me/api-keys/{id}** revokes the key.
14. **Alembic migration 002** successfully adds auth columns to `users` and creates `refresh_tokens`, `api_keys`, `user_settings` tables.
15. All pytest tests pass with 90%+ coverage on auth module and 85%+ on users module.

---

## Order of Implementation

1. **Generate RSA key pair** — Create `services/api/keys/` with `jwt_private.pem` and `jwt_public.pem`. Add to `.gitignore`. Update Docker Compose to mount keys.
2. **Configuration updates** — Add JWT and auth settings to `config.py`. Test that keys are loadable.
3. **Bech32/Bech32m decoder** — Create `_bech32.py` with encode/decode. Test with known BIP173/BIP350 test vectors.
4. **Bitcoin signature verification** — Create `bitcoin.py`. Write unit tests for address detection, message hash, and P2PKH verification using known test vectors.
5. **JWT module** — Create `jwt.py`. Write unit tests for create/verify roundtrip, expiry, type checking.
6. **Alembic migration 002** — Create the migration. Run `alembic upgrade head`. Verify columns and tables exist.
7. **SQLAlchemy models update** — Add `RefreshToken`, `ApiKey`, `UserSettings` models. Extend `User` with new columns.
8. **Auth service** — Create `auth/service.py` with `store_refresh_token`, `rotate_refresh_token`, `revoke_refresh_token`, `get_or_create_user`.
9. **Auth router** — Create `auth/router.py` with challenge, verify, refresh, logout, logout-all. Register in `main.py` under `/api/v1`.
10. **Auth dependencies** — Create `get_current_user` dependency. Write test that protected endpoint returns 401 without token.
11. **User service and router** — Create profile CRUD and settings CRUD. Register under `/api/v1`.
12. **API key module** — Create `api_keys.py` with generate/verify. Create CRUD endpoints.
13. **`authed_client` fixture** — Create a conftest fixture that generates a test key pair, signs a challenge, and returns an AsyncClient with valid JWT.
14. **Integration tests** — Write all auth flow, profile, settings, and API key tests.
15. **Full verification** — `docker compose up --build`. Test all 13 endpoints manually via Swagger UI. Run full test suite.

**Critical: Get step 5 (JWT module) working before building the auth router. Step 4 (Bitcoin verification) can be done in parallel with step 5, but step 9 (auth router) depends on both.**
