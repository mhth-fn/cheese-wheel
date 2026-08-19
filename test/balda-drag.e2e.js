'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');
const {
  login,
  startServer,
  stopServer,
} = require('./helpers/server-fixture');

const fsp = fs.promises;

test('Balda selects a complete path while a mouse button is held', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-balda-drag-'));
  const instance = await startServer(dataDir, { frontend: 'built' });
  let browser = null;
  t.after(async () => {
    await browser?.close();
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  const auth = await login(instance, 1);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'ru-RU',
    viewport: { width: 1280, height: 900 },
  });
  const [cookieName, cookieValue] = auth.cookie.split('=', 2);
  await context.addCookies([{
    name: cookieName,
    value: cookieValue,
    url: instance.baseUrl,
  }]);
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));

  await page.goto(instance.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Игры', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть игру', exact: true }).click();
  await page.getByRole('heading', { name: 'Балда · Комната 1', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Занять место', exact: true }).click();
  await page.getByLabel('На ход').selectOption('300');
  await page.getByRole('button', { name: 'Добавить Борхеса', exact: true }).click();
  await page.getByText('Ваш ход', { exact: true }).waitFor({ timeout: 5_000 });

  const cells = await page.locator('[data-balda-cell]').evaluateAll(elements => (
    elements.map(element => ({
      column: Number(element.dataset.column),
      filled: !element.getAttribute('aria-label').endsWith(', пусто'),
      row: Number(element.dataset.row),
    }))
  ));
  const byKey = new Map(cells.map(cell => [`${cell.row}:${cell.column}`, cell]));
  const candidates = [
    { placement: { row: 1, column: 0 }, columns: [0, 1, 2, 3, 4] },
    { placement: { row: 3, column: 0 }, columns: [0, 1, 2, 3, 4] },
    { placement: { row: 1, column: 4 }, columns: [4, 3, 2, 1, 0] },
    { placement: { row: 3, column: 4 }, columns: [4, 3, 2, 1, 0] },
  ];
  const candidate = candidates.find(item => (
    !byKey.get(`${item.placement.row}:${item.placement.column}`)?.filled
    && item.columns.every(column => byKey.get(`2:${column}`)?.filled)
  ));
  assert.ok(candidate, 'the starting row must have a free end for a six-cell path');
  const placement = candidate.placement;
  const pathCells = [
    placement,
    ...candidate.columns.map(column => ({ row: 2, column })),
  ];

  const placementCell = page.locator(
    `[data-row="${placement.row}"][data-column="${placement.column}"]`
  );
  const dragWord = async button => {
    await placementCell.click();
    await page.getByLabel('Новая буква', { exact: true }).fill('С');
    const points = [];
    for (const cell of pathCells) {
      const box = await page.locator(
        `[data-row="${cell.row}"][data-column="${cell.column}"]`
      ).boundingBox();
      assert.ok(box);
      points.push({
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      });
    }
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down({ button });
    for (const point of points.slice(1)) {
      await page.mouse.move(point.x, point.y, { steps: 4 });
    }
    await page.mouse.up({ button });
    assert.equal(await page.locator('.balda-cell.is-in-path').count(), pathCells.length);
    assert.equal(
      await page.getByRole('button', { name: 'Сыграть слово', exact: true }).isEnabled(),
      true,
    );
  };

  await dragWord('left');
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await dragWord('right');
  assert.deepEqual(browserErrors, []);
});
