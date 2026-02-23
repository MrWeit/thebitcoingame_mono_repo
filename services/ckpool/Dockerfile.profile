## TheBitcoinGame CKPool — Profiling Docker Image
## Based on ckpool by Con Kolivas (GPLv3)
##
## This image includes CPU/memory profiling tools:
##   - perf (Linux perf_events)
##   - FlameGraph (Brendan Gregg's stack trace visualizer)
##   - Valgrind + massif (heap profiler)
##   - gdb (debugger)
##
## Build:
##   docker build -f Dockerfile.profile -t tbg-ckpool:profile .
##
## Usage (perf):
##   docker run --privileged --cap-add SYS_ADMIN \
##     tbg-ckpool:profile perf record -g -o /tmp/perf.data -- \
##     ckpool -c /etc/ckpool/ckpool-mainnet.conf -s /var/run/ckpool
##
## Usage (Valgrind massif):
##   docker run tbg-ckpool:profile valgrind --tool=massif \
##     --pages-as-heap=yes --massif-out-file=/tmp/massif.out \
##     ckpool -c /etc/ckpool/ckpool-mainnet.conf -s /var/run/ckpool
##
## Usage (FlameGraph from perf data):
##   # Inside the container after perf record:
##   perf script -i /tmp/perf.data | /opt/FlameGraph/stackcollapse-perf.pl | \
##     /opt/FlameGraph/flamegraph.pl > /tmp/flamegraph.svg

FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    autoconf \
    automake \
    libtool \
    pkg-config \
    yasm \
    libjansson-dev \
    libhiredis-dev \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Clone official ckpool at pinned commit
RUN git clone https://bitbucket.org/ckolivas/ckpool.git /build/ckpool-src && \
    cd /build/ckpool-src && \
    git checkout 88e99e0b6fc7e28796c8450b42fa00070b66c6e3

WORKDIR /build/ckpool-src

# Copy patches and TBG source files
COPY patches/ /build/patches/
COPY src/ /build/tbg-src/

# Apply TBG patches
RUN chmod +x /build/patches/apply-patches.sh /build/patches/[0-9][0-9]-*.sh && \
    /build/patches/apply-patches.sh /build/ckpool-src

# Copy TBG extension source files into ckpool source tree
RUN cp /build/tbg-src/tbg_*.c /build/tbg-src/tbg_*.h /build/ckpool-src/src/ && \
    if ls /build/tbg-src/event_ring.* 1>/dev/null 2>&1; then \
        cp /build/tbg-src/event_ring.* /build/ckpool-src/src/; \
    fi && \
    if ls /build/tbg-src/input_validation.* 1>/dev/null 2>&1; then \
        cp /build/tbg-src/input_validation.* /build/ckpool-src/src/; \
    fi && \
    if ls /build/tbg-src/rate_limit.* 1>/dev/null 2>&1; then \
        cp /build/tbg-src/rate_limit.* /build/ckpool-src/src/; \
    fi && \
    if ls /build/tbg-src/memory_pool.* 1>/dev/null 2>&1; then \
        cp /build/tbg-src/memory_pool.* /build/ckpool-src/src/; \
    fi

# Build with debug symbols (essential for profiling) — no stripping
ENV CFLAGS="-O2 -g -fno-omit-frame-pointer -fstack-protector-strong"

RUN ./autogen.sh && \
    ./configure --prefix=/opt/ckpool --without-ckdb && \
    make -j$(nproc)

# Install manually
RUN mkdir -p /build/install/opt/ckpool/bin && \
    cp src/ckpool src/ckpmsg src/notifier /build/install/opt/ckpool/bin/
    # NOTE: Do NOT strip — debug symbols are needed for perf/valgrind

# =============================================================================
# Runtime with profiling tools
# =============================================================================
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libjansson4 \
    libhiredis0.14 \
    curl \
    gettext-base \
    # --- Profiling tools ---
    linux-tools-generic \
    linux-tools-common \
    valgrind \
    gdb \
    strace \
    ltrace \
    binutils \
    git \
    perl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Brendan Gregg's FlameGraph tools
RUN git clone --depth 1 https://github.com/brendangregg/FlameGraph.git /opt/FlameGraph

# Copy built binaries (with debug symbols)
COPY --from=builder /build/install/opt/ckpool /opt/ckpool

# Create directories
RUN mkdir -p /var/log/ckpool /var/run/ckpool /tmp/ckpool /etc/ckpool /tmp/profiles && \
    chmod 777 /var/log/ckpool /var/run/ckpool /tmp/ckpool /tmp/profiles

# Copy entrypoint and config
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

COPY config/ /etc/ckpool/

ENV PATH="/opt/ckpool/bin:/opt/FlameGraph:${PATH}"

# Profiling output directory
VOLUME /tmp/profiles

EXPOSE 3333
EXPOSE 9100

# Run as root — required for perf and some profiling tools
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["-c", "/etc/ckpool/ckpool-mainnet.conf", "-s", "/var/run/ckpool", "-l", "7"]
