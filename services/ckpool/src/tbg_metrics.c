/*
 * tbg_metrics.c — Prometheus metrics HTTP endpoint for ckpool
 * THE BITCOIN GAME — GPLv3
 *
 * Runs a lightweight HTTP server on a dedicated thread that serves
 * metrics in Prometheus exposition text format. All counters use
 * C11 _Atomic types for lock-free thread safety.
 */

#include "config.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <errno.h>
#include <signal.h>

#include "tbg_metrics.h"

/* Global metrics instance */
ckpool_metrics_t g_metrics = {0};

static int metrics_server_fd = -1;
static pthread_t metrics_thread;
static volatile int metrics_running = 0;

int tbg_format_metrics(char *buf, int buflen)
{
	time_t uptime = time(NULL) - g_metrics.start_time;
	int n = 0;

	n += snprintf(buf + n, buflen - n,
		"# HELP ckpool_shares_valid_total Total valid shares accepted\n"
		"# TYPE ckpool_shares_valid_total counter\n"
		"ckpool_shares_valid_total %lu\n",
		(unsigned long)METRIC_GET(shares_valid));

	n += snprintf(buf + n, buflen - n,
		"# HELP ckpool_shares_invalid_total Total invalid/rejected shares\n"
		"# TYPE ckpool_shares_invalid_total counter\n"
		"ckpool_shares_invalid_total %lu\n",
		(unsigned long)METRIC_GET(shares_invalid));

	n += snprintf(buf + n, buflen - n,
		"# HELP ckpool_shares_stale_total Total stale shares\n"
		"# TYPE ckpool_shares_stale_total counter\n"
		"ckpool_shares_stale_total %lu\n",
		(unsigned long)METRIC_GET(shares_stale));

	n += snprintf(buf + n, buflen - n,
		"# HELP ckpool_blocks_found_total Total blocks found by pool\n"
		"# TYPE ckpool_blocks_found_total counter\n"
		"ckpool_blocks_found_total %lu\n",
		(unsigned long)METRIC_GET(blocks_found));

	n += snprintf(buf + n, buflen - n,
		"# HELP ckpool_connected_miners Current number of connected miners\n"
		"# TYPE ckpool_connected_miners gauge\n"
		"ckpool_connected_miners %ld\n",
		(long)METRIC_GET(connected_miners));

	n += snprintf(buf + n, buflen - n,
		"# HELP ckpool_bitcoin_height Current Bitcoin block height\n"
		"# TYPE ckpool_bitcoin_height gauge\n"
		"ckpool_bitcoin_height %ld\n",
		(long)METRIC_GET(bitcoin_height));

	n += snprintf(buf + n, buflen - n,
		"# HELP ckpool_bitcoin_connected Bitcoin node connection status\n"
		"# TYPE ckpool_bitcoin_connected gauge\n"
		"ckpool_bitcoin_connected %d\n",
		(int)METRIC_GET(bitcoin_connected));

	n += snprintf(buf + n, buflen - n,
		"# HELP ckpool_asicboost_miners_total Miners detected using AsicBoost\n"
		"# TYPE ckpool_asicboost_miners_total counter\n"
		"ckpool_asicboost_miners_total %lu\n",
		(unsigned long)METRIC_GET(asicboost_miners));

	n += snprintf(buf + n, buflen - n,
		"# HELP ckpool_total_diff_accepted_total Total difficulty of accepted shares\n"
		"# TYPE ckpool_total_diff_accepted_total counter\n"
		"ckpool_total_diff_accepted_total %lu\n",
		(unsigned long)METRIC_GET(total_diff_accepted));

	n += snprintf(buf + n, buflen - n,
		"# HELP ckpool_uptime_seconds Seconds since ckpool started\n"
		"# TYPE ckpool_uptime_seconds gauge\n"
		"ckpool_uptime_seconds %ld\n",
		(long)uptime);

	return n;
}

static void handle_metrics_request(int client_fd)
{
	char req[1024];
	char body[8192];
	char response[10240];
	int body_len, resp_len;
	ssize_t n;

	/* Read the HTTP request (we only care that it's a GET) */
	n = recv(client_fd, req, sizeof(req) - 1, 0);
	if (n <= 0)
		goto out;
	req[n] = '\0';

	/* Only respond to GET requests */
	if (strncmp(req, "GET ", 4) != 0) {
		const char *bad = "HTTP/1.1 405 Method Not Allowed\r\n\r\n";
		send(client_fd, bad, strlen(bad), MSG_NOSIGNAL);
		goto out;
	}

	body_len = tbg_format_metrics(body, sizeof(body));

	resp_len = snprintf(response, sizeof(response),
		"HTTP/1.1 200 OK\r\n"
		"Content-Type: text/plain; version=0.0.4; charset=utf-8\r\n"
		"Content-Length: %d\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		body_len, body);

	send(client_fd, response, resp_len, MSG_NOSIGNAL);

out:
	close(client_fd);
}

static void *metrics_server_thread(void *arg)
{
	int port = *(int *)arg;
	struct sockaddr_in addr;
	int optval = 1;

	free(arg);

	/* Ignore SIGPIPE in this thread */
	signal(SIGPIPE, SIG_IGN);

	metrics_server_fd = socket(AF_INET, SOCK_STREAM, 0);
	if (metrics_server_fd < 0)
		return NULL;

	setsockopt(metrics_server_fd, SOL_SOCKET, SO_REUSEADDR, &optval, sizeof(optval));

	memset(&addr, 0, sizeof(addr));
	addr.sin_family = AF_INET;
	addr.sin_addr.s_addr = INADDR_ANY;
	addr.sin_port = htons(port);

	if (bind(metrics_server_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
		close(metrics_server_fd);
		metrics_server_fd = -1;
		return NULL;
	}

	if (listen(metrics_server_fd, 5) < 0) {
		close(metrics_server_fd);
		metrics_server_fd = -1;
		return NULL;
	}

	while (metrics_running) {
		struct sockaddr_in client_addr;
		socklen_t client_len = sizeof(client_addr);
		int client_fd;

		/* Use a timeout so we can check metrics_running */
		struct timeval tv = {.tv_sec = 1, .tv_usec = 0};
		fd_set fds;
		FD_ZERO(&fds);
		FD_SET(metrics_server_fd, &fds);

		int ready = select(metrics_server_fd + 1, &fds, NULL, NULL, &tv);
		if (ready <= 0)
			continue;

		client_fd = accept(metrics_server_fd, (struct sockaddr *)&client_addr, &client_len);
		if (client_fd < 0)
			continue;

		handle_metrics_request(client_fd);
	}

	close(metrics_server_fd);
	metrics_server_fd = -1;
	return NULL;
}

void tbg_metrics_init(int port)
{
	int *port_arg;

	if (metrics_running)
		return;

	g_metrics.start_time = time(NULL);
	metrics_running = 1;

	port_arg = malloc(sizeof(int));
	if (!port_arg)
		return;
	*port_arg = port;

	if (pthread_create(&metrics_thread, NULL, metrics_server_thread, port_arg) != 0) {
		free(port_arg);
		metrics_running = 0;
	}
}

void tbg_metrics_shutdown(void)
{
	if (!metrics_running)
		return;

	metrics_running = 0;

	if (metrics_server_fd >= 0) {
		shutdown(metrics_server_fd, SHUT_RDWR);
		close(metrics_server_fd);
		metrics_server_fd = -1;
	}

	pthread_join(metrics_thread, NULL);
}
