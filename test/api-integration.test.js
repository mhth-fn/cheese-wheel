'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { io: createSocket } = require('socket.io-client');
const {
  delay,
  login,
  request,
  startServer,
  stopServer,
} = require('./helpers/server-fixture');

const fsp = fs.promises;

function waitForSocket(socket, event, timeout = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for Socket.IO event: ${event}`)),
      timeout
    );
    socket.once(event, payload => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function connect(instance, cookie) {
  const socket = createSocket(instance.baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: {
      Cookie: cookie,
      Origin: instance.baseUrl,
    },
  });
  await Promise.race([
    waitForSocket(socket, 'connect'),
    waitForSocket(socket, 'connect_error').then(error => {
      throw error;
    }),
  ]);
  return socket;
}

test('real server enforces authentication, dynamic roles and content ownership', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-api-test-'));
  let instance = await startServer(dataDir);
  t.after(async () => {
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  const health = await request(instance, '/healthz');
  assert.equal(health.status, 200);
  assert.deepEqual(health.payload, { status: 'ok' });
  const readiness = await request(instance, '/readyz');
  assert.equal(readiness.status, 200);
  assert.deepEqual(readiness.payload, { status: 'ready' });

  const noLegacyFallback = await request(instance, '/');
  assert.equal(noLegacyFallback.status, 503);
  assert.match(noLegacyFallback.payload, /Frontend build is unavailable/);

  assert.equal((await request(instance, '/api/watched')).status, 401);
  const guest = await request(instance, '/api/auth/guest', {
    method: 'POST',
    body: {},
  });
  assert.equal(guest.status, 200);
  const guestCookie = guest.response.headers.get('set-cookie').split(';', 1)[0];
  assert.equal((await request(instance, '/api/watched', {
    method: 'POST',
    cookie: guestCookie,
    body: { title: 'Guest mutation' },
  })).status, 403);

  const anton = await login(instance, 1);
  const sergey = await login(instance, 2);
  const peter = await login(instance, 3);
  assert.equal(anton.user.role, 'member');
  assert.equal(sergey.user.role, 'admin');

  const legacyVlessLink = [
    'vless://22222222-2222-4222-8222-222222222222@198.51.100.20:2443',
    '?encryption=none&flow=xtls-rprx-vision&security=reality',
    '&sni=example.com&fp=chrome&pbk=test-public-key',
    '&sid=abcd&spx=%2F&type=tcp#old-label',
  ].join('');
  const vpnDb = new Database(path.join(dataDir, 'cheese_wheel.db'));
  vpnDb.prepare(`
    INSERT INTO vpn_clients (
      user_id, server_id, inbound_id, client_id, email,
      device_name, connection_link, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    anton.user.id,
    'legacy-link-test',
    1,
    '22222222-2222-4222-8222-222222222222',
    'legacy-link@example.invalid',
    'Legacy iPhone',
    legacyVlessLink,
    Date.now()
  );
  vpnDb.close();
  const vpnClients = await request(instance, '/api/vpn/clients', {
    cookie: anton.cookie,
  });
  assert.equal(vpnClients.status, 200, JSON.stringify(vpnClients.payload));
  assert.equal(vpnClients.payload.clients[0].connectionLink, [
    'vless://22222222-2222-4222-8222-222222222222@198.51.100.20:2443/',
    '?type=tcp&encryption=none&security=reality&pbk=test-public-key',
    '&fp=chrome&sni=example.com&sid=abcd&spx=%2F',
    '&flow=xtls-rprx-vision#Legacy-iPhone',
  ].join(''));

  assert.equal((await request(instance, '/api/admin/users', {
    cookie: anton.cookie,
  })).status, 403);
  assert.equal((await request(instance, '/api/admin/users', {
    cookie: sergey.cookie,
  })).status, 200);

  const customSpinDuration = await request(instance, '/api/settings/spin-duration', {
    method: 'POST',
    cookie: sergey.cookie,
    body: { duration: 20 },
  });
  assert.equal(customSpinDuration.status, 200, JSON.stringify(customSpinDuration.payload));
  const updatedSettings = await request(instance, '/api/settings', {
    cookie: sergey.cookie,
  });
  assert.equal(updatedSettings.status, 200);
  assert.equal(updatedSettings.payload.spin_duration, 20);
  const rejectedSpinDuration = await request(instance, '/api/settings/spin-duration', {
    method: 'POST',
    cookie: sergey.cookie,
    body: { duration: 31 },
  });
  assert.equal(rejectedSpinDuration.status, 400);
  assert.match(rejectedSpinDuration.payload.error, /5.*30/);

  assert.equal((await request(instance, '/api/watched', {
    method: 'POST',
    cookie: anton.cookie,
    body: { title: 'Member cannot add this' },
  })).status, 403);

  const watched = await request(instance, '/api/watched', {
    method: 'POST',
    cookie: sergey.cookie,
    body: {
      title: 'Интеграционный фильм',
      alternative_title: 'Integration Film',
      director: 'Test Director',
      year: 2024,
    },
  });
  assert.equal(watched.status, 200, JSON.stringify(watched.payload));
  assert.equal(watched.payload.alternative_title, 'Integration Film');
  assert.equal(watched.payload.director, 'Test Director');
  assert.equal(watched.payload.year, 2024);
  const watchedId = watched.payload.id;

  assert.equal((await request(instance, `/api/movies/${watchedId}`, {
    method: 'PATCH',
    cookie: anton.cookie,
    body: { title: 'Member edit' },
  })).status, 403);
  const renamed = await request(instance, `/api/movies/${watchedId}`, {
    method: 'PATCH',
    cookie: sergey.cookie,
    body: {
      title: 'Переименованный фильм',
      alternative_title: 'Admin Renamed Film',
      director: 'Updated Director',
      year: 2025,
      watched_at: '2026-07-25',
    },
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.payload.title, 'Переименованный фильм');
  assert.equal(renamed.payload.alternative_title, 'Admin Renamed Film');
  assert.equal(renamed.payload.director, 'Updated Director');
  assert.equal(renamed.payload.year, 2025);
  assert.equal((await request(instance, `/api/movies/${watchedId}`, {
    method: 'PATCH',
    cookie: sergey.cookie,
    body: { title: 'Invalid year', year: 1887 },
  })).status, 400);

  assert.equal((await request(instance, '/api/ratings', {
    method: 'POST',
    cookie: anton.cookie,
    body: { movie_id: watchedId, user_id: 3, rating: 7 },
  })).status, 403);
  assert.equal((await request(instance, '/api/ratings', {
    method: 'POST',
    cookie: anton.cookie,
    body: { movie_id: watchedId, user_id: 1, rating: 8 },
  })).status, 200);
  assert.equal((await request(instance, '/api/ratings', {
    method: 'POST',
    cookie: sergey.cookie,
    body: { movie_id: watchedId, user_id: 3, rating: 9 },
  })).status, 200);

  const coreStats = await request(instance, '/api/stats?scope=core', {
    cookie: sergey.cookie,
  });
  assert.equal(coreStats.status, 200, JSON.stringify(coreStats.payload));
  assert.deepEqual(
    coreStats.payload.per_user_avg.map(user => user.name),
    ['Антон', 'Митя', 'Пётр', 'Сергей', 'Егор']
  );
  const selectedStats = await request(instance, '/api/stats?scope=selected&user_ids=1,3', {
    cookie: sergey.cookie,
  });
  assert.equal(selectedStats.status, 200, JSON.stringify(selectedStats.payload));
  assert.equal(selectedStats.payload.scope, 'selected');
  assert.deepEqual(selectedStats.payload.selected_user_ids, [1, 3]);
  assert.deepEqual(
    selectedStats.payload.per_user_avg.map(user => user.name),
    ['Антон', 'Пётр']
  );
  assert.equal(selectedStats.payload.total_watched, 1);
  assert.equal(selectedStats.payload.top_rated.avg_rating, 8.5);
  assert.equal((await request(instance, '/api/stats?scope=selected&user_ids=999', {
    cookie: sergey.cookie,
  })).status, 400);
  const personalSelectedStats = await request(
    instance,
    '/api/stats?scope=personal&comparison_scope=selected&user_ids=3',
    { cookie: anton.cookie }
  );
  assert.equal(
    personalSelectedStats.status,
    200,
    JSON.stringify(personalSelectedStats.payload)
  );
  assert.equal(personalSelectedStats.payload.scope, 'personal');
  assert.equal(personalSelectedStats.payload.comparison_scope, 'selected');
  assert.deepEqual(personalSelectedStats.payload.comparison_user_ids, [3]);
  assert.equal(personalSelectedStats.payload.closest_rating_pair.second_user, 'Пётр');
  assert.equal(personalSelectedStats.payload.closest_rating_pair.average_difference, 1);
  assert.equal(personalSelectedStats.payload.furthest_rating_pair.second_user, 'Пётр');
  const personalEmptyComparisonStats = await request(
    instance,
    '/api/stats?scope=personal&comparison_scope=selected&user_ids=',
    { cookie: anton.cookie }
  );
  assert.equal(
    personalEmptyComparisonStats.status,
    200,
    JSON.stringify(personalEmptyComparisonStats.payload)
  );
  assert.deepEqual(personalEmptyComparisonStats.payload.comparison_user_ids, []);
  assert.equal(personalEmptyComparisonStats.payload.closest_rating_pair, null);
  assert.equal(personalEmptyComparisonStats.payload.furthest_rating_pair, null);
  assert.equal((await request(
    instance,
    '/api/stats?scope=selected&user_ids=',
    { cookie: anton.cookie }
  )).status, 400);
  assert.equal((await request(
    instance,
    '/api/stats?scope=personal&comparison_scope=selected&user_ids=1',
    { cookie: anton.cookie }
  )).status, 400);
  assert.equal((await request(
    instance,
    '/api/stats?scope=personal&comparison_scope=selected&user_ids=999',
    { cookie: anton.cookie }
  )).status, 400);

  const lastAdmin = await request(instance, '/api/admin/users/2/role', {
    method: 'PATCH',
    cookie: sergey.cookie,
    body: { role: 'member' },
  });
  assert.equal(lastAdmin.status, 409);
  assert.equal((await request(instance, '/api/admin/users/1/role', {
    method: 'PATCH',
    cookie: sergey.cookie,
    body: { role: 'admin' },
  })).status, 200);
  assert.equal((await request(instance, '/api/admin/users/2/role', {
    method: 'PATCH',
    cookie: sergey.cookie,
    body: { role: 'member' },
  })).status, 200);
  assert.equal((await request(instance, '/api/watched', {
    method: 'POST',
    cookie: sergey.cookie,
    body: { title: 'Former admin cannot add this' },
  })).status, 403);
  assert.equal((await request(instance, '/api/watched', {
    method: 'POST',
    cookie: anton.cookie,
    body: { title: 'Current admin can add this' },
  })).status, 200);
  assert.equal((await request(instance, '/api/admin/users/2/role', {
    method: 'PATCH',
    cookie: anton.cookie,
    body: { role: 'admin' },
  })).status, 200);
  assert.equal((await request(instance, '/api/admin/users/1/role', {
    method: 'PATCH',
    cookie: sergey.cookie,
    body: { role: 'member' },
  })).status, 200);

  const movieReview = await request(instance, '/api/movie-reviews', {
    method: 'POST',
    cookie: anton.cookie,
    body: {
      movie_id: watchedId,
      content: 'Original member review',
      recommend: 1,
    },
  });
  assert.equal(movieReview.status, 200, JSON.stringify(movieReview.payload));
  const duplicateMovieReview = await request(instance, '/api/movie-reviews', {
    method: 'POST',
    cookie: anton.cookie,
    body: {
      movie_id: watchedId,
      content: 'Duplicate review must be rejected',
      recommend: -1,
    },
  });
  assert.equal(duplicateMovieReview.status, 409);
  assert.equal(duplicateMovieReview.payload.code, 'MOVIE_REVIEW_ALREADY_EXISTS');
  assert.equal(duplicateMovieReview.payload.existing_review_id, movieReview.payload.id);
  assert.equal(duplicateMovieReview.payload.movie_id, watchedId);

  const peterMovieReview = await request(instance, '/api/movie-reviews', {
    method: 'POST',
    cookie: peter.cookie,
    body: {
      movie_id: watchedId,
      content: 'Another user may review the same film',
      recommend: 1,
    },
  });
  assert.equal(peterMovieReview.status, 200, JSON.stringify(peterMovieReview.payload));

  const otherWatched = await request(instance, '/api/watched', {
    method: 'POST',
    cookie: sergey.cookie,
    body: { title: 'Another reviewed film' },
  });
  assert.equal(otherWatched.status, 200, JSON.stringify(otherWatched.payload));
  const otherMovieReview = await request(instance, '/api/movie-reviews', {
    method: 'POST',
    cookie: anton.cookie,
    body: {
      movie_id: otherWatched.payload.id,
      content: 'Same user may review a different film',
      recommend: 0,
    },
  });
  assert.equal(otherMovieReview.status, 200, JSON.stringify(otherMovieReview.payload));
  const relinkConflict = await request(
    instance,
    `/api/movie-reviews/${otherMovieReview.payload.id}`,
    {
      method: 'PATCH',
      cookie: anton.cookie,
      body: {
        movie_id: watchedId,
        content: 'Relinking must not bypass uniqueness',
        recommend: 0,
      },
    }
  );
  assert.equal(relinkConflict.status, 409);
  assert.equal(relinkConflict.payload.code, 'MOVIE_REVIEW_ALREADY_EXISTS');
  assert.equal(relinkConflict.payload.existing_review_id, movieReview.payload.id);

  assert.equal((await request(instance, `/api/movie-reviews/${movieReview.payload.id}`, {
    method: 'PATCH',
    cookie: peter.cookie,
    body: { title: 'Other member edit', content: 'No', recommend: -1 },
  })).status, 403);
  const adminMovieEdit = await request(
    instance,
    `/api/movie-reviews/${movieReview.payload.id}`,
    {
      method: 'PATCH',
      cookie: sergey.cookie,
      body: { content: 'Admin-edited member review', recommend: 0 },
    }
  );
  assert.equal(adminMovieEdit.status, 200);
  assert.equal(adminMovieEdit.payload.content, 'Admin-edited member review');
  assert.equal((await request(instance, `/api/movie-reviews/${movieReview.payload.id}`, {
    method: 'DELETE',
    cookie: sergey.cookie,
  })).status, 200);
  assert.equal((await request(instance, '/api/movie-reviews', {
    method: 'POST',
    cookie: anton.cookie,
    body: {
      movie_id: watchedId,
      content: 'A new review is allowed after deleting the old one',
      recommend: 1,
    },
  })).status, 200);
  const standaloneMovieReview = await request(instance, '/api/movie-reviews', {
    method: 'POST',
    cookie: anton.cookie,
    body: {
      title: 'Film outside watched history',
      link_by_title: false,
      content: 'Standalone reviews remain available',
      recommend: 1,
    },
  });
  assert.equal(
    standaloneMovieReview.status,
    200,
    JSON.stringify(standaloneMovieReview.payload)
  );
  assert.equal(standaloneMovieReview.payload.movie_id, null);

  const wineReview = await request(instance, '/api/wine-reviews', {
    method: 'POST',
    cookie: peter.cookie,
    body: {
      title: 'Integration Wine',
      content: 'Original wine review',
      recommend: 1,
      wine_type: 'red',
    },
  });
  assert.equal(wineReview.status, 200, JSON.stringify(wineReview.payload));
  assert.equal((await request(instance, `/api/wine-reviews/${wineReview.payload.id}`, {
    method: 'PATCH',
    cookie: anton.cookie,
    body: { title: 'Other member edit', content: 'No', recommend: -1 },
  })).status, 403);
  const adminWineEdit = await request(
    instance,
    `/api/wine-reviews/${wineReview.payload.id}`,
    {
      method: 'PATCH',
      cookie: sergey.cookie,
      body: {
        title: 'Admin-edited wine',
        content: 'Admin-edited wine review',
        recommend: 0,
        wine_type: 'red',
      },
    }
  );
  assert.equal(adminWineEdit.status, 200);
  assert.equal(adminWineEdit.payload.content, 'Admin-edited wine review');
  assert.equal((await request(instance, `/api/wine-reviews/${wineReview.payload.id}`, {
    method: 'DELETE',
    cookie: sergey.cookie,
  })).status, 200);

  const wheelMovie = await request(instance, '/api/wheel', {
    method: 'POST',
    cookie: anton.cookie,
    body: {
      title: 'Фильм для сохранённой прокрутки',
      alternative_title: 'Persisted Spin Film',
      director: 'Wheel Director',
      year: 2023,
    },
  });
  assert.equal(wheelMovie.status, 200, JSON.stringify(wheelMovie.payload));
  assert.equal(wheelMovie.payload.alternative_title, 'Persisted Spin Film');
  assert.equal(wheelMovie.payload.director, 'Wheel Director');
  assert.equal(wheelMovie.payload.year, 2023);
  assert.equal((await request(instance, '/api/wheel/form', {
    method: 'POST',
    cookie: sergey.cookie,
    body: {},
  })).status, 200);

  assert.equal((await request(instance, '/api/settings/spin-enabled', {
    method: 'POST',
    cookie: sergey.cookie,
    body: { enabled: false },
  })).status, 200);
  const disabledMemberSocket = await connect(instance, anton.cookie);
  const disabledSpinRejected = waitForSocket(disabledMemberSocket, 'spin-rejected');
  disabledMemberSocket.emit('spin-wheel', { spinDuration: 5 });
  assert.match((await disabledSpinRejected).error, /основного колеса отключена/);
  disabledMemberSocket.close();

  assert.equal((await request(instance, '/api/settings/spin-enabled', {
    method: 'POST',
    cookie: sergey.cookie,
    body: { enabled: true },
  })).status, 200);
  const memberSocket = await connect(instance, anton.cookie);
  const spinStarted = waitForSocket(memberSocket, 'wheel-spinning');
  memberSocket.emit('spin-wheel', { spinDuration: 5 });
  const spin = await spinStarted;
  assert.equal(spin.winnerMovieId, wheelMovie.payload.id);
  memberSocket.close();

  await stopServer(instance, 'SIGKILL');
  instance = await startServer(dataDir);

  const completionDeadline = Date.now() + 8_000;
  let completedMovie = null;
  while (Date.now() < completionDeadline) {
    const watchedAfterRestart = await request(instance, '/api/watched', {
      cookie: sergey.cookie,
    });
    assert.equal(watchedAfterRestart.status, 200);
    completedMovie = watchedAfterRestart.payload.find(
      movie => Number(movie.id) === Number(wheelMovie.payload.id)
    );
    if (completedMovie) break;
    await delay(100);
  }
  assert.ok(completedMovie, 'persisted spin must complete exactly once after restart');
  assert.equal(completedMovie.alternative_title, 'Persisted Spin Film');
  assert.equal(completedMovie.director, 'Wheel Director');
  assert.equal(completedMovie.year, 2023);
  const wheelStatus = await request(instance, '/api/wheel/status', {
    cookie: sergey.cookie,
  });
  assert.equal(wheelStatus.status, 200);
  assert.equal(wheelStatus.payload.pending_spin, null);
  assert.equal(
    (await request(instance, '/api/watched', { cookie: sergey.cookie }))
      .payload.filter(movie => Number(movie.id) === Number(wheelMovie.payload.id)).length,
    1
  );
});

