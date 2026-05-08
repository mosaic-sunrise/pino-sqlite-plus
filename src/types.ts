import type Database from 'better-sqlite3';

/** Options accepted by the Pino transport. */
export interface TransportOptions {
  /** Path to the SQLite database file */
  dbPath: string;
  /** Number of logs to batch before inserting (default: 100) */
  batchSize?: number;
  /** Milliseconds between flush intervals (default: 1000) */
  flushIntervalMs?: number;
  /** Custom table name (default: 'logs') */
  tableName?: string;
  /**
   * Map of column names to JSON paths for field extraction.
   * Creates virtual generated columns with indexes for fast queries.
   * Example: { 'request_id': '$.requestId', 'user_id': '$.user.id' }
   */
  extractFields?: Record<string, string>;
}

/** A log object as emitted by Pino, before storage. */
export interface PinoLog {
  /** Pino numeric level (10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal). */
  level: number;
  /** Epoch milliseconds. */
  time: number;
  msg?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * A row from the `logs` table. `level` is stored as `"<num>-<name>"`
 * (e.g. `"50-error"`) to keep lexical comparison consistent with numeric ordering
 * for the standard Pino levels. `data` is the original log JSON-serialised.
 */
export interface LogEntry {
  id: number;
  time: number;
  level: string;
  msg: string | null;
  name: string | null;
  data: string;
  created_at: number;
}

/** A {@link LogEntry} with the JSON `data` column parsed back into a {@link PinoLog}. */
export interface ParsedLogEntry extends Omit<LogEntry, 'data'> {
  data: PinoLog;
}

/** Re-export of better-sqlite3's `Database` type for internal helpers. */
export type DatabaseInstance = Database.Database;

/** Comparison operators accepted by query filter methods. */
export type ComparisonOperator = '=' | '!=' | '<' | '<=' | '>' | '>=';
