type RateLimitEntry = {
  timestamps: number[];
  windowMs: number;
  max: number;
};

const store = new Map<string, RateLimitEntry>();

export type RateLimitConfig = {
  windowSeconds: number;
  max: number;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export const rateLimiter = {
  
  check(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;

    if (!store.has(key)) {
      store.set(key, { timestamps: [], windowMs, max: config.max });
    }

    const entry = store.get(key)!;

    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= config.max) {
      const oldest = entry.timestamps[0];
      const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    entry.timestamps.push(now);
    return { allowed: true };
  },
};

export const RATE_LIMITS = {
  instagram: { windowSeconds: 3600, max: 180 },
  tiktok:    { windowSeconds: 60,   max: 10  },
  youtube:   { windowSeconds: 60,   max: 5   },
} satisfies Record<string, RateLimitConfig>;