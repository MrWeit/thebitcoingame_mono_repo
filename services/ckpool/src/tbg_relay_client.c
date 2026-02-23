/*
 * tbg_relay_client.c — Relay-side template receiver and failover manager
 * THE BITCOIN GAME — GPLv3
 *
 * Connects to the primary ckpool instance, receives block templates,
 * monitors heartbeat health, and fails over to independent mode when
 * the primary is unreachable.
 *
 * Threads:
 * - Receiver thread: reads messages from primary (templates, heartbeats)
 * - Heartbeat thread: sends heartbeats, monitors primary health, triggers failover
 */

#include "config.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <signal.h>
#include <fcntl.h>
#include <time.h>

#include "tbg_relay.h"
#include "tbg_relay_client.h"

#ifndef LOGNOTICE
#define LOGNOTICE(fmt, ...) fprintf(stderr, "TBG-RELAY-CLIENT NOTICE: " fmt "\n", ##__VA_ARGS__)
#endif
#ifndef LOGWARNING
#define LOGWARNING(fmt, ...) fprintf(stderr, "TBG-RELAY-CLIENT WARNING: " fmt "\n", ##__VA_ARGS__)
#endif

static tbg_relay_client_state_t client_state;
static tbg_template_callback_t template_callback = NULL;
static volatile bool client_running = false;
static char client_region[32] = "unknown";

/* Send a framed message. Returns 0 on success, -1 on failure. */
static int send_msg(int fd, uint8_t msg_type, const char *payload, uint32_t len)
{
	tbg_relay_hdr_t hdr;

	memcpy(hdr.magic, TBG_RELAY_MAGIC, TBG_RELAY_MAGIC_LEN);
	hdr.version = TBG_RELAY_VERSION;
	hdr.msg_type = msg_type;
	hdr.reserved = 0;
	hdr.length = htonl(len);

	if (send(fd, &hdr, TBG_RELAY_HDR_LEN, MSG_NOSIGNAL) != TBG_RELAY_HDR_LEN)
		return -1;

	if (len > 0 && payload) {
		uint32_t sent = 0;
		while (sent < len) {
			ssize_t n = send(fd, payload + sent, len - sent, MSG_NOSIGNAL);
			if (n <= 0)
				return -1;
			sent += n;
		}
	}

	return 0;
}

/* Read exactly n bytes. Returns 0 on success, -1 on failure/EOF. */
static int recv_exact(int fd, void *buf, size_t n)
{
	size_t received = 0;

	while (received < n) {
		ssize_t r = recv(fd, (char *)buf + received, n - received, 0);
		if (r <= 0)
			return -1;
		received += r;
	}

	return 0;
}

/* Read one framed message. Caller must free *payload. Returns msg_type or -1. */
static int recv_msg(int fd, char **payload, uint32_t *out_len)
{
	tbg_relay_hdr_t hdr;

	*payload = NULL;
	*out_len = 0;

	if (recv_exact(fd, &hdr, TBG_RELAY_HDR_LEN) < 0)
		return -1;

	if (memcmp(hdr.magic, TBG_RELAY_MAGIC, TBG_RELAY_MAGIC_LEN) != 0)
		return -1;

	if (hdr.version != TBG_RELAY_VERSION)
		return -1;

	uint32_t len = ntohl(hdr.length);
	if (len > TBG_RELAY_MAX_MSG)
		return -1;

	if (len > 0) {
		*payload = malloc(len + 1);
		if (!*payload)
			return -1;

		if (recv_exact(fd, *payload, len) < 0) {
			free(*payload);
			*payload = NULL;
			return -1;
		}
		(*payload)[len] = '\0';
	}

	*out_len = len;
	return hdr.msg_type;
}

/* Connect to the primary. Returns fd or -1. */
static int connect_to_primary(void)
{
	struct addrinfo hints, *res, *rp;
	char port_str[16];
	int fd = -1;

	memset(&hints, 0, sizeof(hints));
	hints.ai_family = AF_INET;
	hints.ai_socktype = SOCK_STREAM;

	snprintf(port_str, sizeof(port_str), "%d", client_state.primary_port);

	if (getaddrinfo(client_state.primary_host, port_str, &hints, &res) != 0) {
		LOGWARNING("TBG: Cannot resolve primary host '%s'", client_state.primary_host);
		return -1;
	}

	for (rp = res; rp != NULL; rp = rp->ai_next) {
		fd = socket(rp->ai_family, rp->ai_socktype, rp->ai_protocol);
		if (fd < 0)
			continue;

		/* Set connect timeout */
		struct timeval tv = {.tv_sec = 5, .tv_usec = 0};
		setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

		if (connect(fd, rp->ai_addr, rp->ai_addrlen) == 0)
			break;

		close(fd);
		fd = -1;
	}

	freeaddrinfo(res);

	if (fd >= 0) {
		int optval = 1;
		setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &optval, sizeof(optval));
		setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &optval, sizeof(optval));
	}

	return fd;
}

