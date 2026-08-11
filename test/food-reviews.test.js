'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
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

  assert.match(frontend, /MAX_FOOD_PHOTO_BYTES\s*=\s*100 \* 1024 \* 1024/);
  assert.match(
    frontend,
    /FOOD_PHOTO_COMPRESSION_THRESHOLD_BYTES\s*=\s*10 \* 1024 \* 1024/
  );
  assert.match(frontend, /image\/heic/);
  assert.match(server, /MAX_STORED_PHOTO_BYTES\s*=\s*10 \* 1024 \* 1024/);
  assert.match(server, /MAX_UPLOAD_PHOTO_BYTES\s*=\s*100 \* 1024 \* 1024/);
  assert.match(server, /\bexecFileAsync\(FFMPEG_PATH,/);
  assert.match(
    nginx,
    /location ~ \^\/api\/food-reviews\/\[0-9\]\+\/photos\$\s*\{[^}]*client_max_body_size 100m;/s
  );
});

test('food review UI exposes editing, reactions, and non-animated photos', () => {
  const page = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'FoodReviewsPage.jsx'),
    'utf8'
  );
  const styles = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'css', 'reviews.css'),
    'utf8'
  );

  assert.match(page, /\bpatchFoodReview\(editingId,/);
  assert.match(page, /\bdeleteFoodReviewPhoto\(review\.id, photo\.id\)/);
  assert.match(page, /\buploadFoodReviewPhoto\(review\.id, prepared\)/);
  assert.match(page, /Фотографии обзора/);
  assert.match(page, /\bpostReviewReaction\('food', reviewId, reaction\)/);
  assert.match(page, /socket\.on\('review-reaction-updated', updateReaction\)/);
  assert.match(page, /socket\.off\('review-reaction-updated', updateReaction\)/);
  assert.match(page, /src=\{photo\.thumbnail_url \|\| photo\.url\}/);
  assert.doesNotMatch(
    page,
    /loading=["']lazy["']/,
    'Safari must receive food review thumbnails without lazy-loading the grid images'
  );
  assert.match(
    styles,
    /\.food-photo-grid img\s*\{[^}]*transform:\s*none;[^}]*transition:\s*none;/s
  );
  assert.match(
    styles,
    /\.food-photo-trigger\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3;/s,
    'food photo controls need explicit geometry in Safari'
  );
  assert.match(
    styles,
    /@media \(max-width: 680px\)\s*\{[\s\S]*?\.food-review-card \.review-card-title\s*\{[^}]*flex:\s*1 0 100%;[^}]*overflow-wrap:\s*anywhere;/,
    'food review titles need their own flex row on narrow screens'
  );
  assert.doesNotMatch(
    styles,
    /\.food-photo-grid\s*\{[^}]*max-height:/s,
    'the photo grid must not create a percentage-height sizing cycle in Safari'
  );
  assert.doesNotMatch(
    styles,
    /\.food-photo-grid img\s*\{[^}]*transition:\s*transform\b/s,
    'food photos must not start a composited transform transition on desktop Safari'
  );
  assert.doesNotMatch(
    styles,
    /\.food-photo-(?:grid\s+a|trigger):hover img\s*\{[^}]*transform:\s*scale\(/s,
    'food photos must not be scaled while their controls retain hover'
  );
});

