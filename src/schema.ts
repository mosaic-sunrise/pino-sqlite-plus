import type { DatabaseInstance } from './types.js';

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Matches a JSONPath understood by SQLite's json_extract: $, then dot/bracket steps.
// Allows wildcards and array indices but rejects quotes/semicolons that could break out of the literal.
const JSON_PATH_RE = /^\$([.[][A-Za-z0-9_*\]]+)*$/;

function validateIdentifier(kind: string, name: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`Invalid ${kind}: ${JSON.stringify(name)}. Must match ${IDENTIFIER_RE.source}`);
  }
}

function validateJsonPath(path: string): void {
  if (!JSON_PATH_RE.test(path)) {
    throw new Error(
      `Invalid JSON path: ${JSON.stringify(path)}. Must match ${JSON_PATH_RE.source}`
    );
  }
}

export function createSchema(
  db: DatabaseInstance,
  tableName: string,
  extractFields?: Record<string, string>
): void {
  validateIdentifier('table name', tableName);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time INTEGER NOT NULL,
      level TEXT NOT NULL,
      msg TEXT,
      name TEXT,
      data JSON NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_${tableName}_time ON ${tableName}(time)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${tableName}_level ON ${tableName}(level)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${tableName}_name ON ${tableName}(name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${tableName}_time_level ON ${tableName}(time, level)`);

  if (extractFields) {
    for (const [columnName, jsonPath] of Object.entries(extractFields)) {
      addExtractedColumn(db, tableName, columnName, jsonPath);
    }
  }
}

function addExtractedColumn(
  db: DatabaseInstance,
  tableName: string,
  columnName: string,
  jsonPath: string
): void {
  validateIdentifier('column name', columnName);
  validateJsonPath(jsonPath);

  const columns = db.prepare(`PRAGMA table_xinfo(${tableName})`).all() as Array<{ name: string }>;
  const columnExists = columns.some((col) => col.name === columnName);

  if (!columnExists) {
    db.exec(`
      ALTER TABLE ${tableName}
      ADD COLUMN ${columnName} TEXT
      GENERATED ALWAYS AS (json_extract(data, '${jsonPath}')) VIRTUAL
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_${columnName} ON ${tableName}(${columnName})`
    );
  }
}
