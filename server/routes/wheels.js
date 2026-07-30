'use strict';

function registerWheelRoutes(context) {
  const {
    ALLOWED_THEMES,
    MAX_ONE_OFF_MOVIES,
    ONE_OFF_MAX_SPIN_DURATION,
    ONE_OFF_MIN_SPIN_DURATION,
    ONE_OFF_MODES,
    app,
    broadcastOneOffState,
    broadcastWheelStatus,
    canManageMovie,
    db,
    escapeDiscordMarkdown,
    getOneOffState,
    getWheelStatus,
    io,
    isMovieInFormedWheel,
    notifyDiscord,
    parseIntStrict,
    readFormedWheel,
    readMovieInput,
    readOneOffResult,
    rejectFormedCurrentWheelMutation,
    rejectOneOffMutation,
    rejectWheelMutationDuringSpin,
    requireAdmin,
    sanitizeTitle,
    serializeOneOffMovie,
    setOneOffResult,
    setOneOffSetting,
    spinState,
    stmts,
    stopOneOffElimination,
    toWheelSnapshotMovie,
    updateFormedWheelSnapshot,
  } = context;

app.get('/api/theme', (req, res) => {
  const theme = stmts.getTheme.get();
  res.json({ theme: theme?.value || 'cheese' });
});

app.post('/api/theme', requireAdmin, (req, res) => {
  const { theme } = req.body;
  if (!ALLOWED_THEMES.includes(theme)) {
    return res.status(400).json({ error: 'Неверная тема' });
  }
  stmts.setTheme.run(theme);
  io.emit('theme-changed', { theme });
  res.json({ success: true });
});

app.get('/api/users', (req, res) => {
  res.json(stmts.getUsers.all());
});

app.get('/api/wheel', (req, res) => {
  res.json(stmts.getUnwatched.all());
});

app.get('/api/wheel/status', (req, res) => {
  res.json(getWheelStatus());
});

app.post('/api/wheel/form', requireAdmin, rejectWheelMutationDuringSpin, rejectFormedCurrentWheelMutation, (req, res) => {
  const movies = stmts.getUnwatched.all().map(toWheelSnapshotMovie);
  if (movies.length === 0) {
    return res.status(400).json({ error: 'Добавьте хотя бы один фильм' });
  }

  stmts.setFormedWheel.run(JSON.stringify(movies));
  const status = getWheelStatus();
  io.emit('wheel-status-changed', status);
  res.json(status);
});

app.post('/api/wheel/form-next', requireAdmin, rejectWheelMutationDuringSpin, (req, res) => {
  if (readFormedWheel().length === 0) {
    return res.status(409).json({ error: 'Сначала сформируйте текущее колесо' });
  }
  const nextMovies = stmts.getNextWheel.all();
  if (nextMovies.length === 0) {
    return res.status(400).json({ error: 'Добавьте хотя бы один фильм в следующий раунд' });
  }

  try {
    const promoted = db.transaction(() => {
      stmts.deleteCurrentWheelRatings.run();
      stmts.clearCurrentWheel.run();
      stmts.promoteNextWheel.run();
      const movies = stmts.getUnwatched.all();
      stmts.setFormedWheel.run(JSON.stringify(movies.map(toWheelSnapshotMovie)));
      return movies;
    })();

    const status = getWheelStatus();
    io.emit('next-wheel-promoted', promoted);
    io.emit('wheel-status-changed', status);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Не удалось сформировать следующее колесо' });
  }
});

app.post('/api/wheel', rejectWheelMutationDuringSpin, rejectFormedCurrentWheelMutation, (req, res) => {
  const addEnabledRow = db.prepare("SELECT value FROM settings WHERE key = 'add_enabled'").get();
  if (addEnabledRow?.value === '0') {
    return res.status(403).json({ error: 'Добавление фильмов отключено' });
  }
  const input = readMovieInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  const userId = Number(req.tokenData.userId);
  if (!Number.isInteger(userId) || !stmts.getUserById.get(userId)) {
    return res.status(403).json({ error: 'Войдите как участник, чтобы выбрать фильм' });
  }

  try {
    const existing = stmts.getCurrentMovieByUser.get(userId);
    let movie;
    if (existing) {
      stmts.updateMovie.run(
        input.title,
        input.alternative_title,
        input.director,
        input.year,
        existing.added_at || null,
        existing.id
      );
      movie = stmts.getMovieWithAuthorById.get(existing.id);
      io.emit('movie-updated', movie);
    } else {
      const result = stmts.insertMovie.run(
        input.title,
        input.alternative_title,
        input.director,
        input.year,
        userId
      );
      movie = stmts.getMovieWithAuthorById.get(result.lastInsertRowid);
      io.emit('movie-added', movie);
    }
    broadcastWheelStatus();
    res.json({ ...movie, replaced: Boolean(existing) });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'У вас уже есть фильм в текущем колесе' });
    }
    res.status(500).json({ error: 'Не удалось сохранить выбор' });
  }
});

