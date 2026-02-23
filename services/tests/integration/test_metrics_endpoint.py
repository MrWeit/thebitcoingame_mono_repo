"""Integration tests for the Prometheus metrics endpoint.

Verifies that ckpool exposes metrics in proper Prometheus exposition format
on port 9100.
"""

import urllib.request
import pytest


def fetch_metrics(url: str) -> str:
    """Fetch raw metrics text from the endpoint."""
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return resp.read().decode("utf-8")
    except Exception:
        pytest.skip("Metrics endpoint not available (is ckpool running?)")


class TestMetricsEndpoint:
    """Tests for the /metrics HTTP endpoint."""

    def test_endpoint_responds(self, metrics_url):
        """Metrics endpoint should return 200 OK."""
        text = fetch_metrics(metrics_url)
        assert len(text) > 0

    def test_prometheus_format(self, metrics_url):
        """Response should contain HELP and TYPE annotations."""
        text = fetch_metrics(metrics_url)
        assert "# HELP" in text
        assert "# TYPE" in text

    def test_shares_valid_counter(self, metrics_url):
        """shares_valid_total counter should be present."""
        text = fetch_metrics(metrics_url)
        assert "ckpool_shares_valid_total" in text
        # Should be a counter type
        assert "# TYPE ckpool_shares_valid_total counter" in text

    def test_shares_invalid_counter(self, metrics_url):
        """shares_invalid_total counter should be present."""
        text = fetch_metrics(metrics_url)
        assert "ckpool_shares_invalid_total" in text

    def test_shares_stale_counter(self, metrics_url):
        """shares_stale_total counter should be present."""
        text = fetch_metrics(metrics_url)
        assert "ckpool_shares_stale_total" in text

    def test_blocks_found_counter(self, metrics_url):
        """blocks_found_total counter should be present."""
        text = fetch_metrics(metrics_url)
        assert "ckpool_blocks_found_total" in text

    def test_connected_miners_gauge(self, metrics_url):
        """connected_miners should be a gauge type."""
        text = fetch_metrics(metrics_url)
        assert "# TYPE ckpool_connected_miners gauge" in text

    def test_bitcoin_height_gauge(self, metrics_url):
        """bitcoin_height should be a gauge type."""
        text = fetch_metrics(metrics_url)
        assert "# TYPE ckpool_bitcoin_height gauge" in text

    def test_uptime_seconds(self, metrics_url):
        """Uptime should be present and positive."""
        text = fetch_metrics(metrics_url)
        for line in text.splitlines():
            if line.startswith("ckpool_uptime_seconds "):
                uptime = float(line.split()[-1])
                assert uptime > 0, "Uptime should be positive"
                return
        pytest.fail("ckpool_uptime_seconds not found")

    def test_asicboost_counter(self, metrics_url):
        """asicboost_miners counter should be present."""
        text = fetch_metrics(metrics_url)
        assert "ckpool_asicboost_miners_total" in text

    def test_total_diff_counter(self, metrics_url):
        """total_diff_accepted counter should be present."""
        text = fetch_metrics(metrics_url)
        assert "ckpool_total_diff_accepted_total" in text

    def test_all_metrics_have_values(self, metrics_url):
        """Every metric line should have a numeric value."""
        text = fetch_metrics(metrics_url)
        for line in text.splitlines():
            if line.startswith("#") or not line.strip():
                continue
            parts = line.split()
            assert len(parts) == 2, f"Malformed metric line: {line}"
            name, value = parts
            try:
                float(value)
            except ValueError:
                pytest.fail(f"Non-numeric value for {name}: {value}")
