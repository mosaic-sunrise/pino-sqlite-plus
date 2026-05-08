#!/usr/bin/env node

import { LogQuery } from './query.js';
import { LEVELS, parseLevel, extractLevelLabel } from './levels.js';
import { parseDuration } from './duration.js';

const DEFAULT_DB_PATH = './logs.db';

function getDefaultDbPath(): string {
  return process.env.PINO_SQLITE_DB ?? DEFAULT_DB_PATH;
}

function printHelp(): void {
  console.log(`
pino-sqlite-query <command> [options]

Commands:
  query      Query logs from SQLite database
  stats      Show log statistics

Options:
  --db <path>          Database path (default: ./logs.db or $PINO_SQLITE_DB)
  --table <name>       Table name (default: logs)
  --format <format>    Output format: json, text (default: text)

Query Options:
  --level <level>      Filter by minimum log level (trace, debug, info, warn, error, fatal)
  --name <name>        Filter by logger name
  --search <text>      Search in log messages
  --since <duration>   Filter logs from last duration (e.g., 1h, 30m, 1d)
  --limit <n>          Limit number of results (default: 50)

Examples:
  pino-sqlite-query query
  pino-sqlite-query query --level error
  pino-sqlite-query query --db ./app.db --since 1h --level warn
  pino-sqlite-query query --name api --search "failed"
  pino-sqlite-query stats
`);
}

interface QueryOptions {
  dbPath: string;
  level: string | null;
  name: string | null;
  search: string | null;
  since: number | null;
  limit: number;
  table: string;
  format: 'json' | 'text';
}

function parseQueryArgs(args: string[]): QueryOptions | null {
  let dbPath: string | null = null;
  let level: string | null = null;
  let name: string | null = null;
  let search: string | null = null;
  let since: number | null = null;
  let limit = 50;
  let table = 'logs';
  let format: 'json' | 'text' = 'text';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--db') {
      dbPath = args[++i];
      if (!dbPath) {
        console.error('Error: --db requires a path');
        return null;
      }
    } else if (arg === '--level') {
      const val = args[++i];
      if (!val) {
        console.error('Error: --level requires a value');
        return null;
      }
      try {
        level = parseLevel(val);
      } catch (e) {
        console.error((e as Error).message);
        return null;
      }
    } else if (arg === '--name') {
      name = args[++i];
      if (!name) {
        console.error('Error: --name requires a value');
        return null;
      }
    } else if (arg === '--search') {
      search = args[++i];
      if (!search) {
        console.error('Error: --search requires a value');
        return null;
      }
    } else if (arg === '--since') {
      const val = args[++i];
      if (!val) {
        console.error('Error: --since requires a value');
        return null;
      }
      try {
        since = parseDuration(val);
      } catch (e) {
        console.error((e as Error).message);
        return null;
      }
    } else if (arg === '--limit') {
      const val = args[++i];
      limit = parseInt(val, 10);
      if (isNaN(limit) || limit < 1) {
        console.error('Error: --limit requires a positive number');
        return null;
      }
    } else if (arg === '--table') {
      table = args[++i];
      if (!table) {
        console.error('Error: --table requires a value');
        return null;
      }
    } else if (arg === '--format') {
      const val = args[++i];
      if (val !== 'json' && val !== 'text') {
        console.error('Error: --format must be json or text');
        return null;
      }
      format = val;
    } else if (!arg.startsWith('-')) {
      dbPath = arg;
    }
  }

  return {
    dbPath: dbPath ?? getDefaultDbPath(),
    level,
    name,
    search,
    since,
    limit,
    table,
    format
  };
}

function formatTime(time: number): string {
  return new Date(time).toISOString();
}

function runQuery(args: string[]): void {
  const options = parseQueryArgs(args);
  if (!options) {
    printHelp();
    process.exit(1);
  }

  const { dbPath, level, name, search, since, limit, table, format } = options;

  let query: LogQuery;
  try {
    query = new LogQuery(dbPath, table);
  } catch (e) {
    console.error('Error opening database:', (e as Error).message);
    process.exit(1);
  }

  try {
    if (level !== null) {
      query.level(level);
    }
    if (name !== null) {
      query.name(name);
    }
    if (search !== null) {
      query.messageContains(search);
    }
    if (since !== null) {
      query.since(since);
    }
    query.limit(limit);

    const logs = query.find();

    if (format === 'json') {
      console.log(JSON.stringify(logs, null, 2));
    } else {
      if (logs.length === 0) {
        console.log('No logs found.');
        return;
      }

      for (const log of logs) {
        const time = formatTime(log.time);
        const lvl = extractLevelLabel(log.level);
        const nameStr = log.name ? `[${log.name}]` : '';
        const msg = log.msg ?? '';
        console.log(`${time} ${lvl.padEnd(5)} ${nameStr} ${msg}`);
      }
      console.log(`\nShowing ${logs.length} log(s)`);
    }
  } finally {
    query.close();
  }
}

function runStats(args: string[]): void {
  let dbPath: string | null = null;
  let table = 'logs';
  let format: 'json' | 'text' = 'text';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--db') {
      dbPath = args[++i];
    } else if (arg === '--table') {
      table = args[++i];
    } else if (arg === '--format') {
      const val = args[++i];
      if (val === 'json' || val === 'text') {
        format = val;
      }
    } else if (!arg.startsWith('-')) {
      dbPath = arg;
    }
  }

  dbPath = dbPath ?? getDefaultDbPath();

  let query: LogQuery;
  try {
    query = new LogQuery(dbPath, table);
  } catch (e) {
    console.error('Error opening database:', (e as Error).message);
    process.exit(1);
  }

  try {
    const total = query.reset().count();
    const counts: Record<string, number> = {};

    for (const { stored, label } of LEVELS) {
      counts[label] = query.reset().level(stored, '=').count();
    }

    const names = query.distinct('name');

    if (format === 'json') {
      console.log(JSON.stringify({ total, byLevel: counts, loggers: names }, null, 2));
    } else {
      console.log(`Total logs: ${total}`);
      console.log('\nBy level:');
      for (const [level, count] of Object.entries(counts)) {
        if (count > 0) {
          console.log(`  ${level.padEnd(5)}: ${count}`);
        }
      }
      if (names.length > 0) {
        console.log('\nLogger names:');
        for (const name of names) {
          console.log(`  - ${name}`);
        }
      }
    }
  } finally {
    query.close();
  }
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];

  if (command === 'query') {
    runQuery(args.slice(1));
  } else if (command === 'stats') {
    runStats(args.slice(1));
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
}

main();
