#!/bin/bash
# TheBitcoinGame CKPool — Production Entrypoint
# GPLv3 — Based on ckpool by Con Kolivas
#
# This script:
#   1. Substitutes environment variables in the config template
#   2. Cleans stale PID files from previous runs
#   3. Execs ckpool with the provided flags

set -euo pipefail

# ---------------------------------------------------------------------------
# 1. Substitute secrets into config file from environment variables
# ---------------------------------------------------------------------------
CONFIG_TEMPLATE="/etc/ckpool/ckpool-mainnet.conf.template"
CONFIG_OUTPUT="/etc/ckpool/ckpool-mainnet.conf"

if [ -f "${CONFIG_TEMPLATE}" ]; then
    envsubst '${BITCOIN_RPC_USER} ${BITCOIN_RPC_PASS}' \
        < "${CONFIG_TEMPLATE}" \
        > "${CONFIG_OUTPUT}"
    echo "[entrypoint] Config file generated from template."
else
    echo "[entrypoint] No config template found, using existing config."
fi

# ---------------------------------------------------------------------------
# 2. Clean stale PID files from previous container runs
# ---------------------------------------------------------------------------
PID_DIR="/var/run/ckpool"
if [ -d "${PID_DIR}" ]; then
    for pidfile in "${PID_DIR}"/*.pid; do
        if [ -f "${pidfile}" ]; then
            echo "[entrypoint] Removing stale PID file: ${pidfile}"
            rm -f "${pidfile}"
        fi
    done
fi

# ---------------------------------------------------------------------------
# 3. Log startup info
# ---------------------------------------------------------------------------
echo "[entrypoint] Starting ckpool (TheBitcoinGame production)"
echo "[entrypoint] Arguments: $*"
echo "[entrypoint] PID: $$"

# ---------------------------------------------------------------------------
# 4. Exec ckpool — replaces this shell process (PID 1)
#    This ensures SIGTERM from Docker is delivered directly to ckpool
# ---------------------------------------------------------------------------
exec ckpool "$@"
