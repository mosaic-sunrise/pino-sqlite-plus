import build from 'pino-abstract-transport';
import { initDatabase, insertBatch, closeDatabase } from './db.js';
import type { DatabaseInstance, PinoLog, TransportOptions } from './types.js';

export default async function (opts: TransportOptions) {
  const { batchSize = 100, flushIntervalMs = 1000, tableName = 'logs' } = opts;

  const db: DatabaseInstance = initDatabase(opts);
  let buffer: PinoLog[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    if (buffer.length === 0) return;
    const pending = buffer;
    buffer = [];
    try {
      insertBatch(db, tableName, pending);
    } catch (err) {
      // Drop the batch rather than retry — a schema/disk error would loop forever.
      // Surface to stderr so the failure is visible without crashing the worker.
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[pino-sqlite-plus] flush failed, dropped ${pending.length} log(s): ${message}\n`
      );
    }
  };

  const scheduleFlush = (): void => {
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, flushIntervalMs);
    }
  };

  return build(
    async function (source) {
      for await (const obj of source) {
        buffer.push(obj as PinoLog);

        if (buffer.length >= batchSize) {
          flush();
        } else {
          scheduleFlush();
        }
      }
    },
    {
      close: (err, cb) => {
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flush();
        try {
          closeDatabase(db);
        } catch (closeErr) {
          const message = closeErr instanceof Error ? closeErr.message : String(closeErr);
          process.stderr.write(`[pino-sqlite-plus] close failed: ${message}\n`);
        }
        cb(err);
      }
    }
  );
}
