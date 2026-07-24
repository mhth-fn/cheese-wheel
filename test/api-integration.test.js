'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
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
  assert.equal((await request(instance, '/api/admin/users', {
    cookie: anton.cookie,
  })).status, 403);
  assert.equal((await request(instance, '/api/admin/users', {
    cookie: sergey.cookie,
  })).status, 200);

  assert.equal((await request(instance, '/api/watched', {
    method: 'POST',
    cookie: anton.cookie,
    body: { title: 'Member cannot add this' },
  })).status, 403);

  const watched = await request(instance, '/api/watched', {
    method: 'POST',
    cookie: sergey.cookie,
    body: { title: 'Integration Film' },
  });
  assert.equal(watched.status, 200, JSON.stringify(watched.payload));
  const watchedId = watched.payload.id;

  assert.equal((await request(instance, `/api/movies/${watchedId}`, {
    method: 'PATCH',
    cookie: anton.cookie,
    body: { title: 'Member edit' },
  })).status, 403);
  const renamed = await request(instance, `/api/movies/${watchedId}`, {
    method: 'PATCH',
    cookie: sergey.cookie,
    body: { title: 'Admin renamed film', watched_at: '2026-07-25' },
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.payload.title, 'Admin renamed film');

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
    body: { title: 'Persisted Spin Film' },
  });
  assert.equal(wheelMovie.status, 200, JSON.stringify(wheelMovie.payload));
  assert.equal((await request(instance, '/api/wheel/form', {
    method: 'POST',
    cookie: sergey.cookie,
    body: {},
  })).status, 200);

  const memberSocket = await connect(instance, anton.cookie);
  const memberRejected = waitForSocket(memberSocket, 'spin-rejected');
  memberSocket.emit('spin-wheel', { spinDuration: 5 });
  assert.match((await memberRejected).error, /администратор/);
  memberSocket.close();

  const adminSocket = await connect(instance, sergey.cookie);
  const spinStarted = waitForSocket(adminSocket, 'wheel-spinning');
  adminSocket.emit('spin-wheel', { spinDuration: 5 });
  const spin = await spinStarted;
  assert.equal(spin.winnerMovieId, wheelMovie.payload.id);
  adminSocket.close();

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
