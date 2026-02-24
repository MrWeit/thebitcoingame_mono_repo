FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential autoconf automake libcurl4-openssl-dev libjansson-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/pooler/cpuminer.git /opt/cpuminer && \
    cd /opt/cpuminer && \
    ./autogen.sh && ./configure && make -j$(nproc)

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4 libjansson4 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/cpuminer/minerd /usr/local/bin/minerd

ENTRYPOINT ["minerd"]
