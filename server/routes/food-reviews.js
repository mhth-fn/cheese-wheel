'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
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
  fs.mkdirSync(photosPath, { recursive: true, mode: 0o750 });

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
    return {
      id: photo.id,
      original_file_name: photo.original_file_name,
      mime_type: photo.mime_type,
      file_size: photo.file_size,
      url: `/uploads/food-reviews/${encodeURIComponent(photo.storage_key)}`,
    };
  }

  function serializeReview(review) {
    return {
      ...review,
      recommend: Number(review.recommend),
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
        if (received > MAX_PHOTO_BYTES || received > expectedSize) {
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
    statements.delete.run(id);
    photos.forEach(photo => {
      try {
        fs.unlinkSync(path.join(photosPath, photo.storage_key));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn('[cheese-wheel] Failed to remove food photo:', error.message);
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
    if (expectedSize > MAX_PHOTO_BYTES) {
      return res.status(413).json({ error: 'Фотография больше 10 МБ' });
    }
    const storageKey = `${crypto.randomUUID()}${extension}`;
    const finalPath = path.join(photosPath, storageKey);
    const temporaryPath = path.join(photosPath, `.${storageKey}.upload`);
    try {
      const upload = await receivePhoto(req, temporaryPath, expectedSize);
      if (!signatureMatches(mimeType, upload.signature)) {
        const error = new Error('Содержимое файла не похоже на фотографию');
        error.status = 400;
        throw error;
      }
      fs.renameSync(temporaryPath, finalPath);
      const result = statements.insertPhoto.run(
        id,
        storageKey,
        safeOriginalName(req.query.original_file_name),
        mimeType,
        upload.received,
        Date.now()
      );
      const photo = statements.getPhoto.get(result.lastInsertRowid);
      io.emit('food-reviews-changed', { action: 'photo-added', review_id: id });
      res.status(201).json(serializePhoto(photo));
    } catch (error) {
      for (const filePath of [temporaryPath, finalPath]) {
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
    try { fs.unlinkSync(path.join(photosPath, photo.storage_key)); } catch { /* already absent */ }
    io.emit('food-reviews-changed', { action: 'photo-deleted', review_id: reviewId });
    res.json({ ok: true });
  });
}

module.exports = { registerFoodReviewRoutes };
