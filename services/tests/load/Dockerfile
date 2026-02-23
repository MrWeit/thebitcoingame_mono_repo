# =============================================================================
# Stratum Load Test Container
# =============================================================================
# Dockerized load test runner for CKPool Stratum V1 endpoints.
#
# Build:
#   docker build -t tbg-load-test -f services/tests/load/Dockerfile services/tests/load/
#
# Run:
#   docker run --rm --net=host tbg-load-test --miners 100 --duration 60
#   docker run --rm tbg-load-test --host pool.example.com --port 3333 --miners 500
#
# With Docker Compose (from services/):
#   docker compose run --rm load-test --miners 100 --duration 60
#
# Part of The Bitcoin Game - Phase 5 Production Hardening.
# =============================================================================

FROM python:3.12-slim

LABEL maintainer="The Bitcoin Game <dev@thebitcoingame.io>"
LABEL description="Stratum V1 load testing tool for CKPool"

# No external Python dependencies needed -- uses only stdlib (asyncio, json, etc.)
# If future versions need packages, uncomment:
# COPY requirements.txt /load-test/
# RUN pip install --no-cache-dir -r /load-test/requirements.txt

WORKDIR /load-test

# Copy load test scripts
COPY stratum_load_test.py /load-test/
COPY run_load_test.sh /load-test/

# Make scripts executable
RUN chmod +x /load-test/stratum_load_test.py /load-test/run_load_test.sh

# Create results directory
RUN mkdir -p /load-test/results

# Default entrypoint runs the Python load test directly
# Override with --entrypoint /load-test/run_load_test.sh for the shell wrapper
ENTRYPOINT ["python3", "/load-test/stratum_load_test.py"]

# Default args (can be overridden at runtime)
CMD ["--miners", "100", "--duration", "60", "--share-rate", "10"]
