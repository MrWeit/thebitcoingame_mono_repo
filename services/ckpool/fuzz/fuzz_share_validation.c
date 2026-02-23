/*
 * fuzz_share_validation.c - libFuzzer target for share validation logic
 *
 * Part of THE BITCOIN GAME - CKPool fuzzing infrastructure
 * Parses nonce, nonce2, ntime, job_id from fuzzed input and validates
 * them against expected constraints for Stratum share submissions.
 *
 * Copyright (c) 2024-2026 THE BITCOIN GAME
 * Licensed under the GNU General Public License v3.0
 * See LICENSE file for details.
 *
 * Build with:
 *   clang -g -O1 -fsanitize=fuzzer,address -o fuzz_share_validation fuzz_share_validation.c
 *
 * Run:
 *   ./fuzz_share_validation corpus/
 */

#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* Share field size limits */
#define MAX_NONCE_LEN     8    /* 4 bytes = 8 hex chars */
#define MAX_NONCE2_LEN    16   /* up to 8 bytes = 16 hex chars */
#define MAX_NTIME_LEN     8    /* 4 bytes = 8 hex chars */
#define MAX_JOB_ID_LEN    32   /* variable length hex string */
#define MAX_VERSION_LEN   8    /* 4 bytes for version rolling */
#define MAX_WORKER_LEN    128  /* address.rigname */

/* Difficulty target: simplistic representation */
#define SHARE_DIFF_1      0x00000000FFFF0000ULL

/* Validation error codes */
typedef enum {
    SHARE_OK = 0,
    SHARE_ERR_INVALID_NONCE,
    SHARE_ERR_INVALID_NONCE2,
    SHARE_ERR_INVALID_NTIME,
    SHARE_ERR_INVALID_JOB_ID,
    SHARE_ERR_STALE_JOB,
    SHARE_ERR_NTIME_OUT_OF_RANGE,
    SHARE_ERR_DUPLICATE,
    SHARE_ERR_LOW_DIFFICULTY,
    SHARE_ERR_INVALID_VERSION,
    SHARE_ERR_MALFORMED
} share_error_t;

/* Parsed share submission */
typedef struct {
    char     worker[MAX_WORKER_LEN];
    char     job_id[MAX_JOB_ID_LEN];
    char     nonce2_hex[MAX_NONCE2_LEN + 1];
    char     ntime_hex[MAX_NTIME_LEN + 1];
    char     nonce_hex[MAX_NONCE_LEN + 1];
    char     version_hex[MAX_VERSION_LEN + 1];
    uint32_t nonce;
    uint32_t ntime;
    uint32_t version_bits;
    uint64_t nonce2;
    int      has_version_bits;
} share_submission_t;

/* Simulated job entry */
typedef struct {
    char     job_id[MAX_JOB_ID_LEN];
    uint32_t ntime_min;
    uint32_t ntime_max;
    uint32_t version_mask;
    double   target_diff;
    int      active;
} job_entry_t;

/* A few mock "active" jobs for validation testing */
static const job_entry_t mock_jobs[] = {
    { "4a2f", 0x60000000, 0x6FFFFFFF, 0x1FFFE000, 1.0, 1 },
    { "4a30", 0x60000000, 0x6FFFFFFF, 0x1FFFE000, 2.0, 1 },
    { "4a31", 0x60000000, 0x6FFFFFFF, 0x1FFFE000, 0.5, 1 },
    { "dead", 0x50000000, 0x5FFFFFFF, 0x1FFFE000, 1.0, 0 },  /* stale */
    { "", 0, 0, 0, 0.0, 0 }  /* sentinel */
};

/*
 * Check if a string is valid hexadecimal of the expected length.
 * Returns 1 if valid, 0 otherwise.
 */
static int is_valid_hex(const char *s, size_t expected_len)
{
    size_t len = strlen(s);
    if (expected_len > 0 && len != expected_len)
        return 0;
    if (len == 0 || len % 2 != 0)
        return 0;
    for (size_t i = 0; i < len; i++) {
        if (!isxdigit((unsigned char)s[i]))
            return 0;
    }
    return 1;
}

