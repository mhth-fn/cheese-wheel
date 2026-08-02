'use strict';

function createWheelService({
  auditLog,
  db,
  escapeDiscordMarkdown,
  io,
  notifyDiscord,
  parseIntStrict,
  stmts,
}) {
  const MIN_SPIN_DURATION = 5;
  const MAX_SPIN_DURATION = 30;
  const ONE_OFF_MIN_SPIN_DURATION = MIN_SPIN_DURATION;
  const ONE_OFF_MAX_SPIN_DURATION = MAX_SPIN_DURATION;
  const spinState = {
    activeSpinUntil: 0,
    activeOneOffSpinUntil: 0,
    activeOneOffSpin: null,
    oneOffEliminationActive: false,
  };

function rejectWheelMutationDuringSpin(req, res, next) {
  if (Date.now() < spinState.activeSpinUntil || readPendingSpin()) {
    return res.status(409).json({ error: 'Дождитесь окончания прокрутки' });
  }
  next();
}

// Middleware

function toWheelSnapshotMovie(movie) {
  return {
    id: Number(movie.id),
    title: movie.title,
    alternative_title: movie.alternative_title || null,
    director: movie.director || null,
    year: movie.year == null ? null : Number(movie.year),
    added_by: movie.added_by ?? null,
    added_by_name: movie.added_by_name ?? null,
    is_watched: Number(movie.is_watched) === 1,
  };
}

function readFormedWheel() {
  const row = stmts.getFormedWheel.get();
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed)
      ? parsed.filter(movie => movie && Number.isInteger(Number(movie.id)) && typeof movie.title === 'string')
      : [];
  } catch {
    return [];
  }
}

function getWheelStatus() {
  const currentMovies = stmts.getUnwatched.all().map(toWheelSnapshotMovie);
  const roundMovies = readFormedWheel().map(movie => {
    const storedMovie = stmts.getMovieById.get(Number(movie.id));
    return {
      ...toWheelSnapshotMovie(movie),
      is_watched: Number(storedMovie?.is_watched) === 1,
    };
  });
  const activeMovies = roundMovies.filter(movie => !movie.is_watched);
  const pendingSpin = readPendingSpin();
  return {
    formed: roundMovies.length > 0,
    movies: activeMovies,
    round_movies: roundMovies,
    current_count: currentMovies.length,
    pending_spin: pendingSpin ? {
      spin_id: pendingSpin.spinId,
      movie_id: pendingSpin.movieId,
      complete_at: pendingSpin.completeAt,
    } : null,
  };
}

function broadcastWheelStatus() {
  io.emit('wheel-status-changed', getWheelStatus());
}

const PENDING_SPIN_SETTING = 'pending_spin_v1';
let pendingSpinTimer = null;

function readPendingSpin() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?')
    .get(PENDING_SPIN_SETTING);
  if (!row?.value) return null;
  try {
    const pending = JSON.parse(row.value);
    if (
      typeof pending.spinId !== 'string' ||
      !Number.isInteger(Number(pending.movieId)) ||
      !Number.isInteger(Number(pending.actorUserId)) ||
      !Number.isFinite(Number(pending.completeAt))
    ) {
      return null;
    }
    return {
      spinId: pending.spinId,
      movieId: Number(pending.movieId),
      actorUserId: Number(pending.actorUserId),
      completeAt: Number(pending.completeAt),
    };
  } catch {
    return null;
  }
}

