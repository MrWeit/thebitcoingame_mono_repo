/*
 * rate_limit.h — Token-bucket rate limiter for ckpool
 * THE BITCOIN GAME — GPLv3
 *
 * Protects against connection flooding, share spam, and resource
 * exhaustion from malicious or misconfigured miners. Uses a hash
 * map (uthash) keyed by IP address with atomic counters for
 * thread safety.
 */

#ifndef TBG_RATE_LIMIT_H
#define TBG_RATE_LIMIT_H

#include <stdbool.h>
#include <stdint.h>
#include <stdatomic.h>
#include <time.h>
#include <pthread.h>
#include <netinet/in.h>

/* Rate limit types */
typedef enum {
	RATE_CONNECT,          /* New TCP connections per IP */
	RATE_SUBSCRIBE,        /* mining.subscribe per connection */
	RATE_AUTHORIZE,        /* mining.authorize per connection */
	RATE_SUBMIT,           /* mining.submit per connection */
	RATE_INVALID_SHARE,    /* Invalid shares per connection */
	RATE_TYPE_COUNT
} rate_limit_type_t;

/* Default limits */
#define RATE_CONNECT_PER_MIN       10
#define RATE_CONNECT_MAX_CONCURRENT 50
#define RATE_SUBSCRIBE_PER_MIN     3
#define RATE_AUTHORIZE_PER_MIN     5
#define RATE_SUBMIT_PER_MIN        1000
#define RATE_INVALID_PER_MIN       100
#define RATE_GLOBAL_MAX_CONNS      100000

/* Soft-ban duration for share flooding (seconds) */
#define RATE_SOFTBAN_DURATION      300   /* 5 minutes */

/* Cleanup interval for stale IP entries (seconds) */
#define RATE_CLEANUP_INTERVAL      60

/* Stale threshold: remove IP entries not seen for this long */
#define RATE_STALE_THRESHOLD       300   /* 5 minutes */

/* Token bucket for a single limit type */
typedef struct rate_bucket {
	_Atomic uint32_t tokens;
	uint32_t max_tokens;
	uint32_t refill_per_min;
	time_t last_refill;
} rate_bucket_t;

/* Per-IP rate state (uthash entry) */
typedef struct ip_rate_state {
	char ip[INET6_ADDRSTRLEN];       /* Hash key */
	rate_bucket_t connect_bucket;    /* Connection rate bucket */
	_Atomic int32_t active_connections;  /* Current concurrent connections */
	time_t first_seen;
	time_t last_seen;
	time_t softban_until;            /* 0 if not banned */
	void *hh_ptr;                    /* UT_hash_handle placeholder - actual handle in .c */
} ip_rate_state_t;

/* Per-connection rate state (embedded in client struct) */
typedef struct conn_rate_state {
	rate_bucket_t subscribe_bucket;
	rate_bucket_t authorize_bucket;
	rate_bucket_t submit_bucket;
	rate_bucket_t invalid_bucket;
} conn_rate_state_t;

/* Rate limiter configuration (from ckpool.conf) */
typedef struct rate_limit_config {
	int connections_per_ip_per_minute;
	int max_connections_per_ip;
	int max_subscribes_per_minute;
	int max_authorizes_per_minute;
	int max_shares_per_minute;
	int max_invalid_shares_per_minute;
	int global_max_connections;
	int softban_duration_seconds;
} rate_limit_config_t;

/*
 * Initialize the rate limiter subsystem.
 * Must be called once at startup. Starts the background cleanup thread.
 */
void tbg_rate_limit_init(const rate_limit_config_t *config);

/*
 * Shut down the rate limiter. Stops the cleanup thread, frees all entries.
 */
void tbg_rate_limit_shutdown(void);

/*
 * Check if a new connection from this IP should be allowed.
 * Returns true if allowed, false if rate limited.
 * If allowed, increments the active connection count.
 */
bool tbg_rate_limit_connect(const char *ip);

/*
 * Notify that a connection from this IP has closed.
 * Decrements the active connection count.
 */
void tbg_rate_limit_disconnect(const char *ip);

/*
 * Check if this IP is currently soft-banned.
 * Returns true if banned, false otherwise.
 */
bool tbg_rate_limit_is_banned(const char *ip);

/*
 * Check if a per-connection action is allowed.
 * Returns true if allowed, false if rate limited.
 * On false, the caller should disconnect or reject.
 */
bool tbg_rate_limit_check_conn(conn_rate_state_t *state,
                               rate_limit_type_t type);

/*
 * Initialize per-connection rate state.
 * Called when a new connection is established.
 */
void tbg_rate_limit_conn_init(conn_rate_state_t *state);

/*
 * Get the current global connection count.
 */
int tbg_rate_limit_global_connections(void);

/*
 * Soft-ban an IP for the configured duration.
 * Called when share flooding is detected.
 */
void tbg_rate_limit_softban(const char *ip);

#endif /* TBG_RATE_LIMIT_H */
