'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
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
  await profileButton.click();
  await page.getByRole('button', { name: /VPN/ }).waitFor();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Просмотренные', exact: true }).click();
  await page.waitForURL(`${instance.baseUrl}/watched`);
  await page.getByRole('list', { name: 'Все просмотренные фильмы' }).waitFor();
  await page.getByText('Browser Smoke Film', { exact: true }).waitFor();
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
  await page.getByRole('dialog').waitFor();
  assert.equal(
    await page.locator('.connection-status').evaluate(
      element => getComputedStyle(element).visibility
    ),
    'hidden',
    'connection status must be hidden behind a movie dialog'
  );
  await page.getByText('✕', { exact: true }).click();

  await page.getByRole('button', { name: 'Обзоры', exact: true }).click();
  await page.waitForURL(`${instance.baseUrl}/reviews`);
  await page.getByRole('heading', { name: 'Обзоры', exact: true }).waitFor();
  const wineTab = page.getByRole('tab', { name: 'Вино', exact: true });
  await wineTab.click();
  await page.waitForURL(`${instance.baseUrl}/reviews/wine`);
  assert.equal(await wineTab.getAttribute('aria-selected'), 'true');

  assert.deepEqual(browserErrors, []);
});
