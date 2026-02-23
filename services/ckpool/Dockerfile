## TheBitcoinGame Mining Engine — Docker Build (Phase 5)
## Based on ckpool by Con Kolivas (GPLv3)
##
## This Dockerfile:
## 1. Clones upstream ckpool at a PINNED commit (see patches/UPSTREAM.lock)
## 2. Verifies SHA256 checksums of source files
## 3. Applies TBG patches (01-11: events/features/relay, 12-14: security/hardening)
## 4. Copies TBG extension source files into the build tree
## 5. Builds the modified binary with hiredis + hardening flags
## 6. Creates a minimal runtime image

FROM ubuntu:22.04 AS builder

# Prevent interactive prompts during package install
ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies (including hiredis for Redis integration)
RUN apt-get update && apt-get install -y \
    build-essential \
    autoconf \
    automake \
    libtool \
    pkg-config \
    yasm \
    libjansson-dev \
    libhiredis-dev \
    libcap2-bin \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Clone official ckpool and pin to verified commit
# The commit hash comes from patches/UPSTREAM.lock
RUN git clone https://bitbucket.org/ckolivas/ckpool.git /build/ckpool-src && \
    cd /build/ckpool-src && \
    git checkout 88e99e0b6fc7e28796c8450b42fa00070b66c6e3

WORKDIR /build/ckpool-src

# Copy our modification patches (includes UPSTREAM.lock for verification)
COPY patches/ /build/patches/

# Apply TBG patches (modular: 01-11 features/relay, 12-14 security/hardening)
# The script verifies SHA256 of source files before patching
RUN chmod +x /build/patches/apply-patches.sh /build/patches/[0-9][0-9]-*.sh && \
    /build/patches/apply-patches.sh /build/ckpool-src

# Copy TBG extension source files into the ckpool source tree
# Phase 3: tbg_metrics, tbg_coinbase_sig, tbg_vardiff, tbg_relay*
# Phase 5: input_validation, rate_limit, event_ring, memory_pool
COPY src/tbg_*.c src/tbg_*.h /build/ckpool-src/src/
COPY src/input_validation.c src/input_validation.h /build/ckpool-src/src/
COPY src/rate_limit.c src/rate_limit.h /build/ckpool-src/src/
COPY src/event_ring.c src/event_ring.h /build/ckpool-src/src/
COPY src/memory_pool.c src/memory_pool.h /build/ckpool-src/src/

# Build ckpool with hiredis support
RUN ./autogen.sh && \
    ./configure --prefix=/opt/ckpool --without-ckdb && \
    make -j$(nproc)

# Install manually (skip `make install` which tries setcap in Docker)
RUN mkdir -p /build/install/opt/ckpool/bin && \
    cp src/ckpool src/ckpmsg src/notifier /build/install/opt/ckpool/bin/

# --- Runtime image ---
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    libjansson4 \
    libhiredis0.14 \
    libcap2-bin \
    && rm -rf /var/lib/apt/lists/*

# Copy built binary
COPY --from=builder /build/install/opt/ckpool /opt/ckpool

# Create necessary directories
RUN mkdir -p /var/log/ckpool /var/run/ckpool /tmp/ckpool /etc/ckpool && \
    chmod 777 /tmp/ckpool /var/log/ckpool /var/run/ckpool

# Add ckpool to PATH
ENV PATH="/opt/ckpool/bin:${PATH}"

# Stratum port
EXPOSE 3333

# Prometheus metrics endpoint
EXPOSE 9100

# Relay port (primary mode)
EXPOSE 8881

ENTRYPOINT ["ckpool"]
CMD ["-c", "/etc/ckpool/ckpool-signet.conf", "-s", "/var/run/ckpool", "-l", "7"]