function finishPendingSpin(expectedSpinId) {
  const completed = db.transaction(() => {
    const pending = readPendingSpin();
    if (!pending || (expectedSpinId && pending.spinId !== expectedSpinId)) {
      return null;
    }
    const movie = stmts.getMovieById.get(pending.movieId);
    const belongsToRound = readFormedWheel()
      .some(item => Number(item.id) === pending.movieId);
    if (!movie || Number(movie.is_watched) === 1 || !belongsToRound) {
      db.prepare('DELETE FROM settings WHERE key = ?').run(PENDING_SPIN_SETTING);
      return { ...pending, changed: false, movie };
    }
    stmts.markWatched.run(pending.movieId);
    const watchedMovie = stmts.getMovieById.get(pending.movieId);
    const actor = stmts.getAuthUser.get(pending.actorUserId);
    auditLog.record({
      actorUserId: pending.actorUserId,
      actorRole: actor?.role,
      action: 'wheel.spin_completed',
      targetType: 'movie',
      targetId: pending.movieId,
      result: 'success',
      details: {
        spin_id: pending.spinId,
        movie_title: watchedMovie.title,
      },
    });
    db.prepare('DELETE FROM settings WHERE key = ?').run(PENDING_SPIN_SETTING);
    return {
      ...pending,
      changed: true,
      movie: watchedMovie,
    };
  })();

  if (!completed) return;
  pendingSpinTimer = null;
  if (!completed.changed) {
    broadcastWheelStatus();
    return;
  }

  io.emit('movie-watched', completed.movie);
  broadcastWheelStatus();
  void notifyDiscord(
    'Сегодня смотрим *' + escapeDiscordMarkdown(completed.movie.title) + '*'
  );
}

function schedulePendingSpin(pending) {
  if (pendingSpinTimer) clearTimeout(pendingSpinTimer);
  const delay = Math.max(0, pending.completeAt - Date.now());
  pendingSpinTimer = setTimeout(
    () => {
      pendingSpinTimer = null;
      try {
        finishPendingSpin(pending.spinId);
      } catch (error) {
        console.error('[cheese-wheel] Failed to complete persisted spin:', error.message);
        const retry = readPendingSpin();
        if (retry?.spinId === pending.spinId) {
          retry.completeAt = Date.now() + 5000;
          schedulePendingSpin(retry);
        }
      }
    },
    Math.min(delay, 2_147_000_000)
  );
  pendingSpinTimer.unref();
}

