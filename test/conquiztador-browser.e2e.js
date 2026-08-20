'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');
const {
  startServer,
  stopServer,
} = require('./helpers/server-fixture');

const fsp = fs.promises;
const ACTIVE_SAVE_KEY = 'cheese-wheel:conquiztador:active:v1:guest';

function collectBrowserErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (
      message.type() === 'error'
      && !message.text().startsWith('Failed to load resource:')
    ) {
      errors.push(message.text());
    }
  });
  return errors;
}

async function enterDirectlyAsGuest(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);

  const guestResponsePromise = page.waitForResponse(candidate => (
    candidate.request().method() === 'POST'
    && new URL(candidate.url()).pathname === '/api/auth/guest'
  ));
  await page.getByRole('button', { name: 'Войти как гость', exact: true }).click();
  const guestResponse = await guestResponsePromise;
  assert.equal(
    guestResponse.status(),
    200,
    `guest login failed: ${await guestResponse.text()}`
  );
  await page.getByRole('heading', { name: 'ConQUIZtador', exact: true }).waitFor();
}

async function startGame(page, playerName) {
  await page.getByLabel('Ваше имя', { exact: true }).fill(playerName);
  await page.getByRole('button', { name: 'Начать игру', exact: true }).click();
  await page.locator('.cq-game-shell').waitFor();
  assert.equal(await page.locator('.cq-territory').count(), 18);
}

async function chooseFirstLegalTerritory(page) {
  const territory = page.locator('.cq-territory.is-legal').first();
  await territory.waitFor();
  await territory.click({ force: true });
}

async function readSavedGame(page) {
  return page.evaluate(key => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, ACTIVE_SAVE_KEY);
}

async function answerQuestion(page, state) {
  const dialog = page.getByRole('dialog');
  if (state.activeQuestion.type === 'ESTIMATION') {
    await dialog.getByLabel('Ваш числовой ответ', { exact: true }).fill(
      String(state.activeQuestion.correctValue)
    );
    await dialog.getByRole('button', { name: 'Ответить', exact: true }).click();
    return;
  }
  await dialog.locator('.cq-answer-button').nth(state.activeQuestion.correctAnswer).click();
}

async function driveGameToSummary(page) {
  const deadline = Date.now() + 45_000;
  let lastState = null;

  while (Date.now() < deadline) {
    if (await page.locator('.cq-finished').count()) return;

    const state = await readSavedGame(page);
    if (!state) {
      await page.waitForTimeout(25);
      continue;
    }
    lastState = {
      phase: state.phase,
      step: state.step,
      round: state.round,
      currentPlayer: state.players[state.currentPlayerIndex]?.id,
      question: state.activeQuestion?.id,
    };

    if (
      ['EXPANSION', 'DISTRIBUTION', 'WAR'].includes(state.phase)
      && state.step === 'SELECT_TERRITORY'
    ) {
      assert.equal(lastState.currentPlayer, 'human');
      await chooseFirstLegalTerritory(page);
    } else if (state.phase === 'WAR' && state.step === 'CONFIRM_ATTACK') {
      await page.getByRole('dialog').getByRole(
        'button',
        { name: 'Атаковать', exact: true }
      ).click();
    } else if (
      ['QUESTION', 'TIEBREAK'].includes(state.step)
      && state.activeQuestion
      && await page.getByRole('dialog').count()
    ) {
      await answerQuestion(page, state);
    }

    await page.waitForTimeout(25);
  }

  throw new Error(
    `Game did not reach its summary; last state: ${JSON.stringify(lastState)}`
  );
}

