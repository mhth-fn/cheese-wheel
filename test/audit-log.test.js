'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createAuditLog, routeToAction, sanitizeDetails } = require('../lib/audit-log');

test('audit details remove credentials and review bodies', () => {
  assert.deepEqual(
    sanitizeDetails({
      title: 'Arrival',
      status: 200,
      password: 'never-log-this',
      token: 'never-log-this',
      content: 'full review body',
    }),
    { title: 'Arrival', status: 200 }
  );
});

test('known mutation routes get stable human-readable actions', () => {
  assert.equal(routeToAction('PATCH', '/api/admin/users/2/role'), 'user.role_changed');
  assert.equal(routeToAction('DELETE', '/api/watched/42'), 'watched.deleted');
  assert.equal(routeToAction('POST', '/api/2fa/enable'), 'two_factor.enabled');
  assert.equal(routeToAction('POST', '/api/music-reviews'), 'music_review.created');
  assert.equal(
    routeToAction('PATCH', '/api/music-reviews/23'),
    'music_review.updated'
  );
  assert.equal(
    routeToAction('POST', '/api/sigame-packs/17/status'),
    'sigame_pack.status_changed'
  );
  assert.equal(
    routeToAction('PUT', '/api/sigame-packs/17/rating'),
    'sigame_pack.rating_set'
  );
});

test('audit rows are cursor ordered and never expose IP hashes', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );
    INSERT INTO users (id, name) VALUES (2, 'Сергей');
  `);
  const audit = createAuditLog(db, { pepper: 'a'.repeat(32) });
  audit.record({
    actorUserId: 2,
    actorRole: 'admin',
    action: 'theme.changed',
    targetType: 'theme',
    result: 'success',
    ip: '203.0.113.1',
    details: { theme: 'spring' },
  });
  audit.record({
    actorUserId: 2,
    actorRole: 'admin',
    action: 'setting.changed',
    targetType: 'settings',
    result: 'denied',
    ip: '203.0.113.1',
    details: { status: 403 },
  });

  const firstPage = audit.getEntries({ limit: 1 });
  assert.equal(firstPage.length, 1);
  assert.equal(firstPage[0].action, 'setting.changed');
  assert.equal(firstPage[0].actor_name, 'Сергей');
  assert.equal(Object.hasOwn(firstPage[0], 'ip_hash'), false);

  const secondPage = audit.getEntries({ before: firstPage[0].id, limit: 10 });
  assert.equal(secondPage.length, 1);
  assert.equal(secondPage[0].details.theme, 'spring');
  db.close();
});
