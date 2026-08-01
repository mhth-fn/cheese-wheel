'use strict';

const MAX_REVIEW_CONTENT_LENGTH = 5000;
const MUSIC_TYPES = new Set(['track', 'album', 'artist', 'playlist', 'live']);

function registerMusicReviewRoutes(context) {
  const {
    app,
    db,
    escapeDiscordMarkdown,
    io,
    notifyDiscord,
    parseIntStrict,
    sanitizeTitle,
    stmts,
  } = context;

  function validateMusicReview(body) {
    body = body && typeof body === 'object' ? body : {};
    const title = sanitizeTitle(body.title);
    if (!title) return { error: 'Введите название (до 200 символов)' };

    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content || content.length > MAX_REVIEW_CONTENT_LENGTH) {
      return { error: 'Введите текст обзора (до 5000 символов)' };
    }

    const recommendRaw = Number.parseInt(body.recommend, 10);
    const recommend = [-1, 0, 1].includes(recommendRaw) ? recommendRaw : 1;
    const artist = typeof body.artist === 'string'
      ? body.artist.trim().slice(0, 120) || null
      : null;
    const musicType = MUSIC_TYPES.has(body.music_type) ? body.music_type : 'track';
    const sourceUrlRaw = typeof body.source_url === 'string'
      ? body.source_url.trim()
      : '';
    let sourceUrl = null;
    if (sourceUrlRaw) {
      if (sourceUrlRaw.length > 2048) return { error: 'Ссылка слишком длинная' };
      try {
        const parsed = new URL(sourceUrlRaw);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return { error: 'Ссылка должна начинаться с http:// или https://' };
        }
        sourceUrl = parsed.href;
      } catch {
        return { error: 'Введите корректную ссылку на музыку' };
      }
    }

    return { artist, content, musicType, recommend, sourceUrl, title };
  }

  function serializeMusicReview({ reactions_json, ...review }) {
    return {
      ...review,
      reactions: JSON.parse(reactions_json || '[]'),
    };
  }

  function musicReviewWithReactions(review) {
    const reactions = stmts.getReviewReactions.all('music', review.id);
    const user = stmts.getUsers.all().find(
      item => item.id === Number(review.user_id)
    );
    return {
      ...review,
      user_name: user?.name,
      reactions,
      likes: reactions.filter(item => item.reaction === 1).length,
      dislikes: reactions.filter(item => item.reaction === -1).length,
    };
  }

  app.get('/api/music-reviews', (req, res) => {
    res.json(stmts.getMusicReviews.all().map(serializeMusicReview));
  });

  app.post('/api/music-reviews', (req, res) => {
    const userId = Number(req.tokenData.userId);
    if (!Number.isInteger(userId) || !stmts.getUserById.get(userId)) {
      return res.status(403).json({ error: 'Требуется вход участника' });
    }
    const validated = validateMusicReview(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });

    try {
      const result = stmts.insertMusicReview.run(
        userId,
        validated.title,
        validated.artist,
        validated.musicType,
        validated.sourceUrl,
        validated.content,
        validated.recommend
      );
      const review = musicReviewWithReactions(
        stmts.getMusicReviewById.get(result.lastInsertRowid)
      );
      io.emit('music-review-added', review);
      const artist = review.artist
        ? ` — ${escapeDiscordMarkdown(review.artist)}`
        : '';
      void notifyDiscord(
        '🎵 Новая музыкальная находка *' + escapeDiscordMarkdown(review.title)
        + artist + '*. Автор — *'
        + escapeDiscordMarkdown(review.user_name || 'Пользователь') + '*'
      );
      res.json(review);
    } catch {
      res.status(500).json({ error: 'Ошибка сохранения' });
    }
  });

  app.patch('/api/music-reviews/:id', (req, res) => {
    const id = parseIntStrict(req.params.id);
    const userId = Number(req.tokenData.userId);
    if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID' });
    if (!Number.isInteger(userId)) {
      return res.status(403).json({ error: 'Требуется вход участника' });
    }

    const existing = stmts.getMusicReviewById.get(id);
    if (!existing) return res.status(404).json({ error: 'Обзор не найден' });
    const canManage = req.tokenData.role === 'admin'
      || Number(existing.user_id) === userId;
    if (!canManage) {
      return res.status(403).json({ error: 'Можно редактировать только свой обзор' });
    }

    const validated = validateMusicReview(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });
    const result = stmts.updateMusicReview.run(
      validated.title,
      validated.artist,
      validated.musicType,
      validated.sourceUrl,
      validated.content,
      validated.recommend,
      id,
      existing.user_id
    );
    if (result.changes === 0) {
      return res.status(403).json({ error: 'Нет доступа или обзор не найден' });
    }

    const review = musicReviewWithReactions(stmts.getMusicReviewById.get(id));
    io.emit('music-review-updated', review);
    res.json(review);
  });

  app.delete('/api/music-reviews/:id', (req, res) => {
    const id = parseIntStrict(req.params.id);
    const userId = Number(req.tokenData.userId);
    if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID' });
    if (!Number.isInteger(userId)) {
      return res.status(403).json({ error: 'Требуется вход участника' });
    }

    const review = stmts.getMusicReviewById.get(id);
    if (!review) return res.status(404).json({ error: 'Обзор не найден' });
    const canManage = req.tokenData.role === 'admin'
      || Number(review.user_id) === userId;
    if (!canManage) {
      return res.status(403).json({ error: 'Можно удалить только свой обзор' });
    }

    const deleteReview = db.transaction(() => {
      stmts.deleteReviewReactions.run('music', id);
      return stmts.deleteMusicReview.run(id, review.user_id);
    });
    const result = deleteReview();
    if (result.changes === 0) {
      return res.status(403).json({ error: 'Нет доступа или обзор не найден' });
    }
    io.emit('music-review-deleted', { id });
    res.json({ success: true });
  });
}

module.exports = { registerMusicReviewRoutes };
