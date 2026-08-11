'use strict';

const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');

const MAX_PHOTOS = 4;
const MAX_STORED_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_PHOTO_BYTES = 100 * 1024 * 1024;
const FFMPEG_PATH = process.env.FOOD_PHOTO_FFMPEG_PATH || 'ffmpeg';
const execFileAsync = promisify(execFile);
const COMPRESSION_ATTEMPTS = [
  { maxDimension: 4096, quality: 3 },
  { maxDimension: 3072, quality: 5 },
  { maxDimension: 2560, quality: 7 },
  { maxDimension: 2048, quality: 9 },
  { maxDimension: 1600, quality: 12 },
  { maxDimension: 1280, quality: 15 },
];
const PHOTO_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

function registerFoodReviewRoutes(context) {
  const {
    app,
    db,
    escapeDiscordMarkdown,
    io,
    notifyDiscord,
    parseIntStrict,
    sanitizeTitle,
    stmts,
    uploadsPath,
  } = context;
  const photosPath = path.join(uploadsPath, 'food-reviews');
  const thumbnailsPath = path.join(photosPath, 'thumbnails');
  fs.mkdirSync(photosPath, { recursive: true, mode: 0o750 });
  fs.mkdirSync(thumbnailsPath, { recursive: true, mode: 0o750 });

  const statements = {
    list: db.prepare(`
      SELECT r.*, u.name AS user_name
      FROM food_reviews r
      JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC, r.id DESC
    `),
    get: db.prepare('SELECT * FROM food_reviews WHERE id = ?'),
    insert: db.prepare(`
      INSERT INTO food_reviews (user_id, title, content, recommend)
      VALUES (?, ?, ?, ?)
    `),
    update: db.prepare(`
      UPDATE food_reviews SET title = ?, content = ?, recommend = ? WHERE id = ?
    `),
    delete: db.prepare('DELETE FROM food_reviews WHERE id = ?'),
    listPhotos: db.prepare(`
      SELECT * FROM food_review_photos WHERE review_id = ? ORDER BY id
    `),
    getPhoto: db.prepare('SELECT * FROM food_review_photos WHERE id = ?'),
    countPhotos: db.prepare(`
      SELECT COUNT(*) AS count FROM food_review_photos WHERE review_id = ?
    `),
    insertPhoto: db.prepare(`
      INSERT INTO food_review_photos (
        review_id, storage_key, original_file_name, mime_type, file_size, added_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `),
    deletePhoto: db.prepare('DELETE FROM food_review_photos WHERE id = ?'),
  };

  function readReview(body) {
    const title = sanitizeTitle(body?.title);
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    const recommend = Number(body?.recommend);
    if (!title) return { error: 'Введите название блюда (до 200 символов)' };
    if (!content || content.length > 5000) {
      return { error: 'Введите текст обзора (до 5000 символов)' };
    }
    if (![-1, 0, 1].includes(recommend)) {
      return { error: 'Укажите итоговое впечатление' };
    }
    return { title, content, recommend };
  }

  function serializePhoto(photo) {
    const thumbnailKey = thumbnailStorageKey(photo.storage_key);
    const thumbnailUrl = fs.existsSync(path.join(thumbnailsPath, thumbnailKey))
      ? `/uploads/food-reviews/thumbnails/${encodeURIComponent(thumbnailKey)}`
      : `/uploads/food-reviews/${encodeURIComponent(photo.storage_key)}`;
    return {
      id: photo.id,
      original_file_name: photo.original_file_name,
      mime_type: photo.mime_type,
      file_size: photo.file_size,
      url: `/uploads/food-reviews/${encodeURIComponent(photo.storage_key)}`,
      thumbnail_url: thumbnailUrl,
    };
  }

  function serializeReview(review) {
    const reactions = stmts.getReviewReactions.all('food', review.id);
    return {
      ...review,
      recommend: Number(review.recommend),
      likes: reactions.filter(item => item.reaction === 1).length,
      dislikes: reactions.filter(item => item.reaction === -1).length,
      reactions,
      photos: statements.listPhotos.all(review.id).map(serializePhoto),
    };
  }

  function getSerializedReview(id) {
    const row = statements.list.all().find(review => Number(review.id) === Number(id));
    return row ? serializeReview(row) : null;
  }

  function canManage(review, tokenData) {
    return tokenData.role === 'admin'
      || Number(review.user_id) === Number(tokenData.userId);
  }

  function safeOriginalName(value) {
    return path.basename(String(value || 'photo')).replace(/[\0\r\n]/g, '').slice(0, 180);
  }

  function thumbnailStorageKey(storageKey) {
    const baseName = path.parse(path.basename(String(storageKey || 'photo'))).name;
    return `${baseName}.jpg`;
  }

  function receivePhoto(req, temporaryPath, expectedSize) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let received = 0;
      let signature = Buffer.alloc(0);
      const output = fs.createWriteStream(temporaryPath, { flags: 'wx', mode: 0o640 });
      const fail = error => {
        if (settled) return;
        settled = true;
        req.unpipe(output);
        output.destroy();
        req.resume();
        reject(error);
      };
      req.on('data', chunk => {
        received += chunk.length;
        if (signature.length < 12) {
          signature = Buffer.concat([signature, chunk]).subarray(0, 12);
        }
        if (received > MAX_UPLOAD_PHOTO_BYTES || received > expectedSize) {
          const error = new Error('Фотография слишком большая');
          error.status = 413;
          fail(error);
        }
      });
      req.once('aborted', () => fail(new Error('Загрузка прервана')));
      req.once('error', fail);
      output.once('error', fail);
      output.once('finish', () => {
        if (settled) return;
        settled = true;
        if (received !== expectedSize) {
          const error = new Error('Фотография загрузилась не полностью');
          error.status = 400;
          reject(error);
          return;
        }
        resolve({ received, signature });
      });
      req.pipe(output);
    });
  }

  function signatureMatches(mimeType, signature) {
    if (mimeType === 'image/jpeg') {
      return signature.length >= 3
        && signature[0] === 0xff
        && signature[1] === 0xd8
        && signature[2] === 0xff;
    }
    if (mimeType === 'image/png') {
      return signature.length >= 8
        && signature.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        );
    }
    return signature.length >= 12
      && signature.subarray(0, 4).toString('ascii') === 'RIFF'
      && signature.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  async function compressPhoto(inputPath, outputPath) {
    for (const attempt of COMPRESSION_ATTEMPTS) {
      try {
        await execFileAsync(FFMPEG_PATH, [
          '-nostdin',
          '-hide_banner',
          '-loglevel', 'error',
          '-y',
          '-i', inputPath,
          '-map_metadata', '-1',
          '-vf', `scale='min(${attempt.maxDimension},iw)':'min(${attempt.maxDimension},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuvj420p`,
          '-frames:v', '1',
          '-c:v', 'mjpeg',
          '-q:v', String(attempt.quality),
          '-f', 'image2',
          outputPath,
        ], {
          encoding: 'utf8',
          timeout: 90_000,
          maxBuffer: 128 * 1024,
          windowsHide: true,
          env: {
            LANG: 'C.UTF-8',
            PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          },
        });
      } catch (error) {
        try { fs.unlinkSync(outputPath); } catch { /* already absent */ }
        const compressionError = new Error('Не удалось сжать фотографию');
        compressionError.status = error.killed ? 408 : 422;
        throw compressionError;
      }

      const stats = await fs.promises.stat(outputPath);
      if (stats.size > 0 && stats.size <= MAX_STORED_PHOTO_BYTES) {
        const signature = Buffer.alloc(12);
        const handle = await fs.promises.open(outputPath, 'r');
        try {
          await handle.read(signature, 0, signature.length, 0);
        } finally {
          await handle.close();
        }
        if (signatureMatches('image/jpeg', signature)) {
          return stats.size;
        }
      }
    }

    try { fs.unlinkSync(outputPath); } catch { /* already absent */ }
    const error = new Error('Не удалось уменьшить фотографию до 10 МБ');
    error.status = 422;
    throw error;
  }

  async function createPhotoThumbnail(inputPath, outputPath) {
    try {
      await execFileAsync(FFMPEG_PATH, [
        '-nostdin',
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-i', inputPath,
        '-map_metadata', '-1',
        '-vf', "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuvj420p",
        '-frames:v', '1',
        '-c:v', 'mjpeg',
        '-q:v', '6',
        '-f', 'image2',
        outputPath,
      ], {
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 128 * 1024,
        windowsHide: true,
        env: {
          LANG: 'C.UTF-8',
          PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        },
      });
      const stats = await fs.promises.stat(outputPath);
      const signature = Buffer.alloc(12);
      const handle = await fs.promises.open(outputPath, 'r');
      try {
        await handle.read(signature, 0, signature.length, 0);
      } finally {
        await handle.close();
      }
      if (stats.size < 1 || !signatureMatches('image/jpeg', signature)) {
        throw new Error('Invalid thumbnail output');
      }
    } catch (error) {
      try { fs.unlinkSync(outputPath); } catch { /* already absent */ }
      const thumbnailError = new Error('Не удалось подготовить превью фотографии');
      thumbnailError.status = error.killed ? 408 : 422;
      throw thumbnailError;
    }
  }

  async function ensureExistingPhotoThumbnails() {
    const photos = db.prepare('SELECT storage_key FROM food_review_photos ORDER BY id').all();
    for (const photo of photos) {
      const sourcePath = path.join(photosPath, photo.storage_key);
      const thumbnailKey = thumbnailStorageKey(photo.storage_key);
      const thumbnailPath = path.join(thumbnailsPath, thumbnailKey);
      const temporaryThumbnailPath = path.join(thumbnailsPath, `.${thumbnailKey}.upload`);
      if (!fs.existsSync(sourcePath) || fs.existsSync(thumbnailPath)) continue;
      try {
        await createPhotoThumbnail(sourcePath, temporaryThumbnailPath);
        fs.renameSync(temporaryThumbnailPath, thumbnailPath);
      } catch (error) {
        console.warn('[cheese-wheel] Failed to prepare food photo thumbnail:', error.message);
      }
    }
  }

  setImmediate(() => {
    void ensureExistingPhotoThumbnails();
  });

  app.get('/api/food-reviews', (req, res) => {
    res.json(statements.list.all().map(serializeReview));
  });

  app.post('/api/food-reviews', (req, res) => {
    const userId = Number(req.tokenData.userId);
    if (!Number.isInteger(userId) || !stmts.getUserById.get(userId)) {
      return res.status(403).json({ error: 'Требуется вход участника' });
    }
    const review = readReview(req.body);
    if (review.error) return res.status(400).json({ error: review.error });
    const result = statements.insert.run(
      userId,
      review.title,
      review.content,
      review.recommend
    );
    const created = getSerializedReview(result.lastInsertRowid);
    io.emit('food-reviews-changed', { action: 'created', review_id: created.id });
    void notifyDiscord(
      '🍽️ Новый обзор еды *' + escapeDiscordMarkdown(created.title)
      + '*. Автор — *' + escapeDiscordMarkdown(created.user_name || 'Пользователь') + '*'
    );
    res.status(201).json(created);
  });

  app.patch('/api/food-reviews/:id', (req, res) => {
    const id = parseIntStrict(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID обзора' });
    const existing = statements.get.get(id);
    if (!existing) return res.status(404).json({ error: 'Обзор не найден' });
    if (!canManage(existing, req.tokenData)) {
      return res.status(403).json({ error: 'Можно редактировать только свой обзор' });
    }
    const review = readReview(req.body);
    if (review.error) return res.status(400).json({ error: review.error });
    statements.update.run(review.title, review.content, review.recommend, id);
    const updated = getSerializedReview(id);
    io.emit('food-reviews-changed', { action: 'updated', review_id: id });
    res.json(updated);
  });

  app.delete('/api/food-reviews/:id', (req, res) => {
    const id = parseIntStrict(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID обзора' });
    const existing = statements.get.get(id);
    if (!existing) return res.status(404).json({ error: 'Обзор не найден' });
    if (!canManage(existing, req.tokenData)) {
      return res.status(403).json({ error: 'Можно удалить только свой обзор' });
    }
    const photos = statements.listPhotos.all(id);
    const removeReview = db.transaction(() => {
      stmts.deleteReviewReactions.run('food', id);
      return statements.delete.run(id);
    });
    removeReview();
    photos.forEach(photo => {
      for (const filePath of [
        path.join(photosPath, photo.storage_key),
        path.join(thumbnailsPath, thumbnailStorageKey(photo.storage_key)),
      ]) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.warn('[cheese-wheel] Failed to remove food photo:', error.message);
          }
        }
      }
    });
    io.emit('food-reviews-changed', { action: 'deleted', review_id: id });
    res.json({ ok: true });
  });

  app.post('/api/food-reviews/:id/photos', async (req, res) => {
    const id = parseIntStrict(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID обзора' });
    const review = statements.get.get(id);
    if (!review) return res.status(404).json({ error: 'Обзор не найден' });
    if (!canManage(review, req.tokenData)) {
      return res.status(403).json({ error: 'Можно менять фотографии только своего обзора' });
    }
    if (statements.countPhotos.get(id).count >= MAX_PHOTOS) {
      return res.status(409).json({ error: `Можно прикрепить не более ${MAX_PHOTOS} фотографий` });
    }
    const mimeType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const extension = PHOTO_TYPES.get(mimeType);
    if (!extension) {
      return res.status(415).json({ error: 'Поддерживаются JPG, PNG и WebP' });
    }
    const expectedSize = Number(
      req.headers['x-file-size'] || req.headers['content-length']
    );
    if (!Number.isInteger(expectedSize) || expectedSize < 1) {
      return res.status(400).json({ error: 'Выберите фотографию' });
    }
    if (expectedSize > MAX_UPLOAD_PHOTO_BYTES) {
      return res.status(413).json({ error: 'Фотография больше 100 МБ' });
    }
    const fileId = crypto.randomUUID();
    const temporaryPath = path.join(photosPath, `.${fileId}${extension}.upload`);
    const compressedPath = path.join(photosPath, `.${fileId}.compressed.jpg.upload`);
    const thumbnailKey = `${fileId}.jpg`;
    const thumbnailPath = path.join(thumbnailsPath, thumbnailKey);
    const temporaryThumbnailPath = path.join(thumbnailsPath, `.${thumbnailKey}.upload`);
    let finalPath = null;
    try {
      const upload = await receivePhoto(req, temporaryPath, expectedSize);
      if (!signatureMatches(mimeType, upload.signature)) {
        const error = new Error('Содержимое файла не похоже на фотографию');
        error.status = 400;
        throw error;
      }
      const compressed = upload.received > MAX_STORED_PHOTO_BYTES;
      const storedMimeType = compressed ? 'image/jpeg' : mimeType;
      const storedExtension = compressed ? '.jpg' : extension;
      const storageKey = `${fileId}${storedExtension}`;
      finalPath = path.join(photosPath, storageKey);
      const storedSize = compressed
        ? await compressPhoto(temporaryPath, compressedPath)
        : upload.received;
      fs.renameSync(compressed ? compressedPath : temporaryPath, finalPath);
      await createPhotoThumbnail(finalPath, temporaryThumbnailPath);
      fs.renameSync(temporaryThumbnailPath, thumbnailPath);
      const result = statements.insertPhoto.run(
        id,
        storageKey,
        safeOriginalName(req.query.original_file_name),
        storedMimeType,
        storedSize,
        Date.now()
      );
      const photo = statements.getPhoto.get(result.lastInsertRowid);
      io.emit('food-reviews-changed', { action: 'photo-added', review_id: id });
      res.status(201).json({ ...serializePhoto(photo), compressed });
    } catch (error) {
      for (const filePath of [
        temporaryPath,
        compressedPath,
        temporaryThumbnailPath,
        thumbnailPath,
        finalPath,
      ]) {
        if (!filePath) continue;
        try { fs.unlinkSync(filePath); } catch { /* already absent */ }
      }
      res.status(error.status || 500).json({
        error: error.status ? error.message : 'Не удалось сохранить фотографию',
      });
    }
  });

  app.delete('/api/food-reviews/:reviewId/photos/:photoId', (req, res) => {
    const reviewId = parseIntStrict(req.params.reviewId);
    const photoId = parseIntStrict(req.params.photoId);
    if (isNaN(reviewId) || isNaN(photoId)) {
      return res.status(400).json({ error: 'Неверный ID фотографии' });
    }
    const review = statements.get.get(reviewId);
    const photo = statements.getPhoto.get(photoId);
    if (!review || !photo || Number(photo.review_id) !== reviewId) {
      return res.status(404).json({ error: 'Фотография не найдена' });
    }
    if (!canManage(review, req.tokenData)) {
      return res.status(403).json({ error: 'Можно удалять фотографии только своего обзора' });
    }
    statements.deletePhoto.run(photoId);
    for (const filePath of [
      path.join(photosPath, photo.storage_key),
      path.join(thumbnailsPath, thumbnailStorageKey(photo.storage_key)),
    ]) {
      try { fs.unlinkSync(filePath); } catch { /* already absent */ }
    }
    io.emit('food-reviews-changed', { action: 'photo-deleted', review_id: reviewId });
    res.json({ ok: true });
  });
}

module.exports = { registerFoodReviewRoutes };