const claimPendingSpin = db.transaction((pending, auditContext) => {
  if (readPendingSpin()) return false;
  // Drop only an invalid row; a valid pending spin is never overwritten.
  db.prepare('DELETE FROM settings WHERE key = ?').run(PENDING_SPIN_SETTING);
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
  `).run(PENDING_SPIN_SETTING, JSON.stringify(pending));
  auditLog.record({
    actorUserId: pending.actorUserId,
    actorRole: auditContext.actorRole,
    action: 'wheel.spin_started',
    targetType: 'movie',
    targetId: pending.movieId,
    result: 'success',
    ip: auditContext.ip,
    userAgent: auditContext.userAgent,
    details: { spin_id: pending.spinId },
  });
  return true;
});

const restoredPendingSpin = readPendingSpin();
if (restoredPendingSpin) {
  spinState.activeSpinUntil = restoredPendingSpin.completeAt + 1200;
  schedulePendingSpin(restoredPendingSpin);
} else {
  // Invalid or half-written state must never block future rounds.
  db.prepare('DELETE FROM settings WHERE key = ?').run(PENDING_SPIN_SETTING);
}

// Сохраняем уже существующее колесо как сформированное при первом запуске новой версии.
if (!stmts.getFormedWheel.get()) {
  const initialMovies = stmts.getUnwatched.all().map(toWheelSnapshotMovie);
  stmts.setFormedWheel.run(JSON.stringify(initialMovies));
}

const ALLOWED_THEMES = ['cheese', 'newyear', 'spring', 'samurai'];

function canManageMovie(req, movie) {
  const userId = Number(req.tokenData?.userId);
  return req.tokenData?.role === 'admin'
    || (Number.isInteger(userId) && Number(movie.added_by) === userId);
}

function isMovieInFormedWheel(movieId) {
  return readFormedWheel().some(movie => Number(movie.id) === Number(movieId));
}

function updateFormedWheelSnapshot(movieId, updater) {
  const wheel = readFormedWheel();
  const index = wheel.findIndex(movie => Number(movie.id) === Number(movieId));
  if (index < 0) return false;

  const nextWheel = [...wheel];
  const updated = updater(nextWheel[index]);
  if (updated === null) {
    nextWheel.splice(index, 1);
  } else {
    nextWheel[index] = toWheelSnapshotMovie(updated);
  }
  stmts.setFormedWheel.run(JSON.stringify(nextWheel));
  return true;
}

const ONE_OFF_RESULT_SETTING = 'one_off_result_v1';
const ONE_OFF_MODES = new Set(['selection', 'elimination']);
const MAX_ONE_OFF_MOVIES = 60;

function serializeOneOffMovie(movie) {
  if (!movie) return null;
  return {
    id: Number(movie.id),
    title: movie.title,
    added_by: Number(movie.added_by),
    added_by_name: movie.added_by_name || null,
    added_at: Number(movie.added_at),
  };
}

function getOneOffSetting(key, fallback) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;
}

function setOneOffSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, String(value));
}

function readOneOffResult() {
  const raw = getOneOffSetting(ONE_OFF_RESULT_SETTING, '');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const movie = serializeOneOffMovie(parsed?.movie);
    if (!movie || !Number.isFinite(Number(parsed.created_at))) return null;
    return {
      movie,
      created_at: Number(parsed.created_at),
      mode: ONE_OFF_MODES.has(parsed.mode) ? parsed.mode : 'selection',
      eliminated_movie: serializeOneOffMovie(parsed.eliminated_movie),
    };
  } catch {
    return null;
  }
}

function setOneOffResult(result) {
  if (!result) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(ONE_OFF_RESULT_SETTING);
    return;
  }
  setOneOffSetting(ONE_OFF_RESULT_SETTING, JSON.stringify(result));
}

function getOneOffState() {
  const modeValue = getOneOffSetting('one_off_mode', 'selection');
  const durationValue = parseIntStrict(getOneOffSetting('one_off_spin_duration', '5'));
  return {
    enabled: getOneOffSetting('one_off_enabled', '0') === '1',
    mode: ONE_OFF_MODES.has(modeValue) ? modeValue : 'selection',
    spin_duration: (
      !isNaN(durationValue)
      && durationValue >= ONE_OFF_MIN_SPIN_DURATION
      && durationValue <= ONE_OFF_MAX_SPIN_DURATION
    ) ? durationValue : ONE_OFF_MIN_SPIN_DURATION,
    movies: stmts.getOneOffMovies.all().map(serializeOneOffMovie),
    result: readOneOffResult(),
    spinning_until: spinState.activeOneOffSpinUntil > Date.now() ? spinState.activeOneOffSpinUntil : null,
    elimination_active: spinState.oneOffEliminationActive,
  };
}

function broadcastOneOffState() {
  io.emit('one-off-state-changed', getOneOffState());
}

function rejectOneOffMutation(req, res, next) {
  const state = getOneOffState();
  if (!state.enabled) {
    return res.status(409).json({ error: 'Разовое колесо сейчас не опубликовано' });
  }
  if (spinState.activeOneOffSpinUntil > Date.now()) {
    return res.status(409).json({ error: 'Дождитесь окончания прокрутки разового колеса' });
  }
  if (spinState.oneOffEliminationActive) {
    return res.status(409).json({ error: 'Дождитесь окончания режима на выбывание' });
  }
  if (state.result) {
    return res.status(409).json({ error: 'Сначала завершите выбор выпавшего фильма' });
  }
  next();
}

function rejectFormedCurrentWheelMutation(req, res, next) {
  if (readFormedWheel().length > 0) {
    return res.status(409).json({ error: 'Текущее колесо уже сформировано' });
  }
  next();
}

// ============ API ============

function stopOneOffElimination() {
  spinState.oneOffEliminationActive = false;
}


  return {
    ALLOWED_THEMES,
    MAX_ONE_OFF_MOVIES,
    MAX_SPIN_DURATION,
    MIN_SPIN_DURATION,
    ONE_OFF_MAX_SPIN_DURATION,
    ONE_OFF_MIN_SPIN_DURATION,
    ONE_OFF_MODES,
    broadcastOneOffState,
    broadcastWheelStatus,
    canManageMovie,
    claimPendingSpin,
    getOneOffState,
    getWheelStatus,
    isMovieInFormedWheel,
    readFormedWheel,
    readOneOffResult,
    rejectFormedCurrentWheelMutation,
    rejectOneOffMutation,
    rejectWheelMutationDuringSpin,
    schedulePendingSpin,
    serializeOneOffMovie,
    setOneOffResult,
    setOneOffSetting,
    spinState,
    stopOneOffElimination,
    toWheelSnapshotMovie,
    updateFormedWheelSnapshot,
  };
}

module.exports = { createWheelService };
