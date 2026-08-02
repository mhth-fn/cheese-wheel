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

test('one-off elimination waits for a manual click before each round', async t => {
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

  const movieRows = replacement.locator('.one-off-table tbody tr');
  const movieCaption = replacement.locator('.one-off-table caption');
  assert.equal(await movieRows.count(), 3);
  assert.equal((await movieCaption.textContent()).trim(), 'Фильмы: 3');

  const spinButton = page.getByRole('button', { name: 'Крутить разовое колесо' });
  await spinButton.click();
  await page.getByText('Сейчас выбывает один фильм', { exact: true }).waitFor();
  const stateDuringFirstSpin = await request(instance, '/api/one-off-wheel', {
    cookie: admin.cookie,
  });
  assert.equal(stateDuringFirstSpin.status, 200);
  assert.equal(stateDuringFirstSpin.payload.movies.length, 2);
  assert.equal(await movieRows.count(), 3, 'the table must keep the spin snapshot');
  assert.equal((await movieCaption.textContent()).trim(), 'Фильмы: 3');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await replacement.waitFor();
  await page.getByText('Сейчас выбывает один фильм', { exact: true }).waitFor();
  await replacement.locator('.cheese-wheel-stage.is-spinning').waitFor();
  assert.equal(await movieRows.count(), 3, 'reload must restore the active spin snapshot');
  assert.equal((await movieCaption.textContent()).trim(), 'Фильмы: 3');

  const eliminatedRow = replacement.locator('.one-off-table tr.is-eliminated');
  await eliminatedRow.waitFor({ timeout: 9_000 });
  assert.equal(
    await eliminatedRow.getByText('ВЫБЫЛ', { exact: true }).isVisible(),
    true
  );
  assert.equal(await movieRows.count(), 3, 'the eliminated row stays during reveal');
  assert.equal((await movieCaption.textContent()).trim(), 'Фильмы: 3');

  await page.getByText(
    'Нажмите на центр колеса для следующего раунда',
    { exact: true }
  ).waitFor({ timeout: 9_000 });
  assert.equal(await movieRows.count(), 2);
  assert.equal((await movieCaption.textContent()).trim(), 'Фильмы: 2');
  assert.equal(await eliminatedRow.count(), 0);
  assert.equal(await replacement.isVisible(), true);
  assert.equal(await spinButton.isEnabled(), true);

  await spinButton.click();
  await page.getByText('Сейчас выбывает один фильм', { exact: true }).waitFor();
  const stateDuringFinalSpin = await request(instance, '/api/one-off-wheel', {
    cookie: admin.cookie,
  });
  assert.equal(stateDuringFinalSpin.status, 200);
  assert.equal(stateDuringFinalSpin.payload.movies.length, 1);
  assert.equal(await movieRows.count(), 2, 'the final spin must also keep its snapshot');
  assert.equal((await movieCaption.textContent()).trim(), 'Фильмы: 2');

  await eliminatedRow.waitFor({ timeout: 9_000 });
  assert.equal(await movieRows.count(), 2, 'the final eliminated row stays during reveal');
  assert.equal((await movieCaption.textContent()).trim(), 'Фильмы: 2');
  await replacement.waitFor({ state: 'detached', timeout: 16_000 });
  await page.locator('.wheel-page-layout').waitFor();
  assert.equal(await page.locator('.one-off-replacement').count(), 0);
  await page.locator('.one-off-result-card').waitFor();

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
