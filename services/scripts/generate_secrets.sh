#!/bin/bash
# TheBitcoinGame — Production Secrets Generator
# Generates cryptographically random passwords for all services.
#
# Usage:
#   ./generate_secrets.sh                   # Print to stdout
#   ./generate_secrets.sh > .env.production # Write to file
#
# Each password is 64 hex characters (256 bits of entropy) from openssl.

set -euo pipefail

# Generate a random 64-character hex password
generate_password() {
    openssl rand -hex 32
}

BITCOIN_RPC_USER="tbg_rpc_$(openssl rand -hex 4)"
BITCOIN_RPC_PASS="$(generate_password)"
POSTGRES_USER="tbg_db_$(openssl rand -hex 4)"
POSTGRES_PASSWORD="$(generate_password)"
REDIS_PASSWORD="$(generate_password)"
GRAFANA_ADMIN_PASSWORD="$(generate_password)"

cat <<EOF
# TheBitcoinGame — Production Environment Variables
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Generator: generate_secrets.sh
#
# SECURITY: Do NOT commit this file to version control.
# Store a backup in a secure password manager or vault.

# ---------------------------------------------------------------------------
# Bitcoin Core RPC
# ---------------------------------------------------------------------------
BITCOIN_RPC_USER=${BITCOIN_RPC_USER}
BITCOIN_RPC_PASS=${BITCOIN_RPC_PASS}

# ---------------------------------------------------------------------------
# PostgreSQL / TimescaleDB
# ---------------------------------------------------------------------------
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------
REDIS_PASSWORD=${REDIS_PASSWORD}

# ---------------------------------------------------------------------------
# Grafana
# ---------------------------------------------------------------------------
GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
EOF

# If writing to a file, set restrictive permissions
if [ ! -t 1 ]; then
    # stdout is redirected to a file — we can't chmod the redirect target
    # from here, so print a reminder to stderr
    echo "[generate_secrets] Reminder: run 'chmod 600 .env.production' to restrict access." >&2
fi
