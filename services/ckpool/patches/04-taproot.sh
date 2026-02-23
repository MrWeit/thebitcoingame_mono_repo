#!/bin/bash
# 04-taproot.sh — Taproot (bc1p/bech32m) address support
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# Key insight: The existing segaddress_to_txn() already handles witness v1+
# correctly. bech32_decode() doesn't verify checksums so bc1p works.
# This patch adds proper bech32m checksum verification (BIP350).

echo "=== Patch 04: Taproot Address Support ==="

LIBCKPOOL="${CKPOOL_DIR}/src/libckpool.c"
LIBCKPOOL_H="${CKPOOL_DIR}/src/libckpool.h"

if [ ! -f "${LIBCKPOOL}" ]; then
    echo "  FATAL: ${LIBCKPOOL} not found"; exit 1
fi

# ─── Add bech32m checksum verification to libckpool.c ─────────────────
echo "  Adding bech32m polymod verification..."
if ! grep -q "BECH32M_CONST" "${LIBCKPOOL}"; then
    # Write bech32m verification code to temp file
    cat > /tmp/tbg_bech32m.c << 'BECH32MEOF'

/* ======================================================================
 * THE BITCOIN GAME: Bech32m checksum verification (BIP350)
 * Adds proper checksum validation for Taproot (bc1p) addresses.
 * GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
 * ====================================================================== */
#define BECH32_CONST  1
#define BECH32M_CONST 0x2bc830a3

static uint32_t bech32_polymod_step(uint32_t pre) {
	uint8_t b = pre >> 25;
	return ((pre & 0x1ffffff) << 5) ^
		(-((b >> 0) & 1) & 0x3b6a57b2UL) ^
		(-((b >> 1) & 1) & 0x26508e6dUL) ^
		(-((b >> 2) & 1) & 0x1ea119faUL) ^
		(-((b >> 3) & 1) & 0x3d4233ddUL) ^
		(-((b >> 4) & 1) & 0x2a1462b3UL);
}

/* Verify bech32/bech32m checksum. Returns the encoding constant (1 for
 * bech32, 0x2bc830a3 for bech32m) on success, or 0 on failure. */
static uint32_t tbg_bech32_verify_checksum(const char *addr) {
	uint32_t chk = 1;
	int addr_len = strlen(addr);
	int sep_pos = -1;
	int i;

	/* Find the separator '1' (last occurrence) */
	for (i = addr_len - 1; i >= 0; i--) {
		if (addr[i] == '1') {
			sep_pos = i;
			break;
		}
	}
	if (sep_pos < 1 || sep_pos + 7 > addr_len)
		return 0;

	/* Expand HRP into polymod */
	for (i = 0; i < sep_pos; i++)
		chk = bech32_polymod_step(chk) ^ (addr[i] >> 5);
	chk = bech32_polymod_step(chk);
	for (i = 0; i < sep_pos; i++)
		chk = bech32_polymod_step(chk) ^ (addr[i] & 0x1f);

	/* Process data part (including checksum) */
	for (i = sep_pos + 1; i < addr_len; i++) {
		int c = addr[i];
		int v = (c & 0x80) ? -1 : charset_rev[c];
		if (v == -1) return 0;
		chk = bech32_polymod_step(chk) ^ v;
	}
	return chk;
}

/* Verify a bech32 address checksum and return witness version, or -1 on failure.
 * For witness v0: expects bech32 encoding (constant 1)
 * For witness v1+: expects bech32m encoding (constant 0x2bc830a3) */
static int tbg_verify_bech32_address(const char *addr) {
	uint32_t check;
	int sep_pos, addr_len, data_val;

	if (!addr || strlen(addr) < 8)
		return -1;

	addr_len = strlen(addr);
	check = tbg_bech32_verify_checksum(addr);
	if (check == 0)
		return -1;

	/* Find separator to get first data value (witness version) */
	for (sep_pos = addr_len - 1; sep_pos >= 0; sep_pos--)
		if (addr[sep_pos] == '1') break;

	data_val = charset_rev[(int)addr[sep_pos + 1]];
	if (data_val < 0 || data_val > 16)
		return -1;

	/* Witness v0 must use bech32, v1+ must use bech32m */
	if (data_val == 0 && check != BECH32_CONST)
		return -1;
	if (data_val > 0 && check != BECH32M_CONST)
		return -1;

	return data_val;
}

/* === THE BITCOIN GAME: End of bech32m verification === */

BECH32MEOF

    # Insert before the existing bech32_decode function
    LINE=$(getline "static void bech32_decode" "${LIBCKPOOL}")
    if [ -n "${LINE}" ]; then
        sedi "$((LINE - 1))r /tmp/tbg_bech32m.c" "${LIBCKPOOL}"
        echo "    Bech32m verification code inserted at line $((LINE - 1))"
    else
        echo "    FATAL: bech32_decode not found in libckpool.c"; exit 1
    fi
    rm -f /tmp/tbg_bech32m.c
else
    echo "    Already patched"
fi

# ─── Add checksum verification to segaddress_to_txn ──────────────────
echo "  Adding checksum verification to segaddress_to_txn..."
if ! grep -q "tbg_verify_bech32_address" "${LIBCKPOOL}"; then
    # Find segaddress_to_txn and add verification before bech32_decode call
    LINE=$(getline "bech32_decode(data, &data_len, addr);" "${LIBCKPOOL}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
\t/* TBG: Verify bech32/bech32m checksum (BIP350) */\\
\tif (tbg_verify_bech32_address(addr) < 0)\\
\t\treturn 0;" "${LIBCKPOOL}"
        echo "    Checksum verification added before bech32_decode"
    else
        echo "    FATAL: bech32_decode call not found in segaddress_to_txn"; exit 1
    fi
else
    echo "    Already patched"
fi

# ─── Add bc1p/tb1p fallback detection in bitcoin.c ───────────────────
echo "  Adding Taproot prefix fallback in validate_address..."
if ! grep -q "bc1p" "${BITCOIN}"; then
    # After the iswitness check, add fallback for missing iswitness field
    LINE=$(getline 'json_is_true(tmp_val)' "${BITCOIN}" | tail -1)
    LINE=$(grep -n 'iswitness' "${BITCOIN}" | tail -1 | cut -d: -f1 || true)
    if [ -n "${LINE}" ]; then
        # Find the goto out after iswitness check
        GOTO_LINE=$((LINE + 2))
        sedi "${GOTO_LINE}i\\
\t/* TBG: Taproot fallback — if bitcoind lacks iswitness, detect bc1p/tb1p prefix */\\
\tif (!*segwit && (strncmp(address, \"bc1p\", 4) == 0 || strncmp(address, \"tb1p\", 4) == 0))\\
\t\t*segwit = true;" "${BITCOIN}"
        echo "    Taproot prefix fallback added"
    else
        echo "    WARNING: Could not add Taproot fallback (iswitness not found)"
    fi
else
    echo "    Already patched"
fi

echo "  Patch 04 complete"
