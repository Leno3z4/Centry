const buckets = globalThis.__centryRateLimitBuckets || new Map();
globalThis.__centryRateLimitBuckets = buckets;

const DEFAULT_MAX = 30;
const DEFAULT_WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

function now() {
  return Date.now();
}

function cleanupExpired(timestamp) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= timestamp) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
  }
}

export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}

export function rateLimit(request, scope, options = {}) {
  const max = Number.isFinite(options.max) ? Math.max(1, Math.floor(options.max)) : DEFAULT_MAX;
  const windowMs = Number.isFinite(options.windowMs) ? Math.max(1_000, Math.floor(options.windowMs)) : DEFAULT_WINDOW_MS;
  const identity = options.identity || getClientIp(request);
  const key = `${scope}:${identity}`;
  const timestamp = now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= timestamp) {
    buckets.set(key, { count: 1, resetAt: timestamp + windowMs });
    cleanupExpired(timestamp);
    return { allowed: true, limit: max, remaining: max - 1, resetAt: timestamp + windowMs };
  }

  current.count += 1;
  const allowed = current.count <= max;

  return {
    allowed,
    limit: max,
    remaining: Math.max(0, max - current.count),
    resetAt: current.resetAt,
  };
}

export function rateLimitResponse(result) {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - now()) / 1000));
  return Response.json(
    { success: false, error: 'Too many requests. Please slow down and try again.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    },
  );
}

export function withRateLimitHeaders(response, result) {
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  return response;
}
