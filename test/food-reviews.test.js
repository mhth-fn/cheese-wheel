'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
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

async function uploadPhotoWithoutContentLength(instance, cookie, reviewId, body) {
  const target = new URL(
    `/api/food-reviews/${reviewId}/photos?original_file_name=iphone.png`,
    instance.baseUrl
  );
  return new Promise((resolve, reject) => {
    const request = http.request(target, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'image/png',
        'Transfer-Encoding': 'chunked',
        'X-File-Size': String(body.length),
      },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: response.statusCode,
          payload: text ? JSON.parse(text) : null,
        });
      });
    });
    request.once('error', reject);
    request.end(body);
  });
}

async function startDiscordWebhook() {
  let resolveMessage;
  const message = new Promise(resolve => {
    resolveMessage = resolve;
  });
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      resolveMessage(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      response.statusCode = 204;
      response.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    }),
    message,
    url: `http://127.0.0.1:${server.address().port}/webhook`,
  };
}

test('food photo limit is aligned across the browser, server, and Nginx', () => {
  const frontend = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'utils', 'foodPhotos.js'),
    'utf8'
  );
  const server = fs.readFileSync(
    path.join(__dirname, '..', 'server', 'routes', 'food-reviews.js'),
    'utf8'
  );
  const nginx = fs.readFileSync(
    path.join(__dirname, '..', 'deploy', 'nginx', 'cheese-wheel.conf'),
    'utf8'
  );

  assert.match(frontend, /MAX_FOOD_PHOTO_BYTES\s*=\s*10 \* 1024 \* 1024/);
  assert.match(frontend, /image\/heic/);
  assert.match(server, /MAX_PHOTO_BYTES\s*=\s*10 \* 1024 \* 1024/);
  assert.match(
    nginx,
    /location ~ \^\/api\/food-reviews\/\[0-9\]\+\/photos\$\s*\{[^}]*client_max_body_size 10m;/s
  );
});

test('food reviews accept bounded photos and preserve ownership', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-food-test-'));
  const discord = await startDiscordWebhook();
  const instance = await startServer(dataDir, { discordWebhookUrl: discord.url });
  t.after(async () => {
    await stopServer(instance);
    await discord.close();
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
  const discordMessage = await Promise.race([
    discord.message,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error('Discord notification was not sent')),
      2000
    )),
  ]);
  assert.equal(
    discordMessage.content,
    '🍽️ Новый обзор еды *Сырники*. Автор — *Антон*'
  );
  assert.deepEqual(discordMessage.allowed_mentions, { parse: [] });
  assert.equal(discordMessage.content.includes('Хрустящие снаружи'), false);
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

  const chunkedPhoto = await uploadPhotoWithoutContentLength(
    instance,
    anton.cookie,
    created.payload.id,
    fakePng
  );
  assert.equal(chunkedPhoto.status, 201, JSON.stringify(chunkedPhoto.payload));

  const maximumPng = Buffer.alloc(10 * 1024 * 1024);
  fakePng.copy(maximumPng);
  const maximumPhoto = await uploadPhoto(
    instance,
    anton.cookie,
    created.payload.id,
    maximumPng
  );
  assert.equal(maximumPhoto.status, 201, JSON.stringify(maximumPhoto.payload));

  const oversizedPng = Buffer.alloc((10 * 1024 * 1024) + 1);
  fakePng.copy(oversizedPng);
  const oversizedPhoto = await uploadPhoto(
    instance,
    anton.cookie,
    created.payload.id,
    oversizedPng
  );
  assert.equal(oversizedPhoto.status, 413, JSON.stringify(oversizedPhoto.payload));
  assert.equal(oversizedPhoto.payload.error, 'Фотография больше 10 МБ');

  const listed = await request(instance, '/api/food-reviews', {
    cookie: peter.cookie,
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.length, 1);
  assert.equal(listed.payload[0].photos.length, 3);
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
