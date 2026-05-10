type RateLimitEntry = {
  windowStartMs: number;
  count: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
};

export class FixedWindowRateLimiter {
  private readonly windowMs: number;
  private readonly limit: number;
  private readonly store = new Map<string, RateLimitEntry>();

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  consume(key: string, nowMs: number = Date.now()): RateLimitResult {
    const existing = this.store.get(key);
    if (!existing || nowMs - existing.windowStartMs >= this.windowMs) {
      const entry: RateLimitEntry = { windowStartMs: nowMs, count: 1 };
      this.store.set(key, entry);
      return {
        allowed: true,
        limit: this.limit,
        remaining: Math.max(this.limit - 1, 0),
        resetAtMs: entry.windowStartMs + this.windowMs,
      };
    }

    existing.count += 1;
    const allowed = existing.count <= this.limit;
    return {
      allowed,
      limit: this.limit,
      remaining: Math.max(this.limit - existing.count, 0),
      resetAtMs: existing.windowStartMs + this.windowMs,
    };
  }
}
