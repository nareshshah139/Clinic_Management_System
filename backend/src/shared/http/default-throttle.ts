/**
 * @cc [owner:nareshshah139,label:security] default-throttle-window
 * Every route without its own limit MUST allow at most DEFAULT_THROTTLE.limit requests per
 * client address in a 60-second window (ttl is in milliseconds) and answer 429 with Retry-After
 * beyond it. Portal limits MUST NOT rely on this throttler.
 */
export const DEFAULT_THROTTLE = { ttl: 60_000, limit: 600 };