/* Receiver thread — reads messages from primary */
static void *receiver_thread(void *arg)
{
	(void)arg;

	signal(SIGPIPE, SIG_IGN);

	while (client_running) {
		if (client_state.fd < 0) {
			/* Not connected — try to connect */
			LOGNOTICE("TBG: Connecting to primary %s:%d...",
				  client_state.primary_host, client_state.primary_port);

			client_state.fd = connect_to_primary();
			if (client_state.fd < 0) {
				LOGWARNING("TBG: Cannot connect to primary, retrying in 3s");
				sleep(3);
				continue;
			}

			client_state.connected = true;
			client_state.last_heartbeat = time(NULL);

			/* Send registration */
			send_msg(client_state.fd, TBG_MSG_REGISTER,
				 client_region, strlen(client_region));

			LOGNOTICE("TBG: Connected to primary, registered as '%s'", client_region);

			/* If we were in independent mode, recover */
			if (client_state.independent_mode) {
				client_state.independent_mode = false;
				LOGNOTICE("TBG: Recovered from independent mode, resuming relay");
			}
		}

		/* Set recv timeout */
		struct timeval tv = {.tv_sec = 2, .tv_usec = 0};
		setsockopt(client_state.fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

		char *payload;
		uint32_t len;
		int msg_type = recv_msg(client_state.fd, &payload, &len);

		if (msg_type < 0) {
			if (errno == EAGAIN || errno == EWOULDBLOCK)
				continue;

			/* Connection lost */
			LOGWARNING("TBG: Lost connection to primary");
			close(client_state.fd);
			client_state.fd = -1;
			client_state.connected = false;
			continue;
		}

		switch (msg_type) {
		case TBG_MSG_HEARTBEAT:
			client_state.last_heartbeat = time(NULL);
			break;

		case TBG_MSG_TEMPLATE:
			client_state.last_heartbeat = time(NULL);
			if (payload && template_callback && !client_state.independent_mode) {
				LOGNOTICE("TBG: Received template from primary (%u bytes)", len);
				template_callback(payload, len);
			}
			break;

		case TBG_MSG_CONFIG_SYNC:
			client_state.last_heartbeat = time(NULL);
			LOGNOTICE("TBG: Received config sync from primary");
			break;

		default:
			LOGWARNING("TBG: Unknown message type %d from primary", msg_type);
			break;
		}

		free(payload);
	}

	return NULL;
}

/* Heartbeat/failover monitor thread */
static void *heartbeat_monitor(void *arg)
{
	(void)arg;

	while (client_running) {
		sleep(TBG_RELAY_HB_INTERVAL);

		if (!client_running)
			break;

		/* Send heartbeat if connected */
		if (client_state.connected && client_state.fd >= 0) {
			send_msg(client_state.fd, TBG_MSG_HEARTBEAT, NULL, 0);
		}

		/* Check for failover */
		if (client_state.connected) {
			time_t now = time(NULL);
			time_t elapsed = now - client_state.last_heartbeat;

			if (elapsed > client_state.failover_timeout &&
			    !client_state.independent_mode) {
				LOGWARNING("TBG: Primary unreachable for %lds (timeout=%ds), "
					   "switching to INDEPENDENT MODE",
					   (long)elapsed, client_state.failover_timeout);
				client_state.independent_mode = true;

				/* Close the dead connection */
				if (client_state.fd >= 0) {
					close(client_state.fd);
					client_state.fd = -1;
					client_state.connected = false;
				}
			}
		}
	}

	return NULL;
}

int tbg_relay_client_init(const char *primary_url, int failover_timeout,
			  const char *region)
{
	char *colon;

	if (client_running)
		return 0;

	if (!primary_url || !primary_url[0]) {
		LOGWARNING("TBG: No primary URL specified for relay mode");
		return -1;
	}

	memset(&client_state, 0, sizeof(client_state));
	client_state.fd = -1;
	client_state.failover_timeout = failover_timeout > 0 ? failover_timeout : TBG_RELAY_HB_TIMEOUT;

	/* Parse host:port */
	strncpy(client_state.primary_host, primary_url, sizeof(client_state.primary_host) - 1);
	colon = strrchr(client_state.primary_host, ':');
	if (colon) {
		*colon = '\0';
		client_state.primary_port = atoi(colon + 1);
	}
	if (client_state.primary_port <= 0)
		client_state.primary_port = TBG_RELAY_PORT_DEFAULT;

	if (region)
		strncpy(client_region, region, sizeof(client_region) - 1);

	client_running = true;

	/* Start receiver thread */
	if (pthread_create(&client_state.recv_thread, NULL, receiver_thread, NULL) != 0) {
		LOGWARNING("TBG: Failed to start relay receiver thread");
		client_running = false;
		return -1;
	}

	/* Start heartbeat monitor */
	if (pthread_create(&client_state.heartbeat_thread, NULL, heartbeat_monitor, NULL) != 0) {
		LOGWARNING("TBG: Failed to start relay heartbeat thread");
		/* Non-fatal */
	}

	LOGNOTICE("TBG: Relay client initialized, connecting to %s:%d (region=%s, timeout=%ds)",
		  client_state.primary_host, client_state.primary_port,
		  client_region, client_state.failover_timeout);

	return 0;
}

void tbg_relay_client_shutdown(void)
{
	if (!client_running)
		return;

	LOGNOTICE("TBG: Shutting down relay client");
	client_running = false;

	if (client_state.fd >= 0) {
		shutdown(client_state.fd, SHUT_RDWR);
		close(client_state.fd);
		client_state.fd = -1;
	}

	pthread_join(client_state.recv_thread, NULL);
	pthread_join(client_state.heartbeat_thread, NULL);

	LOGNOTICE("TBG: Relay client shut down");
}

int tbg_relay_is_independent(void)
{
	return client_state.independent_mode ? 1 : 0;
}

int tbg_relay_send_block(const char *block_json, int len)
{
	if (!client_state.connected || client_state.fd < 0)
		return -1;

	return send_msg(client_state.fd, TBG_MSG_BLOCK_FOUND, block_json, len);
}

void tbg_relay_set_template_callback(tbg_template_callback_t cb)
{
	template_callback = cb;
}
