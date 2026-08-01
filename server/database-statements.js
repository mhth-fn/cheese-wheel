'use strict';

function createStatements(db) {
// Подготовленные выражения (кешируем для производительности)
const stmts = {
  getTheme: db.prepare("SELECT value FROM settings WHERE key = 'theme'"),
  setTheme: db.prepare("UPDATE settings SET value = ? WHERE key = 'theme'"),
  getUsers: db.prepare('SELECT id, name FROM users ORDER BY id'),
  getUserById: db.prepare('SELECT id FROM users WHERE id = ?'),
  getAuthUser: db.prepare(`
    SELECT u.id, u.name, u.role,
      CASE WHEN t.enabled = 1 THEN 1 ELSE 0 END AS two_factor_enabled
    FROM users u
    LEFT JOIN user_totp t ON t.user_id = u.id
    WHERE u.id = ?
  `),
  getAdminUsers: db.prepare(`
    SELECT u.id, u.name, u.role,
      CASE WHEN t.enabled = 1 THEN 1 ELSE 0 END AS two_factor_enabled
    FROM users u
    LEFT JOIN user_totp t ON t.user_id = u.id
    ORDER BY u.id
  `),
  getUserWithPassword: db.prepare('SELECT id, name, password_hash, role FROM users WHERE id = ?'),
  setUserPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  getUnwatched: db.prepare(`
    SELECT m.*, u.name as added_by_name
    FROM movies m LEFT JOIN users u ON m.added_by = u.id
    WHERE m.is_watched = 0 AND m.is_next_wheel = 0 ORDER BY m.id
  `),
  getNextWheel: db.prepare(`
    SELECT m.*, u.name as added_by_name
    FROM movies m LEFT JOIN users u ON m.added_by = u.id
    WHERE m.is_watched = 0 AND m.is_next_wheel = 1 ORDER BY m.id
  `),
  promoteNextWheel: db.prepare('UPDATE movies SET is_next_wheel = 0 WHERE is_watched = 0 AND is_next_wheel = 1'),
  deleteCurrentWheelRatings: db.prepare(`
    DELETE FROM ratings
    WHERE movie_id IN (
      SELECT id FROM movies WHERE is_watched = 0 AND is_next_wheel = 0
    )
  `),
  clearCurrentWheel: db.prepare('DELETE FROM movies WHERE is_watched = 0 AND is_next_wheel = 0'),
  insertMovie: db.prepare(`
    INSERT INTO movies (
      title, alternative_title, director, year, added_by, is_next_wheel
    ) VALUES (?, ?, ?, ?, ?, 0)
  `),
  insertNextMovie: db.prepare(`
    INSERT INTO movies (
      title, alternative_title, director, year, added_by, is_next_wheel
    ) VALUES (?, ?, ?, ?, ?, 1)
  `),
  getMovieById: db.prepare('SELECT * FROM movies WHERE id = ?'),
  getMovieWithAuthorById: db.prepare(`
    SELECT m.*, u.name as added_by_name
    FROM movies m LEFT JOIN users u ON m.added_by = u.id
    WHERE m.id = ?
  `),
  getCurrentMovieByUser: db.prepare(`
    SELECT * FROM movies
    WHERE added_by = ? AND is_watched = 0 AND is_next_wheel = 0
  `),
  getNextMovieByUser: db.prepare(`
    SELECT * FROM movies
    WHERE added_by = ? AND is_watched = 0 AND is_next_wheel = 1
  `),
  deleteUnwatched: db.prepare('DELETE FROM movies WHERE id = ? AND is_watched = 0 AND is_next_wheel = 0'),
  deleteNextMovie: db.prepare('DELETE FROM movies WHERE id = ? AND is_watched = 0 AND is_next_wheel = 1'),
  markWatched: db.prepare("UPDATE movies SET is_watched = 1, watched_at = datetime('now') WHERE id = ?"),
  insertWatched: db.prepare(`
    INSERT INTO movies (
      title, alternative_title, director, year,
      is_watched, added_by, watched_at
    ) VALUES (?, ?, ?, ?, 1, ?, datetime('now'))
  `),
  getOneOffMovies: db.prepare(`
    SELECT m.id, m.title, m.added_by, m.added_at, u.name AS added_by_name
    FROM one_off_movies m
    JOIN users u ON u.id = m.added_by
    ORDER BY m.added_at, m.id
  `),
  getOneOffMovieById: db.prepare(`
    SELECT m.id, m.title, m.added_by, m.added_at, u.name AS added_by_name
    FROM one_off_movies m
    JOIN users u ON u.id = m.added_by
    WHERE m.id = ?
  `),
  insertOneOffMovie: db.prepare(
    'INSERT INTO one_off_movies (title, added_by, added_at) VALUES (?, ?, ?)'
  ),
  deleteOneOffMovie: db.prepare('DELETE FROM one_off_movies WHERE id = ?'),
  getWatchedMoviesForReviewLink: db.prepare('SELECT id, title FROM movies WHERE is_watched = 1'),
  getWatched: null, // инициализируется ниже динамически
  updateMovie: db.prepare(`
    UPDATE movies
    SET title = ?, alternative_title = ?, director = ?, year = ?, added_at = ?
    WHERE id = ?
  `),
  updateWatchedMovie: db.prepare(`
    UPDATE movies
    SET title = ?, alternative_title = ?, director = ?, year = ?, watched_at = ?
    WHERE id = ? AND is_watched = 1
  `),
  deleteRatings: db.prepare('DELETE FROM ratings WHERE movie_id = ?'),
  deleteMovie: db.prepare('DELETE FROM movies WHERE id = ?'),
  upsertRating: db.prepare(`
    INSERT INTO ratings (movie_id, user_id, rating) VALUES (?, ?, ?)
    ON CONFLICT(movie_id, user_id) DO UPDATE SET rating = excluded.rating
  `),
  deleteRating: db.prepare('DELETE FROM ratings WHERE movie_id = ? AND user_id = ?'),
  getSpinDuration: db.prepare("SELECT value FROM settings WHERE key = 'spin_duration'"),
  setSpinDuration: db.prepare("UPDATE settings SET value = ? WHERE key = 'spin_duration'"),
  getFormedWheel: db.prepare("SELECT value FROM settings WHERE key = 'formed_wheel_snapshot'"),
  setFormedWheel: db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('formed_wheel_snapshot', ?)"),
  totalWatched: db.prepare('SELECT COUNT(*) as count FROM movies WHERE is_watched = 1'),
  topRated: db.prepare(`
    SELECT m.title, ROUND(AVG(r.rating), 1) as avg_rating
    FROM movies m JOIN ratings r ON m.id = r.movie_id
    WHERE m.is_watched = 1 GROUP BY m.id ORDER BY avg_rating DESC LIMIT 1
  `),
  lowestRated: db.prepare(`
    SELECT m.title, ROUND(AVG(r.rating), 1) as avg_rating
    FROM movies m JOIN ratings r ON m.id = r.movie_id
    WHERE m.is_watched = 1 GROUP BY m.id ORDER BY avg_rating ASC LIMIT 1
  `),
  perUserAvg: db.prepare(`
    SELECT u.name, ROUND(AVG(r.rating), 1) as avg_rating
    FROM users u LEFT JOIN ratings r ON u.id = r.user_id
    GROUP BY u.id ORDER BY u.id
  `),
  ratingPairs: db.prepare(`
    SELECT
      u1.name as first_user,
      u2.name as second_user,
      COUNT(*) as common_movies,
      ROUND(AVG(ABS(r1.rating - r2.rating)), 2) as average_difference
    FROM ratings r1
    JOIN ratings r2
      ON r1.movie_id = r2.movie_id
      AND r1.user_id < r2.user_id
    JOIN movies m ON m.id = r1.movie_id AND m.is_watched = 1
    JOIN users u1 ON u1.id = r1.user_id
    JOIN users u2 ON u2.id = r2.user_id
    GROUP BY r1.user_id, r2.user_id
  `),
  getWineReviews: db.prepare(`
    SELECT wr.*, u.name as user_name,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='wine' AND review_id=wr.id AND reaction=1), 0) as likes,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='wine' AND review_id=wr.id AND reaction=-1), 0) as dislikes,
      COALESCE((SELECT json_group_array(json_object('user_id', user_id, 'reaction', reaction)) FROM review_reactions WHERE review_type='wine' AND review_id=wr.id), '[]') as reactions_json
    FROM wine_reviews wr JOIN users u ON wr.user_id = u.id
    ORDER BY wr.created_at DESC
  `),
  insertWineReview: db.prepare('INSERT INTO wine_reviews (user_id, title, content, recommend, wine_type, grape, region, vintage, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  getWineReviewById: db.prepare('SELECT * FROM wine_reviews WHERE id = ?'),
  deleteWineReview: db.prepare('DELETE FROM wine_reviews WHERE id = ? AND user_id = ?'),
  updateWineReview: db.prepare('UPDATE wine_reviews SET title=?, content=?, recommend=?, wine_type=?, grape=?, region=?, vintage=?, price=? WHERE id=? AND user_id=?'),
  getMusicReviews: db.prepare(`
    SELECT mr.*, u.name as user_name,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='music' AND review_id=mr.id AND reaction=1), 0) as likes,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='music' AND review_id=mr.id AND reaction=-1), 0) as dislikes,
      COALESCE((SELECT json_group_array(json_object('user_id', user_id, 'reaction', reaction)) FROM review_reactions WHERE review_type='music' AND review_id=mr.id), '[]') as reactions_json
    FROM music_reviews mr JOIN users u ON mr.user_id = u.id
    ORDER BY mr.created_at DESC, mr.id DESC
  `),
  insertMusicReview: db.prepare(`
    INSERT INTO music_reviews (
      user_id, title, artist, music_type, source_url, content, recommend
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getMusicReviewById: db.prepare('SELECT * FROM music_reviews WHERE id = ?'),
  deleteMusicReview: db.prepare('DELETE FROM music_reviews WHERE id = ? AND user_id = ?'),
  updateMusicReview: db.prepare(`
    UPDATE music_reviews
    SET title=?, artist=?, music_type=?, source_url=?, content=?, recommend=?
    WHERE id=? AND user_id=?
  `),
  getMovieReviews: db.prepare(`
    SELECT mr.*, u.name as user_name,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='movie' AND review_id=mr.id AND reaction=1), 0) as likes,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='movie' AND review_id=mr.id AND reaction=-1), 0) as dislikes,
      COALESCE((SELECT json_group_array(json_object('user_id', user_id, 'reaction', reaction)) FROM review_reactions WHERE review_type='movie' AND review_id=mr.id), '[]') as reactions_json
    FROM movie_reviews mr JOIN users u ON mr.user_id = u.id
    ORDER BY mr.created_at DESC
  `),
  getMovieReviewsByMovie: db.prepare(`
    SELECT mr.*, u.name as user_name,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='movie' AND review_id=mr.id AND reaction=1), 0) as likes,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='movie' AND review_id=mr.id AND reaction=-1), 0) as dislikes,
      COALESCE((SELECT json_group_array(json_object('user_id', user_id, 'reaction', reaction)) FROM review_reactions WHERE review_type='movie' AND review_id=mr.id), '[]') as reactions_json
    FROM movie_reviews mr
    JOIN users u ON mr.user_id = u.id
    WHERE mr.movie_id = ?
    ORDER BY mr.created_at DESC
  `),
  insertMovieReview: db.prepare('INSERT INTO movie_reviews (movie_id, user_id, title, content, recommend, director, year) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  getMovieReviewById: db.prepare('SELECT * FROM movie_reviews WHERE id = ?'),
  getMovieReviewByUserAndMovie: db.prepare(`
    SELECT id, movie_id, title
    FROM movie_reviews
    WHERE user_id = ? AND movie_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `),
  deleteMovieReview: db.prepare('DELETE FROM movie_reviews WHERE id = ? AND user_id = ?'),
  updateMovieReview: db.prepare('UPDATE movie_reviews SET movie_id=?, title=?, content=?, recommend=?, director=?, year=? WHERE id=? AND user_id=?'),
  updateLinkedMovieReviewTitles: db.prepare('UPDATE movie_reviews SET title = ? WHERE movie_id = ?'),
  getReviewReactions: db.prepare('SELECT user_id, reaction FROM review_reactions WHERE review_type = ? AND review_id = ?'),
  deleteReviewReactions: db.prepare('DELETE FROM review_reactions WHERE review_type = ? AND review_id = ?'),
};

const vpnStmts = {
  listByUser: db.prepare(`
    SELECT id, server_id, email, device_name, connection_link, created_at
    FROM vpn_clients
    WHERE user_id = ?
    ORDER BY created_at DESC
  `),
  countByUserAndServer: db.prepare(`
    SELECT COUNT(*) AS count
    FROM vpn_clients
    WHERE user_id = ? AND server_id = ?
  `),
  getByIdAndUser: db.prepare(`
    SELECT *
    FROM vpn_clients
    WHERE id = ? AND user_id = ?
  `),
  getByUserServerAndDevice: db.prepare(`
    SELECT id
    FROM vpn_clients
    WHERE user_id = ? AND server_id = ? AND device_name = ? COLLATE NOCASE
  `),
  insert: db.prepare(`
    INSERT INTO vpn_clients (
      user_id, server_id, inbound_id, client_id, email,
      device_name, connection_link, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  deleteByIdAndUser: db.prepare('DELETE FROM vpn_clients WHERE id = ? AND user_id = ?'),
};

