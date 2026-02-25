/*
 * input_validation.c — Input validation for all miner-supplied data
 * THE BITCOIN GAME — GPLv3
 *
 * Validates every field that enters the system from miners over Stratum.
 * All validation failures are logged at WARNING level with the client IP
 * and truncated offending input to prevent log injection attacks.
 */

#include "config.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdint.h>

#include "input_validation.h"
#include "libckpool.h"

/* ── Helpers ─────────────────────────────────────────────────────── */

/*
 * Safely truncate and sanitize a string for logging.
 * Replaces control characters with '.' and truncates at max_out - 1.
 */
static void safe_truncate(const char *input, char *out, size_t max_out)
{
	size_t i;
	size_t len;

	if (!input) {
		out[0] = '\0';
		return;
	}

	len = strlen(input);
	if (len > max_out - 1)
		len = max_out - 1;

	for (i = 0; i < len; i++) {
		if (input[i] >= 0x20 && input[i] <= 0x7E)
			out[i] = input[i];
		else
			out[i] = '.';
	}
	out[len] = '\0';
}

void tbg_log_validation_failure(const char *ip, const char *field_name,
                                const char *input, const char *reason)
{
	char safe_input[LOG_INPUT_TRUNCATE + 1];
	const char *safe_ip = ip ? ip : "unknown";

	safe_truncate(input, safe_input, sizeof(safe_input));

	LOGWARNING("Validation failure: field=%s ip=%s reason=%s input=\"%.64s\"",
	           field_name, safe_ip, reason, safe_input);
}

/* ── Hex validation ──────────────────────────────────────────────── */

static bool is_hex_char(char c)
{
	return (c >= '0' && c <= '9') ||
	       (c >= 'a' && c <= 'f') ||
	       (c >= 'A' && c <= 'F');
}

bool tbg_validate_hex_string(const char *hex, size_t expected_len)
{
	size_t i;

	if (!hex)
		return false;

	if (strlen(hex) != expected_len)
		return false;

	for (i = 0; i < expected_len; i++) {
		if (!is_hex_char(hex[i]))
			return false;
	}
	return true;
}

bool tbg_validate_hex_string_max(const char *hex, size_t max_len)
{
	size_t i, len;

	if (!hex)
		return false;

	len = strlen(hex);
	if (len == 0 || len > max_len)
		return false;

	for (i = 0; i < len; i++) {
		if (!is_hex_char(hex[i]))
			return false;
	}
	return true;
}

/* ── Worker name validation ──────────────────────────────────────── */

bool tbg_validate_worker_name(const char *name)
{
	size_t len;
	const char *p;

	if (!name)
		return false;

	len = strlen(name);
	if (len == 0 || len > MAX_WORKER_NAME_LEN)
		return false;

	for (p = name; *p; p++) {
		/* Allow alphanumeric + underscore + hyphen + dot */
		if (!isalnum((unsigned char)*p) &&
		    *p != '_' && *p != '-' && *p != '.')
			return false;
	}
	return true;
}

/* ── Bitcoin address validation ──────────────────────────────────── */

/*
 * Base58 character set (no 0, O, I, l)
 */
static const char BASE58_CHARS[] =
	"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

static bool is_base58_char(char c)
{
	return strchr(BASE58_CHARS, c) != NULL;
}

/*
 * Basic base58check validation (length and character set only).
 * Full checksum verification requires SHA256 double-hash which is
 * already performed by ckpool's internal address validation in bitcoin.c.
 * We add an additional layer of pre-validation here to reject obviously
 * malformed addresses before they reach the deeper validation path.
 */
static bool validate_base58_address(const char *address)
{
	size_t len;
	size_t i;

	if (!address)
		return false;

	len = strlen(address);

	/* P2PKH: 25-34 chars starting with '1' */
	/* P2SH: 34 chars starting with '3' */
	if (len < 25 || len > 34)
		return false;

	/* Verify all characters are valid base58 */
	for (i = 0; i < len; i++) {
		if (!is_base58_char(address[i]))
			return false;
	}

	return true;
}

/*
 * Bech32/bech32m basic validation (format check).
 * The actual checksum verification is handled by ckpool's bitcoin.c
 * code which we've already patched for bech32m support.
 */
static bool validate_bech32_address(const char *address)
{
	size_t len;
	size_t i;
	const char *data_part;

	if (!address)
		return false;

	len = strlen(address);

	/* bc1q... (P2WPKH): 42-62 chars */
	/* bc1p... (P2TR): 62 chars */
	if (len < 14 || len > 74)
		return false;

	/* Must start with bc1 (mainnet) or tb1 (testnet/signet) */
	if (strncasecmp(address, "bc1", 3) != 0 &&
	    strncasecmp(address, "tb1", 3) != 0)
		return false;

	/* The 4th character determines the witness version */
	/* bc1q = v0 (bech32), bc1p = v1/taproot (bech32m) */
	if (tolower((unsigned char)address[3]) != 'q' &&
	    tolower((unsigned char)address[3]) != 'p')
		return false;

	/* Verify the data part uses only valid bech32 characters */
	/* bech32 alphabet: qpzry9x8gf2tvdw0s3jn54khce6mua7l */
	data_part = address + 4;
	for (i = 0; data_part[i]; i++) {
		char c = tolower((unsigned char)data_part[i]);
		if (!strchr("qpzry9x8gf2tvdw0s3jn54khce6mua7l", c))
			return false;
	}

	return true;
}