/*
 * Parse a hex string into a uint32_t (big-endian).
 * Returns 0 on success, -1 on error.
 */
static int hex_to_uint32(const char *hex, uint32_t *out)
{
    if (!hex || strlen(hex) != 8)
        return -1;

    char *endp;
    unsigned long val = strtoul(hex, &endp, 16);
    if (*endp != '\0')
        return -1;
    *out = (uint32_t)val;
    return 0;
}

/*
 * Parse a hex string into a uint64_t.
 * Returns 0 on success, -1 on error.
 */
static int hex_to_uint64(const char *hex, uint64_t *out)
{
    size_t len = strlen(hex);
    if (!hex || len == 0 || len > 16)
        return -1;

    char *endp;
    unsigned long long val = strtoull(hex, &endp, 16);
    if (*endp != '\0')
        return -1;
    *out = (uint64_t)val;
    return 0;
}

/*
 * Find a job by its ID in the mock job list.
 * Returns pointer to the job entry, or NULL if not found.
 */
static const job_entry_t *find_job(const char *job_id)
{
    for (int i = 0; mock_jobs[i].job_id[0] != '\0'; i++) {
        if (strcmp(mock_jobs[i].job_id, job_id) == 0)
            return &mock_jobs[i];
    }
    return NULL;
}

/*
 * Simple simulated difficulty check.
 * In real CKPool, this would compute SHA256d of the block header.
 * Here we simulate by combining nonce and nonce2 to check
 * if the resulting value meets the target.
 */
static double compute_share_diff(uint32_t nonce, uint64_t nonce2,
                                 uint32_t ntime)
{
    /* Simulated hash difficulty computation.
     * Mix the share parameters to produce a pseudo-difficulty. */
    uint64_t mixed = (uint64_t)nonce ^ (nonce2 << 3) ^ ((uint64_t)ntime << 7);
    mixed = mixed * 0x5851F42D4C957F2DULL + 0x14057B7EF767814FULL;
    mixed ^= mixed >> 33;
    mixed *= 0xC4CEB9FE1A85EC53ULL;
    mixed ^= mixed >> 33;

    if (mixed == 0)
        return 0.0;

    /* Map to a difficulty-like value */
    return (double)SHARE_DIFF_1 / (double)(mixed >> 32);
}

/*
 * Extract a field from the fuzzed buffer at a given offset.
 * Fields are delimited by newline characters in the raw input.
 * Returns the number of bytes consumed, or 0 if no field found.
 */
static size_t extract_field(const uint8_t *data, size_t size, size_t offset,
                            char *dst, size_t dst_len)
{
    if (offset >= size)
        return 0;

    size_t i = 0;
    while (offset + i < size && data[offset + i] != '\n' && i < dst_len - 1) {
        dst[i] = (char)data[offset + i];
        i++;
    }
    dst[i] = '\0';

    /* Skip past the newline delimiter */
    if (offset + i < size && data[offset + i] == '\n')
        i++;

    return i;
}

/*
 * Validate a share submission against the known job list.
 * This is the core function being fuzz-tested.
 */
