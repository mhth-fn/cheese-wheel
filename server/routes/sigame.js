'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function registerSigameRoutes(context) {
  const {
    MAX_SIGAME_PACK_BYTES,
    MAX_SIGAME_TAGS,
    app,
    canManageSigamePack,
    db,
    getSigamePackFilePath,
    getSigamePackForViewer,
    io,
    parseIntStrict,
    parseSigamePlayedDate,
    parseSigameUploadTags,
    readSigamePackInput,
    receiveSigamePackFile,
    replaceSigamePackTags,
    sanitizeSigameOriginalFileName,
    sanitizeTitle,
    serializeSigamePack,
    sigamePacksPath,
    sigameStmts,
  } = context;

// ============ SIGAME PACKS ============

const sigameReviewStmts = {
  list: db.prepare(`
    SELECT r.*, u.name AS user_name
    FROM sigame_pack_reviews r
    JOIN users u ON u.id = r.user_id
    WHERE r.pack_id = ?
    ORDER BY r.created_at DESC, r.id DESC
  `),
  getById: db.prepare('SELECT * FROM sigame_pack_reviews WHERE id = ?'),
  getByUserAndPack: db.prepare(
    'SELECT * FROM sigame_pack_reviews WHERE pack_id = ? AND user_id = ?'
  ),
  insert: db.prepare(`
    INSERT INTO sigame_pack_reviews (pack_id, user_id, content, recommend)
    VALUES (?, ?, ?, ?)
  `),
  update: db.prepare(
    'UPDATE sigame_pack_reviews SET content = ?, recommend = ? WHERE id = ?'
  ),
  delete: db.prepare('DELETE FROM sigame_pack_reviews WHERE id = ?'),
};

function readSigameReview(body) {
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  const recommend = Number(body?.recommend);
  if (!content || content.length > 5000) {
    return { error: 'Введите текст обзора (до 5000 символов)' };
  }
  if (![-1, 0, 1].includes(recommend)) {
    return { error: 'Укажите итоговое впечатление' };
  }
  return { content, recommend };
}

function serializeReview(review) {
  return { ...review, recommend: Number(review.recommend) };
}

function getPackReviews(packId) {
  return sigameReviewStmts.list.all(packId).map(serializeReview);
}

function serializePackWithReviews(row) {
  const pack = serializeSigamePack(row);
  return { ...pack, reviews: getPackReviews(pack.id) };
}

function getPackForViewerWithReviews(packId, viewerId) {
  const pack = getSigamePackForViewer(packId, viewerId);
  return pack ? { ...pack, reviews: getPackReviews(packId) } : pack;
}

app.get('/api/sigame-packs', (req, res) => {
  const viewerId = req.tokenData.isGuest ? null : Number(req.tokenData.userId);
  res.json(sigameStmts.list.all(viewerId).map(serializePackWithReviews));
});

app.get('/api/sigame-packs/:id/reviews', (req, res) => {
  const packId = parseIntStrict(req.params.id);
  if (isNaN(packId)) return res.status(400).json({ error: 'Неверный ID пака' });
  if (!sigameStmts.getRawById.get(packId)) {
    return res.status(404).json({ error: 'Пак не найден' });
  }
  res.json(getPackReviews(packId));
});

app.post('/api/sigame-packs/:id/reviews', (req, res) => {
  const packId = parseIntStrict(req.params.id);
  const userId = Number(req.tokenData.userId);
  if (isNaN(packId)) return res.status(400).json({ error: 'Неверный ID пака' });
  if (!Number.isInteger(userId) || !sigameStmts.getRawById.get(packId)) {
    return res.status(404).json({ error: 'Пак не найден' });
  }
  const pack = sigameStmts.getRawById.get(packId);
  if (pack.status !== 'played') {
    return res.status(409).json({ error: 'Обзор можно написать только на сыгранный пак' });
  }
  const review = readSigameReview(req.body);
  if (review.error) return res.status(400).json({ error: review.error });
  const conflict = sigameReviewStmts.getByUserAndPack.get(packId, userId);
  if (conflict) {
    return res.status(409).json({
      code: 'SIGAME_REVIEW_ALREADY_EXISTS',
      error: 'У вас уже есть обзор на этот пак. Отредактируйте его.',
      existing_review_id: conflict.id,
    });
  }
  const result = sigameReviewStmts.insert.run(
    packId,
    userId,
    review.content,
    review.recommend
  );
  const created = getPackReviews(packId).find(item => Number(item.id) === Number(result.lastInsertRowid));
  io.emit('sigame-packs-changed', { action: 'review-created', pack_id: packId });
  res.status(201).json(created);
});

