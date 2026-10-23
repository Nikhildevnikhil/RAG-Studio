import time
from collections import defaultdict
from typing import Dict, List
from fastapi import Request, HTTPException
from backend.app.core.config import settings

class SlidingWindowRateLimiter:
    """
    Sliding window in-memory rate limiter designed for public demo instances.
    Tracks query timestamps per client IP to safeguard hosted API quotas from abuse.
    """
    def __init__(self):
        self.history: Dict[str, List[float]] = defaultdict(list)

    @staticmethod
    def get_client_ip(request: Request) -> str:
        # Check Cloudflare header
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()

        # Check standard X-Forwarded-For header
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()

        # Check X-Real-IP header
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()

        # Direct connection host fallback
        if request.client and request.client.host:
            return request.client.host
        return "127.0.0.1"

    def check(self, request: Request, custom_limit: int = None) -> None:
        """
        Enforces requests-per-minute limits.
        If the limit is exceeded, raises HTTP 429 with informative guidance.
        """
        limit = custom_limit if custom_limit is not None else getattr(settings, "RATE_LIMIT_PER_MINUTE", 15)
        if limit <= 0:
            return

        client_ip = self.get_client_ip(request)
        now = time.time()
        window_start = now - 60.0

        # Purge timestamps outside the 60-second window
        recent = [t for t in self.history[client_ip] if t > window_start]
        self.history[client_ip] = recent

        if len(recent) >= limit:
            oldest_in_window = recent[0]
            retry_after = max(1, int(60.0 - (now - oldest_in_window)) + 1)
            raise HTTPException(
                status_code=429,
                detail=f"Hosted Demo rate limit reached ({limit} requests/min). Please wait {retry_after}s before sending another query.",
                headers={"Retry-After": str(retry_after)}
            )

        self.history[client_ip].append(now)

rate_limiter = SlidingWindowRateLimiter()
