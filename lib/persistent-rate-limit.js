'use strict';

const crypto = require('crypto');

const DEFAULT_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const MIN_PEPPER_BYTES = 32;

function normalizePepper(pepper) {
  if (Buffer.isBuffer(pepper)) {
    if (pepper.length < MIN_PEPPER_BYTES) {
      throw new Error(`Rate-limit pepper must contain at least ${MIN_PEPPER_BYTES} bytes`);
    }
    return Buffer.from(pepper);
  }

  if (typeof pepper === 'string' && Buffer.byteLength(pepper, 'utf8') >= MIN_PEPPER_BYTES) {
    return Buffer.from(pepper, 'utf8');
  }

  throw new Error(`Rate-limit pepper must contain at least ${MIN_PEPPER_BYTES} bytes`);
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function createPersistentRateLimiter({
  db,
  pepper,
  now = Date.now,
  cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
  logger = console,
} = {}) {
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new TypeError('A better-sqlite3 database instance is required');
  }
  if (typeof now !== 'function') {
    throw new TypeError('now must be a function');
  }
  if (!Number.isSafeInteger(cleanupIntervalMs) || cleanupIntervalMs < 0) {
    throw new TypeError('cleanupIntervalMs must be a non-negative safe integer');
  }

  const pepperBuffer = normalizePepper(pepper);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      scope TEXT NOT NULL,
      key_hash BLOB NOT NULL,
      count INTEGER NOT NULL CHECK(count > 0),
      reset_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(scope, key_hash)
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset_at
      ON rate_limit_buckets(reset_at);
  `);

  const consumeStatement = db.prepare(`
    INSERT INTO rate_limit_buckets (
      scope,
      key_hash,
      count,
      reset_at,
      updated_at
    )
    VALUES (
      @scope,
      @keyHash,
      1,
      @resetAt,
      @now
    )
    ON CONFLICT(scope, key_hash) DO UPDATE SET
      count = CASE
        WHEN rate_limit_buckets.reset_at <= @now THEN 1
        ELSE MIN(rate_limit_buckets.count + 1, @maxPlusOne)
      END,
      reset_at = CASE
        WHEN rate_limit_buckets.reset_at <= @now THEN @resetAt
        ELSE rate_limit_buckets.reset_at
      END,
      updated_at = @now
    RETURNING count, reset_at
  `);
  const cleanupStatement = db.prepare(
    'DELETE FROM rate_limit_buckets WHERE reset_at <= ?'
  );

  function hashKey(scope, key) {
    return crypto
      .createHmac('sha256', pepperBuffer)
      .update(scope, 'utf8')
      .update('\0', 'utf8')
      .update(String(key), 'utf8')
      .digest();
  }

  function consume(scope, key, max, windowMs) {
    if (typeof scope !== 'string' || scope.length < 1 || scope.length > 64) {
      throw new TypeError('scope must be a non-empty string of at most 64 characters');
    }
    if (key === undefined || key === null) {
      throw new TypeError('rate-limit key is required');
    }
    assertPositiveInteger(max, 'max');
    assertPositiveInteger(windowMs, 'windowMs');
    if (max === Number.MAX_SAFE_INTEGER) {
      throw new RangeError('max is too large');
    }

    const currentTime = Number(now());
    if (!Number.isSafeInteger(currentTime) || currentTime < 0) {
      throw new Error('now() must return a non-negative integer timestamp');
    }
    if (currentTime > Number.MAX_SAFE_INTEGER - windowMs) {
      throw new RangeError('rate-limit window exceeds the timestamp range');
    }

    const row = consumeStatement.get({
      scope,
      keyHash: hashKey(scope, key),
      maxPlusOne: max + 1,
      now: currentTime,
      resetAt: currentTime + windowMs,
    });

    const resetAt = Number(row.reset_at);
    const count = Number(row.count);
    return {
      allowed: count <= max,
      count,
      limit: max,
      resetAt,
      retryAfter: count <= max
        ? 0
        : Math.max(1, Math.ceil((resetAt - currentTime) / 1000)),
    };
  }

  function cleanupExpired(at = now()) {
    const timestamp = Number(at);
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new TypeError('cleanup timestamp must be a non-negative integer');
    }
    return cleanupStatement.run(timestamp).changes;
  }

  // Remove stale state from previous processes immediately. A failed cleanup
  // should surface during startup instead of silently disabling persistence.
  cleanupExpired();

  let cleanupTimer = null;
  if (cleanupIntervalMs > 0) {
    cleanupTimer = setInterval(() => {
      try {
        cleanupExpired();
      } catch (error) {
        logger?.error?.('[cheese-wheel] Persistent rate-limit cleanup failed:', error);
      }
    }, cleanupIntervalMs);
    cleanupTimer.unref?.();
  }

  function close() {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }

  return {
    consume,
    cleanupExpired,
    close,
  };
}

module.exports = {
  createPersistentRateLimiter,
};
