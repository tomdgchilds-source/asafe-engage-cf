// ─────────────────────────────────────────────────────────
// Structured JSON logger.
//
// Workers logs are shipped through `console.log` / `console.error`;
// the Cloudflare dashboard and Logpush indexes them by level and the
// first-line JSON payload. Every log line this emits is a single-line
// JSON record so downstream log-search infrastructure (Cloudflare
// Logpush → BigQuery / S3 / whatever) can index by `requestId`,
// `userId`, `level`, and `msg` without parsing unstructured strings.
//
// Usage:
//   const log = createLogger({ requestId, userId });
//   log.info("order_created", { orderId, totalAed: 12500 });
//   log.error("db_write_failed", { err: String(err) });
//
// Never throws — a logger failure must not take down the request.
// ─────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  ts: string;
  level: LogLevel;
  requestId?: string;
  userId?: string;
  msg: string;
  [key: string]: unknown;
}

export interface LoggerCtx {
  requestId: string;
  userId?: string;
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  /** Return a child logger that inherits the parent context plus overrides. */
  child(extra: Partial<LoggerCtx>): Logger;
}

function safeStringify(record: LogRecord): string {
  try {
    return JSON.stringify(record);
  } catch {
    // Most likely a circular reference inside `data`. Strip values and
    // keep the top-level metadata so the log line isn't lost entirely.
    try {
      return JSON.stringify({
        ts: record.ts,
        level: record.level,
        requestId: record.requestId,
        userId: record.userId,
        msg: record.msg,
        _loggerNote: "payload-unserialisable",
      });
    } catch {
      return `{"ts":"${new Date().toISOString()}","level":"error","msg":"logger_serialise_failed"}`;
    }
  }
}

function emit(level: LogLevel, record: LogRecord): void {
  const line = safeStringify(record);
  try {
    if (level === "warn" || level === "error") {
      // eslint-disable-next-line no-console
      console.error(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  } catch {
    // Swallow. Console failing in a Worker is catastrophic upstream;
    // the logger must never propagate the error.
  }
}

export function createLogger(ctx: LoggerCtx): Logger {
  const base: LoggerCtx = {
    requestId: ctx.requestId,
    userId: ctx.userId,
  };

  function build(
    level: LogLevel,
    msg: string,
    data?: Record<string, unknown>
  ): LogRecord {
    const rec: LogRecord = {
      ts: new Date().toISOString(),
      level,
      requestId: base.requestId,
      msg,
    };
    if (base.userId) rec.userId = base.userId;
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        if (!(k in rec)) rec[k] = v;
      }
    }
    return rec;
  }

  const logger: Logger = {
    debug(msg, data) {
      emit("debug", build("debug", msg, data));
    },
    info(msg, data) {
      emit("info", build("info", msg, data));
    },
    warn(msg, data) {
      const record = build("warn", msg, data);
      emit("warn", record);
      maybeForwardToSentry(record);
    },
    error(msg, data) {
      const record = build("error", msg, data);
      emit("error", record);
      maybeForwardToSentry(record);
    },
    child(extra) {
      return createLogger({
        requestId: extra.requestId ?? base.requestId,
        userId: extra.userId ?? base.userId,
      });
    },
  };

  return logger;
}

// ─────────────────────────────────────────────────────────
// Sentry forwarding — deliberately a no-op for now.
//
// TODO(security): when SENTRY_DSN is wired through wrangler.toml + the
// Env type, implement a minimal fetch-based forwarder for warn + error
// levels. No SDK dependency — we POST to Sentry's /store endpoint
// directly to keep the Worker bundle lean. Use c.executionCtx.waitUntil
// when called from within a request so the response isn't blocked on
// the network round-trip.
// ─────────────────────────────────────────────────────────
function maybeForwardToSentry(_record: LogRecord): void {
  // Intentional no-op. See TODO above.
}