test('ConQUIZtador supports guest play, refresh restore, full completion, and mobile', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-conquiztador-browser-'));
  const instance = await startServer(dataDir, { frontend: 'built' });
  let browser = null;
  t.after(async () => {
    await browser?.close();
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  browser = await chromium.launch({ headless: true });

  const restoreContext = await browser.newContext({
    locale: 'ru-RU',
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 900 },
  });
  const restorePage = await restoreContext.newPage();
  const restoreErrors = collectBrowserErrors(restorePage);
  await enterDirectlyAsGuest(restorePage, `${instance.baseUrl}/conquiztador`);
  assert.equal(new URL(restorePage.url()).pathname, '/conquiztador');
  await startGame(restorePage, 'Хронист E2E');
  await chooseFirstLegalTerritory(restorePage);
  await chooseFirstLegalTerritory(restorePage);
  await restorePage.getByRole('dialog').getByRole(
    'group',
    { name: 'Варианты ответа' }
  ).waitFor();
  await restorePage.waitForFunction(key => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    return state?.phase === 'EXPANSION' && state?.step === 'QUESTION';
  }, ACTIVE_SAVE_KEY);

  const beforeReload = await restorePage.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    return {
      deadlineAt: state.questionDeadlineAt,
      durationMs: state.questionDurationMs,
      remainingMs: state.questionDeadlineAt - Date.now(),
      sequence: state.activeQuestion.sequence,
    };
  }, ACTIVE_SAVE_KEY);
  assert.equal(beforeReload.durationMs, 10_000);
  assert.ok(beforeReload.remainingMs > 5_000);

  await restorePage.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = await restorePage.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    return {
      deadlineAt: state.questionDeadlineAt,
      remainingMs: state.questionDeadlineAt - Date.now(),
      sequence: state.activeQuestion.sequence,
    };
  }, ACTIVE_SAVE_KEY);
  assert.equal(afterReload.deadlineAt, beforeReload.deadlineAt);
  assert.equal(afterReload.sequence, beforeReload.sequence);
  assert.ok(
    afterReload.remainingMs < beforeReload.remainingMs,
    'refresh must consume time from the original question deadline'
  );
  await restorePage.getByRole('dialog').getByRole(
    'group',
    { name: 'Варианты ответа' }
  ).waitFor();
  assert.deepEqual(restoreErrors, []);
  await restoreContext.close();

  const completionContext = await browser.newContext({
    locale: 'ru-RU',
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 900 },
  });
  await completionContext.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay = 0, ...args) => nativeSetTimeout(
      callback,
      delay >= 100 && delay <= 3_500 ? Math.min(delay, 50) : delay,
      ...args
    );
  });
  const completionPage = await completionContext.newPage();
  const completionErrors = collectBrowserErrors(completionPage);
  await enterDirectlyAsGuest(
    completionPage,
    `${instance.baseUrl}/conquiztador?conquizDev=1`
  );
  assert.equal(new URL(completionPage.url()).searchParams.get('conquizDev'), '1');
  await startGame(completionPage, 'Завоеватель E2E');
  await completionPage.waitForFunction(key => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    return state?.questionDurationMs === 10_000;
  }, ACTIVE_SAVE_KEY);
  assert.equal(
    await completionPage.getByLabel('Инструменты разработчика').count(),
    0,
    'production build must keep DEV controls hidden'
  );
  await chooseFirstLegalTerritory(completionPage);
  await completionPage.waitForFunction(key => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    return state?.phase === 'EXPANSION';
  }, ACTIVE_SAVE_KEY);
  await driveGameToSummary(completionPage);
  await completionPage.getByText('Партия завершена', { exact: true }).waitFor();
  await completionPage.locator('.cq-final-table').waitFor();
  assert.deepEqual(completionErrors, []);
  await completionContext.close();

  const mobileContext = await browser.newContext({
    locale: 'ru-RU',
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  const mobilePage = await mobileContext.newPage();
  const mobileErrors = collectBrowserErrors(mobilePage);
  await enterDirectlyAsGuest(
    mobilePage,
    `${instance.baseUrl}/conquiztador?conquizDev=1`
  );
  await startGame(mobilePage, 'Мобильный E2E');
  assert.equal(await mobilePage.locator('.cq-territory').count(), 18);
  assert.equal(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'ConQUIZtador must not create horizontal page overflow at 390px'
  );
  await chooseFirstLegalTerritory(mobilePage);
  await mobilePage.getByText('Этап II · Захват земель', { exact: false }).waitFor();
  assert.deepEqual(mobileErrors, []);
  await mobileContext.close();
});
