/*
 * fuzz_stratum_parser.c - libFuzzer target for Stratum JSON-RPC parsing
 *
 * Part of THE BITCOIN GAME - CKPool fuzzing infrastructure
 * Feeds arbitrary bytes into a self-contained Stratum JSON-RPC parser
 * that extracts method, params, and id from JSON messages.
 *
 * Copyright (c) 2024-2026 THE BITCOIN GAME
 * Licensed under the GNU General Public License v3.0
 * See LICENSE file for details.
 *
 * Build with:
 *   clang -g -O1 -fsanitize=fuzzer,address -o fuzz_stratum_parser fuzz_stratum_parser.c
 *
 * Run:
 *   ./fuzz_stratum_parser corpus/
 */

#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* Maximum sizes for parsed fields */
#define MAX_METHOD_LEN  64
#define MAX_PARAM_LEN   256
#define MAX_PARAMS       8
#define MAX_JSON_LEN    4096

/* Stratum method types */
typedef enum {
    METHOD_UNKNOWN = 0,
    METHOD_SUBSCRIBE,
    METHOD_AUTHORIZE,
    METHOD_SUBMIT,
    METHOD_CONFIGURE,
    METHOD_SUGGEST_DIFFICULTY,
    METHOD_EXTRANONCE_SUBSCRIBE
} stratum_method_t;

/* Parsed Stratum request */
typedef struct {
    int64_t         id;
    int             has_id;
    stratum_method_t method;
    char            method_str[MAX_METHOD_LEN];
    char            params[MAX_PARAMS][MAX_PARAM_LEN];
    int             param_count;
    int             valid;
} stratum_request_t;

/*
 * Skip whitespace in JSON buffer.
 * Returns pointer past any whitespace characters.
 */
static const char *skip_ws(const char *p, const char *end)
{
    while (p < end && isspace((unsigned char)*p))
        p++;
    return p;
}

/*
 * Parse a JSON string value (expects p to point at opening quote).
 * Copies the string content into dst (up to dst_len-1 chars).
 * Returns pointer past the closing quote, or NULL on error.
 */
static const char *parse_json_string(const char *p, const char *end,
                                     char *dst, size_t dst_len)
{
    if (p >= end || *p != '"')
        return NULL;
    p++; /* skip opening quote */

    size_t written = 0;
    while (p < end && *p != '"') {
        if (*p == '\\') {
            p++;
            if (p >= end)
                return NULL;
            /* Handle common escape sequences */
            char c;
            switch (*p) {
                case '"':  c = '"';  break;
                case '\\': c = '\\'; break;
                case '/':  c = '/';  break;
                case 'b':  c = '\b'; break;
                case 'f':  c = '\f'; break;
                case 'n':  c = '\n'; break;
                case 'r':  c = '\r'; break;
                case 't':  c = '\t'; break;
                case 'u':
                    /* Skip \uXXXX unicode escapes */
                    p++;
                    for (int i = 0; i < 4 && p < end; i++, p++)
                        ;
                    continue;
                default:
                    c = *p;
                    break;
            }
            if (written < dst_len - 1)
                dst[written++] = c;
        } else {
            if (written < dst_len - 1)
                dst[written++] = (char)*p;
        }
        p++;
    }

    dst[written] = '\0';

    if (p >= end || *p != '"')
        return NULL;
    p++; /* skip closing quote */
    return p;
}

/*
 * Parse a JSON number (integer only for Stratum id).
 * Returns pointer past the number, or NULL on error.
 */
static const char *parse_json_number(const char *p, const char *end,
                                     int64_t *out)
{
    if (p >= end)
        return NULL;

    int negative = 0;
    if (*p == '-') {
        negative = 1;
        p++;
    }

    if (p >= end || !isdigit((unsigned char)*p))
        return NULL;

    int64_t val = 0;
    while (p < end && isdigit((unsigned char)*p)) {
        int64_t digit = *p - '0';
        /* Overflow check */
        if (val > (INT64_MAX - digit) / 10)
            return NULL;
        val = val * 10 + digit;
        p++;
    }

    *out = negative ? -val : val;
    return p;
}

/*
 * Skip a JSON value (string, number, object, array, true, false, null).
 * Returns pointer past the value, or NULL on error.
 */