test('food photos open in an accessible modal lightbox', () => {
  const page = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'FoodReviewsPage.jsx'),
    'utf8'
  );
  const styles = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'css', 'reviews.css'),
    'utf8'
  );
  const dialogA11y = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'hooks', 'useDialogA11y.js'),
    'utf8'
  );

  assert.doesNotMatch(
    page,
    /target\s*=\s*["']_blank["']/,
    'food photos must stay in the current tab'
  );
  assert.doesNotMatch(
    page,
    /<a\b[^>]*href=\{photo\.url\}/s,
    'food photos must open the lightbox instead of navigating to the raw image'
  );
  assert.match(page, /className=["']food-photo-trigger["']/);
  assert.match(page, /className=["']food-photo-trigger["'][\s\S]{0,120}type=["']button["']/);
  assert.match(page, /\bsetActivePhoto\s*\(/);
  assert.match(page, /event\.currentTarget\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  assert.match(page, /<img\b[^>]*src=\{photo\.url\}/s);
  assert.match(page, /function\s+FoodPhotoLightbox\s*\(/);
  assert.match(page, /\bcreatePortal\s*\(/);
  assert.match(page, /\buseDialogA11y\s*\(Boolean\(photo\),\s*onClose\)/);
  assert.match(page, /className=["']food-photo-lightbox["']/);
  assert.match(page, /className=["']food-photo-lightbox-dialog["']/);
  assert.match(page, /role=["']dialog["']/);
  assert.match(page, /aria-modal=["']true["']/);
  assert.match(
    page,
    /on(?:Click|MouseDown)=\{[^}]*event\.target\s*===\s*event\.currentTarget[^}]*\}/s,
    'clicking the backdrop must close the lightbox without treating clicks on the photo as backdrop clicks'
  );
  assert.match(
    styles,
    /\.food-photo-lightbox-close\s*\{[^}]*position:\s*fixed;[^}]*safe-area-inset-top[^}]*safe-area-inset-right/s,
    'the close button must stay pinned to the iPhone safe area while the photo loads'
  );
  assert.doesNotMatch(
    styles,
    /\.food-photo-lightbox-close\s*\{[^}]*position:\s*absolute;/s,
    'the close button must not depend on the decoded photo dimensions'
  );

  assert.match(
    dialogA11y,
    /event\.key\s*===\s*["']Escape["'][\s\S]{0,160}\bonClose\(\)/,
    'Escape must close dialogs using the shared accessibility hook'
  );
  assert.match(
    dialogA11y,
    /document\.body\.style\.overflow\s*=\s*["']hidden["']/,
    'opening the lightbox must lock background scrolling'
  );
  assert.match(
    dialogA11y,
    /document\.body\.style\.overflow\s*=\s*previousOverflow/,
    'closing the lightbox must restore the previous scroll state'
  );
});

test('food reviews accept bounded photos and preserve ownership', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-food-test-'));
  const realFfmpegPath = process.env.TEST_FOOD_PHOTO_REAL_FFMPEG || '';
  const fakeFfmpegPath = path.join(dataDir, 'fake-food-ffmpeg.js');
  await fsp.writeFile(fakeFfmpegPath, `#!/bin/sh
for output_path do :; done
printf '\\377\\330\\377\\331' > "$output_path"
`);
  await fsp.chmod(fakeFfmpegPath, 0o755);
  const discord = await startDiscordWebhook();
  const instance = await startServer(dataDir, {
    discordWebhookUrl: discord.url,
    extraEnv: {
      FOOD_PHOTO_FFMPEG_PATH: realFfmpegPath || fakeFfmpegPath,
    },
  });
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
  assert.equal(created.payload.likes, 0);
  assert.equal(created.payload.dislikes, 0);
  assert.deepEqual(created.payload.reactions, []);
  assert.equal((await request(instance, `/api/food-reviews/${created.payload.id}`, {
    method: 'PATCH',
    cookie: peter.cookie,
    body: { title: 'Чужая правка', content: 'Нет доступа', recommend: -1 },
  })).status, 403);

  const authorEdit = await request(
    instance,
    `/api/food-reviews/${created.payload.id}`,
    {
      method: 'PATCH',
      cookie: anton.cookie,
      body: {
        title: 'Сырники со сметаной',
        content: 'Автор уточнил впечатления.',
        recommend: 1,
      },
    }
  );
  assert.equal(authorEdit.status, 200, JSON.stringify(authorEdit.payload));
  assert.equal(authorEdit.payload.title, 'Сырники со сметаной');
  assert.equal(authorEdit.payload.content, 'Автор уточнил впечатления.');

  assert.equal((await request(instance, '/api/review-reactions', {
    method: 'POST',
    cookie: anton.cookie,
    body: { review_type: 'food', review_id: created.payload.id, reaction: 1 },
  })).status, 403);
  const foodLike = await request(instance, '/api/review-reactions', {
    method: 'POST',
    cookie: peter.cookie,
    body: { review_type: 'food', review_id: created.payload.id, reaction: 1 },
  });
  assert.equal(foodLike.status, 200, JSON.stringify(foodLike.payload));
  assert.equal(foodLike.payload.review_type, 'food');
  assert.equal(foodLike.payload.likes, 1);
  assert.equal(foodLike.payload.dislikes, 0);
  assert.deepEqual(foodLike.payload.reactions, [
    { user_id: peter.user.id, reaction: 1 },
  ]);

  const removedFoodLike = await request(instance, '/api/review-reactions', {
    method: 'POST',
    cookie: peter.cookie,
    body: { review_type: 'food', review_id: created.payload.id, reaction: 1 },
  });
  assert.equal(removedFoodLike.status, 200, JSON.stringify(removedFoodLike.payload));
  assert.equal(removedFoodLike.payload.likes, 0);
  assert.deepEqual(removedFoodLike.payload.reactions, []);

  const foodDislike = await request(instance, '/api/review-reactions', {
    method: 'POST',
    cookie: peter.cookie,
    body: { review_type: 'food', review_id: created.payload.id, reaction: -1 },
  });
  assert.equal(foodDislike.status, 200, JSON.stringify(foodDislike.payload));
  assert.equal(foodDislike.payload.likes, 0);
  assert.equal(foodDislike.payload.dislikes, 1);

  const adminEdit = await request(
    instance,
    `/api/food-reviews/${created.payload.id}`,
    {
      method: 'PATCH',
      cookie: sergey.cookie,
      body: {
        title: 'Сырники со сметаной',
        content: 'Администратор исправил опечатку.',
        recommend: 1,
      },
    }
  );
  assert.equal(adminEdit.status, 200, JSON.stringify(adminEdit.payload));
  assert.equal(adminEdit.payload.content, 'Администратор исправил опечатку.');
  assert.equal(adminEdit.payload.dislikes, 1);
  assert.deepEqual(adminEdit.payload.reactions, [
    { user_id: peter.user.id, reaction: -1 },
  ]);

  let fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (realFfmpegPath) {
    const smallPngPath = path.join(dataDir, 'real-small.png');
    execFileSync(realFfmpegPath, [
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'color=c=orange:s=16x16',
      '-frames:v', '1',
      smallPngPath,
    ], { timeout: 30_000 });
    fakePng = await fsp.readFile(smallPngPath);
  }
  const photo = await uploadPhoto(
    instance,
    anton.cookie,
    created.payload.id,
    fakePng
  );
  assert.equal(photo.status, 201, JSON.stringify(photo.payload));
  assert.match(photo.payload.url, /^\/uploads\/food-reviews\//);
  assert.match(
    photo.payload.thumbnail_url,
    /^\/uploads\/food-reviews\/thumbnails\/[^/]+\.jpg$/
  );
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

  const tooLargeResponse = await fetch(
    `${instance.baseUrl}/api/food-reviews/${created.payload.id}/photos?original_file_name=huge.png`,
    {
      method: 'POST',
      headers: {
        Cookie: anton.cookie,
        'Content-Type': 'image/png',
        'X-File-Size': String((100 * 1024 * 1024) + 1),
      },
      body: fakePng,
    }
  );
  assert.equal(tooLargeResponse.status, 413);
  assert.equal(
    (await tooLargeResponse.json()).error,
    'Фотография больше 100 МБ'
  );

  let oversizedPng;
  if (realFfmpegPath) {
    const oversizedPngPath = path.join(dataDir, 'real-oversized.png');
    execFileSync(realFfmpegPath, [
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'nullsrc=s=3000x3000',
      '-vf', 'noise=alls=100:allf=t',
      '-frames:v', '1',
      '-compression_level', '0',
      oversizedPngPath,
    ], { timeout: 90_000 });
    oversizedPng = await fsp.readFile(oversizedPngPath);
    assert.ok(oversizedPng.length > 10 * 1024 * 1024);
    assert.ok(oversizedPng.length <= 100 * 1024 * 1024);
  } else {
    oversizedPng = Buffer.alloc((10 * 1024 * 1024) + 1);
    fakePng.copy(oversizedPng);
  }
  const oversizedPhoto = await uploadPhoto(
    instance,
    anton.cookie,
    created.payload.id,
    oversizedPng
  );
  assert.equal(oversizedPhoto.status, 201, JSON.stringify(oversizedPhoto.payload));
  assert.equal(oversizedPhoto.payload.compressed, true);
  assert.equal(oversizedPhoto.payload.mime_type, 'image/jpeg');
  if (realFfmpegPath) {
    assert.ok(oversizedPhoto.payload.file_size > 4);
    assert.ok(oversizedPhoto.payload.file_size <= 10 * 1024 * 1024);
  } else {
    assert.equal(oversizedPhoto.payload.file_size, 4);
  }
  assert.match(oversizedPhoto.payload.url, /\.jpg$/);

  const listed = await request(instance, '/api/food-reviews', {
    cookie: peter.cookie,
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.length, 1);
  assert.equal(listed.payload[0].photos.length, 4);
  assert.equal(listed.payload[0].likes, 0);
  assert.equal(listed.payload[0].dislikes, 1);
  assert.deepEqual(listed.payload[0].reactions, [
    { user_id: peter.user.id, reaction: -1 },
  ]);
  const servedPhoto = await fetch(`${instance.baseUrl}${listed.payload[0].photos[0].url}`);
  assert.equal(servedPhoto.status, 200);
  assert.equal(Buffer.from(await servedPhoto.arrayBuffer()).equals(fakePng), true);
  const servedThumbnail = await fetch(
    `${instance.baseUrl}${listed.payload[0].photos[0].thumbnail_url}`
  );
  assert.equal(servedThumbnail.status, 200);
  const thumbnailBytes = Buffer.from(await servedThumbnail.arrayBuffer());
  assert.equal(thumbnailBytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])), true);

  assert.equal((await request(
    instance,
    `/api/food-reviews/${created.payload.id}/photos/${oversizedPhoto.payload.id}`,
    { method: 'DELETE', cookie: peter.cookie }
  )).status, 403);
  assert.equal((await request(
    instance,
    `/api/food-reviews/${created.payload.id}/photos/${oversizedPhoto.payload.id}`,
    { method: 'DELETE', cookie: anton.cookie }
  )).status, 200);

  assert.equal((await request(instance, `/api/food-reviews/${created.payload.id}`, {
    method: 'DELETE',
    cookie: sergey.cookie,
  })).status, 200);
  assert.deepEqual(
    (await request(instance, '/api/food-reviews', { cookie: anton.cookie })).payload,
    []
  );
  const storedDb = new Database(path.join(dataDir, 'cheese_wheel.db'), {
    readonly: true,
  });
  const remainingReactions = storedDb.prepare(`
    SELECT COUNT(*) AS count
    FROM review_reactions
    WHERE review_type = 'food' AND review_id = ?
  `).get(created.payload.id).count;
  storedDb.close();
  assert.equal(remainingReactions, 0);
  assert.equal(
    await fsp.access(path.join(
      dataDir,
      'uploads',
      'food-reviews',
      decodeURIComponent(photo.payload.url.split('/').pop())
    )).then(() => true, () => false),
    false
  );
  assert.equal(
    await fsp.access(path.join(
      dataDir,
      'uploads',
      'food-reviews',
      'thumbnails',
      decodeURIComponent(photo.payload.thumbnail_url.split('/').pop())
    )).then(() => true, () => false),
    false
  );
});