const sigameStmts = {
  list: db.prepare(`
    SELECT
      p.*,
      added_user.name AS added_by_name,
      played_user.name AS played_by_name,
      ROUND(AVG(r.rating), 1) AS average_rating,
      COUNT(r.rating) AS ratings_count,
      (
        SELECT own.rating
        FROM sigame_pack_ratings own
        WHERE own.pack_id = p.id AND own.user_id = ?
      ) AS my_rating
    FROM sigame_packs p
    JOIN users added_user ON added_user.id = p.added_by
    LEFT JOIN users played_user ON played_user.id = p.played_by
    LEFT JOIN sigame_pack_ratings r ON r.pack_id = p.id
    GROUP BY p.id
    ORDER BY
      CASE p.status WHEN 'planned' THEN 0 ELSE 1 END,
      CASE WHEN p.status = 'planned' THEN p.added_at END DESC,
      CASE WHEN p.status = 'played' THEN p.played_at END DESC,
      p.id DESC
  `),
  getById: db.prepare(`
    SELECT
      p.*,
      added_user.name AS added_by_name,
      played_user.name AS played_by_name,
      ROUND(AVG(r.rating), 1) AS average_rating,
      COUNT(r.rating) AS ratings_count,
      (
        SELECT own.rating
        FROM sigame_pack_ratings own
        WHERE own.pack_id = p.id AND own.user_id = ?
      ) AS my_rating
    FROM sigame_packs p
    JOIN users added_user ON added_user.id = p.added_by
    LEFT JOIN users played_user ON played_user.id = p.played_by
    LEFT JOIN sigame_pack_ratings r ON r.pack_id = p.id
    WHERE p.id = ?
    GROUP BY p.id
  `),
  getRawById: db.prepare('SELECT * FROM sigame_packs WHERE id = ?'),
  getTags: db.prepare(`
    SELECT tag
    FROM sigame_pack_tags
    WHERE pack_id = ?
    ORDER BY tag COLLATE NOCASE
  `),
  insert: db.prepare(`
    INSERT INTO sigame_packs (
      title, added_by, added_at, original_file_name, storage_key, file_size
    ) VALUES (?, ?, ?, ?, ?, ?)
  `),
  update: db.prepare(`
    UPDATE sigame_packs
    SET title = ?
    WHERE id = ?
  `),
  delete: db.prepare('DELETE FROM sigame_packs WHERE id = ?'),
  deleteTags: db.prepare('DELETE FROM sigame_pack_tags WHERE pack_id = ?'),
  insertTag: db.prepare(`
    INSERT INTO sigame_pack_tags (pack_id, tag)
    VALUES (?, ?)
  `),
  markPlayed: db.prepare(`
    UPDATE sigame_packs
    SET status = 'played', played_by = ?, played_at = ?
    WHERE id = ?
  `),
  updatePlayedAt: db.prepare(`
    UPDATE sigame_packs
    SET played_at = ?
    WHERE id = ? AND status = 'played'
  `),
  restorePlanned: db.prepare(`
    UPDATE sigame_packs
    SET status = 'planned', played_by = NULL, played_at = NULL
    WHERE id = ?
  `),
  upsertRating: db.prepare(`
    INSERT INTO sigame_pack_ratings (pack_id, user_id, rating, rated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(pack_id, user_id) DO UPDATE SET
      rating = excluded.rating,
      rated_at = excluded.rated_at
  `),
  deleteRating: db.prepare(`
    DELETE FROM sigame_pack_ratings
    WHERE pack_id = ? AND user_id = ?
  `),
  deleteRatingsForPack: db.prepare(`
    DELETE FROM sigame_pack_ratings
    WHERE pack_id = ?
  `),
};