bool tbg_validate_btc_address(const char *address)
{
	size_t len;

	if (!address)
		return false;

	len = strlen(address);
	if (len == 0 || len > MAX_BTC_ADDRESS_LEN)
		return false;

	/* Determine address type by prefix */
	/* Mainnet P2PKH (1), Mainnet P2SH (3) */
	/* Testnet/Signet P2PKH (m, n), Testnet/Signet P2SH (2) */
	if (address[0] == '1' || address[0] == '3' ||
	    address[0] == 'm' || address[0] == 'n' || address[0] == '2')
		return validate_base58_address(address);

	if (strncasecmp(address, "bc1", 3) == 0 ||
	    strncasecmp(address, "tb1", 3) == 0)
		return validate_bech32_address(address);

	return false;
}

/* ── ntime validation ────────────────────────────────────────────── */

bool tbg_validate_ntime(const char *ntime_hex, time_t current_time,
                        int max_drift_seconds)
{
	unsigned long ntime_val;
	char *endptr;
	time_t ntime_time;
	time_t drift;

	if (!tbg_validate_hex_string(ntime_hex, MAX_NTIME_LEN))
		return false;

	/* Parse the hex ntime value */
	ntime_val = strtoul(ntime_hex, &endptr, 16);
	if (*endptr != '\0')
		return false;

	ntime_time = (time_t)ntime_val;

	/* Check drift from current time */
	if (ntime_time > current_time)
		drift = ntime_time - current_time;
	else
		drift = current_time - ntime_time;

	if (drift > (time_t)max_drift_seconds)
		return false;

	return true;
}

/* ── Version bits validation ─────────────────────────────────────── */

bool tbg_validate_version_bits(const char *version_hex,
                               uint32_t job_version,
                               uint32_t version_mask)
{
	unsigned long submitted_version;
	uint32_t modified_bits;
	char *endptr;

	if (!tbg_validate_hex_string(version_hex, MAX_VERSION_BITS_LEN))
		return false;

	submitted_version = strtoul(version_hex, &endptr, 16);
	if (*endptr != '\0')
		return false;

	/* Check that modified bits are within the allowed mask */
	modified_bits = (uint32_t)submitted_version ^ job_version;
	if ((modified_bits & ~version_mask) != 0)
		return false;

	return true;
}

/* ── JSON payload validation ─────────────────────────────────────── */

/*
 * Count nesting depth in a JSON string without a full parser.
 * We scan for { and [ as depth increasers, } and ] as decreasers,
 * while respecting string literals (content between quotes).
 */
static int json_nesting_depth(const char *buf, size_t len)
{
	int depth = 0;
	int max_depth = 0;
	bool in_string = false;
	bool escape = false;
	size_t i;

	for (i = 0; i < len; i++) {
		char c = buf[i];

		if (escape) {
			escape = false;
			continue;
		}

		if (c == '\\' && in_string) {
			escape = true;
			continue;
		}

		if (c == '"') {
			in_string = !in_string;
			continue;
		}

		if (in_string)
			continue;

		if (c == '{' || c == '[') {
			depth++;
			if (depth > max_depth)
				max_depth = depth;
		} else if (c == '}' || c == ']') {
			depth--;
		}
	}

	return max_depth;
}

bool tbg_validate_json_payload(const char *buf, size_t len, size_t max_size)
{
	int depth;

	if (!buf || len == 0)
		return false;

	if (len > max_size)
		return false;

	/* Must start with { (object) */
	/* Skip leading whitespace */
	while (len > 0 && (*buf == ' ' || *buf == '\t' ||
	       *buf == '\n' || *buf == '\r')) {
		buf++;
		len--;
	}

	if (len == 0 || buf[0] != '{')
		return false;

	/* Check nesting depth */
	depth = json_nesting_depth(buf, len);
	if (depth > MAX_JSON_NESTING)
		return false;

	return true;
}

/* ── User agent sanitization ─────────────────────────────────────── */

bool tbg_sanitize_user_agent(char *user_agent, size_t max_len)
{
	bool was_clean = true;
	size_t i, len;

	if (!user_agent)
		return true;

	len = strlen(user_agent);

	/* Truncate if too long */
	if (len > max_len) {
		user_agent[max_len] = '\0';
		len = max_len;
		was_clean = false;
	}

	/* Replace non-printable ASCII */
	for (i = 0; i < len; i++) {
		if (user_agent[i] < 0x20 || user_agent[i] > 0x7E) {
			user_agent[i] = '?';
			was_clean = false;
		}
	}

	return was_clean;
}
