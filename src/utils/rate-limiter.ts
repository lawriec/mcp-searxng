const DEFAULT_MIN_INTERVAL_MS = 2000;

class RateLimiter {
  private lastRequestTime = 0;
  private readonly minIntervalMs: number;

  constructor() {
    const envVal = process.env.SEARXNG_MIN_INTERVAL_MS;
    this.minIntervalMs =
      envVal && Number.isFinite(Number(envVal))
        ? Math.max(0, Number(envVal))
        : DEFAULT_MIN_INTERVAL_MS;
  }

  async acquireSlot(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const waitMs = this.minIntervalMs - elapsed;

    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }

    this.lastRequestTime = Date.now();
  }
}

export const rateLimiter = new RateLimiter();
