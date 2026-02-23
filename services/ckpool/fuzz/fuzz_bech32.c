/*
 * fuzz_bech32.c - libFuzzer target for bech32/bech32m address decoding
 *
 * Part of THE BITCOIN GAME - CKPool fuzzing infrastructure
 * Attempts to decode arbitrary input as bech32 (BIP173) and
 * bech32m (BIP350) encoded Bitcoin addresses. Covers both
 * SegWit v0 (bc1q...) and Taproot v1 (bc1p...) addresses.
 *
 * Copyright (c) 2024-2026 THE BITCOIN GAME
 * Licensed under the GNU General Public License v3.0
 * See LICENSE file for details.
 *
 * Build with:
 *   clang -g -O1 -fsanitize=fuzzer,address -o fuzz_bech32 fuzz_bech32.c
 *
 * Run:
 *   ./fuzz_bech32 corpus/
 */

#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* Bech32 encoding constants */
#define BECH32_MAX_LEN     90
#define BECH32_CHECKSUM_LEN 6
#define MAX_DATA_LEN       65  /* witness program max: 2 + 40 bytes */
#define MAX_HRP_LEN        10

/* Bech32 encoding type */
typedef enum {
    BECH32_ENCODING_NONE = 0,
    BECH32_ENCODING_BECH32,     /* BIP173 - SegWit v0 */
    BECH32_ENCODING_BECH32M     /* BIP350 - SegWit v1+ (Taproot) */
} bech32_encoding_t;

/* Decoded bech32 result */
typedef struct {
    bech32_encoding_t encoding;
    char              hrp[MAX_HRP_LEN + 1];
    uint8_t           data[MAX_DATA_LEN];
    size_t            data_len;
    int               witness_version;
    uint8_t           witness_program[40];
    size_t            witness_program_len;
} bech32_result_t;

/* Bech32 character set */
static const char BECH32_CHARSET[] = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/* Bech32 generator polynomial coefficients */
static const uint32_t BECH32_GEN[] = {
    0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3
};

/* Bech32m constant (BIP350) */
#define BECH32M_CONST 0x2BC830A3

/*
 * Compute bech32 polymod checksum.
 */
static uint32_t bech32_polymod(const uint8_t *values, size_t len)
{
    uint32_t chk = 1;
    for (size_t i = 0; i < len; i++) {
        uint8_t top = chk >> 25;
        chk = ((chk & 0x1FFFFFF) << 5) ^ values[i];
        for (int j = 0; j < 5; j++) {
            if ((top >> j) & 1)
                chk ^= BECH32_GEN[j];
        }
    }
    return chk;
}

/*
 * Expand the human-readable part for checksum computation.
 * Returns the number of bytes written to dst.
 */
static size_t bech32_hrp_expand(const char *hrp, size_t hrp_len,
                                uint8_t *dst, size_t dst_size)
{
    if (hrp_len * 2 + 1 > dst_size)
        return 0;

    size_t pos = 0;
    for (size_t i = 0; i < hrp_len; i++)
        dst[pos++] = (uint8_t)(hrp[i] >> 5);
    dst[pos++] = 0;
    for (size_t i = 0; i < hrp_len; i++)
        dst[pos++] = (uint8_t)(hrp[i] & 0x1F);

    return pos;
}

/*
 * Verify the bech32/bech32m checksum.
 * Returns the encoding type, or BECH32_ENCODING_NONE if invalid.
 */
static bech32_encoding_t bech32_verify_checksum(const char *hrp,
                                                 size_t hrp_len,
                                                 const uint8_t *data,
                                                 size_t data_len)
{
    /* Build the values array: hrp_expand + data */
    size_t expand_len = hrp_len * 2 + 1;
    size_t total_len = expand_len + data_len;

    if (total_len > 256)
        return BECH32_ENCODING_NONE;

    uint8_t values[256];
    size_t pos = bech32_hrp_expand(hrp, hrp_len, values, sizeof(values));
    if (pos == 0)
        return BECH32_ENCODING_NONE;

    memcpy(values + pos, data, data_len);

    uint32_t polymod = bech32_polymod(values, total_len);

    if (polymod == 1)
        return BECH32_ENCODING_BECH32;
    if (polymod == BECH32M_CONST)
        return BECH32_ENCODING_BECH32M;

    return BECH32_ENCODING_NONE;
}

