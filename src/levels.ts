export interface LevelInfo {
  num: number;
  name: string;
  label: string;
  stored: string;
}

export const LEVELS: readonly LevelInfo[] = Object.freeze([
  { num: 10, name: 'trace', label: 'TRACE', stored: '10-trace' },
  { num: 20, name: 'debug', label: 'DEBUG', stored: '20-debug' },
  { num: 30, name: 'info', label: 'INFO', stored: '30-info' },
  { num: 40, name: 'warn', label: 'WARN', stored: '40-warn' },
  { num: 50, name: 'error', label: 'ERROR', stored: '50-error' },
  { num: 60, name: 'fatal', label: 'FATAL', stored: '60-fatal' }
]);

const NUM_TO_INFO = new Map(LEVELS.map((l) => [l.num, l]));
const NAME_TO_INFO = new Map(LEVELS.map((l) => [l.name, l]));

export function levelToString(level: number): string {
  return NUM_TO_INFO.get(level)?.stored ?? `${level}`;
}

/**
 * Convert any level input (string name, numeric value, or stored format) to stored format.
 */
export function parseLevel(input: string | number): string {
  if (typeof input === 'number') {
    return levelToString(input);
  }
  if (/^\d+-/.test(input)) {
    return input;
  }
  const info = NAME_TO_INFO.get(input.toLowerCase());
  if (info) return info.stored;
  const num = parseInt(input, 10);
  if (!isNaN(num)) return levelToString(num);
  throw new Error(
    `Invalid level: ${input}. Use trace, debug, info, warn, error, fatal, or a numeric value`
  );
}

/**
 * Extract human-readable label from stored format (e.g. '50-error' -> 'ERROR').
 */
export function extractLevelLabel(stored: string): string {
  const match = stored.match(/^\d+-(.+)$/);
  if (match) return match[1].toUpperCase();
  const num = parseInt(stored, 10);
  if (!isNaN(num)) return NUM_TO_INFO.get(num)?.label ?? `L${num}`;
  return stored.toUpperCase();
}
