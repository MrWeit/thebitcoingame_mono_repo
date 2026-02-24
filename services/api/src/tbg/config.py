"""Application settings via pydantic-settings."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables with TBG_ prefix."""

    model_config = SettingsConfigDict(
        env_prefix="TBG_",
        env_file=".env",
        case_sensitive=False,
    )

    # --- Core ---
    app_version: str = "0.1.0"
    debug: bool = False
    environment: str = "development"
    database_url: str = "postgresql+asyncpg://tbg:tbgdev2026@localhost:5432/thebitcoingame"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    rate_limit_requests: int = 100
    rate_limit_window_seconds: int = 60
    log_level: str = "INFO"
    log_format: str = "json"

    # --- JWT ---
    jwt_private_key_path: str = "keys/jwt_private.pem"
    jwt_public_key_path: str = "keys/jwt_public.pem"
    jwt_algorithm: str = "RS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 7
    jwt_issuer: str = "thebitcoingame.com"

    # --- Bitcoin auth ---
    btc_network: str = "signet"
    btc_challenge_expire_seconds: int = 300

    # --- Email auth / Password ---
    password_min_length: int = 8
    password_max_length: int = 128
    account_lockout_threshold: int = 10
    account_lockout_duration_minutes: int = 15

    # --- Email service ---
    email_provider: str = "smtp"
    email_from_address: str = "noreply@thebitcoingame.com"
    email_from_name: str = "The Bitcoin Game"
    support_email: str = "support@thebitcoingame.com"
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    resend_api_key: str = ""
    ses_region: str = "us-east-1"
    ses_access_key: str = ""
    ses_secret_key: str = ""
    email_rate_limit_per_hour: int = 5
    email_verification_token_ttl_hours: int = 24
    password_reset_token_ttl_minutes: int = 60
    frontend_base_url: str = "https://thebitcoingame.com"

    # --- Rate limits (per endpoint group) ---
    rate_limit_auth: int = 5

    # --- Mining / Stream Consumer ---
    redis_stream_consumer_name: str = "api-worker-1"
    worker_timeout_seconds: int = 600  # 10 minutes
    hashrate_snapshot_interval_seconds: int = 300  # 5 minutes
    arq_redis_url: str = "redis://localhost:6379/0"

    # --- WebSocket ---
    ws_heartbeat_interval_seconds: int = 30
    ws_max_connections_per_user: int = 5

    # --- Dashboard ---
    dashboard_cache_ttl_seconds: int = 10
    activity_feed_max_items: int = 10_000
    activity_feed_prune_interval_hours: int = 1


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()
