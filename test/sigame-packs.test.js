'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  login,
  request,
  startServer,
  stopServer,
} = require('./helpers/server-fixture');

const fsp = fs.promises;

test('SIGame library supports tags, shared status, ownership and personal ratings', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-sigame-test-'));
  const instance = await startServer(dataDir);
  t.after(async () => {
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  assert.equal((await request(instance, '/api/sigame-packs')).status, 401);

  const guest = await request(instance, '/api/auth/guest', {
    method: 'POST',
    body: {},
  });
  assert.equal(guest.status, 200);
  const guestCookie = guest.response.headers.get('set-cookie').split(';', 1)[0];
  const emptyLibrary = await request(instance, '/api/sigame-packs', {
    cookie: guestCookie,
  });
  assert.equal(emptyLibrary.status, 200);
  assert.deepEqual(emptyLibrary.payload, []);
  assert.equal((await request(instance, '/api/sigame-packs', {
    method: 'POST',
    cookie: guestCookie,
    body: { title: 'Guest pack' },
  })).status, 403);

  const anton = await login(instance, 1);
  const sergey = await login(instance, 2);
  const peter = await login(instance, 3);

  const invalidPack = await request(instance, '/api/sigame-packs', {
    method: 'POST',
    cookie: anton.cookie,
    body: {
      title: 'Unsafe source',
      source_url: 'javascript:alert(1)',
      tags: [],
    },
  });
  assert.equal(invalidPack.status, 400);

  const created = await request(instance, '/api/sigame-packs', {
    method: 'POST',
    cookie: anton.cookie,
    body: {
      title: 'Большой научный пак',
      pack_author: 'Quizmaster',
      description: 'Тестовый пакет для интеграционного сценария.',
      source_url: 'https://example.com/packs/science.siq',
      tags: ['Наука', 'сложный', 'наука'],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.status, 'planned');
  assert.equal(created.payload.added_by, anton.user.id);
  assert.deepEqual(new Set(created.payload.tags), new Set(['Наука', 'сложный']));
  assert.equal(created.payload.average_rating, null);
  const packId = created.payload.id;

  assert.equal((await request(instance, `/api/sigame-packs/${packId}`, {
    method: 'PATCH',
    cookie: peter.cookie,
    body: { description: 'Чужая правка' },
  })).status, 403);

  const edited = await request(instance, `/api/sigame-packs/${packId}`, {
    method: 'PATCH',
    cookie: anton.cookie,
    body: { description: 'Обновлённое описание.' },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.payload.description, 'Обновлённое описание.');
  assert.deepEqual(new Set(edited.payload.tags), new Set(['Наука', 'сложный']));

  assert.equal((await request(instance, `/api/sigame-packs/${packId}/rating`, {
    method: 'PUT',
    cookie: anton.cookie,
    body: { rating: 9 },
  })).status, 409);

  const played = await request(instance, `/api/sigame-packs/${packId}/status`, {
    method: 'POST',
    cookie: peter.cookie,
    body: { status: 'played' },
  });
  assert.equal(played.status, 200);
  assert.equal(played.payload.status, 'played');
  assert.equal(played.payload.played_by, peter.user.id);
  assert.ok(played.payload.played_at);

  const antonRating = await request(instance, `/api/sigame-packs/${packId}/rating`, {
    method: 'PUT',
    cookie: anton.cookie,
    body: { rating: 9 },
  });
  assert.equal(antonRating.status, 200);
  assert.equal(antonRating.payload.my_rating, 9);

  const sergeyRating = await request(instance, `/api/sigame-packs/${packId}/rating`, {
    method: 'PUT',
    cookie: sergey.cookie,
    body: { rating: 7 },
  });
  assert.equal(sergeyRating.status, 200);
  assert.equal(sergeyRating.payload.my_rating, 7);
  assert.equal(sergeyRating.payload.average_rating, 8);
  assert.equal(sergeyRating.payload.ratings_count, 2);

  const antonView = await request(instance, '/api/sigame-packs', {
    cookie: anton.cookie,
  });
  assert.equal(antonView.status, 200);
  assert.equal(antonView.payload[0].my_rating, 9);
  assert.equal(antonView.payload[0].average_rating, 8);

  const guestView = await request(instance, '/api/sigame-packs', {
    cookie: guestCookie,
  });
  assert.equal(guestView.status, 200);
  assert.equal(guestView.payload[0].my_rating, null);
  assert.equal(guestView.payload[0].average_rating, 8);

  assert.equal((await request(instance, `/api/sigame-packs/${packId}/status`, {
    method: 'POST',
    cookie: peter.cookie,
    body: { status: 'planned' },
  })).status, 403);

  const restored = await request(instance, `/api/sigame-packs/${packId}/status`, {
    method: 'POST',
    cookie: anton.cookie,
    body: { status: 'planned' },
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.payload.status, 'planned');
  assert.equal(restored.payload.played_at, null);

  assert.equal((await request(instance, `/api/sigame-packs/${packId}`, {
    method: 'DELETE',
    cookie: peter.cookie,
  })).status, 403);
  assert.equal((await request(instance, `/api/sigame-packs/${packId}`, {
    method: 'DELETE',
    cookie: sergey.cookie,
  })).status, 200);
  assert.deepEqual(
    (await request(instance, '/api/sigame-packs', { cookie: anton.cookie })).payload,
    []
  );
});