app.patch('/api/sigame-packs/:packId/reviews/:reviewId', (req, res) => {
  const packId = parseIntStrict(req.params.packId);
  const reviewId = parseIntStrict(req.params.reviewId);
  if (isNaN(packId) || isNaN(reviewId)) {
    return res.status(400).json({ error: 'Неверный ID обзора' });
  }
  const existing = sigameReviewStmts.getById.get(reviewId);
  if (!existing || Number(existing.pack_id) !== packId) {
    return res.status(404).json({ error: 'Обзор не найден' });
  }
  const userId = Number(req.tokenData.userId);
  if (req.tokenData.role !== 'admin' && Number(existing.user_id) !== userId) {
    return res.status(403).json({ error: 'Можно редактировать только свой обзор' });
  }
  const review = readSigameReview(req.body);
  if (review.error) return res.status(400).json({ error: review.error });
  sigameReviewStmts.update.run(review.content, review.recommend, reviewId);
  const updated = getPackReviews(packId).find(item => Number(item.id) === reviewId);
  io.emit('sigame-packs-changed', { action: 'review-updated', pack_id: packId });
  res.json(updated);
});

app.delete('/api/sigame-packs/:packId/reviews/:reviewId', (req, res) => {
  const packId = parseIntStrict(req.params.packId);
  const reviewId = parseIntStrict(req.params.reviewId);
  if (isNaN(packId) || isNaN(reviewId)) {
    return res.status(400).json({ error: 'Неверный ID обзора' });
  }
  const existing = sigameReviewStmts.getById.get(reviewId);
  if (!existing || Number(existing.pack_id) !== packId) {
    return res.status(404).json({ error: 'Обзор не найден' });
  }
  const userId = Number(req.tokenData.userId);
  if (req.tokenData.role !== 'admin' && Number(existing.user_id) !== userId) {
    return res.status(403).json({ error: 'Можно удалить только свой обзор' });
  }
  sigameReviewStmts.delete.run(reviewId);
  io.emit('sigame-packs-changed', { action: 'review-deleted', pack_id: packId });
  res.json({ ok: true });
});

app.post('/api/sigame-packs', async (req, res) => {
  const title = sanitizeTitle(req.query.title);
  const tags = parseSigameUploadTags(req.query.tags);
  const originalFileName = sanitizeSigameOriginalFileName(
    req.query.original_file_name
  );
  if (!title) return res.status(400).json({ error: 'Укажите название пака' });
  if (tags === null) {
    return res.status(400).json({ error: `Укажите не более ${MAX_SIGAME_TAGS} корректных тегов` });
  }
  if (!originalFileName) {
    return res.status(400).json({
      error: 'Выберите файл пакета SIGame в формате .siq',
    });
  }

  const expectedSize = Number(req.headers['content-length']);
  if (!Number.isInteger(expectedSize) || expectedSize < 1) {
    return res.status(400).json({ error: 'Выберите файл пака' });
  }
  if (expectedSize > MAX_SIGAME_PACK_BYTES) {
    return res.status(413).json({ error: 'Файл пака слишком большой' });
  }

  const storageKey = `${crypto.randomUUID()}.siq`;
  const finalPath = getSigamePackFilePath(storageKey);
  const temporaryPath = path.join(sigamePacksPath, `.${storageKey}.upload`);
  let finalized = false;

  try {
    const fileSize = await receiveSigamePackFile(req, temporaryPath, expectedSize);
    await fs.promises.link(temporaryPath, finalPath);
    finalized = true;
    await fs.promises.unlink(temporaryPath);

    const userId = Number(req.tokenData.userId);
    const packId = db.transaction(() => {
      const result = sigameStmts.insert.run(
        title,
        userId,
        Date.now(),
        originalFileName,
        storageKey,
        fileSize
      );
      const id = Number(result.lastInsertRowid);
      replaceSigamePackTags(id, tags);
      return id;
    })();

    const pack = getPackForViewerWithReviews(packId, userId);
    io.emit('sigame-packs-changed', { action: 'created', pack_id: packId });
    return res.status(201).json(pack);
  } catch (error) {
    await Promise.allSettled([
      fs.promises.unlink(temporaryPath),
      ...(finalized ? [fs.promises.unlink(finalPath)] : []),
    ]);
    console.warn('[cheese-wheel] SIGame pack upload failed:', error.message);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : 'Не удалось сохранить файл пака',
    });
  }
});

