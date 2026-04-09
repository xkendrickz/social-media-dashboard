type QuotaEntry = {
  used: number;
  resetAt: number;
};

const store = new Map<string, QuotaEntry>();

export type QuotaConfig = {
  dailyLimit: number;
  costPerRequest: number;
  warningThreshold?: number;
};

export type QuotaResult =
  | { allowed: true; warning: false }
  | { allowed: true; warning: true; usedPercent: number }
  | { allowed: false; usedPercent: number; resetsAt: Date };

function nextMidnight(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export const quotaTracker = {
  check(key: string, config: QuotaConfig): QuotaResult {
    const now = Date.now();

    const existing = store.get(key);
    if (existing && now >= existing.resetAt) {
      store.delete(key);
    }

    if (!store.has(key)) {
      store.set(key, { used: 0, resetAt: nextMidnight() });
    }

    const entry = store.get(key)!;
    const projectedUsage = entry.used + config.costPerRequest;
    const usedPercent = Math.round(
      (projectedUsage / config.dailyLimit) * 100
    );

    if (projectedUsage > config.dailyLimit) {
      return {
        allowed: false,
        usedPercent,
        resetsAt: new Date(entry.resetAt),
      };
    }

    const threshold = config.warningThreshold ?? 0.8;
    const isWarning = projectedUsage / config.dailyLimit >= threshold;

    if (isWarning) {
      return {
        allowed: true,
        warning: true,
        usedPercent,
      };
    }

    return {
      allowed: true,
      warning: false,
    };
  },

  increment(key: string, config: QuotaConfig): void {
    const entry = store.get(key);
    if (entry) {
      entry.used += config.costPerRequest;
    }
  },

  getUsage(key: string): number {
    return store.get(key)?.used ?? 0;
  },
};

export const QUOTA_CONFIGS = {
  instagram: { dailyLimit: 1000, costPerRequest: 6, warningThreshold: 0.8 },
  tiktok: { dailyLimit: 16, costPerRequest: 2, warningThreshold: 0.75 },
  youtube: { dailyLimit: 9800, costPerRequest: 202, warningThreshold: 0.8 },
} satisfies Record<string, QuotaConfig>;