static const char *skip_json_value(const char *p, const char *end)
{
    p = skip_ws(p, end);
    if (p >= end)
        return NULL;

    if (*p == '"') {
        /* String */
        p++;
        while (p < end && *p != '"') {
            if (*p == '\\') {
                p++;
                if (p >= end)
                    return NULL;
            }
            p++;
        }
        if (p >= end)
            return NULL;
        return p + 1;
    } else if (*p == '{') {
        /* Object */
        int depth = 1;
        p++;
        while (p < end && depth > 0) {
            if (*p == '{') depth++;
            else if (*p == '}') depth--;
            else if (*p == '"') {
                p++;
                while (p < end && *p != '"') {
                    if (*p == '\\') p++;
                    p++;
                }
            }
            p++;
        }
        return (depth == 0) ? p : NULL;
    } else if (*p == '[') {
        /* Array */
        int depth = 1;
        p++;
        while (p < end && depth > 0) {
            if (*p == '[') depth++;
            else if (*p == ']') depth--;
            else if (*p == '"') {
                p++;
                while (p < end && *p != '"') {
                    if (*p == '\\') p++;
                    p++;
                }
            }
            p++;
        }
        return (depth == 0) ? p : NULL;
    } else if (*p == '-' || isdigit((unsigned char)*p)) {
        /* Number */
        if (*p == '-') p++;
        while (p < end && (isdigit((unsigned char)*p) || *p == '.' ||
               *p == 'e' || *p == 'E' || *p == '+' || *p == '-'))
            p++;
        return p;
    } else if (end - p >= 4 && memcmp(p, "true", 4) == 0) {
        return p + 4;
    } else if (end - p >= 5 && memcmp(p, "false", 5) == 0) {
        return p + 5;
    } else if (end - p >= 4 && memcmp(p, "null", 4) == 0) {
        return p + 4;
    }

    return NULL;
}

/*
 * Identify the Stratum method from its string name.
 */
static stratum_method_t identify_method(const char *method)
{
    if (strcmp(method, "mining.subscribe") == 0)
        return METHOD_SUBSCRIBE;
    if (strcmp(method, "mining.authorize") == 0)
        return METHOD_AUTHORIZE;
    if (strcmp(method, "mining.submit") == 0)
        return METHOD_SUBMIT;
    if (strcmp(method, "mining.configure") == 0)
        return METHOD_CONFIGURE;
    if (strcmp(method, "mining.suggest_difficulty") == 0)
        return METHOD_SUGGEST_DIFFICULTY;
    if (strcmp(method, "mining.extranonce.subscribe") == 0)
        return METHOD_EXTRANONCE_SUBSCRIBE;
    return METHOD_UNKNOWN;
}

/*
 * Validate parsed request for correctness.
 * Checks parameter counts match expected values per method.
 */
static void validate_request(stratum_request_t *req)
{
    if (!req->has_id) {
        req->valid = 0;
        return;
    }

    switch (req->method) {
        case METHOD_SUBSCRIBE:
            /* mining.subscribe: 0-2 params (user_agent, optional session_id) */
            req->valid = (req->param_count >= 0 && req->param_count <= 2);
            break;
        case METHOD_AUTHORIZE:
            /* mining.authorize: 2 params (username, password) */
            req->valid = (req->param_count == 2);
            break;
        case METHOD_SUBMIT:
            /* mining.submit: 5 params (worker, job_id, nonce2, ntime, nonce)
             * Some implementations send a 6th for version bits */
            req->valid = (req->param_count >= 5 && req->param_count <= 6);
            break;
        case METHOD_CONFIGURE:
            req->valid = (req->param_count >= 1);
            break;
        case METHOD_SUGGEST_DIFFICULTY:
            req->valid = (req->param_count >= 1);
            break;
        default:
            req->valid = 0;
            break;
    }
}

/*
 * Parse a Stratum JSON-RPC request from a buffer.
 * This is the core function being fuzz-tested.
 */
