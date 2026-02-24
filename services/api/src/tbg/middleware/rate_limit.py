"""Redis-backed sliding window rate limiting middleware."""

import time
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from tbg.redis_client import get_redis

# Paths exempt from rate limiting
_EXEMPT_PATHS = frozenset({"/health", "/ready"})


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limit requests per IP using Redis counters."""

    def __init__(self, app: Any, requests_per_window: int = 100, window_seconds: int = 60) -> None:  # noqa: ANN401
        super().__init__(app)
        self.requests_per_window = requests_per_window
        self.window_seconds = window_seconds

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Check rate limit, return 429 if exceeded."""
        if request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        window = int(time.time()) // self.window_seconds
        rate_key = f"ratelimit:{client_ip}:{window}"

        try:
            redis = get_redis()
            pipe = redis.pipeline()
            pipe.incr(rate_key)
            pipe.expire(rate_key, self.window_seconds + 1)
            results: list[Any] = await pipe.execute()

            current_count: int = results[0]
            remaining = max(0, self.requests_per_window - current_count)

            if current_count > self.requests_per_window:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Try again later."},
                    headers={
                        "Retry-After": str(self.window_seconds),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Limit": str(self.requests_per_window),
                    },
                )

            response = await call_next(request)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Limit"] = str(self.requests_per_window)
        except RuntimeError:
            # Redis not initialized — let the request through without rate limiting
            response = await call_next(request)

        return response
