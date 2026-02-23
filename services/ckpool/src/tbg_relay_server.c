/*
 * tbg_relay_server.c — Primary-side relay server
 * THE BITCOIN GAME — GPLv3
 *
 * Listens for incoming relay connections on a TCP port.
 * When the stratifier generates a new block template, it is pushed
 * to all connected relays. Relays can also send back block solutions
 * for dual submission.
 *
 * Architecture:
 * - Main listener thread: accepts connections, spawns per-peer threads
 * - Per-peer thread: reads messages from relay, handles registration + block found
 * - Heartbeat thread: periodically sends heartbeats, reaps dead peers
 * - Push: tbg_relay_push_template() is called from the stratifier when update_base() fires
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
#include <signal.h>
#include <fcntl.h>
#include <time.h>

#include "tbg_relay.h"
#include "tbg_relay_server.h"

/* Logging macros — ckpool provides LOGNOTICE, LOGWARNING, etc.
 * but they may not be available here. Use fprintf as fallback. */
#ifndef LOGNOTICE
#define LOGNOTICE(fmt, ...) fprintf(stderr, "TBG-RELAY-SERVER NOTICE: " fmt "\n", ##__VA_ARGS__)
#endif
#ifndef LOGWARNING
#define LOGWARNING(fmt, ...) fprintf(stderr, "TBG-RELAY-SERVER WARNING: " fmt "\n", ##__VA_ARGS__)
#endif

static tbg_relay_server_state_t server_state;

