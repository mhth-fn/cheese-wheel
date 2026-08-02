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

async function uploadPhoto(instance, cookie, reviewId, body, contentType = 'image/png') {
  const response = await fetch(
    `${instance.baseUrl}/api/food-reviews/${reviewId}/photos?original_file_name=plate.png`,
    {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': contentType },
      body,
    }
  );
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

test('food reviews accept bounded photos and preserve ownership', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-food-test-'));
  const instance = await startServer(dataDir);
  t.after(async () => {
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  const anton = await login(instance, 1);
  const sergey = await login(instance, 2);
  const peter = await login(instance, 3);

  const created = await request(instance, '/api/food-reviews', {
    method: 'POST',
    cookie: anton.cookie,
    body: {
      title: 'Сырники',
      content: 'Хрустящие снаружи и мягкие внутри.',
      recommend: 1,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.deepEqual(created.payload.photos, []);
  assert.equal((await request(instance, `/api/food-reviews/${created.payload.id}`, {
    method: 'PATCH',
    cookie: peter.cookie,
    body: { title: 'Чужая правка', content: 'Нет доступа', recommend: -1 },
  })).status, 403);

  const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const photo = await uploadPhoto(
    instance,
    anton.cookie,
    created.payload.id,
    fakePng
  );
  assert.equal(photo.status, 201, JSON.stringify(photo.payload));
  assert.match(photo.payload.url, /^\/uploads\/food-reviews\//);
  assert.equal((await uploadPhoto(
    instance,
    anton.cookie,
    created.payload.id,
    Buffer.from('plain text'),
    'text/plain'
  )).status, 415);

  const listed = await request(instance, '/api/food-reviews', {
    cookie: peter.cookie,
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.length, 1);
  assert.equal(listed.payload[0].photos.length, 1);
  const servedPhoto = await fetch(`${instance.baseUrl}${listed.payload[0].photos[0].url}`);
  assert.equal(servedPhoto.status, 200);
  assert.equal(Buffer.from(await servedPhoto.arrayBuffer()).equals(fakePng), true);

  assert.equal((await request(instance, `/api/food-reviews/${created.payload.id}`, {
    method: 'DELETE',
    cookie: sergey.cookie,
  })).status, 200);
  assert.deepEqual(
    (await request(instance, '/api/food-reviews', { cookie: anton.cookie })).payload,
    []
  );
  assert.equal(
    await fsp.access(path.join(
      dataDir,
      'uploads',
      'food-reviews',
      decodeURIComponent(photo.payload.url.split('/').pop())
    )).then(() => true, () => false),
    false
  );
});
