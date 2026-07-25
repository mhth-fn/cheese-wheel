'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');
const {
  login,
  request,
  startServer,
  stopServer,
  testPassword,
} = require('./helpers/server-fixture');

const fsp = fs.promises;

test('mobile browser can log in and use watched and reviews navigation', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-browser-test-'));
  const instance = await startServer(dataDir, { frontend: 'built' });
  let browser = null;
  t.after(async () => {
    await browser?.close();
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });
  browser = await chromium.launch({ headless: true });

  const apiAdmin = await login(instance, 2);
  const seededMovie = await request(instance, '/api/watched', {
    method: 'POST',
    cookie: apiAdmin.cookie,
    body: { title: 'Browser Smoke Film' },
  });
  assert.equal(seededMovie.status, 200, JSON.stringify(seededMovie.payload));
  const seededRating = await request(instance, '/api/ratings', {
    method: 'POST',
    cookie: apiAdmin.cookie,
    body: {
      movie_id: seededMovie.payload.id,
      user_id: apiAdmin.user.id,
      rating: 9,
    },
  });
  assert.equal(seededRating.status, 200, JSON.stringify(seededRating.payload));
  const testVlessLink = [
    'vless://11111111-1111-4111-8111-111111111111@198.51.100.10:443',
    '?encryption=none&flow=xtls-rprx-vision&security=reality',
    '&sni=example.com&fp=chrome&type=tcp#Browser%20VPN',
  ].join('');
  const vpnSeedDb = new Database(path.join(dataDir, 'cheese_wheel.db'));
  vpnSeedDb.prepare(`
    INSERT INTO vpn_clients (
      user_id, server_id, inbound_id, client_id, email,
      device_name, connection_link, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    apiAdmin.user.id,
    'browser-test',
    1,
    '11111111-1111-4111-8111-111111111111',
    'browser-test@example.invalid',
    'Browser VPN',
    testVlessLink,
    Date.now()
  );
  vpnSeedDb.close();

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (
      message.type() === 'error'
      && !message.text().startsWith('Failed to load resource:')
    ) {
      browserErrors.push(message.text());
    }
  });

  const response = await page.goto(instance.baseUrl, {
    waitUntil: 'domcontentloaded',
  });
  assert.equal(response.status(), 200);
  await page.getByRole('heading', { name: 'Сырное Колесо' }).waitFor();

  await page.getByRole('button', { name: 'Сергей', exact: true }).click();
  await page.getByPlaceholder('Введите пароль…').fill(testPassword);
  const loginResponsePromise = page.waitForResponse(response => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/auth'
  ));
  const sessionResponsePromise = page.waitForResponse(response => (
    response.request().method() === 'GET'
    && new URL(response.url()).pathname === '/api/auth/session'
  ));
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const loginResponse = await loginResponsePromise;
  assert.equal(
    loginResponse.status(),
    200,
    `browser login failed: ${await loginResponse.text()}`
  );
  const sessionResponse = await sessionResponsePromise;
  assert.equal(
    sessionResponse.status(),
    200,
    `browser session was not established: ${await sessionResponse.text()}`
  );

  const appContainer = page.locator('.app-container');
  try {
    await appContainer.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    throw new Error(
      'application did not leave the login screen after a valid session'
      + `\nBrowser errors: ${browserErrors.join(' | ') || 'none'}`
      + `\nBody HTML: ${(await page.locator('body').innerHTML()).slice(0, 2_000)}`
    );
  }
  await page.locator('nav[aria-label="Основные разделы"]').waitFor();
  const profileButton = page.getByRole('button', { name: 'Меню пользователя Сергей' });
  await profileButton.waitFor();
  await page.getByRole('button', { name: 'VPN', exact: true }).waitFor();

  await page.getByRole('button', { name: 'Просмотренные', exact: true }).click();
  await page.waitForURL(`${instance.baseUrl}/watched`);
  await page.getByRole('list', { name: 'Все просмотренные фильмы' }).waitFor();
  await page.locator('.watched-card-title strong', { hasText: 'Browser Smoke Film' }).waitFor();
  assert.equal(await page.locator('table.watched-table').count(), 0);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'mobile page must not overflow horizontally'
  );
  const cardBox = await page.locator('.watched-movie-card').first().boundingBox();
  const connectionBox = await page.locator('.connection-status').boundingBox();
  const bottomNavBox = await page.locator('.nav-pages').boundingBox();
  assert.ok(
    cardBox && connectionBox && bottomNavBox,
    'mobile cards, navigation and connection status must be visible'
  );
  assert.ok(cardBox.height <= 160, 'mobile movie summary must stay compact');
  assert.equal(await page.locator('.watched-card-meta').count(), 0);
  assert.equal(await page.locator('.watched-card-ratings').count(), 0);
  assert.equal(await page.locator('.watched-card-footer').count(), 0);
  assert.equal(
    await page.locator('.watched-card-average .rating-avg small').evaluate(
      element => getComputedStyle(element).display
    ),
    'none',
    'compact average must show only the score'
  );
  assert.equal(
    connectionBox.y < cardBox.y + cardBox.height
      && connectionBox.y + connectionBox.height > cardBox.y,
    false,
    'connection status must not overlap a movie card'
  );
  assert.equal(
    connectionBox.x < bottomNavBox.x + bottomNavBox.width
      && connectionBox.x + connectionBox.width > bottomNavBox.x
      && connectionBox.y < bottomNavBox.y + bottomNavBox.height
      && connectionBox.y + connectionBox.height > bottomNavBox.y,
    false,
    'connection status must not overlap the mobile navigation'
  );

  await page.locator('.watched-card-title').first().click();
  const movieDialog = page.getByRole('dialog');
  await movieDialog.waitFor();
  await page.getByLabel('Ваша оценка фильму Browser Smoke Film').waitFor();
  assert.equal(await movieDialog.getByRole('tablist').count(), 0);
  assert.equal(await movieDialog.getByRole('tab').count(), 0);
  await movieDialog.getByRole('heading', { name: 'Оценки участников', exact: true }).waitFor();
  await movieDialog.getByRole('heading', { name: 'Обзоры участников', exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => {
      const ratings = document.querySelector('.movie-details-ratings');
      const reviews = document.querySelector('.movie-details-reviews');
      return Boolean(
        ratings
        && reviews
        && (ratings.compareDocumentPosition(reviews) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    }),
    true,
    'ratings must appear before reviews in one continuous movie dialog'
  );
  const movieAdminActions = page.getByRole('group', {
    name: 'Действия с фильмом Browser Smoke Film',
  });
  await movieAdminActions.getByRole('button', { name: /Изменить/ }).waitFor();
  await movieAdminActions.getByRole('button', { name: /Удалить/ }).waitFor();
  const contextualReviewText = movieDialog.getByPlaceholder(
    'Что запомнилось, что сработало, а что — нет?'
  );
  await contextualReviewText.fill('Browser smoke review');
  await movieDialog.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await movieDialog.getByText('Вы уже написали обзор на этот фильм.', { exact: true }).waitFor();
  const editOwnReview = movieDialog.getByRole(
    'button',
    { name: 'Изменить мой обзор', exact: true }
  );
  await editOwnReview.waitFor();
  assert.equal(await movieDialog.locator('form.review-form').count(), 0);
  await editOwnReview.click();
  const reviewEditor = movieDialog.locator('.review-edit-form');
  await reviewEditor.waitFor();
  await reviewEditor.locator('textarea').waitFor();
  assert.equal(
    await reviewEditor.locator('textarea').evaluate(
      element => element === document.activeElement
    ),
    true
  );
  assert.equal(
    await page.locator('.connection-status').evaluate(
      element => getComputedStyle(element).visibility
    ),
    'hidden',
    'connection status must be hidden behind a movie dialog'
  );
  await page.getByText('✕', { exact: true }).click();

  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('.watched-mobile-list').waitFor();
  assert.equal(await page.locator('table.watched-table').count(), 0);
  const landscapeCardBox = await page.locator('.watched-movie-card').first().boundingBox();
  assert.ok(
    landscapeCardBox && landscapeCardBox.height <= 160,
    'landscape phone must keep compact movie summaries'
  );
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole('button', { name: 'Обзоры', exact: true }).click();
  await page.waitForURL(`${instance.baseUrl}/reviews`);
  await page.getByRole('heading', { name: 'Обзоры', exact: true }).waitFor();
  const titleInput = page.getByLabel('Название фильма *');
  const reviewForm = page.locator('.review-form');
  await titleInput.waitFor();
  await titleInput.fill('Очень длинное название фильма, которое должно оставаться внутри формы');

  const assertReviewFormFits = async orientation => {
    const layout = await page.evaluate(() => {
      const form = document.querySelector('.review-form');
      const input = document.querySelector('#movie-review-title');
      const nav = document.querySelector('.nav-pages');
      const profile = document.querySelector('.nav-user');
      const connection = document.querySelector('.connection-status');
      const formRect = form?.getBoundingClientRect();
      const inputRect = input?.getBoundingClientRect();
      const navRect = nav?.getBoundingClientRect();
      const profileRect = profile?.getBoundingClientRect();
      const connectionRect = connection?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        formWidth: form?.clientWidth,
        formContentWidth: form?.scrollWidth,
        formRect: formRect && {
          left: formRect.left,
          right: formRect.right,
        },
        inputRect: inputRect && {
          left: inputRect.left,
          right: inputRect.right,
        },
        navPosition: nav ? getComputedStyle(nav).position : null,
        navRect: navRect && {
          left: navRect.left,
          right: navRect.right,
          top: navRect.top,
          bottom: navRect.bottom,
        },
        profileRect: profileRect && {
          left: profileRect.left,
          right: profileRect.right,
          top: profileRect.top,
          bottom: profileRect.bottom,
        },
        connectionRect: connectionRect && {
          left: connectionRect.left,
          right: connectionRect.right,
          top: connectionRect.top,
          bottom: connectionRect.bottom,
        },
      };
    });
    assert.equal(
      layout.documentWidth <= layout.viewportWidth,
      true,
      `${orientation}: page must not overflow horizontally`
    );
    assert.ok(layout.formRect && layout.inputRect, `${orientation}: review form must be visible`);
    assert.ok(
      layout.inputRect.left >= layout.formRect.left - 1
        && layout.inputRect.right <= layout.formRect.right + 1,
      `${orientation}: movie title input must stay inside the form`
    );
    assert.ok(
      layout.formContentWidth <= layout.formWidth,
      `${orientation}: review form contents must not overflow`
    );
    assert.equal(layout.navPosition, 'fixed', `${orientation}: phone navigation must stay mobile`);
    assert.equal(
      layout.navRect.left < layout.profileRect.right
        && layout.navRect.right > layout.profileRect.left
        && layout.navRect.top < layout.profileRect.bottom
        && layout.navRect.bottom > layout.profileRect.top,
      false,
      `${orientation}: navigation must not cover the profile`
    );
    assert.equal(
      layout.navRect.left < layout.connectionRect.right
        && layout.navRect.right > layout.connectionRect.left
        && layout.navRect.top < layout.connectionRect.bottom
        && layout.navRect.bottom > layout.connectionRect.top,
      false,
      `${orientation}: navigation must not cover the connection status`
    );
  };

  await assertReviewFormFits('portrait');
  await page.setViewportSize({ width: 844, height: 390 });
  await assertReviewFormFits('landscape');
  await page.getByRole('button', { name: 'VPN', exact: true }).click();
  await page.waitForURL(`${instance.baseUrl}/vpn`);
  await page.getByRole(
    'button',
    { name: '📋 Скопировать для Hiddify', exact: true }
  ).waitFor();
  assert.equal(await page.locator('a[href^="hiddify://"]').count(), 0);
  await page.getByText(
    'Скопируйте, сначала откройте Hiddify, затем нажмите «+» → «Из буфера».',
    { exact: true }
  ).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'Hiddify import controls must not overflow in landscape'
  );
  await page.getByRole('button', { name: 'Обзоры', exact: true }).click();
  await page.waitForURL(`${instance.baseUrl}/reviews`);
  const wineTab = page.getByRole('tab', { name: 'Вино', exact: true });
  await wineTab.click();
  await page.waitForURL(`${instance.baseUrl}/reviews/wine`);
  assert.equal(await wineTab.getAttribute('aria-selected'), 'true');

  assert.deepEqual(browserErrors, []);
});
