/*
 * input_validation.h — Input validation for all miner-supplied data
 * THE BITCOIN GAME — GPLv3
 *
 * Every field from the Stratum protocol that originates from the miner
 * MUST be validated before use. This module provides validation functions
 * for Bitcoin addresses, worker names, hex strings, ntime values,
 * JSON payloads, and user agents.
 *
 * All validation failures are logged at WARNING level with the client IP
 * and the offending input (truncated to 64 chars to prevent log injection).
 */

#ifndef TBG_INPUT_VALIDATION_H
#define TBG_INPUT_VALIDATION_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <time.h>

/* Maximum lengths for miner-supplied fields */
#define MAX_BTC_ADDRESS_LEN   90
#define MAX_WORKER_NAME_LEN   128
#define MAX_NONCE_LEN         8     /* 32-bit nonce = 8 hex chars */
#define MAX_NONCE2_LEN        16    /* 64-bit default nonce2 = 16 hex chars */
#define MAX_JOB_ID_LEN        8
#define MAX_NTIME_LEN         8
#define MAX_VERSION_BITS_LEN  8
#define MAX_USER_AGENT_LEN    256
#define MAX_JSON_PAYLOAD_SIZE 4096
#define MAX_JSON_NESTING      3

/* Maximum ntime drift from current time (seconds) */
#define MAX_NTIME_DRIFT       7200  /* +/- 2 hours */

/* Log truncation limit for offending input */
#define LOG_INPUT_TRUNCATE    64

/*
 * Validate a Bitcoin address.
 * Supports P2PKH (1...), P2SH (3...), bech32/P2WPKH (bc1q...),
 * and bech32m/P2TR (bc1p...) with full checksum verification.
 *
 * Returns true if the address is valid, false otherwise.
 */
bool tbg_validate_btc_address(const char *address);

/*
 * Validate a worker name (the part after the '.' separator in
 * mining.authorize). Only alphanumeric characters plus '_', '-',
 * and '.' are allowed. No control characters.
 *
 * Returns true if the name is valid, false otherwise.
 */
bool tbg_validate_worker_name(const char *name);

/*
 * Validate a hex string of exact expected length.
 * Each character must be 0-9, a-f, or A-F.
 *
 * Returns true if valid, false otherwise.
 */
bool tbg_validate_hex_string(const char *hex, size_t expected_len);

/*
 * Validate a hex string with a maximum (but not exact) length.
 * Allows strings shorter than max_len but not longer.
 *
 * Returns true if valid, false otherwise.
 */
bool tbg_validate_hex_string_max(const char *hex, size_t max_len);

/*
 * Validate an ntime hex string (8 chars) and check that the
 * encoded time value is within +/- max_drift_seconds of current_time.
 *
 * Returns true if valid and in range, false otherwise.
 */
bool tbg_validate_ntime(const char *ntime_hex, time_t current_time,
                        int max_drift_seconds);

/*
 * Validate version bits submitted by the miner.
 * The bits field must be a valid 8-char hex string, and the
 * modified bits (submitted ^ job_version) must be within the
 * allowed version_mask.
 *
 * Returns true if valid, false otherwise.
 */
bool tbg_validate_version_bits(const char *version_hex,
                               uint32_t job_version,
                               uint32_t version_mask);

/*
 * Validate a JSON payload from the wire.
 * Checks:
 *   - Not NULL and not empty
 *   - Length does not exceed max_size
 *   - Well-formed JSON (single object)
 *   - Nesting depth does not exceed MAX_JSON_NESTING
 *
 * Returns true if valid, false otherwise.
 */
bool tbg_validate_json_payload(const char *buf, size_t len, size_t max_size);

/*
 * Sanitize a user agent string in place.
 * Replaces any non-printable ASCII character (outside 0x20-0x7E)
 * with '?'. Truncates at MAX_USER_AGENT_LEN.
 *
 * Returns true if the original string was clean, false if sanitization
 * was needed.
 */
bool tbg_sanitize_user_agent(char *user_agent, size_t max_len);

/*
 * Log a validation failure with the client IP and truncated input.
 * The input is safely truncated to LOG_INPUT_TRUNCATE chars and
 * control characters are replaced to prevent log injection.
 *
 * This is a helper for the validation functions above; it calls
 * LOGWARNING internally.
 */
void tbg_log_validation_failure(const char *ip, const char *field_name,
                                const char *input, const char *reason);

#endif /* TBG_INPUT_VALIDATION_H */
