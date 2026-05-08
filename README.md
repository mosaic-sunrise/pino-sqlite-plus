# pino-sqlite-plus

A Pino transport that stores logs to SQLite for queryable log storage, with a fluent query API, CLI, and test-run correlation.

## Features

- Stores all Pino logs in SQLite with indexed fields for fast queries or to reduce context of coding agents
- Query by level, time range, logger name, message content, or arbitrary JSON properties
- Extract frequently-queried JSON fields into virtual columns for efficient filtering
- CLI tool for querying logs from the command line

## Installation

```bash
npm install @mosaic-code/pino-sqlite-plus
```

## Recommended Setups

### 1. Developer Mode: stdout + SQLite

For development, you typically want logs visible in the console while also persisting them to SQLite for later analysis. Use `pino.multistream` to send logs to both destinations:

```ts
import pino from 'pino';
import multistream from 'pino-multi-stream'; // npm install pino-multi-stream
import pinoSqlite from '@mosaic-code/pino-sqlite-plus';

const log = pino(
  {
    level: 'trace' // Capture all levels for SQLite
  },
  multistream.stream(
    [
      // Pretty-printed console output for development
      { stream: pino.destination({ sync: false }) },
      // SQLite transport for persistent storage
      pinoSqlite({
        dbPath: './logs.db'
      })
    ],
    {
      // Deduplicate log levels across streams
      dedupe: true
    }
  )
);
```

### 2. LLM/Agent Mode: SQLite Only

For LLM applications or agents, disable stdout entirely to keep logs silent while persisting everything to SQLite. This prevents the logs from clogging up your context, and the LLM can later query specific log levels as needed:

```ts
import pino from 'pino';
import pinoSqlite from '@mosaic-code/pino-sqlite-plus';

const log = pino(
  {
    level: 'trace' // Capture ALL levels - LLM can filter later
  },
  pino.transport({
    target: '@mosaic-code/pino-sqlite-plus',
    options: {
      dbPath: './logs.db',
      // Optional: extract specific fields for faster queries
      extractFields: {
        userId: '$.userId',
        requestId: '$.requestId'
      }
    }
  })
);
```

The LLM can then query only what it needs:

```ts
import { createQueryHelper } from '@mosaic-code/pino-sqlite-plus';

const query = createQueryHelper('./logs.db');

// Show only errors and above (can use numeric or string name)
const errors = query.level('error', '>=').find();
// Or: query.level(50, '>=').find()

// Debug logs for a specific user
const debugLogs = query.level('debug', '=').where('userId', 'user-123').find();
// Or: query.level(20, '=').where('userId', 'user-123').find()

// Recent logs within time range
const recent = query.timeRange(Date.now() - 3600000).find();
```

## Log Levels

Pino uses numeric levels (lower = less severe). pino-sqlite-plus stores these as human-readable strings with numeric prefixes for easy reading while maintaining efficient comparisons:

| Level | Pino Value | Storage Format |
| ----- | ---------- | -------------- |
| trace | 10         | `"10-trace"`   |
| debug | 20         | `"20-debug"`   |
| info  | 30         | `"30-info"`    |
| warn  | 40         | `"40-warn"`    |
| error | 50         | `"50-error"`   |
| fatal | 60         | `"60-fatal"`   |

The query API accepts both formats:

- String names: `query.level('error', '>=')`
- Numeric values: `query.level(50, '>=')`
- String format: `query.level('50-error', '>=')`

All three formats work identically and are converted to the storage format internally.

## API

### Transport Options

```ts
interface TransportOptions {
  dbPath: string; // Path to SQLite database file
  tableName?: string; // Default: 'logs'
  batchSize?: number; // Default: 100
  flushIntervalMs?: number; // Default: 1000
  extractFields?: Record<string, string>; // { columnName: jsonPath }
}
```

### Query API

```ts
const query = createQueryHelper('./logs.db', 'logs');

// Filter methods
query.name('my-logger');
query.level('error', '>='); // error and above (or use: query.level(50, '>='))
query.timeRange(start, end);
query.since(60000); // last 60 seconds (milliseconds)
query.since('60s'); // last 60 seconds (human-readable: ms, s, m, h, d, w, mo, y)
query.since(new Date(Date.now() - 60000)); // since a specific date
query.messageContains('search term');
query.where('$.json.path', 'value');
query.has('$.someProperty');
query.limit(100);
query.offset(0);
query.orderBy('time', 'DESC');

// Execute
const results = query.find();
const count = query.count();
query.reset(); // clear conditions for reuse
query.close(); // close database connection
```

## CLI

```bash
# Query logs from command line
pino-sqlite-query ./logs.db --level ">=50" --limit 50

# Recent logs
pino-sqlite-query ./logs.db --since 1h

# Search by message
pino-sqlite-query ./logs.db --message "error"

# Filter by logger name
pino-sqlite-query ./logs.db --name "my-app"
```

## Why Store All Levels?

Pino filters logs at the logger level, not the transport level. Setting `level: 'info'` means trace and debug logs are never sent to any transport - they're discarded immediately.

For LLM use cases, set `level: 'trace'` to capture everything. You can then query selectively:

- **During development**: See all logs in console
- **During analysis**: Query SQLite for specific levels/timeframes
- **For LLM review**: Query only error/warn logs to identify issues

This approach gives you maximum flexibility without re-logging or re-running your application.

## Test Log Correlation

pino-sqlite-plus works with [`test-results-to-sqlite`](../test-json-report-to-sqlite/) to correlate logs with test runs. This enables powerful debugging workflows where you can retrieve all logs associated with a failed test.

### Automatic Test Context (Recommended)

The simplest approach uses automatic context decoration - no need to manually add test metadata to every log call.

#### Setup

**vitest.setup.ts:**

```typescript
import pino from 'pino';
import pinoSqlite from '@mosaic-code/pino-sqlite-plus';
import { createTestContextMixin, setupTestContextLogging } from '@mosaic-code/pino-sqlite-plus';

// Generate a test run ID (suggested format: branch + timestamp)
const branch = process.env.GIT_BRANCH || 'unknown';
const timestamp = new Date().toISOString();
const TEST_RUN_ID = `${branch} ${timestamp}`;

const log = pino(
  {
    level: 'trace',
    mixin: createTestContextMixin() // Auto-injects test context + NODE_ENV
  },
  pino.transport({
    target: '@mosaic-code/pino-sqlite-plus',
    options: {
      dbPath: './dev-logging.db',
      extractFields: {
        test_run_id: '$.testRunId',
        node_env: '$.nodeEnv'
      }
    }
  })
);

export const testContext = setupTestContextLogging({
  testRunId: TEST_RUN_ID
});

// Make available globally for tests
globalThis.log = log;
globalThis.testContext = testContext;
```

**package.json:**

```json
{
  "scripts": {
    "test": "GIT_BRANCH=$(git branch --show-current) vitest"
  }
}
```

**In your tests:**

```typescript
import { beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  testContext.setContext();
});

afterEach(() => {
  testContext.clearContext();
});

it('should work', () => {
  log.info('Test starting'); // Auto-decorated with testRunId!
  log.debug('Some detail');
  log.error('Something failed');
});
```

See the [test-results-to-sqlite README](../test-json-report-to-sqlite/) for complete documentation on querying correlated test logs.
