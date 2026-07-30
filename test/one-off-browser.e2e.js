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
} = require('./helpers/server-fixture');

const fsp = fs.promises;

test('one-off selection uses one spin and elimination continues until a winner', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-one-off-browser-'));
  const instance = await startServer(dataDir, { frontend: 'built' });
  let browser = null;
  t.after(async () => {
    await browser?.close();
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  const admin = await login(instance, 2);
  const settings = await request(instance, '/api/one-off-wheel/settings', {
    method: 'PATCH',
    cookie: admin.cookie,
    body: {
      enabled: true,
      mode: 'elimination',
      spin_duration: 5,
    },
  });
  assert.equal(settings.status, 200, JSON.stringify(settings.payload));
  for (const title of ['Разовый фильм A', 'Разовый фильм B']) {
    const added = await request(instance, '/api/one-off-wheel', {
      method: 'POST',
      cookie: admin.cookie,
      body: { title },
    });
    assert.equal(added.status, 200, JSON.stringify(added.payload));
  }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ru-RU',
    reducedMotion: 'reduce',
  });
  const [cookieName, cookieValue] = admin.cookie.split('=', 2);
  await context.addCookies([{
    name: cookieName,
    value: cookieValue,
    url: instance.baseUrl,
  }]);
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

  await page.goto(instance.baseUrl, { waitUntil: 'domcontentloaded' });
  const replacement = page.locator('.one-off-replacement');
  await replacement.waitFor();
  await page.getByText('Разовое колесо', { exact: true }).waitFor();
  assert.equal(await replacement.locator('canvas').count(), 1);
  assert.equal(await page.locator('.wheel-page-layout').count(), 0);

  const wheelBox = await page.locator('.one-off-main').boundingBox();
  const menuBox = await page.locator('.one-off-panel').boundingBox();
  assert.ok(wheelBox && menuBox);
  assert.ok(menuBox.x > wheelBox.x, 'one-off menu must be to the right of the wheel');

  const modeSelect = page.getByLabel('Режим');
  const selectionModeResponse = page.waitForResponse(response => (
    response.request().method() === 'PATCH'
    && new URL(response.url()).pathname === '/api/one-off-wheel/settings'
  ));
  await modeSelect.selectOption('selection');
  assert.equal((await selectionModeResponse).status(), 200);
  const eliminationModeResponse = page.waitForResponse(response => (
    response.request().method() === 'PATCH'
    && new URL(response.url()).pathname === '/api/one-off-wheel/settings'
  ));
  await modeSelect.selectOption('elimination');
  assert.equal((await eliminationModeResponse).status(), 200);

  const duration = page.getByLabel('Время прокрутки разового колеса');
  const durationResponse = page.waitForResponse(response => (
    response.request().method() === 'PATCH'
    && new URL(response.url()).pathname === '/api/one-off-wheel/settings'
  ));
  await duration.fill('6');
  assert.equal((await durationResponse).status(), 200);

  await page.getByLabel('Добавить фильм').fill('Разовый фильм D');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByText('Разовый фильм D', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'Крутить разовое колесо' }).click();
  await page.getByText('Крутится до выбора одного фильма', { exact: true }).waitFor();
  await replacement.waitFor({ state: 'detached', timeout: 16_000 });
  await page.locator('.wheel-page-layout').waitFor();
  assert.equal(await page.getByText('Разовое колесо', { exact: true }).count(), 0);

  const state = await request(instance, '/api/one-off-wheel', {
    cookie: admin.cookie,
  });
  assert.equal(state.status, 200);
  assert.equal(state.payload.enabled, false);
  assert.equal(state.payload.elimination_active, false);
  assert.equal(state.payload.movies.length, 1);
  assert.ok(state.payload.result?.movie);
  assert.deepEqual(browserErrors, []);
});
