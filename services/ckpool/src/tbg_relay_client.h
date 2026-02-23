/*
 * tbg_relay_client.h — Relay-side template receiver
 * THE BITCOIN GAME — GPLv3
 *
 * Connects to primary, receives templates, monitors heartbeat,
 * handles failover to independent mode.
 */

#ifndef TBG_RELAY_CLIENT_H
#define TBG_RELAY_CLIENT_H

#include "tbg_relay.h"

/* Initialize and start the relay client (relay mode).
 * primary_url: "host:port" of the primary
 * failover_timeout: seconds before switching to independent mode
 * region: this relay's region tag
 * Returns 0 on success, -1 on failure. */
int tbg_relay_client_init(const char *primary_url, int failover_timeout,
			  const char *region);

/* Gracefully shut down the relay client */
void tbg_relay_client_shutdown(void);

/* Check if the relay is in independent (failover) mode */
int tbg_relay_is_independent(void);

/* Send a block found notification to the primary.
 * block_json: JSON string with block data
 * len: length of the JSON string
 * Returns 0 on success (sent), -1 on failure (not connected) */
int tbg_relay_send_block(const char *block_json, int len);

/* Callback type for template received from primary */
typedef void (*tbg_template_callback_t)(const char *template_json, int len);

/* Set the callback invoked when a new template arrives from the primary */
void tbg_relay_set_template_callback(tbg_template_callback_t cb);

#endif /* TBG_RELAY_CLIENT_H */