/* Send a framed message to a peer. Returns 0 on success, -1 on failure. */
static int send_msg(int fd, uint8_t msg_type, const char *payload, uint32_t len)
{
	tbg_relay_hdr_t hdr;

	memcpy(hdr.magic, TBG_RELAY_MAGIC, TBG_RELAY_MAGIC_LEN);
	hdr.version = TBG_RELAY_VERSION;
	hdr.msg_type = msg_type;
	hdr.reserved = 0;
	hdr.length = htonl(len);

	/* Send header */
	if (send(fd, &hdr, TBG_RELAY_HDR_LEN, MSG_NOSIGNAL) != TBG_RELAY_HDR_LEN)
		return -1;

	/* Send payload if present */
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

/* Read exactly n bytes from fd. Returns 0 on success, -1 on failure/EOF. */
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

/* Per-peer handler thread */
static void *peer_handler(void *arg)
{
	tbg_relay_peer_t *peer = (tbg_relay_peer_t *)arg;
	char *payload;
	uint32_t len;

	signal(SIGPIPE, SIG_IGN);

	LOGNOTICE("TBG: Relay peer connected (fd=%d)", peer->fd);

	while (peer->active && server_state.running) {
		/* Set recv timeout so we can check running flag */
		struct timeval tv = {.tv_sec = 2, .tv_usec = 0};
		setsockopt(peer->fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

		int msg_type = recv_msg(peer->fd, &payload, &len);

		if (msg_type < 0) {
			if (errno == EAGAIN || errno == EWOULDBLOCK)
				continue;
			break; /* Connection lost */
		}

		switch (msg_type) {
		case TBG_MSG_HEARTBEAT:
			peer->last_heartbeat = time(NULL);
			break;

		case TBG_MSG_REGISTER:
			if (payload && len < sizeof(peer->region)) {
				strncpy(peer->region, payload, sizeof(peer->region) - 1);
				peer->region[sizeof(peer->region) - 1] = '\0';
				LOGNOTICE("TBG: Relay registered from region '%s'", peer->region);
			}
			peer->last_heartbeat = time(NULL);
			break;

		case TBG_MSG_BLOCK_FOUND:
			if (payload) {
				LOGNOTICE("TBG: Block found by relay '%s': %.*s",
					  peer->region, len > 128 ? 128 : (int)len, payload);
				/* TODO: Forward to generator for submitblock */
			}
			break;

		default:
			LOGWARNING("TBG: Unknown message type %d from relay", msg_type);
			break;
		}

		free(payload);
	}

	LOGNOTICE("TBG: Relay peer disconnected (region='%s', fd=%d)", peer->region, peer->fd);

	close(peer->fd);
	peer->fd = -1;
	peer->active = false;

	return NULL;
}

/* Heartbeat sender thread — sends heartbeats to all peers, reaps dead ones */
static void *heartbeat_sender(void *arg)
{
	(void)arg;

	signal(SIGPIPE, SIG_IGN);

	while (server_state.running) {
		sleep(TBG_RELAY_HB_INTERVAL);

		if (!server_state.running)
			break;

		time_t now = time(NULL);

		pthread_mutex_lock(&server_state.peers_lock);
		for (int i = 0; i < server_state.peer_count; i++) {
			tbg_relay_peer_t *peer = &server_state.peers[i];

			if (!peer->active)
				continue;

			/* Send heartbeat */
			if (send_msg(peer->fd, TBG_MSG_HEARTBEAT, NULL, 0) < 0) {
				LOGWARNING("TBG: Failed to send heartbeat to relay '%s'", peer->region);
				peer->active = false;
				continue;
			}

			/* Check for dead peer (no heartbeat received for 3x interval) */
			if (now - peer->last_heartbeat > TBG_RELAY_HB_INTERVAL * 3) {
				LOGWARNING("TBG: Relay '%s' timed out, removing", peer->region);
				peer->active = false;
			}
		}
		pthread_mutex_unlock(&server_state.peers_lock);
	}

	return NULL;
}

/* Listener thread — accepts connections and spawns per-peer handlers */
static void *listener_thread(void *arg)
{
	(void)arg;

	signal(SIGPIPE, SIG_IGN);

	LOGNOTICE("TBG: Relay server listening on port %d", server_state.port);

	while (server_state.running) {
		struct sockaddr_in client_addr;
		socklen_t client_len = sizeof(client_addr);
		int client_fd;

		/* Use select with timeout to allow clean shutdown */
		fd_set fds;
		struct timeval tv = {.tv_sec = 1, .tv_usec = 0};
		FD_ZERO(&fds);
		FD_SET(server_state.listen_fd, &fds);

		int ready = select(server_state.listen_fd + 1, &fds, NULL, NULL, &tv);
		if (ready <= 0)
			continue;

		client_fd = accept(server_state.listen_fd, (struct sockaddr *)&client_addr, &client_len);
		if (client_fd < 0)
			continue;

		/* Enable TCP keepalive */
		int optval = 1;
		setsockopt(client_fd, SOL_SOCKET, SO_KEEPALIVE, &optval, sizeof(optval));
		setsockopt(client_fd, IPPROTO_TCP, TCP_NODELAY, &optval, sizeof(optval));

		/* Find a slot for this peer */
		pthread_mutex_lock(&server_state.peers_lock);

		int slot = -1;
		for (int i = 0; i < TBG_RELAY_MAX_PEERS; i++) {
			if (!server_state.peers[i].active) {
				slot = i;
				break;
			}
		}

		if (slot < 0) {
			pthread_mutex_unlock(&server_state.peers_lock);
			LOGWARNING("TBG: Max relay peers reached, rejecting connection");
			close(client_fd);
			continue;
		}

		tbg_relay_peer_t *peer = &server_state.peers[slot];
		memset(peer, 0, sizeof(*peer));
		peer->fd = client_fd;
		peer->active = true;
		peer->last_heartbeat = time(NULL);
		strcpy(peer->region, "unknown");

		if (slot >= server_state.peer_count)
			server_state.peer_count = slot + 1;

		pthread_mutex_unlock(&server_state.peers_lock);

		/* Spawn handler thread */
		if (pthread_create(&peer->thread, NULL, peer_handler, peer) != 0) {
			LOGWARNING("TBG: Failed to create peer handler thread");
			close(client_fd);
			peer->active = false;
		} else {
			pthread_detach(peer->thread);
		}
	}

	return NULL;
}

int tbg_relay_server_init(int port)
{
	struct sockaddr_in addr;
	int optval = 1;

	if (server_state.running)
		return 0;

	memset(&server_state, 0, sizeof(server_state));
	server_state.port = port > 0 ? port : TBG_RELAY_PORT_DEFAULT;
	pthread_mutex_init(&server_state.peers_lock, NULL);

	/* Create listener socket */
	server_state.listen_fd = socket(AF_INET, SOCK_STREAM, 0);
	if (server_state.listen_fd < 0) {
		LOGWARNING("TBG: Cannot create relay listener socket: %s", strerror(errno));
		return -1;
	}

	setsockopt(server_state.listen_fd, SOL_SOCKET, SO_REUSEADDR, &optval, sizeof(optval));

	memset(&addr, 0, sizeof(addr));
	addr.sin_family = AF_INET;
	addr.sin_addr.s_addr = INADDR_ANY;
	addr.sin_port = htons(server_state.port);

	if (bind(server_state.listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
		LOGWARNING("TBG: Cannot bind relay port %d: %s", server_state.port, strerror(errno));
		close(server_state.listen_fd);
		return -1;
	}

	if (listen(server_state.listen_fd, 8) < 0) {
		LOGWARNING("TBG: Cannot listen on relay port: %s", strerror(errno));
		close(server_state.listen_fd);
		return -1;
	}

	server_state.running = true;

	/* Start listener thread */
	if (pthread_create(&server_state.listen_thread, NULL, listener_thread, NULL) != 0) {
		LOGWARNING("TBG: Failed to start relay listener thread");
		server_state.running = false;
		close(server_state.listen_fd);
		return -1;
	}

	/* Start heartbeat thread */
	if (pthread_create(&server_state.heartbeat_thread, NULL, heartbeat_sender, NULL) != 0) {
		LOGWARNING("TBG: Failed to start relay heartbeat thread");
		/* Non-fatal — server still works without outbound heartbeats */
	}

	LOGNOTICE("TBG: Relay server initialized on port %d", server_state.port);
	return 0;
}

void tbg_relay_server_shutdown(void)
{
	if (!server_state.running)
		return;

	LOGNOTICE("TBG: Shutting down relay server");
	server_state.running = false;

	/* Close listener to unblock accept() */
	if (server_state.listen_fd >= 0) {
		shutdown(server_state.listen_fd, SHUT_RDWR);
		close(server_state.listen_fd);
		server_state.listen_fd = -1;
	}

	/* Mark all peers inactive to unblock their threads */
	pthread_mutex_lock(&server_state.peers_lock);
	for (int i = 0; i < server_state.peer_count; i++) {
		if (server_state.peers[i].active) {
			server_state.peers[i].active = false;
			if (server_state.peers[i].fd >= 0) {
				shutdown(server_state.peers[i].fd, SHUT_RDWR);
				close(server_state.peers[i].fd);
				server_state.peers[i].fd = -1;
			}
		}
	}
	pthread_mutex_unlock(&server_state.peers_lock);

	/* Wait for threads */
	pthread_join(server_state.listen_thread, NULL);
	pthread_join(server_state.heartbeat_thread, NULL);

	pthread_mutex_destroy(&server_state.peers_lock);
	LOGNOTICE("TBG: Relay server shut down");
}

void tbg_relay_push_template(const char *template_json, int len)
{
	if (!server_state.running || !template_json || len <= 0)
		return;

	pthread_mutex_lock(&server_state.peers_lock);
	for (int i = 0; i < server_state.peer_count; i++) {
		tbg_relay_peer_t *peer = &server_state.peers[i];

		if (!peer->active)
			continue;

		if (send_msg(peer->fd, TBG_MSG_TEMPLATE, template_json, len) < 0) {
			LOGWARNING("TBG: Failed to push template to relay '%s'", peer->region);
			/* Don't kill the peer here — heartbeat will handle it */
		}
	}
	pthread_mutex_unlock(&server_state.peers_lock);
}

int tbg_relay_peer_count(void)
{
	int count = 0;

	pthread_mutex_lock(&server_state.peers_lock);
	for (int i = 0; i < server_state.peer_count; i++) {
		if (server_state.peers[i].active)
			count++;
	}
	pthread_mutex_unlock(&server_state.peers_lock);

	return count;
}
