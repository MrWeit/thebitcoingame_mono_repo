/*
 * tbg_relay.h — Shared types for the relay/primary template sync system
 * THE BITCOIN GAME — GPLv3
 *
 * Wire protocol between primary and relay ckpool instances.
 * Primary pushes block templates to relays; relays send back block solutions.
 * Heartbeats maintain connection health; relays fail over to independent
 * mode if the primary is unreachable for tbg_failover_timeout seconds.
 */

#ifndef TBG_RELAY_H
#define TBG_RELAY_H

#include <stdint.h>
#include <stdbool.h>
#include <time.h>
#include <pthread.h>

/* Wire protocol constants */
#define TBG_RELAY_MAGIC      "TBGR"
#define TBG_RELAY_MAGIC_LEN  4
#define TBG_RELAY_VERSION    1
#define TBG_RELAY_HDR_LEN    12      /* magic(4) + version(1) + type(1) + reserved(2) + length(4) */
#define TBG_RELAY_MAX_MSG    (4*1024*1024) /* 4 MB max message */
#define TBG_RELAY_PORT_DEFAULT 8881
#define TBG_RELAY_HB_INTERVAL  3     /* seconds between heartbeats */
#define TBG_RELAY_HB_TIMEOUT  10     /* seconds before declaring primary dead */
#define TBG_RELAY_MAX_PEERS   16

/* Message types */
enum tbg_relay_msg_type {
	TBG_MSG_TEMPLATE    = 1,  /* New block template (primary → relay) */
	TBG_MSG_HEARTBEAT   = 2,  /* Keepalive (bidirectional) */
	TBG_MSG_BLOCK_FOUND = 3,  /* Block solution (relay → primary) */
	TBG_MSG_CONFIG_SYNC = 4,  /* Config/difficulty sync (primary → relay) */
	TBG_MSG_REGISTER    = 5   /* Relay self-registration (relay → primary) */
};

/* Wire header (packed, network byte order for length) */
typedef struct __attribute__((packed)) tbg_relay_hdr {
	char     magic[4];       /* "TBGR" */
	uint8_t  version;        /* Protocol version (1) */
	uint8_t  msg_type;       /* enum tbg_relay_msg_type */
	uint16_t reserved;       /* Future use, set to 0 */
	uint32_t length;         /* Payload length in bytes (network order) */
} tbg_relay_hdr_t;

/* Per-relay peer state (used by primary) */
typedef struct tbg_relay_peer {
	int       fd;
	char      region[32];
	time_t    last_heartbeat;
	pthread_t thread;
	bool      active;
} tbg_relay_peer_t;

/* Relay client state (used by relay) */
typedef struct tbg_relay_client_state {
	int       fd;
	char      primary_host[256];
	int       primary_port;
	int       failover_timeout;
	time_t    last_heartbeat;
	bool      connected;
	bool      independent_mode;
	pthread_t recv_thread;
	pthread_t heartbeat_thread;
} tbg_relay_client_state_t;

/* Global relay server state (used by primary) */
typedef struct tbg_relay_server_state {
	int                listen_fd;
	int                port;
	tbg_relay_peer_t   peers[TBG_RELAY_MAX_PEERS];
	int                peer_count;
	pthread_mutex_t    peers_lock;
	pthread_t          listen_thread;
	pthread_t          heartbeat_thread;
	bool               running;
	/* Callback: pointer to function that returns current template JSON */
	char *(*get_template)(void);
} tbg_relay_server_state_t;

#endif /* TBG_RELAY_H */
