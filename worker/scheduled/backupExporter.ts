/**
 * Weekly R2 backup exporter — dumps four core tables to CSV and writes them
 * to `R2_BUCKET` under `backups/<table>/<YYYY>/<YYYY-MM-DD>.csv`.
 *
 * Triggered by the `scheduled` handler on the cron `0 3 * * SUN` (03:00 UTC
 * every Sunday — see wrangler.toml). 12-week retention is enforced at the
 * tail of the run with a list-and-delete pass per table.
 *
 * Deliberately plain-SQL rather than drizzle-select: the schema is big and
 * evolving, and a raw `SELECT * FROM <table>` gives us a reliable dump even
 * if a few columns are out of sync between drizzle and Neon.
 */

import { neon } from "@neondatabase/serverless";
import type { Env } from "../types";

// Tables included in the weekly dump. Order is stable so the R2 keys are
// consistent across runs. Add / remove here as tables mature.
const BACKUP_TABLES = [
  "orders",
  "projects",
  "customer_companies",
  "cart_items",
] as const;

const RETENTION_WEEKS = 12;

/**
 * Convert a JS value to a CSV-safe string. Handles null, numbers, booleans,
 * Date, and object/array (JSON-stringified). Quotes the field whenever it
 * contains a comma, double-quote, CR, or LF, and escapes embedded quotes by
 * doubling them per RFC 4180.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str: string;
  if (value instanceof Date) {
    str = value.toISOString();
  } else if (typeof value === "object") {
    // Postgres JSONB comes back as a parsed object from neon-http.
    str = JSON.stringify(value);
  } else if (typeof value === "boolean" || typeof value === "number") {
    str = String(value);
  } else {
    str = String(value);
  }
  // Quote and escape per RFC 4180 when the field contains any reserved char.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Given an array of row objects, produce a CSV string with a header row.
 * Header comes from the first row's keys (Postgres column order is stable
 * within a single `SELECT *` query).
 */
function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines: string[] = [];
  lines.push(headers.map(csvEscape).join(","));
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  // Trailing newline — mostly a cosmetic nicety so `cat backup.csv` renders
  // cleanly in a terminal.
  return lines.join("\n") + "\n";
}

/** Zero-padded YYYY-MM-DD for a Date object, UTC. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function yearOf(d: Date): string {
  return d.toISOString().slice(0, 4);
}

/**
 * Build the R2 key for a given table/date. Keyed under `backups/` so a
 * lifecycle rule at the bucket level could target the prefix separately if
 * you ever want S3-style tiering.
 */
function r2KeyFor(table: string, date: Date): string {
  return `backups/${table}/${yearOf(date)}/${isoDate(date)}.csv`;
}

/**
 * Delete any CSV files for a given table that are older than the retention
 * window. Uses the R2 `list` API with prefix filtering so we never hold
 * more than one listing page in memory.
 */
async function enforceRetention(
  bucket: R2Bucket,
  table: string,
  cutoff: Date
): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  const prefix = `backups/${table}/`;

  do {
    const page: R2Objects = await bucket.list({
      prefix,
      cursor,
      limit: 1000,
    });
    const toDelete: string[] = [];
    for (const obj of page.objects) {
      // Key format: backups/<table>/<YYYY>/<YYYY-MM-DD>.csv — extract the
      // date-ish tail to decide retention.
      const match = obj.key.match(/(\d{4}-\d{2}-\d{2})\.csv$/);
      if (!match) continue;
      const keyDate = new Date(`${match[1]}T00:00:00Z`);
      if (keyDate.getTime() < cutoff.getTime()) {
        toDelete.push(obj.key);
      }
    }
    if (toDelete.length > 0) {
      // R2 binding supports multi-key delete via an array.
      await bucket.delete(toDelete);
      deleted += toDelete.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return deleted;
}

/**
 * Dump a single table to CSV and upload to R2. Returns the key and row
 * count for logging.
 */
async function dumpTable(
  env: Env,
  table: string,
  now: Date
): Promise<{ key: string; rows: number }> {
  if (!env.R2_BUCKET) {
    throw new Error("R2_BUCKET binding missing — cannot persist backups");
  }
  const sqlClient = neon(env.DATABASE_URL);
  // Table names are from a fixed allowlist — safe to interpolate. neon's
  // template tag would otherwise try to bind this as a parameter.
  const rows = (await sqlClient(`SELECT * FROM ${table}`)) as Record<
    string,
    unknown
  >[];
  const csv = rowsToCsv(rows);
  const key = r2KeyFor(table, now);

  await env.R2_BUCKET.put(key, csv, {
    httpMetadata: {
      contentType: "text/csv; charset=utf-8",
    },
    customMetadata: {
      // Lightweight audit trail — when, what, how big.
      table,
      rowCount: String(rows.length),
      generatedAt: now.toISOString(),
    },
  });

  return { key, rows: rows.length };
}

/**
 * Main entry point — dumps every table, enforces retention, logs summary.
 * Called from the `scheduled` export in worker/index.ts, wrapped in
 * ctx.waitUntil so it doesn't block the event handler.
 */
export async function runBackups(env: Env): Promise<void> {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - RETENTION_WEEKS * 7 * 24 * 60 * 60 * 1000
  );

  if (!env.R2_BUCKET) {
    console.error("[backup] R2_BUCKET binding missing — aborting run");
    return;
  }

  console.log(
    `[backup] starting weekly dump at ${now.toISOString()}, retention cutoff ${cutoff.toISOString()}`
  );

  const results: { table: string; key: string; rows: number }[] = [];
  for (const table of BACKUP_TABLES) {
    try {
      const { key, rows } = await dumpTable(env, table, now);
      results.push({ table, key, rows });
      console.log(`[backup] ${table}: wrote ${rows} rows to ${key}`);
    } catch (err) {
      // Don't abort the whole run — log the failure and continue so at
      // least the other tables get backed up.
      console.error(`[backup] ${table} failed:`, err);
    }
  }

  // Retention pass — best-effort; a failure here shouldn't poison a
  // successful dump.
  for (const table of BACKUP_TABLES) {
    try {
      const deleted = await enforceRetention(env.R2_BUCKET, table, cutoff);
      if (deleted > 0) {
        console.log(`[backup] retention: pruned ${deleted} old files for ${table}`);
      }
    } catch (err) {
      console.error(`[backup] retention pass failed for ${table}:`, err);
    }
  }

  console.log(
    `[backup] finished; wrote ${results.length}/${BACKUP_TABLES.length} tables`
  );
}
