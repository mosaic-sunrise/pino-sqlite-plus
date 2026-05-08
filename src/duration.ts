const MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  mo: 30 * 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000
};

/**
 * Parse a human-readable duration string (e.g. '1h', '30m', '1d', '1w', '3mo', '1y') into milliseconds.
 * Month and year are approximations (30 days, 365 days).
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h|d|w|mo|y)$/);
  if (!match) {
    throw new Error(
      `Invalid duration format: ${duration}. Use format like 1h, 30m, 1d, 1w, 3mo, 1y`
    );
  }
  return parseInt(match[1], 10) * MULTIPLIERS[match[2]];
}
