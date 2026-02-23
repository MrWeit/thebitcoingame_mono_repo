# TBG Event Collector

Python async service that bridges ckpool's event emission system to Redis Streams and TimescaleDB.

## Architecture

```
ckpool (C, GPLv3) --[Unix DGRAM socket]--> Event Collector (Python, Proprietary)
                                              |-> Redis Streams (real-time consumers)
                                              |-> TimescaleDB (persistence)
```

The GPL boundary is the Unix domain socket. This service is a separate process
with zero linking dependency on ckpool code.

## Running

```bash
# Via Docker Compose (recommended)
cd services/
docker compose up event-collector

# Standalone
cd services/event-collector
pip install -r requirements.txt
REDIS_URL=redis://localhost:6379/0 \
DATABASE_URL=postgresql://tbg:tbgdev2026@localhost:5432/thebitcoingame \
SOCKET_PATH=/tmp/ckpool/events.sock \
python -m src.collector
```

## Configuration

All config via environment variables:

| Variable | Default | Description |
|---|---|---|
| `SOCKET_PATH` | `/tmp/ckpool/events.sock` | Unix socket path for ckpool events |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL |
| `DATABASE_URL` | `postgresql://tbg:...@localhost:5432/thebitcoingame` | TimescaleDB connection |
| `LOG_LEVEL` | `INFO` | Logging level |
| `BATCH_FLUSH_INTERVAL` | `1.0` | Seconds between DB batch flushes |
| `BATCH_MAX_SIZE` | `500` | Max events per DB batch write |
| `REDIS_STREAM_MAXLEN` | `100000` | Max entries per Redis stream |

## Testing

```bash
pip install -r requirements.txt
pip install pytest pytest-asyncio
pytest
```

## Event Flow

1. ckpool emits JSON datagrams to the Unix socket
2. Collector receives and validates against Pydantic schemas
3. Events are published to Redis Streams (`mining:{event_type}`)
4. Events are batched and written to TimescaleDB
5. Block found events also trigger a Redis PUB/SUB notification
