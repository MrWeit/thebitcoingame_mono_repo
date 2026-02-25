#!/bin/sh
# regtest-init.sh — Bootstrap regtest: create wallet + mine 101 maturity blocks
# Runs once on fresh start. Idempotent (skips if wallet already exists).

set -e

RPC_ARGS="-regtest -rpcuser=tbg -rpcpassword=tbgdev2026 -rpcconnect=bitcoin-regtest -rpcport=18443"
CLI="bitcoin-cli $RPC_ARGS"
CLI_WALLET="bitcoin-cli $RPC_ARGS -rpcwallet=default"

echo "[regtest-init] Waiting for bitcoind to be ready..."
i=0
while [ $i -lt 60 ]; do
    if $CLI getblockchaininfo > /dev/null 2>&1; then
        echo "[regtest-init] bitcoind is ready."
        break
    fi
    i=$((i + 1))
    echo "[regtest-init] Attempt $i/60 — waiting..."
    sleep 2
done

if ! $CLI getblockchaininfo > /dev/null 2>&1; then
    echo "[regtest-init] ERROR: bitcoind not reachable after 120s"
    exit 1
fi

# Create or load default wallet
if $CLI listwallets 2>/dev/null | grep -q "default"; then
    echo "[regtest-init] Wallet 'default' already loaded."
else
    # Try to create; if already exists on disk, load it
    if $CLI createwallet "default" > /dev/null 2>&1; then
        echo "[regtest-init] Wallet 'default' created."
    elif $CLI loadwallet "default" > /dev/null 2>&1; then
        echo "[regtest-init] Wallet 'default' loaded from disk."
    else
        echo "[regtest-init] ERROR: Could not create or load wallet."
        exit 1
    fi
fi

# Verify wallet is accessible
if ! $CLI_WALLET getwalletinfo > /dev/null 2>&1; then
    echo "[regtest-init] ERROR: wallet 'default' not accessible"
    exit 1
fi

# Get current block height
HEIGHT=$($CLI getblockcount)
echo "[regtest-init] Current block height: $HEIGHT"

# Generate maturity blocks if height < 101
if [ "$HEIGHT" -lt 101 ]; then
    NEEDED=$((101 - HEIGHT))
    echo "[regtest-init] Generating $NEEDED maturity blocks..."
    ADDRESS=$($CLI_WALLET getnewaddress "" "legacy")
    echo "[regtest-init] Mining to address: $ADDRESS"
    $CLI_WALLET generatetoaddress $NEEDED "$ADDRESS" > /dev/null
    NEW_HEIGHT=$($CLI getblockcount)
    echo "[regtest-init] Done. New height: $NEW_HEIGHT"
else
    echo "[regtest-init] Already at height $HEIGHT, no maturity blocks needed."
fi

echo "[regtest-init] Bootstrap complete. CKPool can now request block templates."