static share_error_t validate_share(share_submission_t *share)
{
    /* Validate nonce is valid hex, exactly 8 chars */
    if (!is_valid_hex(share->nonce_hex, MAX_NONCE_LEN))
        return SHARE_ERR_INVALID_NONCE;

    /* Validate nonce2 is valid hex, even length, non-empty */
    size_t n2len = strlen(share->nonce2_hex);
    if (n2len == 0 || n2len > MAX_NONCE2_LEN || n2len % 2 != 0)
        return SHARE_ERR_INVALID_NONCE2;
    if (!is_valid_hex(share->nonce2_hex, 0))
        return SHARE_ERR_INVALID_NONCE2;

    /* Validate ntime is valid hex, exactly 8 chars */
    if (!is_valid_hex(share->ntime_hex, MAX_NTIME_LEN))
        return SHARE_ERR_INVALID_NTIME;

    /* Validate job_id is non-empty */
    if (strlen(share->job_id) == 0)
        return SHARE_ERR_INVALID_JOB_ID;

    /* Parse numeric values */
    if (hex_to_uint32(share->nonce_hex, &share->nonce) != 0)
        return SHARE_ERR_INVALID_NONCE;

    if (hex_to_uint32(share->ntime_hex, &share->ntime) != 0)
        return SHARE_ERR_INVALID_NTIME;

    if (hex_to_uint64(share->nonce2_hex, &share->nonce2) != 0)
        return SHARE_ERR_INVALID_NONCE2;

    /* Version bits (optional) */
    if (share->has_version_bits) {
        if (!is_valid_hex(share->version_hex, MAX_VERSION_LEN))
            return SHARE_ERR_INVALID_VERSION;
        if (hex_to_uint32(share->version_hex, &share->version_bits) != 0)
            return SHARE_ERR_INVALID_VERSION;
    }

    /* Look up the job */
    const job_entry_t *job = find_job(share->job_id);
    if (!job)
        return SHARE_ERR_INVALID_JOB_ID;

    /* Check if job is stale */
    if (!job->active)
        return SHARE_ERR_STALE_JOB;

    /* Check ntime range */
    if (share->ntime < job->ntime_min || share->ntime > job->ntime_max)
        return SHARE_ERR_NTIME_OUT_OF_RANGE;

    /* Check version bits against mask */
    if (share->has_version_bits) {
        uint32_t bits_outside_mask = share->version_bits & ~job->version_mask;
        if (bits_outside_mask != 0)
            return SHARE_ERR_INVALID_VERSION;
    }

    /* Compute simulated share difficulty */
    double diff = compute_share_diff(share->nonce, share->nonce2, share->ntime);
    if (diff < job->target_diff)
        return SHARE_ERR_LOW_DIFFICULTY;

    return SHARE_OK;
}

/*
 * libFuzzer entry point.
 * Parses share fields from fuzzed newline-delimited input
 * and runs them through share validation.
 *
 * Expected input format (newline-delimited):
 *   worker\njob_id\nnonce2\nntime\nnonce[\nversion_bits]
 */
int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    /* Limit input size */
    if (size == 0 || size > 1024)
        return 0;

    share_submission_t share;
    memset(&share, 0, sizeof(share));

    size_t offset = 0;
    size_t consumed;

    /* Parse worker name */
    consumed = extract_field(data, size, offset, share.worker, MAX_WORKER_LEN);
    if (consumed == 0)
        return 0;
    offset += consumed;

    /* Parse job_id */
    consumed = extract_field(data, size, offset, share.job_id, MAX_JOB_ID_LEN);
    if (consumed == 0)
        return 0;
    offset += consumed;

    /* Parse nonce2 */
    consumed = extract_field(data, size, offset, share.nonce2_hex,
                             MAX_NONCE2_LEN + 1);
    if (consumed == 0)
        return 0;
    offset += consumed;

    /* Parse ntime */
    consumed = extract_field(data, size, offset, share.ntime_hex,
                             MAX_NTIME_LEN + 1);
    if (consumed == 0)
        return 0;
    offset += consumed;

    /* Parse nonce */
    consumed = extract_field(data, size, offset, share.nonce_hex,
                             MAX_NONCE_LEN + 1);
    if (consumed == 0)
        return 0;
    offset += consumed;

    /* Optionally parse version bits */
    if (offset < size) {
        consumed = extract_field(data, size, offset, share.version_hex,
                                 MAX_VERSION_LEN + 1);
        if (consumed > 0 && strlen(share.version_hex) > 0)
            share.has_version_bits = 1;
    }

    /* Run validation */
    share_error_t err = validate_share(&share);

    /* Touch the result to prevent optimization */
    volatile share_error_t result = err;
    (void)result;

    return 0;
}