app.patch('/api/sigame-packs/:id', (req, res) => {
  const packId = parseIntStrict(req.params.id);
  if (isNaN(packId)) return res.status(400).json({ error: 'Неверный ID пака' });
  const existing = sigameStmts.getRawById.get(packId);
  if (!existing) return res.status(404).json({ error: 'Пак не найден' });
  if (!canManageSigamePack(existing, req.tokenData)) {
    return res.status(403).json({ error: 'Можно редактировать только свои паки' });
  }

  const input = readSigamePackInput(req.body, existing);
  if (!input) {
    return res.status(400).json({ error: 'Проверьте название и теги пака' });
  }

  db.transaction(() => {
    sigameStmts.update.run(input.title, packId);
    replaceSigamePackTags(packId, input.tags);
  })();

  const pack = getPackForViewerWithReviews(packId, Number(req.tokenData.userId));
  io.emit('sigame-packs-changed', { action: 'updated', pack_id: packId });
  res.json(pack);
});

app.post('/api/sigame-packs/:id/status', (req, res) => {
  const packId = parseIntStrict(req.params.id);
  if (isNaN(packId)) return res.status(400).json({ error: 'Неверный ID пака' });
  const existing = sigameStmts.getRawById.get(packId);
  if (!existing) return res.status(404).json({ error: 'Пак не найден' });

  const status = req.body?.status;
  if (!['unplayed', 'played'].includes(status)) {
    return res.status(400).json({ error: 'Неверный статус пака' });
  }
  if (status === 'unplayed' && !canManageSigamePack(existing, req.tokenData)) {
    return res.status(403).json({
      error: 'Вернуть пак в несыгранные может его владелец или администратор',
    });
  }

  const userId = Number(req.tokenData.userId);
  if (status === 'played') {
    sigameStmts.markPlayed.run(userId, Date.now(), packId);
  } else {
    db.transaction(() => {
      sigameStmts.deleteRatingsForPack.run(packId);
      sigameStmts.restorePlanned.run(packId);
    })();
  }

  const pack = getPackForViewerWithReviews(packId, userId);
  io.emit('sigame-packs-changed', {
    action: status === 'played' ? 'played' : 'restored',
    pack_id: packId,
  });
  res.json(pack);
});

app.patch('/api/sigame-packs/:id/played-date', (req, res) => {
  const packId = parseIntStrict(req.params.id);
  if (isNaN(packId)) return res.status(400).json({ error: 'Неверный ID пака' });
  const existing = sigameStmts.getRawById.get(packId);
  if (!existing) return res.status(404).json({ error: 'Пак не найден' });
  if (!canManageSigamePack(existing, req.tokenData)) {
    return res.status(403).json({
      error: 'Изменить дату может владелец пака или администратор',
    });
  }
  if (existing.status !== 'played') {
    return res.status(409).json({ error: 'Дата игры доступна только для сыгранного пака' });
  }

  const playedAt = parseSigamePlayedDate(req.body?.played_date);
  if (playedAt === undefined) {
    return res.status(400).json({
      error: 'Укажите корректную дату или установите дату неизвестной',
    });
  }

  sigameStmts.updatePlayedAt.run(playedAt, packId);
  const pack = getPackForViewerWithReviews(packId, Number(req.tokenData.userId));
  io.emit('sigame-packs-changed', {
    action: 'played-date-updated',
    pack_id: packId,
  });
  res.json(pack);
});