test('startup preserves legacy duplicate reviews while enforcing one linked review', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-review-migration-'));
  let instance = await startServer(dataDir);
  t.after(async () => {
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });
  await stopServer(instance);

  const databasePath = path.join(dataDir, 'cheese_wheel.db');
  const seedDb = new Database(databasePath);
  seedDb.pragma('foreign_keys = ON');
  seedDb.exec('DROP INDEX idx_movie_reviews_user_movie');
  const movieId = Number(seedDb.prepare(`
    INSERT INTO movies (title, is_watched, watched_at)
    VALUES ('Legacy duplicate film', 1, '2026-07-25')
  `).run().lastInsertRowid);
  const insertReview = seedDb.prepare(`
    INSERT INTO movie_reviews (
      movie_id, user_id, title, content, recommend, created_at
    ) VALUES (?, 1, 'Legacy duplicate film', ?, 1, ?)
  `);
  const olderId = Number(insertReview.run(
    movieId,
    'Older review stays in the journal',
    '2026-07-24 10:00:00'
  ).lastInsertRowid);
  const newerId = Number(insertReview.run(
    movieId,
    'Newer review remains linked',
    '2026-07-25 10:00:00'
  ).lastInsertRowid);
  seedDb.prepare(`
    INSERT INTO review_reactions (review_type, review_id, user_id, reaction)
    VALUES ('movie', ?, 2, 1)
  `).run(olderId);
  seedDb.close();

  instance = await startServer(dataDir);
  await stopServer(instance);

  const migratedDb = new Database(databasePath, { readonly: true });
  const reviews = migratedDb.prepare(`
    SELECT id, movie_id
    FROM movie_reviews
    WHERE id IN (?, ?)
    ORDER BY id
  `).all(olderId, newerId);
  assert.deepEqual(reviews, [
    { id: olderId, movie_id: null },
    { id: newerId, movie_id: movieId },
  ]);
  assert.equal(
    migratedDb.prepare(`
      SELECT COUNT(*) AS count
      FROM review_reactions
      WHERE review_type = 'movie' AND review_id = ?
    `).get(olderId).count,
    1
  );
  assert.match(
    migratedDb.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'index' AND name = 'idx_movie_reviews_user_movie'
    `).get().sql,
    /CREATE UNIQUE INDEX/i
  );
  migratedDb.close();
});