static int parse_stratum_request(const char *buf, size_t len,
                                 stratum_request_t *req)
{
    memset(req, 0, sizeof(*req));

    if (len == 0 || len > MAX_JSON_LEN)
        return -1;

    const char *p = buf;
    const char *end = buf + len;

    /* Skip leading whitespace */
    p = skip_ws(p, end);
    if (p >= end || *p != '{')
        return -1;
    p++; /* skip '{' */

    /* Parse object key-value pairs */
    int found_method = 0;
    int found_params = 0;

    while (1) {
        p = skip_ws(p, end);
        if (p >= end)
            return -1;
        if (*p == '}')
            break;

        /* Expect comma between pairs (except first) */
        if (found_method || found_params || req->has_id) {
            if (*p == ',') {
                p++;
                p = skip_ws(p, end);
            }
        }

        if (p >= end || *p != '"')
            return -1;

        /* Parse key */
        char key[32] = {0};
        p = parse_json_string(p, end, key, sizeof(key));
        if (!p)
            return -1;

        /* Expect colon */
        p = skip_ws(p, end);
        if (p >= end || *p != ':')
            return -1;
        p++;
        p = skip_ws(p, end);
        if (p >= end)
            return -1;

        /* Parse value based on key */
        if (strcmp(key, "id") == 0) {
            if (*p == '"') {
                /* String id - some miners do this */
                char id_str[32] = {0};
                p = parse_json_string(p, end, id_str, sizeof(id_str));
                if (!p)
                    return -1;
                req->id = atoll(id_str);
            } else if (isdigit((unsigned char)*p) || *p == '-') {
                p = parse_json_number(p, end, &req->id);
                if (!p)
                    return -1;
            } else if (end - p >= 4 && memcmp(p, "null", 4) == 0) {
                p += 4;
                req->id = 0;
            } else {
                return -1;
            }
            req->has_id = 1;
        } else if (strcmp(key, "method") == 0) {
            p = parse_json_string(p, end, req->method_str, sizeof(req->method_str));
            if (!p)
                return -1;
            req->method = identify_method(req->method_str);
            found_method = 1;
        } else if (strcmp(key, "params") == 0) {
            if (*p != '[')
                return -1;
            p++; /* skip '[' */

            req->param_count = 0;
            p = skip_ws(p, end);

            while (p < end && *p != ']') {
                if (req->param_count > 0) {
                    if (*p != ',')
                        break;
                    p++;
                    p = skip_ws(p, end);
                }

                if (p >= end)
                    return -1;

                if (*p == '"') {
                    /* String param */
                    if (req->param_count < MAX_PARAMS) {
                        p = parse_json_string(p, end,
                            req->params[req->param_count],
                            MAX_PARAM_LEN);
                        if (!p)
                            return -1;
                        req->param_count++;
                    } else {
                        p = skip_json_value(p, end);
                        if (!p)
                            return -1;
                    }
                } else {
                    /* Non-string param (number, bool, null, array, object) */
                    if (req->param_count < MAX_PARAMS) {
                        const char *start = p;
                        p = skip_json_value(p, end);
                        if (!p)
                            return -1;
                        size_t vlen = (size_t)(p - start);
                        if (vlen >= MAX_PARAM_LEN)
                            vlen = MAX_PARAM_LEN - 1;
                        memcpy(req->params[req->param_count], start, vlen);
                        req->params[req->param_count][vlen] = '\0';
                        req->param_count++;
                    } else {
                        p = skip_json_value(p, end);
                        if (!p)
                            return -1;
                    }
                }

                p = skip_ws(p, end);
            }

            if (p >= end || *p != ']')
                return -1;
            p++; /* skip ']' */
            found_params = 1;
        } else {
            /* Unknown key - skip value */
            p = skip_json_value(p, end);
            if (!p)
                return -1;
        }

        p = skip_ws(p, end);
    }

    if (!found_method)
        return -1;

    validate_request(req);
    return 0;
}

/*
 * libFuzzer entry point.
 * Feeds arbitrary byte sequences into the Stratum JSON-RPC parser.
 */
int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    /* Limit input size to prevent excessive processing */
    if (size > MAX_JSON_LEN)
        return 0;

    /* Null-terminate the input for safe string operations */
    char *buf = (char *)malloc(size + 1);
    if (!buf)
        return 0;
    memcpy(buf, data, size);
    buf[size] = '\0';

    stratum_request_t req;
    int ret = parse_stratum_request(buf, size, &req);

    /* If parsing succeeded, exercise the parsed data */
    if (ret == 0) {
        /* Access all parsed fields to catch memory errors under ASAN */
        volatile int method = req.method;
        volatile int64_t id = req.id;
        volatile int valid = req.valid;
        volatile int count = req.param_count;
        (void)method;
        (void)id;
        (void)valid;
        (void)count;

        /* Touch all param strings */
        for (int i = 0; i < req.param_count && i < MAX_PARAMS; i++) {
            volatile size_t plen = strlen(req.params[i]);
            (void)plen;
        }

        /* Touch method string */
        volatile size_t mlen = strlen(req.method_str);
        (void)mlen;
    }

    free(buf);
    return 0;
}