/*
 * Decode a bech32/bech32m string.
 * Returns 0 on success, -1 on error.
 */
static int bech32_decode(const char *input, size_t input_len,
                         bech32_result_t *result)
{
    memset(result, 0, sizeof(*result));

    /* Check length bounds */
    if (input_len < 8 || input_len > BECH32_MAX_LEN)
        return -1;

    /* Find the separator (last '1' in the string) */
    int sep_pos = -1;
    int has_lower = 0, has_upper = 0;

    for (int i = (int)input_len - 1; i >= 0; i--) {
        if (input[i] == '1') {
            sep_pos = i;
            break;
        }
    }

    if (sep_pos < 1 || sep_pos + 7 > (int)input_len)
        return -1;

    /* Check HRP length */
    size_t hrp_len = (size_t)sep_pos;
    if (hrp_len > MAX_HRP_LEN || hrp_len < 1)
        return -1;

    /* Extract and validate HRP (must be lowercase or will be lowered) */
    for (size_t i = 0; i < hrp_len; i++) {
        char c = input[i];
        if (c < 33 || c > 126)
            return -1;
        if (c >= 'A' && c <= 'Z') {
            has_upper = 1;
            result->hrp[i] = c + 32; /* tolower */
        } else {
            if (c >= 'a' && c <= 'z')
                has_lower = 1;
            result->hrp[i] = c;
        }
    }
    result->hrp[hrp_len] = '\0';

    /* Decode the data part (after separator) */
    size_t data_part_len = input_len - sep_pos - 1;
    if (data_part_len < BECH32_CHECKSUM_LEN)
        return -1;

    uint8_t data[BECH32_MAX_LEN];
    for (size_t i = 0; i < data_part_len; i++) {
        char c = input[sep_pos + 1 + i];

        /* Check for mixed case */
        if (c >= 'A' && c <= 'Z') {
            has_upper = 1;
            c += 32; /* tolower */
        } else if (c >= 'a' && c <= 'z') {
            has_lower = 1;
        }

        /* Mixed case is invalid */
        if (has_lower && has_upper)
            return -1;

        /* Find character in bech32 charset */
        const char *pos = strchr(BECH32_CHARSET, c);
        if (!pos)
            return -1;
        data[i] = (uint8_t)(pos - BECH32_CHARSET);
    }

    /* Verify checksum */
    result->encoding = bech32_verify_checksum(result->hrp, hrp_len,
                                               data, data_part_len);
    if (result->encoding == BECH32_ENCODING_NONE)
        return -1;

    /* Copy data (excluding checksum) */
    result->data_len = data_part_len - BECH32_CHECKSUM_LEN;
    if (result->data_len > MAX_DATA_LEN)
        return -1;
    memcpy(result->data, data, result->data_len);

    return 0;
}

/*
 * Convert 5-bit groups to 8-bit groups.
 * Returns 0 on success, -1 on error.
 */
static int convert_bits(uint8_t *out, size_t *out_len, int out_bits,
                        const uint8_t *in, size_t in_len, int in_bits,
                        int pad)
{
    uint32_t val = 0;
    int bits = 0;
    uint32_t maxv = (1 << out_bits) - 1;
    *out_len = 0;

    for (size_t i = 0; i < in_len; i++) {
        if (in[i] >> in_bits)
            return -1;
        val = (val << in_bits) | in[i];
        bits += in_bits;
        while (bits >= out_bits) {
            bits -= out_bits;
            out[(*out_len)++] = (val >> bits) & maxv;
        }
    }

    if (pad) {
        if (bits > 0)
            out[(*out_len)++] = (val << (out_bits - bits)) & maxv;
    } else if (bits >= in_bits || ((val << (out_bits - bits)) & maxv)) {
        return -1;
    }

    return 0;
}

/*
 * Decode and validate a SegWit address.
 * Returns 0 on success, -1 on error.
 */
