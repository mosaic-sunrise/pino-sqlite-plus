import Database from 'better-sqlite3';
import { parseLevel } from './levels.js';
import { parseDuration } from './duration.js';
import type { ComparisonOperator, LogEntry, ParsedLogEntry, PinoLog } from './types.js';

// Safely escape SQL identifiers using SQLite's printf
function escapeIdentifier(db: Database.Database, identifier: string): string {
  const result = db.prepare("SELECT printf('%w', ?)").pluck().get(identifier) as string;
  return `"${result}"`;
}

export class LogQuery {
  private db: Database.Database;
  private tableName: string;
  private conditions: string[] = [];
  private params: unknown[] = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private orderByClause = 'time DESC';

  constructor(dbPath: string, tableName = 'logs') {
    this.db = new Database(dbPath, { readonly: true });
    this.tableName = tableName;
  }

  /**
   * Filter by logger name/subsystem
   */
  name(name: string): this {
    this.conditions.push('name = ?');
    this.params.push(name);
    return this;
  }

  /**
   * Filter by log level
   * @param level - Can be:
   *   - String name: 'trace', 'debug', 'info', 'warn', 'error', 'fatal'
   *   - Pino numeric value: 10, 20, 30, 40, 50, 60
   *   - String format: '10-trace', '50-error', etc. (pass through)
   * @param operator - Comparison operator (default: '>=')
   */
  level(level: string | number, operator: ComparisonOperator = '>='): this {
    const levelStr = parseLevel(level);
    this.conditions.push(`level ${operator} ?`);
    this.params.push(levelStr);
    return this;
  }

  /**
   * Filter by time range (epoch milliseconds)
   */
  timeRange(start?: number, end?: number): this {
    if (start !== undefined) {
      this.conditions.push('time >= ?');
      this.params.push(start);
    }
    if (end !== undefined) {
      this.conditions.push('time <= ?');
      this.params.push(end);
    }
    return this;
  }

  /**
   * Filter logs from a point in time backwards to now.
   *
   * @param value
   *   - `Date`: include logs at or after this date.
   *   - `string`: human-readable duration ago (e.g. `'60s'`, `'5m'`, `'1h'`, `'2d'`, `'1w'`, `'3mo'`, `'1y'`).
   *   - `number`: milliseconds **ago** (NOT a unix timestamp). Prefer {@link withinLast}
   *     for clarity, or pass a `Date` for an explicit point in time.
   */
  since(value: Date | number | string): this {
    let ms: number;

    if (value instanceof Date) {
      ms = Date.now() - value.getTime();
    } else if (typeof value === 'string') {
      ms = parseDuration(value);
    } else {
      ms = value;
    }

    return this.timeRange(Date.now() - ms);
  }

  /**
   * Filter logs from the last N milliseconds or duration string.
   * Equivalent to {@link since} with the same arg, but the name makes the
   * "duration ago" semantic explicit.
   */
  withinLast(value: number | string): this {
    return this.since(value);
  }

  /**
   * Search message content (LIKE search)
   */
  messageContains(text: string): this {
    this.conditions.push('msg LIKE ?');
    this.params.push(`%${text}%`);
    return this;
  }

  /**
   * Filter by arbitrary JSON property or extracted column.
   * For JSON properties, use '$.path' syntax.
   * For extracted columns, use the column name directly.
   */
  where(pathOrColumn: string, value: unknown, operator: ComparisonOperator = '='): this {
    if (pathOrColumn.startsWith('$.')) {
      this.conditions.push(`json_extract(data, ?) ${operator} ?`);
      this.params.push(pathOrColumn, value);
    } else {
      const safeColumn = escapeIdentifier(this.db, pathOrColumn);
      this.conditions.push(`${safeColumn} ${operator} ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * Check if a JSON property exists (is not null)
   */
  has(jsonPath: string): this {
    this.conditions.push('json_extract(data, ?) IS NOT NULL');
    this.params.push(jsonPath);
    return this;
  }

  /**
   * Set result limit
   */
  limit(n: number): this {
    this.limitValue = n;
    return this;
  }

  /**
   * Set result offset (for pagination)
   */
  offset(n: number): this {
    this.offsetValue = n;
    return this;
  }

  /**
   * Set order by clause
   */
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'DESC'): this {
    const safeColumn = escapeIdentifier(this.db, column);
    this.orderByClause = `${safeColumn} ${direction}`;
    return this;
  }

  /**
   * Execute query and return parsed log entries
   */
  find(): ParsedLogEntry[] {
    const sql = this.buildSelectSql('*');
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...this.params) as LogEntry[];

    return rows.map((row) => ({
      ...row,
      data: JSON.parse(row.data) as PinoLog
    }));
  }

  /**
   * Execute query and return raw log entries (JSON not parsed)
   */
  findRaw(): LogEntry[] {
    const sql = this.buildSelectSql('*');
    const stmt = this.db.prepare(sql);
    return stmt.all(...this.params) as LogEntry[];
  }

  /**
   * Count matching logs
   */
  count(): number {
    const sql = this.buildSelectSql('COUNT(*) as count');
    const stmt = this.db.prepare(sql);
    const result = stmt.get(...this.params) as { count: number };
    return result.count;
  }

  /**
   * Get distinct non-null values for a column. NULL rows are filtered out.
   * Note: this is independent of the chained filter conditions — `where()` /
   * `level()` etc. do not narrow this query.
   */
  distinct(column: string): string[] {
    const safeColumn = escapeIdentifier(this.db, column);
    const sql = `SELECT DISTINCT ${safeColumn} FROM ${this.tableName} WHERE ${safeColumn} IS NOT NULL`;
    const stmt = this.db.prepare(sql);
    const rows = stmt.all() as Array<Record<string, string>>;
    return rows.map((row) => row[column]);
  }

  /**
   * Reset query conditions for reuse
   */
  reset(): this {
    this.conditions = [];
    this.params = [];
    this.limitValue = null;
    this.offsetValue = null;
    this.orderByClause = 'time DESC';
    return this;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  private buildSelectSql(select: string): string {
    let sql = `SELECT ${select} FROM ${this.tableName}`;

    if (this.conditions.length > 0) {
      sql += ` WHERE ${this.conditions.join(' AND ')}`;
    }

    if (select === '*') {
      sql += ` ORDER BY ${this.orderByClause}`;
    }

    if (this.limitValue !== null) {
      sql += ` LIMIT ${this.limitValue}`;
    }

    if (this.offsetValue !== null) {
      sql += ` OFFSET ${this.offsetValue}`;
    }

    return sql;
  }
}

/**
 * Create a new {@link LogQuery} instance bound to the given database file.
 */
export function createLogQuery(dbPath: string, tableName = 'logs'): LogQuery {
  return new LogQuery(dbPath, tableName);
}
