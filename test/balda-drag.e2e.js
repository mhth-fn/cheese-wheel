'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');
const {
  createBaldaResources,
  findBotMove,
} = require('../server/balda-service');
const {
  login,
  startServer,
  stopServer,
} = require('./helpers/server-fixture');

const fsp = fs.promises;
const baldaResources = createBaldaResources();

function findUnknownMove(board) {
  const knownWords = new Set(baldaResources.builtInWords);
  const letters = [...'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const existingLetter = board[(row * 5) + column];
      if (!existingLetter) continue;
      for (const [rowDelta, columnDelta] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const placementRow = row + rowDelta;
        const placementColumn = column + columnDelta;
        if (placementRow < 0 || placementRow >= 5 || placementColumn < 0 || placementColumn >= 5) continue;
        if (board[(placementRow * 5) + placementColumn]) continue;
        const letter = letters.find(candidate => !knownWords.has(`${existingLetter}${candidate}`));
        if (!letter) continue;
        return {
          column: placementColumn,
          letter,
          path: [{ row, column }, { row: placementRow, column: placementColumn }],
          row: placementRow,
          word: `${existingLetter}${letter}`,
        };
      }
    }
  }
  throw new Error('Could not construct an unknown word');
}

test('Balda automatically plays known dragged words and clears unknown paths', async t => {
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
      letter: element.querySelector('span')?.textContent?.trim() || '',
      row: Number(element.dataset.row),
    }))
  ));
  const board = Array(25).fill('');
  for (const cell of cells) board[(cell.row * 5) + cell.column] = cell.letter;
  const initialWord = board.slice(10, 15).join('');
  const knownMove = findBotMove(
    board,
    [initialWord],
    baldaResources.dictionaryTrie,
    () => 0,
  );
  const unknownMove = findUnknownMove(board);
  assert.ok(knownMove, `a legal continuation must exist for ${initialWord}`);

  const dragMove = async (move, button) => {
    const placementCell = page.locator(
      `[data-row="${move.row}"][data-column="${move.column}"]`
    );
    await placementCell.click();
    await page.getByLabel('Новая буква', { exact: true }).fill(move.letter);
    const points = [];
    for (const cell of move.path) {
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
  };

  await dragMove(unknownMove, 'right');
  const rejectionFlash = page.locator('.balda-rejection-flash');
  await rejectionFlash.waitFor();
  await expectText(rejectionFlash, `Слова «${unknownMove.word}» нет в словаре`);
  await expectText(rejectionFlash, 'Выделение сброшено — попробуйте другое слово');
  await page.getByText('Слова нет в словаре', { exact: true }).waitFor();
  assert.equal(await page.locator('.balda-cell.is-in-path').count(), 0);
  assert.equal(await page.getByLabel('Новая буква', { exact: true }).inputValue(), unknownMove.letter);

  await dragMove(unknownMove, 'left');
  await page.getByText('Слова нет в словаре', { exact: true }).waitFor();
  assert.equal(await page.locator('.balda-cell.is-in-path').count(), 0);

  await dragMove(knownMove, 'left');
  await page.locator('.balda-history strong', { hasText: knownMove.word }).waitFor();
  assert.equal(await page.locator('.balda-cell.is-in-path').count(), 0);
  assert.equal(await page.locator(
    `[data-row="${knownMove.row}"][data-column="${knownMove.column}"] span`
  ).textContent(), knownMove.letter);
  assert.deepEqual(browserErrors, []);
});

async function expectText(locator, expected) {
  assert.match((await locator.textContent()) || '', new RegExp(expected));
}