const authSecurityStmts = {
  getTotp: db.prepare(`
    SELECT user_id, secret_enc, enabled, pending_expires, last_used_step, enabled_at
    FROM user_totp
    WHERE user_id = ?
  `),
  upsertPendingTotp: db.prepare(`
    INSERT INTO user_totp (
      user_id, secret_enc, enabled, pending_expires, last_used_step, enabled_at
    ) VALUES (?, ?, 0, ?, NULL, NULL)
    ON CONFLICT(user_id) DO UPDATE SET
      secret_enc = excluded.secret_enc,
      enabled = 0,
      pending_expires = excluded.pending_expires,
      last_used_step = NULL,
      enabled_at = NULL
    WHERE user_totp.enabled = 0
  `),
  enableTotp: db.prepare(`
    UPDATE user_totp
    SET enabled = 1, pending_expires = NULL, last_used_step = ?, enabled_at = ?
    WHERE user_id = ? AND enabled = 0 AND pending_expires >= ?
  `),
  advanceTotpStep: db.prepare(`
    UPDATE user_totp
    SET last_used_step = ?
    WHERE user_id = ?
      AND enabled = 1
      AND (last_used_step IS NULL OR last_used_step < ?)
  `),
  deleteTotp: db.prepare('DELETE FROM user_totp WHERE user_id = ?'),
  deleteRecoveryCodes: db.prepare(
    'DELETE FROM two_factor_recovery_codes WHERE user_id = ?'
  ),
  insertRecoveryCode: db.prepare(`
    INSERT INTO two_factor_recovery_codes (user_id, code_hash, created_at)
    VALUES (?, ?, ?)
  `),
  consumeRecoveryCode: db.prepare(`
    UPDATE two_factor_recovery_codes
    SET used_at = ?
    WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
  `),
  countRecoveryCodes: db.prepare(`
    SELECT COUNT(*) AS count
    FROM two_factor_recovery_codes
    WHERE user_id = ? AND used_at IS NULL
  `),
  getLoginChallenge: db.prepare(`
    SELECT challenge_hash, user_id, expires, attempts
    FROM login_challenges
    WHERE challenge_hash = ?
  `),
  insertLoginChallenge: db.prepare(`
    INSERT INTO login_challenges (
      challenge_hash, user_id, expires, attempts, created_at
    ) VALUES (?, ?, ?, 0, ?)
  `),
  incrementChallengeAttempts: db.prepare(`
    UPDATE login_challenges
    SET attempts = attempts + 1
    WHERE challenge_hash = ? AND attempts < 5 AND expires >= ?
  `),
  deleteChallenge: db.prepare('DELETE FROM login_challenges WHERE challenge_hash = ?'),
  deleteUserChallenges: db.prepare('DELETE FROM login_challenges WHERE user_id = ?'),
  deleteExpiredChallenges: db.prepare('DELETE FROM login_challenges WHERE expires < ?'),
};

  return {
    authSecurityStmts,
    sigameStmts,
    stmts,
    vpnStmts,
  };
}

module.exports = { createStatements };
