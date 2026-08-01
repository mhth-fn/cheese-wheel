'use strict';

function registerReviewRoutes(context) {
  const {
    app,
    db,
    escapeDiscordMarkdown,
    io,
    normalizeReviewMovieTitle,
    notifyDiscord,
    parseIntStrict,
    sanitizeTitle,
    stmts,
  } = context;

// ============ REVIEWS ============

const MAX_REVIEW_CONTENT_LENGTH = 5000;

function validateReview(body) {
  body = body && typeof body === 'object' ? body : {};
  const title = sanitizeTitle(body.title);
  if (!title) return { error: 'Введите название (до 200 символов)' };
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content || content.length > MAX_REVIEW_CONTENT_LENGTH) return { error: 'Введите текст обзора (до 5000 символов)' };
  const recommendRaw = parseInt(body.recommend, 10);
  const recommend = [-1, 0, 1].includes(recommendRaw) ? recommendRaw : 1;
  return { title, content, recommend };
}

app.get('/api/wine-reviews', (req, res) => {
  const reviews = stmts.getWineReviews.all().map(({ reactions_json, ...r }) => ({
    ...r, reactions: JSON.parse(reactions_json || '[]')
  }));
  res.json(reviews);
});

app.post('/api/wine-reviews', (req, res) => {
  const userId = Number(req.tokenData.userId);
  if (!Number.isInteger(userId) || !stmts.getUserById.get(userId)) {
    return res.status(403).json({ error: 'Требуется вход участника' });
  }
  const validated = validateReview(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const ALLOWED_WINE_TYPES = ['red', 'white', 'rose'];
  const wine_type = ALLOWED_WINE_TYPES.includes(req.body.wine_type) ? req.body.wine_type : null;
  const grape = typeof req.body.grape === 'string' ? req.body.grape.trim().slice(0, 100) || null : null;
  const region = typeof req.body.region === 'string' ? req.body.region.trim().slice(0, 100) || null : null;
  const vintage = parseIntStrict(req.body.vintage);
  const vintageVal = !isNaN(vintage) && vintage >= 1900 && vintage <= 2100 ? vintage : null;
  const price = typeof req.body.price === 'string' ? req.body.price.trim().slice(0, 50) || null : null;
  try {
    const result = stmts.insertWineReview.run(userId, validated.title, validated.content, validated.recommend, wine_type, grape, region, vintageVal, price);
    const review = stmts.getWineReviewById.get(result.lastInsertRowid);
    const user = stmts.getUsers.all().find(u => u.id === userId);
    const reviewOut = { ...review, user_name: user?.name, likes: 0, dislikes: 0, reactions: [] };
    io.emit('wine-review-added', reviewOut);
    void notifyDiscord(
      '🍷 Новый обзор вина *' + escapeDiscordMarkdown(review.title)
      + '*. Автор — *' + escapeDiscordMarkdown(user?.name || 'Пользователь') + '*'
    );
    res.json(reviewOut);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

app.delete('/api/wine-reviews/:id', (req, res) => {
  const id = parseIntStrict(req.params.id);
  const userId = Number(req.tokenData.userId);
  if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID' });
  if (!Number.isInteger(userId)) return res.status(403).json({ error: 'Требуется вход участника' });

  const review = stmts.getWineReviewById.get(id);
  if (!review) return res.status(404).json({ error: 'Обзор не найден' });
  const canManage = req.tokenData.role === 'admin' || Number(review.user_id) === userId;
  if (!canManage) {
    return res.status(403).json({ error: 'Можно удалить только свой обзор' });
  }

  const deleteReview = db.transaction(() => {
    stmts.deleteReviewReactions.run('wine', id);
    return stmts.deleteWineReview.run(id, review.user_id);
  });
  const result = deleteReview();
  if (result.changes === 0) return res.status(403).json({ error: 'Нет доступа или обзор не найден' });
  io.emit('wine-review-deleted', { id });
  res.json({ success: true });
});

app.patch('/api/wine-reviews/:id', (req, res) => {
  const id = parseIntStrict(req.params.id);
  const userId = Number(req.tokenData.userId);
  if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID' });
  if (!Number.isInteger(userId)) return res.status(403).json({ error: 'Требуется вход участника' });

  const existing = stmts.getWineReviewById.get(id);
  if (!existing) return res.status(404).json({ error: 'Обзор не найден' });
  const canManage = req.tokenData.role === 'admin' || Number(existing.user_id) === userId;
  if (!canManage) {
    return res.status(403).json({ error: 'Можно редактировать только свой обзор' });
  }

  const validated = validateReview(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const ALLOWED_WINE_TYPES = ['red', 'white', 'rose'];
  const wine_type = ALLOWED_WINE_TYPES.includes(req.body.wine_type) ? req.body.wine_type : null;
  const grape = typeof req.body.grape === 'string' ? req.body.grape.trim().slice(0, 100) || null : null;
  const region = typeof req.body.region === 'string' ? req.body.region.trim().slice(0, 100) || null : null;
  const vintage = parseIntStrict(req.body.vintage);
  const vintageVal = !isNaN(vintage) && vintage >= 1900 && vintage <= 2100 ? vintage : null;
  const price = typeof req.body.price === 'string' ? req.body.price.trim().slice(0, 50) || null : null;
  const result = stmts.updateWineReview.run(
    validated.title,
    validated.content,
    validated.recommend,
    wine_type,
    grape,
    region,
    vintageVal,
    price,
    id,
    existing.user_id
  );
  if (result.changes === 0) return res.status(403).json({ error: 'Нет доступа или обзор не найден' });
  const review = stmts.getWineReviewById.get(id);
  const user = stmts.getUsers.all().find(u => u.id === Number(review.user_id));
  const reactions = stmts.getReviewReactions.all('wine', id);
  const updated = {
    ...review, user_name: user?.name, reactions,
    likes: reactions.filter(r => r.reaction === 1).length,
    dislikes: reactions.filter(r => r.reaction === -1).length
  };
  io.emit('wine-review-updated', updated);
  res.json(updated);
});

function serializeMovieReview({ reactions_json, ...review }) {
  return {
    ...review,
    reactions: JSON.parse(reactions_json || '[]'),
  };
}

function getReviewedMovie(value) {
  const movieId = parseIntStrict(value);
  if (isNaN(movieId)) return { error: 'Неверный ID фильма' };
  const movie = stmts.getMovieById.get(movieId);
  if (!movie || Number(movie.is_watched) !== 1) {
    return { error: 'Рецензию можно привязать только к просмотренному фильму' };
  }
  return { movieId, movie };
}

function findUniqueWatchedMovieByTitle(title) {
  const normalizedTitle = normalizeReviewMovieTitle(title);
  const matches = stmts.getWatchedMoviesForReviewLink.all().filter(
    movie => normalizeReviewMovieTitle(movie.title) === normalizedTitle
  );
  return matches.length === 1 ? matches[0] : null;
}

const duplicateMovieReviewMessage = 'У вас уже есть обзор на этот фильм. Отредактируйте существующий.';

function findMovieReviewConflict(userId, movieId, excludeReviewId = null) {
  if (movieId === null || movieId === undefined) return null;
  const review = stmts.getMovieReviewByUserAndMovie.get(userId, movieId);
  if (!review || (excludeReviewId !== null && Number(review.id) === Number(excludeReviewId))) {
    return null;
  }
  return review;
}

function sendMovieReviewConflict(res, conflict, movieId = null) {
  return res.status(409).json({
    code: 'MOVIE_REVIEW_ALREADY_EXISTS',
    error: duplicateMovieReviewMessage,
    existing_review_id: conflict?.id || null,
    movie_id: movieId || conflict?.movie_id || null,
  });
}

app.get('/api/movie-reviews', (req, res) => {
  let rows;
  if (req.query.movie_id !== undefined) {
    const movieId = parseIntStrict(req.query.movie_id);
    if (isNaN(movieId)) return res.status(400).json({ error: 'Неверный ID фильма' });
    rows = stmts.getMovieReviewsByMovie.all(movieId);
  } else {
    rows = stmts.getMovieReviews.all();
  }
  res.json(rows.map(serializeMovieReview));
});

app.post('/api/movie-reviews', (req, res) => {
  const userId = Number(req.tokenData.userId);
  if (!Number.isInteger(userId) || !stmts.getUserById.get(userId)) {
    return res.status(403).json({ error: 'Требуется вход участника' });
  }

  let movieId = null;
  let movie = null;
  let validated;
  if (req.body.movie_id !== undefined && req.body.movie_id !== null && req.body.movie_id !== '') {
    const resolved = getReviewedMovie(req.body.movie_id);
    if (resolved.error) return res.status(400).json({ error: resolved.error });
    ({ movieId, movie } = resolved);
    validated = validateReview({ ...req.body, title: movie.title });
  } else {
    validated = validateReview(req.body);
    if (!validated.error && req.body.link_by_title !== false) {
      movie = findUniqueWatchedMovieByTitle(validated.title);
      if (movie) {
        movieId = movie.id;
        validated = { ...validated, title: movie.title };
      }
    }
  }

  if (validated.error) return res.status(400).json({ error: validated.error });
  const conflictingReview = findMovieReviewConflict(userId, movieId);
  if (conflictingReview) {
    return sendMovieReviewConflict(res, conflictingReview, movieId);
  }
  const director = typeof req.body.director === 'string' ? req.body.director.trim().slice(0, 100) || null : null;
  const year = parseIntStrict(req.body.year);
  const yearVal = !isNaN(year) && year >= 1888 && year <= 2100 ? year : null;

  try {
    const result = stmts.insertMovieReview.run(
      movieId,
      userId,
      validated.title,
      validated.content,
      validated.recommend,
      director,
      yearVal
    );
    const review = stmts.getMovieReviewById.get(result.lastInsertRowid);
    const user = stmts.getUsers.all().find(item => item.id === userId);
    const reviewOut = {
      ...review,
      user_name: user?.name,
      likes: 0,
      dislikes: 0,
      reactions: [],
    };
    io.emit('movie-review-added', reviewOut);
    void notifyDiscord(
      '🎬 Новый обзор фильма *' + escapeDiscordMarkdown(review.title)
      + '*. Автор — *' + escapeDiscordMarkdown(user?.name || 'Пользователь') + '*'
    );
    res.json(reviewOut);
  } catch (err) {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return sendMovieReviewConflict(
        res,
        findMovieReviewConflict(userId, movieId),
        movieId
      );
    }
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

app.patch('/api/movie-reviews/:id', (req, res) => {
  const id = parseIntStrict(req.params.id);
  const userId = Number(req.tokenData.userId);
  if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID' });
  if (!Number.isInteger(userId)) return res.status(403).json({ error: 'Требуется вход участника' });

  const existing = stmts.getMovieReviewById.get(id);
  if (!existing) return res.status(404).json({ error: 'Рецензия не найдена' });
  const canManage = req.tokenData.role === 'admin' || Number(existing.user_id) === userId;
  if (!canManage) {
    return res.status(403).json({ error: 'Можно редактировать только свою рецензию' });
  }

  let movieId = existing.movie_id || null;
  let movie = movieId ? stmts.getMovieById.get(movieId) : null;
  if (req.body.movie_id !== undefined && req.body.movie_id !== null && req.body.movie_id !== '') {
    const resolved = getReviewedMovie(req.body.movie_id);
    if (resolved.error) return res.status(400).json({ error: resolved.error });
    ({ movieId, movie } = resolved);
  }

  const validated = validateReview(movie ? { ...req.body, title: movie.title } : req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const conflictingReview = findMovieReviewConflict(
    existing.user_id,
    movieId,
    id
  );
  if (conflictingReview) {
    return sendMovieReviewConflict(res, conflictingReview, movieId);
  }
  const director = typeof req.body.director === 'string' ? req.body.director.trim().slice(0, 100) || null : null;
  const year = parseIntStrict(req.body.year);
  const yearVal = !isNaN(year) && year >= 1888 && year <= 2100 ? year : null;
  let result;
  try {
    result = stmts.updateMovieReview.run(
      movieId,
      validated.title,
      validated.content,
      validated.recommend,
      director,
      yearVal,
      id,
      existing.user_id
    );
  } catch (err) {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return sendMovieReviewConflict(
        res,
        findMovieReviewConflict(existing.user_id, movieId, id),
        movieId
      );
    }
    throw err;
  }
  if (result.changes === 0) return res.status(403).json({ error: 'Нет доступа или рецензия не найдена' });

  const review = stmts.getMovieReviewById.get(id);
  const user = stmts.getUsers.all().find(
    item => item.id === Number(review.user_id)
  );
  const reactions = stmts.getReviewReactions.all('movie', id);
  const updated = {
    ...review,
    user_name: user?.name,
    reactions,
    likes: reactions.filter(reaction => reaction.reaction === 1).length,
    dislikes: reactions.filter(reaction => reaction.reaction === -1).length,
  };
  io.emit('movie-review-updated', updated);
  res.json(updated);
});

app.delete('/api/movie-reviews/:id', (req, res) => {
  const id = parseIntStrict(req.params.id);
  const userId = Number(req.tokenData.userId);
  if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID' });
  if (!Number.isInteger(userId)) return res.status(403).json({ error: 'Требуется вход участника' });

  const review = stmts.getMovieReviewById.get(id);
  if (!review) return res.status(404).json({ error: 'Рецензия не найдена' });
  const canManage = req.tokenData.role === 'admin' || Number(review.user_id) === userId;
  if (!canManage) {
    return res.status(403).json({ error: 'Можно удалить только свою рецензию' });
  }

  const deleteReview = db.transaction(() => {
    stmts.deleteReviewReactions.run('movie', id);
    return stmts.deleteMovieReview.run(id, review.user_id);
  });
  const result = deleteReview();
  if (result.changes === 0) return res.status(403).json({ error: 'Нет доступа или рецензия не найдена' });
  io.emit('movie-review-deleted', { id, movie_id: review.movie_id || null });
  res.json({ success: true });
});

// ============ REVIEW REACTIONS ============

app.post('/api/review-reactions', (req, res) => {
  const userId = req.tokenData.userId;
  if (!userId) return res.status(403).json({ error: 'Требуется авторизация' });
  const { review_type, review_id, reaction } = req.body;
  if (!['movie', 'wine', 'music'].includes(review_type)) return res.status(400).json({ error: 'Неверный тип обзора' });
  const reviewId = parseIntStrict(review_id);
  if (isNaN(reviewId)) return res.status(400).json({ error: 'Неверный ID обзора' });
  if (reaction !== 1 && reaction !== -1) return res.status(400).json({ error: 'Неверная реакция' });
  const reviewStatements = {
    movie: stmts.getMovieReviewById,
    wine: stmts.getWineReviewById,
    music: stmts.getMusicReviewById,
  };
  const review = reviewStatements[review_type].get(reviewId);
  if (!review) return res.status(404).json({ error: 'Обзор не найден' });
  if (review.user_id === userId) return res.status(403).json({ error: 'Нельзя оценивать свой обзор' });

  const existing = stmts.getReviewReactions.all(review_type, reviewId).find(r => r.user_id === userId);
  if (existing && existing.reaction === reaction) {
    db.prepare('DELETE FROM review_reactions WHERE review_type=? AND review_id=? AND user_id=?').run(review_type, reviewId, userId);
  } else {
    db.prepare('INSERT INTO review_reactions (review_type, review_id, user_id, reaction) VALUES (?,?,?,?) ON CONFLICT(review_type, review_id, user_id) DO UPDATE SET reaction=excluded.reaction').run(review_type, reviewId, userId, reaction);
  }

  const reactions = stmts.getReviewReactions.all(review_type, reviewId);
  const likes = reactions.filter(r => r.reaction === 1).length;
  const dislikes = reactions.filter(r => r.reaction === -1).length;

  const payload = { review_type, review_id: reviewId, likes, dislikes, reactions };
  io.emit('review-reaction-updated', payload);
  res.json(payload);
});

}

module.exports = { registerReviewRoutes };
