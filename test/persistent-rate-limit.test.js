'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const { createPersistentRateLimiter } = require('../lib/persistent-rate-limit');

test('rate-limit state survives limiter recreation and resets after its window', () => {
  const db = new Database(':memory:');
  let currentTime = 1_000;
  const options = {
    db,
    pepper: Buffer.alloc(32, 7),
    now: () => currentTime,
    cleanupIntervalMs: 0,
  };

  const firstLimiter = createPersistentRateLimiter(options);
  assert.equal(firstLimiter.consume('auth-ip', '203.0.113.1', 2, 10_000).allowed, true);
  assert.equal(firstLimiter.consume('auth-ip', '203.0.113.1', 2, 10_000).allowed, true);
  assert.equal(firstLimiter.consume('auth-ip', '203.0.113.1', 2, 10_000).allowed, false);
  firstLimiter.close();

  const secondLimiter = createPersistentRateLimiter(options);
  const stillBlocked = secondLimiter.consume('auth-ip', '203.0.113.1', 2, 10_000);
  assert.equal(stillBlocked.allowed, false);
  assert.equal(stillBlocked.alreadyLimited, true);
  assert.equal(stillBlocked.retryAfter, 10);

  currentTime = 11_000;
  const reset = secondLimiter.consume('auth-ip', '203.0.113.1', 2, 10_000);
  assert.equal(reset.allowed, true);
  assert.equal(reset.count, 1);
  secondLimiter.close();
  db.close();
});

test('saturated buckets remain read-only until the window resets', () => {
  const db = new Database(':memory:');
  let currentTime = 9_000;
  const limiter = createPersistentRateLimiter({
    db,
    pepper: Buffer.alloc(32, 9),
    now: () => currentTime,
    cleanupIntervalMs: 0,
  });

  assert.equal(limiter.consume('api', '198.51.100.9', 1, 5_000).allowed, true);
  const firstRejection = limiter.consume('api', '198.51.100.9', 1, 5_000);
  assert.equal(firstRejection.allowed, false);
  assert.equal(firstRejection.alreadyLimited, false);

  const before = db.prepare(
    'SELECT count, reset_at, updated_at FROM rate_limit_buckets'
  ).get();
  currentTime = 10_000;
  const repeatedRejection = limiter.consume('api', '198.51.100.9', 1, 5_000);
  const after = db.prepare(
    'SELECT count, reset_at, updated_at FROM rate_limit_buckets'
  ).get();
  assert.equal(repeatedRejection.allowed, false);
  assert.equal(repeatedRejection.alreadyLimited, true);
  assert.deepEqual(after, before);

  limiter.close();
  db.close();
});

test('rate-limit keys are stored as HMAC digests and expired rows are cleaned', () => {
  const db = new Database(':memory:');
  let currentTime = 5_000;
  const limiter = createPersistentRateLimiter({
    db,
    pepper: 'a stable pepper with at least thirty-two bytes',
    now: () => currentTime,
    cleanupIntervalMs: 0,
  });

  limiter.consume('api-write', 'raw-session-token', 3, 1_000);
  const row = db.prepare(
    'SELECT scope, key_hash, reset_at FROM rate_limit_buckets'
  ).get();
  assert.equal(row.scope, 'api-write');
  assert.ok(Buffer.isBuffer(row.key_hash));
  assert.equal(row.key_hash.length, 32);
  assert.equal(row.key_hash.includes(Buffer.from('raw-session-token')), false);

  currentTime = 6_000;
  assert.equal(limiter.cleanupExpired(), 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM rate_limit_buckets').get().count, 0);

  limiter.close();
  db.close();
});
