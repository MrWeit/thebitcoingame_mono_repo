/*
 * tbg_relay_server.h — Primary-side relay server
 * THE BITCOIN GAME — GPLv3
 *
 * Manages incoming relay connections, pushes templates, handles block submissions.
 */

#ifndef TBG_RELAY_SERVER_H
#define TBG_RELAY_SERVER_H

#include "tbg_relay.h"

/* Initialize and start the relay server (primary mode).
 * Spawns listener + heartbeat threads.
 * port: TCP port to listen on (default TBG_RELAY_PORT_DEFAULT)
 * Returns 0 on success, -1 on failure. */
int tbg_relay_server_init(int port);

/* Gracefully shut down the relay server */
void tbg_relay_server_shutdown(void);

/* Push a new block template to all connected relays.
 * template_json: JSON string of the block template
 * len: length of the JSON string */
void tbg_relay_push_template(const char *template_json, int len);

/* Get the number of connected relay peers */
int tbg_relay_peer_count(void);

#endif /* TBG_RELAY_SERVER_H */