app.get('/api/sigame-packs/:id/download', (req, res) => {
  const packId = parseIntStrict(req.params.id);
  if (isNaN(packId)) return res.status(400).json({ error: 'Неверный ID пака' });
  const pack = sigameStmts.getRawById.get(packId);
  if (!pack) return res.status(404).json({ error: 'Пак не найден' });

  const filePath = getSigamePackFilePath(pack.storage_key);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Файл для этой записи недоступен' });
  }

  const originalName = sanitizeSigameOriginalFileName(pack.original_file_name)
    || 'sigame-pack.siq';
  const fallbackName = originalName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_');
  const encodedName = encodeURIComponent(originalName)
    .replace(/['()]/g, character => `%${character.charCodeAt(0).toString(16)}`);
  let stat;
  try {
    stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return res.status(404).json({ error: 'Файл для этой записи недоступен' });
    }
  } catch {
    return res.status(404).json({ error: 'Файл для этой записи недоступен' });
  }
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(stat.size),
    'Content-Disposition': `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  const stream = fs.createReadStream(filePath);
  stream.once('error', error => {
    console.warn('[cheese-wheel] SIGame pack download failed:', error.message);
    if (!res.headersSent) res.status(404).json({ error: 'Файл пака не найден' });
    else res.destroy(error);
  });
  stream.pipe(res);
});

app.put('/api/sigame-packs/:id/rating', (req, res) => {
  const packId = parseIntStrict(req.params.id);
  const rating = parseIntStrict(req.body?.rating);
  if (isNaN(packId) || !Number.isInteger(rating) || rating < 1 || rating > 10) {
    return res.status(400).json({ error: 'Оценка должна быть от 1 до 10' });
  }
  const existing = sigameStmts.getRawById.get(packId);
  if (!existing) return res.status(404).json({ error: 'Пак не найден' });
  if (existing.status !== 'played') {
    return res.status(409).json({ error: 'Оценивать можно только сыгранные паки' });
  }

  const userId = Number(req.tokenData.userId);
  sigameStmts.upsertRating.run(packId, userId, rating, Date.now());
  const pack = getPackForViewerWithReviews(packId, userId);
  io.emit('sigame-packs-changed', { action: 'rated', pack_id: packId });
  res.json(pack);
});

app.delete('/api/sigame-packs/:id/rating', (req, res) => {
  const packId = parseIntStrict(req.params.id);
  if (isNaN(packId)) return res.status(400).json({ error: 'Неверный ID пака' });
  const existing = sigameStmts.getRawById.get(packId);
  if (!existing) return res.status(404).json({ error: 'Пак не найден' });

  sigameStmts.deleteRating.run(packId, Number(req.tokenData.userId));
  const pack = getPackForViewerWithReviews(packId, Number(req.tokenData.userId));
  io.emit('sigame-packs-changed', { action: 'rating-removed', pack_id: packId });
  res.json(pack);
});

app.delete('/api/sigame-packs/:id', (req, res) => {
  const packId = parseIntStrict(req.params.id);
  if (isNaN(packId)) return res.status(400).json({ error: 'Неверный ID пака' });
  const existing = sigameStmts.getRawById.get(packId);
  if (!existing) return res.status(404).json({ error: 'Пак не найден' });
  if (!canManageSigamePack(existing, req.tokenData)) {
    return res.status(403).json({ error: 'Можно удалять только свои паки' });
  }

  const filePath = getSigamePackFilePath(existing.storage_key);
  let quarantinedPath = null;
  try {
    if (filePath && fs.existsSync(filePath)) {
      quarantinedPath = `${filePath}.deleting-${crypto.randomUUID()}`;
      fs.renameSync(filePath, quarantinedPath);
    }
    sigameStmts.delete.run(packId);
  } catch (error) {
    if (quarantinedPath && fs.existsSync(quarantinedPath)) {
      try {
        fs.renameSync(quarantinedPath, filePath);
      } catch (restoreError) {
        console.error(
          '[cheese-wheel] Failed to restore SIGame pack after delete error:',
          restoreError.message
        );
      }
    }
    return res.status(500).json({ error: 'Не удалось удалить пак' });
  }

  if (quarantinedPath) {
    try {
      fs.unlinkSync(quarantinedPath);
    } catch (error) {
      console.error('[cheese-wheel] Failed to remove SIGame pack file:', error.message);
      return res.status(500).json({ error: 'Запись удалена, но файл не удалось удалить' });
    }
  }
  io.emit('sigame-packs-changed', { action: 'deleted', pack_id: packId });
  res.json({ ok: true });
});

}

module.exports = { registerSigameRoutes };