app.delete('/api/wheel/:id', rejectWheelMutationDuringSpin, (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Неверный ID' });
  }
  const movie = stmts.getMovieById.get(id);
  if (!movie || movie.is_watched !== 0 || movie.is_next_wheel !== 0) {
    return res.status(404).json({ error: 'Фильм не найден в текущем колесе' });
  }
  if (!canManageMovie(req, movie)) {
    return res.status(403).json({ error: 'Можно удалить только свой фильм' });
  }
  if (isMovieInFormedWheel(id) && req.tokenData.role !== 'admin') {
    return res.status(409).json({ error: 'Текущее колесо уже сформировано' });
  }

  try {
    const deleteChoice = db.transaction(() => {
      updateFormedWheelSnapshot(id, () => null);
      stmts.deleteUnwatched.run(id);
    });
    deleteChoice();
    io.emit('movie-removed', { id });
    broadcastWheelStatus();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

app.post('/api/wheel/:id/watched', requireAdmin, rejectWheelMutationDuringSpin, (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Неверный ID' });
  }
  try {
    const currentMovie = stmts.getMovieById.get(id);
    if (!currentMovie) {
      return res.status(404).json({ error: 'Фильм не найден' });
    }
    const wheelStatus = getWheelStatus();
    if (!wheelStatus.formed || !wheelStatus.movies.some(movie => movie.id === id)) {
      return res.status(409).json({ error: 'Сначала сформируйте колесо' });
    }
    const wasWatched = currentMovie.is_watched === 1;
    stmts.markWatched.run(id);
    const movie = stmts.getMovieById.get(id);
    io.emit('movie-watched', movie);
    if (!wasWatched) {
      void notifyDiscord('Сегодня смотрим *' + escapeDiscordMarkdown(movie.title) + '*');
    }

    broadcastWheelStatus();
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

app.get('/api/next-wheel', (req, res) => {
  res.json(stmts.getNextWheel.all());
});

app.post('/api/next-wheel', rejectWheelMutationDuringSpin, (req, res) => {
  const input = readMovieInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  const userId = Number(req.tokenData.userId);
  if (!Number.isInteger(userId) || !stmts.getUserById.get(userId)) {
    return res.status(403).json({ error: 'Войдите как участник, чтобы выбрать фильм' });
  }

  try {
    const existing = stmts.getNextMovieByUser.get(userId);
    let movie;
    if (existing) {
      stmts.updateMovie.run(
        input.title,
        input.alternative_title,
        input.director,
        input.year,
        existing.added_at || null,
        existing.id
      );
      movie = stmts.getMovieWithAuthorById.get(existing.id);
      io.emit('next-movie-updated', movie);
    } else {
      const result = stmts.insertNextMovie.run(
        input.title,
        input.alternative_title,
        input.director,
        input.year,
        userId
      );
      movie = stmts.getMovieWithAuthorById.get(result.lastInsertRowid);
      io.emit('next-movie-added', movie);
    }
    res.json({ ...movie, replaced: Boolean(existing) });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'У вас уже есть фильм для следующего раунда' });
    }
    res.status(500).json({ error: 'Не удалось сохранить выбор' });
  }
});

app.delete('/api/next-wheel/:id', rejectWheelMutationDuringSpin, (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Неверный ID' });
  }
  const movie = stmts.getMovieById.get(id);
  if (!movie || movie.is_watched !== 0 || movie.is_next_wheel !== 1) {
    return res.status(404).json({ error: 'Фильм не найден в следующем раунде' });
  }
  if (!canManageMovie(req, movie)) {
    return res.status(403).json({ error: 'Можно удалить только свой фильм' });
  }

  try {
    stmts.deleteNextMovie.run(id);
    io.emit('next-movie-removed', { id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

app.get('/api/one-off-wheel', (req, res) => {
  res.json(getOneOffState());
});

app.patch('/api/one-off-wheel/settings', requireAdmin, (req, res) => {
  const hasEnabled = Object.prototype.hasOwnProperty.call(req.body || {}, 'enabled');
  const hasMode = Object.prototype.hasOwnProperty.call(req.body || {}, 'mode');
  const hasSpinDuration = Object.prototype.hasOwnProperty.call(
    req.body || {},
    'spin_duration'
  );
  if (!hasEnabled && !hasMode && !hasSpinDuration) {
    return res.status(400).json({ error: 'Укажите настройку разового колеса' });
  }
  if (hasEnabled && typeof req.body.enabled !== 'boolean') {
    return res.status(400).json({ error: 'Неверное значение публикации' });
  }
  if (hasMode && !ONE_OFF_MODES.has(req.body.mode)) {
    return res.status(400).json({ error: 'Режим: выбор или выбывание' });
  }
  const spinDuration = hasSpinDuration
    ? parseIntStrict(req.body.spin_duration)
    : null;
  if (
    hasSpinDuration
    && (
      isNaN(spinDuration)
      || spinDuration < ONE_OFF_MIN_SPIN_DURATION
      || spinDuration > ONE_OFF_MAX_SPIN_DURATION
    )
  ) {
    return res.status(400).json({
      error: `Время от ${ONE_OFF_MIN_SPIN_DURATION} до ${ONE_OFF_MAX_SPIN_DURATION} секунд`,
    });
  }
  if (spinState.activeOneOffSpinUntil > Date.now()) {
    return res.status(409).json({ error: 'Дождитесь окончания прокрутки разового колеса' });
  }
  if (spinState.oneOffEliminationActive) {
    return res.status(409).json({ error: 'Дождитесь окончания режима на выбывание' });
  }
  if (hasMode && readOneOffResult()) {
    return res.status(409).json({ error: 'Сначала завершите текущий выбор' });
  }
  if (hasEnabled && req.body.enabled && readOneOffResult()) {
    return res.status(409).json({ error: 'Сначала завершите текущий выбор' });
  }

  if (hasEnabled) {
    setOneOffSetting('one_off_enabled', req.body.enabled ? '1' : '0');
    if (!req.body.enabled) stopOneOffElimination();
  }
  if (hasMode) setOneOffSetting('one_off_mode', req.body.mode);
  if (hasSpinDuration) setOneOffSetting('one_off_spin_duration', spinDuration);
  const state = getOneOffState();
  broadcastOneOffState();
  res.json(state);
});

app.post('/api/one-off-wheel', rejectOneOffMutation, (req, res) => {
  const title = sanitizeTitle(req.body.title);
  if (!title) {
    return res.status(400).json({ error: 'Введите название фильма (до 200 символов)' });
  }
  const userId = Number(req.tokenData.userId);
  if (!Number.isInteger(userId) || !stmts.getUserById.get(userId)) {
    return res.status(403).json({ error: 'Добавлять фильмы могут только участники' });
  }
  if (stmts.getOneOffMovies.all().length >= MAX_ONE_OFF_MOVIES) {
    return res.status(409).json({ error: `В разовом колесе может быть до ${MAX_ONE_OFF_MOVIES} фильмов` });
  }

  try {
    const result = stmts.insertOneOffMovie.run(title, userId, Date.now());
    const movie = serializeOneOffMovie(stmts.getOneOffMovieById.get(result.lastInsertRowid));
    io.emit('one-off-movie-added', movie);
    broadcastOneOffState();
    res.json(movie);
  } catch (error) {
    console.error('[cheese-wheel] Could not add one-off movie:', error.message);
    res.status(500).json({ error: 'Не удалось добавить фильм в разовое колесо' });
  }
});

app.delete('/api/one-off-wheel/:id', rejectOneOffMutation, (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID' });
  const movie = stmts.getOneOffMovieById.get(id);
  if (!movie) return res.status(404).json({ error: 'Фильм не найден в разовом колесе' });
  if (!canManageMovie(req, movie)) {
    return res.status(403).json({ error: 'Можно удалить только свой фильм' });
  }

  stmts.deleteOneOffMovie.run(id);
  io.emit('one-off-movie-removed', { id });
  broadcastOneOffState();
  res.json({ success: true });
});

app.post('/api/one-off-wheel/result', requireAdmin, (req, res) => {
  if (typeof req.body?.add_to_watched !== 'boolean') {
    return res.status(400).json({ error: 'Укажите, добавлять ли фильм в просмотренные' });
  }
  const result = readOneOffResult();
  if (!result) return res.status(409).json({ error: 'У разового колеса пока нет результата' });

  try {
    const watchedMovie = db.transaction(() => {
      let watched = null;
      if (req.body.add_to_watched) {
        const inserted = stmts.insertWatched.run(
          result.movie.title,
          null,
          null,
          null,
          req.tokenData.userId
        );
        watched = stmts.getMovieById.get(inserted.lastInsertRowid);
      }
      stmts.deleteOneOffMovie.run(result.movie.id);
      setOneOffResult(null);
      return watched;
    })();

    if (watchedMovie) {
      io.emit('watched-added', watchedMovie);
      void notifyDiscord(
        '*' + escapeDiscordMarkdown(result.movie.title)
        + '* добавлен в историю из разового колеса'
      );
    }
    const state = getOneOffState();
    io.emit('one-off-result-resolved', {
      movie_id: result.movie.id,
      added_to_watched: Boolean(watchedMovie),
    });
    broadcastOneOffState();
    res.json({ state, watched_movie: watchedMovie });
  } catch (error) {
    console.error('[cheese-wheel] Could not resolve one-off result:', error.message);
    res.status(500).json({ error: 'Не удалось завершить выбор' });
  }
});

app.post('/api/watched', requireAdmin, (req, res) => {
  const input = readMovieInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  try {
    const result = stmts.insertWatched.run(
      input.title,
      input.alternative_title,
      input.director,
      input.year,
      req.tokenData.userId
    );
    const movie = stmts.getMovieById.get(result.lastInsertRowid);
    const user = stmts.getUsers.all().find(u => u.id === req.tokenData.userId);
    io.emit('watched-added', movie);
    void notifyDiscord(
      '*' + escapeDiscordMarkdown(user?.name || 'Пользователь') + '* добавил *' + escapeDiscordMarkdown(movie.title) + '* в историю просмотренных'
    );
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка добавления' });
  }
});

app.get('/api/watched', (req, res) => {
  res.json(stmts.getWatched.all());
});

app.delete('/api/watched/:id', requireAdmin, rejectWheelMutationDuringSpin, (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Неверный ID' });
  }
  try {
    const deleteAll = db.transaction((movieId) => {
      updateFormedWheelSnapshot(movieId, () => null);
      stmts.deleteRatings.run(movieId);
      stmts.deleteMovie.run(movieId);
    });
    deleteAll(id);
    io.emit('watched-deleted', { id });
    broadcastWheelStatus();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

app.patch('/api/movies/:id', rejectWheelMutationDuringSpin, (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID' });

  const movie = stmts.getMovieById.get(id);
  if (!movie) return res.status(404).json({ error: 'Фильм не найден' });
  if (
    movie.is_watched === 0
    && isMovieInFormedWheel(id)
    && req.tokenData.role !== 'admin'
  ) {
    return res.status(409).json({ error: 'Текущее колесо уже сформировано' });
  }
  if (movie.is_watched === 0 && !canManageMovie(req, movie)) {
    return res.status(403).json({ error: 'Можно изменить только свой фильм' });
  }
  if (movie.is_watched === 1 && req.tokenData.role !== 'admin') {
    return res.status(403).json({ error: 'Общую историю меняет только администратор' });
  }

  const input = readMovieInput(req.body, movie);
  if (input.error) return res.status(400).json({ error: input.error });

  let addedAt = movie.added_at || null;
  let watchedAt = movie.watched_at || null;
  const submittedWatchedAt = req.body.watched_at !== undefined
    ? req.body.watched_at
    : movie.is_watched === 1 ? req.body.added_at : undefined;
  if (movie.is_watched === 1 && submittedWatchedAt !== undefined) {
    if (submittedWatchedAt && !/^\d{4}-\d{2}-\d{2}$/.test(submittedWatchedAt)) {
      return res.status(400).json({ error: 'Неверный формат даты (YYYY-MM-DD)' });
    }
    watchedAt = submittedWatchedAt || null;
  } else if (req.body.added_at !== undefined) {
    if (req.body.added_at && !/^\d{4}-\d{2}-\d{2}$/.test(req.body.added_at)) {
      return res.status(400).json({ error: 'Неверный формат даты (YYYY-MM-DD)' });
    }
    addedAt = req.body.added_at || null;
  }

  try {
    const updateMovieAndReviews = db.transaction(() => {
      if (movie.is_watched === 1) {
        stmts.updateWatchedMovie.run(
          input.title,
          input.alternative_title,
          input.director,
          input.year,
          watchedAt,
          id
        );
        updateFormedWheelSnapshot(id, snapshotMovie => ({
          ...snapshotMovie,
          ...input,
        }));
      } else {
        stmts.updateMovie.run(
          input.title,
          input.alternative_title,
          input.director,
          input.year,
          addedAt,
          id
        );
        updateFormedWheelSnapshot(id, snapshotMovie => ({
          ...snapshotMovie,
          ...input,
        }));
      }
      stmts.updateLinkedMovieReviewTitles.run(input.title, id);
    });
    updateMovieAndReviews();
    const updated = stmts.getMovieWithAuthorById.get(id);
    io.emit(movie.is_watched === 0 && movie.is_next_wheel === 1 ? 'next-movie-updated' : 'movie-updated', updated);
    if (
      (movie.is_watched === 0 && movie.is_next_wheel === 0)
      || isMovieInFormedWheel(id)
    ) {
      broadcastWheelStatus();
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

app.post('/api/ratings', (req, res) => {
  const movieId = parseIntStrict(req.body.movie_id);
  const requestedUserId = parseIntStrict(req.body.user_id);
  const authenticatedUserId = Number(req.tokenData.userId);
  const isAdmin = req.tokenData.role === 'admin';
  const targetUserId = isAdmin ? requestedUserId : authenticatedUserId;
  const rating = parseIntStrict(req.body.rating);

  if (isNaN(movieId) || isNaN(requestedUserId) || isNaN(rating)) {
    return res.status(400).json({ error: 'Неверный формат данных' });
  }
  if (!authenticatedUserId || (!isAdmin && requestedUserId !== authenticatedUserId)) {
    return res.status(403).json({ error: 'Можно изменять только свою оценку' });
  }

  if (rating < 1 || rating > 10) {
    return res.status(400).json({ error: 'Оценка от 1 до 10' });
  }

  // Проверяем что пользователь существует
  if (!stmts.getUserById.get(targetUserId)) {
    return res.status(400).json({ error: 'Пользователь не найден' });
  }

  const ratedMovie = stmts.getMovieById.get(movieId);
  if (!ratedMovie || Number(ratedMovie.is_watched) !== 1) {
    return res.status(400).json({ error: 'Оценивать можно только просмотренные фильмы' });
  }

  try {
    stmts.upsertRating.run(movieId, targetUserId, rating);
    io.emit('rating-updated', {
      movie_id: movieId,
      user_id: targetUserId,
      rating,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения оценки' });
  }
});

app.delete('/api/ratings/:movieId', (req, res) => {
  const movieId = parseIntStrict(req.params.movieId);
  const authenticatedUserId = Number(req.tokenData.userId);
  const requestedUserId = req.body?.user_id !== undefined
    ? parseIntStrict(req.body.user_id)
    : req.query.user_id !== undefined
      ? parseIntStrict(req.query.user_id)
      : authenticatedUserId;
  const isAdmin = req.tokenData.role === 'admin';
  if (
    isNaN(movieId) ||
    !authenticatedUserId ||
    isNaN(requestedUserId)
  ) {
    return res.status(400).json({ error: 'Неверный формат данных' });
  }
  if (!isAdmin && requestedUserId !== authenticatedUserId) {
    return res.status(403).json({ error: 'Можно удалять только свою оценку' });
  }
  if (!stmts.getUserById.get(requestedUserId)) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  const ratedMovie = stmts.getMovieById.get(movieId);
  if (!ratedMovie || Number(ratedMovie.is_watched) !== 1) {
    return res.status(400).json({ error: 'Оценка относится не к просмотренному фильму' });
  }

  stmts.deleteRating.run(movieId, requestedUserId);
  io.emit('rating-updated', {
    movie_id: movieId,
    user_id: requestedUserId,
    rating: null,
  });
  res.json({ success: true });
});

}

module.exports = { registerWheelRoutes };