static int decode_segwit_address(const char *addr, size_t addr_len,
                                 bech32_result_t *result)
{
    /* First decode the bech32 string */
    if (bech32_decode(addr, addr_len, result) != 0)
        return -1;

    /* Must have at least 1 byte of data (witness version) */
    if (result->data_len < 1)
        return -1;

    /* Extract witness version (first 5-bit value) */
    result->witness_version = result->data[0];
    if (result->witness_version > 16)
        return -1;

    /* Convert remaining 5-bit data to 8-bit witness program */
    if (result->data_len < 2)
        return -1;

    if (convert_bits(result->witness_program, &result->witness_program_len,
                     8, result->data + 1, result->data_len - 1, 5, 0) != 0)
        return -1;

    /* Validate witness program length */
    if (result->witness_program_len < 2 || result->witness_program_len > 40)
        return -1;

    /* Version 0: must be 20 (P2WPKH) or 32 (P2WSH) bytes */
    if (result->witness_version == 0) {
        if (result->witness_program_len != 20 &&
            result->witness_program_len != 32)
            return -1;
        /* Version 0 must use bech32 encoding */
        if (result->encoding != BECH32_ENCODING_BECH32)
            return -1;
    }

    /* Version 1+: must use bech32m encoding (BIP350) */
    if (result->witness_version >= 1) {
        if (result->encoding != BECH32_ENCODING_BECH32M)
            return -1;
        /* Taproot (version 1): must be 32 bytes */
        if (result->witness_version == 1 &&
            result->witness_program_len != 32)
            return -1;
    }

    /* Validate HRP for Bitcoin mainnet or testnet */
    int valid_hrp = (strcmp(result->hrp, "bc") == 0 ||
                     strcmp(result->hrp, "tb") == 0 ||
                     strcmp(result->hrp, "bcrt") == 0);
    if (!valid_hrp)
        return -1;

    return 0;
}

/*
 * libFuzzer entry point.
 * Attempts to decode the fuzzed input as a bech32/bech32m Bitcoin address.
 */
int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    /* Bech32 addresses are at most 90 chars */
    if (size == 0 || size > BECH32_MAX_LEN + 1)
        return 0;

    /* Null-terminate the input */
    char *addr = (char *)malloc(size + 1);
    if (!addr)
        return 0;
    memcpy(addr, data, size);
    addr[size] = '\0';

    bech32_result_t result;

    /* Try raw bech32 decode first */
    int ret = bech32_decode(addr, size, &result);
    if (ret == 0) {
        /* Access parsed fields under ASAN */
        volatile bech32_encoding_t enc = result.encoding;
        volatile size_t dlen = result.data_len;
        volatile size_t hlen = strlen(result.hrp);
        (void)enc;
        (void)dlen;
        (void)hlen;

        /* Touch data bytes */
        for (size_t i = 0; i < result.data_len; i++) {
            volatile uint8_t b = result.data[i];
            (void)b;
        }
    }

    /* Try full SegWit address decode */
    memset(&result, 0, sizeof(result));
    ret = decode_segwit_address(addr, size, &result);
    if (ret == 0) {
        /* Access witness program under ASAN */
        volatile int ver = result.witness_version;
        volatile size_t wplen = result.witness_program_len;
        (void)ver;
        (void)wplen;

        for (size_t i = 0; i < result.witness_program_len; i++) {
            volatile uint8_t b = result.witness_program[i];
            (void)b;
        }
    }

    /* Also try with common prefixes prepended to exercise more paths */
    if (size < 80) {
        static const char *prefixes[] = {
            "bc1q", "bc1p", "tb1q", "tb1p", "BC1Q", "BC1P", NULL
        };

        for (int i = 0; prefixes[i] != NULL; i++) {
            size_t plen = strlen(prefixes[i]);
            char *modified = (char *)malloc(plen + size + 1);
            if (modified) {
                memcpy(modified, prefixes[i], plen);
                memcpy(modified + plen, addr, size);
                modified[plen + size] = '\0';

                memset(&result, 0, sizeof(result));
                decode_segwit_address(modified, plen + size, &result);
                free(modified);
            }
        }
    }

    free(addr);
    return 0;
}
