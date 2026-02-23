interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Purge expired entries every 60 s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000).unref?.();

/**
 * Simple fixed-window rate limiter (in-memory).
 * @param key   Unique key, e.g. `auth:${ip}`
 * @param limit Max requests in the window
 * @param windowMs Window size in ms
 * @returns `{ ok: true }` if within limits, `{ ok: false }` if exceeded
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (entry.count >= limit) {
    return { ok: false };
  }

  entry.count++;
  return { ok: true };
}
