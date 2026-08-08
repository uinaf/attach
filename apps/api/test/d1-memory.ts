import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../migrations");

function toSqlValue(v: unknown): SQLInputValue {
  if (v instanceof ArrayBuffer) return Buffer.from(v);
  if (v instanceof Uint8Array) return Buffer.from(v);
  return v as SQLInputValue;
}

/** Minimal D1Database backed by node:sqlite for quota characterization tests. */
export function openMemoryD1(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(join(migrationsDir, "0001_init.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0002_quota_counters.sql"), "utf8"));

  const prepare = (sql: string): D1PreparedStatement => {
    const make = (bounds: SQLInputValue[]): D1PreparedStatement => {
      const stmt: D1PreparedStatement = {
        bind(...values: unknown[]) {
          return make(values.map(toSqlValue));
        },
        async first<T = unknown>(colName?: string) {
          const row = sqlite.prepare(sql).get(...bounds) as Record<string, unknown> | undefined;
          if (!row) return null;
          if (colName) return (row[colName] as T) ?? null;
          return row as T;
        },
        async run() {
          const info = sqlite.prepare(sql).run(...bounds);
          return {
            success: true,
            meta: {
              changes: Number(info.changes ?? 0),
              duration: 0,
              last_row_id: Number(info.lastInsertRowid ?? 0),
              rows_read: 0,
              rows_written: Number(info.changes ?? 0),
              size_after: 0,
              changed_db: Number(info.changes ?? 0) > 0,
            },
            results: [],
          };
        },
        async all<T = unknown>() {
          const results = sqlite.prepare(sql).all(...bounds) as T[];
          return {
            success: true,
            meta: {
              changes: 0,
              duration: 0,
              last_row_id: 0,
              rows_read: results.length,
              rows_written: 0,
              size_after: 0,
              changed_db: false,
            },
            results,
          };
        },
        async raw() {
          throw new Error("raw() not implemented in memory D1");
        },
      };
      return stmt;
    };
    return make([]);
  };

  return {
    prepare,
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      const out: D1Result<T>[] = [];
      sqlite.exec("BEGIN");
      try {
        for (const s of statements) {
          out.push((await s.run()) as D1Result<T>);
        }
        sqlite.exec("COMMIT");
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
      return out;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return {
        count: 0,
        duration: 0,
      };
    },
    withSession() {
      throw new Error("withSession not implemented");
    },
  } as unknown as D1Database;
}
