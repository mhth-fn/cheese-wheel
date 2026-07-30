'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const {
  login,
  request,
  startServer,
  stopServer,
} = require('./helpers/server-fixture');

const fsp = fs.promises;
const validSiqFile = Buffer.from([
  0x50, 0x4b, 0x05, 0x06,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

async function uploadPack(instance, cookie, {
  title = 'Тестовый пак',
  tags = [],
  fileName = 'test-pack.siq',
  file = validSiqFile,
} = {}) {
  const params = new URLSearchParams();
  if (title !== null) params.set('title', title);
  params.set('tags', JSON.stringify(tags));
  params.set('original_file_name', fileName);
  const response = await fetch(
    `${instance.baseUrl}/api/sigame-packs?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/octet-stream',
      },
      body: file,
    }
  );
  const payload = await response.json().catch(() => null);
  return { response, status: response.status, payload };
}

test('SIGame library securely stores .siq files and enforces played-state ratings', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-sigame-test-'));
  let instance = await startServer(dataDir);
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
  assert.deepEqual(
    (await request(instance, '/api/sigame-packs', { cookie: guestCookie })).payload,
    []
  );
  assert.equal((await uploadPack(instance, guestCookie)).status, 403);

  const anton = await login(instance, 1);
  const sergey = await login(instance, 2);
  const peter = await login(instance, 3);

  const noFile = await request(
    instance,
    '/api/sigame-packs?title=Без%20файла&tags=%5B%5D&original_file_name=missing.siq',
    { method: 'POST', cookie: anton.cookie }
  );
  assert.equal(noFile.status, 400);

  assert.equal((await uploadPack(instance, anton.cookie, {
    title: null,
  })).status, 400);
  assert.equal((await uploadPack(instance, anton.cookie, {
    fileName: 'not-a-pack.txt',
  })).status, 400);
  assert.equal((await uploadPack(instance, anton.cookie, {
    file: Buffer.from('not a zip archive'),
  })).status, 400);
  assert.equal((await uploadPack(instance, anton.cookie, {
    tags: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  })).status, 400);

  const created = await uploadPack(instance, anton.cookie, {
    title: '  История Древней Греции  ',
    tags: ['история', 'Сложный', 'ИСТОРИЯ', '3', '4', '5', '6', '7', '8'],
    fileName: 'Древняя Греция.siq',
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.title, 'История Древней Греции');
  assert.equal(created.payload.status, 'unplayed');
  assert.equal(created.payload.added_by, anton.user.id);
  assert.deepEqual(
    new Set(created.payload.tags),
    new Set(['история', 'Сложный', '3', '4', '5', '6', '7', '8'])
  );
  assert.equal(created.payload.original_file_name, 'Древняя Греция.siq');
  assert.equal(created.payload.file_size, validSiqFile.length);
  assert.equal(created.payload.has_file, true);
  assert.equal(created.payload.average_rating, null);
  assert.equal(created.payload.my_rating, null);
  const packId = created.payload.id;

  const db = new Database(path.join(dataDir, 'cheese_wheel.db'));
  const stored = db.prepare(
    'SELECT storage_key FROM sigame_packs WHERE id = ?'
  ).get(packId);
  db.close();
  assert.match(stored.storage_key, /^[a-f0-9-]{36}\.siq$/);
  assert.equal(
    await fsp.readFile(path.join(dataDir, 'sigame-packs', stored.storage_key))
      .then(file => file.equals(validSiqFile)),
    true
  );

  const download = await fetch(
    `${instance.baseUrl}/api/sigame-packs/${packId}/download`,
    { headers: { Cookie: guestCookie } }
  );
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /filename\*=UTF-8''/);
  assert.equal(
    Buffer.from(await download.arrayBuffer()).equals(validSiqFile),
    true
  );

  assert.equal((await request(instance, `/api/sigame-packs/${packId}`, {
    method: 'PATCH',
    cookie: peter.cookie,
    body: { title: 'Чужая правка', tags: [] },
  })).status, 403);

  const edited = await request(instance, `/api/sigame-packs/${packId}`, {
    method: 'PATCH',
    cookie: anton.cookie,
    body: {
      title: 'Греция: полный пак',
      tags: ['история', 'античность'],
    },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.payload.title, 'Греция: полный пак');
  assert.deepEqual(new Set(edited.payload.tags), new Set(['история', 'античность']));

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

  assert.equal((await request(instance, `/api/sigame-packs/${packId}/played-date`, {
    method: 'PATCH',
    cookie: peter.cookie,
    body: { played_date: '2026-07-12' },
  })).status, 403);
  assert.equal((await request(instance, `/api/sigame-packs/${packId}/played-date`, {
    method: 'PATCH',
    cookie: anton.cookie,
    body: { played_date: '2026-02-30' },
  })).status, 400);

  const dated = await request(instance, `/api/sigame-packs/${packId}/played-date`, {
    method: 'PATCH',
    cookie: sergey.cookie,
    body: { played_date: '2026-07-12' },
  });
  assert.equal(dated.status, 200);
  assert.equal(dated.payload.played_at, Date.UTC(2026, 6, 12, 12));

  const unknownDate = await request(instance, `/api/sigame-packs/${packId}/played-date`, {
    method: 'PATCH',
    cookie: anton.cookie,
    body: { played_date: null },
  });
  assert.equal(unknownDate.status, 200);
  assert.equal(unknownDate.payload.played_at, null);

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
  assert.equal(sergeyRating.payload.average_rating, 8);
  assert.equal(sergeyRating.payload.ratings_count, 2);

  assert.equal((await request(instance, `/api/sigame-packs/${packId}/status`, {
    method: 'POST',
    cookie: peter.cookie,
    body: { status: 'unplayed' },
  })).status, 403);

  const restored = await request(instance, `/api/sigame-packs/${packId}/status`, {
    method: 'POST',
    cookie: anton.cookie,
    body: { status: 'unplayed' },
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.payload.status, 'unplayed');
  assert.equal(restored.payload.played_at, null);
  assert.equal(restored.payload.average_rating, null);
  assert.equal(restored.payload.my_rating, null);
  assert.equal((await request(instance, `/api/sigame-packs/${packId}/played-date`, {
    method: 'PATCH',
    cookie: anton.cookie,
    body: { played_date: '2026-07-12' },
  })).status, 409);
  const ratingsDb = new Database(path.join(dataDir, 'cheese_wheel.db'));
  assert.equal(
    ratingsDb.prepare(
      'SELECT COUNT(*) AS count FROM sigame_pack_ratings WHERE pack_id = ?'
    ).get(packId).count,
    0
  );
  ratingsDb.close();

  assert.equal((await request(instance, `/api/sigame-packs/${packId}`, {
    method: 'DELETE',
    cookie: peter.cookie,
  })).status, 403);
  assert.equal((await request(instance, `/api/sigame-packs/${packId}`, {
    method: 'DELETE',
    cookie: sergey.cookie,
  })).status, 200);
  assert.equal(
    await fsp.access(path.join(dataDir, 'sigame-packs', stored.storage_key))
      .then(() => true, () => false),
    false
  );
  assert.deepEqual(
    (await request(instance, '/api/sigame-packs', { cookie: anton.cookie })).payload,
    []
  );

  await stopServer(instance);
  const legacyDb = new Database(path.join(dataDir, 'cheese_wheel.db'));
  const legacyPackId = Number(legacyDb.prepare(`
    INSERT INTO sigame_packs (title, status, added_by, added_at)
    VALUES ('Старая запись', 'planned', 1, ?)
  `).run(Date.now()).lastInsertRowid);
  legacyDb.prepare(`
    INSERT INTO sigame_pack_ratings (pack_id, user_id, rating, rated_at)
    VALUES (?, 1, 10, ?)
  `).run(legacyPackId, Date.now());
  const legacyPlayedId = Number(legacyDb.prepare(`
    INSERT INTO sigame_packs (
      title, status, added_by, added_at, played_by, played_at
    ) VALUES ('Старая сыгранная запись', 'played', 1, ?, 2, ?)
  `).run(Date.now() - 1000, Date.now()).lastInsertRowid);
  legacyDb.prepare(`
    INSERT INTO sigame_pack_ratings (pack_id, user_id, rating, rated_at)
    VALUES (?, 1, 8, ?)
  `).run(legacyPlayedId, Date.now());
  legacyDb.close();

  instance = await startServer(dataDir);
  const migrated = await request(instance, '/api/sigame-packs', {
    cookie: anton.cookie,
  });
  assert.equal(migrated.status, 200);
  assert.equal(migrated.payload.length, 2);
  const migratedUnplayed = migrated.payload.find(pack => pack.id === legacyPackId);
  const migratedPlayed = migrated.payload.find(pack => pack.id === legacyPlayedId);
  assert.equal(migratedUnplayed.status, 'unplayed');
  assert.equal(migratedUnplayed.has_file, false);
  assert.equal(migratedUnplayed.average_rating, null);
  assert.equal(migratedPlayed.status, 'played');
  assert.equal(migratedPlayed.average_rating, 8);
  assert.equal(migratedPlayed.my_rating, 8);
  const migratedDb = new Database(path.join(dataDir, 'cheese_wheel.db'));
  assert.equal(
    migratedDb.prepare(
      'SELECT COUNT(*) AS count FROM sigame_pack_ratings WHERE pack_id = ?'
    ).get(legacyPackId).count,
    0
  );
  migratedDb.close();
});
