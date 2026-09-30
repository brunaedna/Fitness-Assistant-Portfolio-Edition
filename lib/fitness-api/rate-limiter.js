export class InMemoryRateLimiter {
  constructor({ limit, windowMs, maxClients = 10_000, now = () => Date.now() }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxClients = maxClients;
    this.now = now;
    this.requests = new Map();
  }

  consume(key) {
    const currentTime = this.now();
    if (!this.requests.has(key) && this.requests.size >= this.maxClients) {
      this.requests.delete(this.requests.keys().next().value);
    }
    const recent = (this.requests.get(key) || []).filter(
      (timestamp) => currentTime - timestamp < this.windowMs,
    );

    if (recent.length >= this.limit) {
      const retryAfterMs = this.windowMs - (currentTime - recent[0]);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)) };
    }

    recent.push(currentTime);
    this.requests.set(key, recent);
    return { allowed: true, remaining: this.limit - recent.length };
  }
}
