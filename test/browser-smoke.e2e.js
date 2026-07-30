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
const browserSiqFile = Buffer.from([
  0x50, 0x4b, 0x05, 0x06,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

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
    userAgent: [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
      'AppleWebKit/605.1.15 (KHTML, like Gecko)',
      'Version/26.0 Mobile/15E148 Safari/604.1',
    ].join(' '),
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

  await page.getByRole('button', { name: 'Паки SIGame', exact: true }).click();
  await page.waitForURL(`${instance.baseUrl}/sigame`);
  await page.getByRole('heading', { name: 'Паки SIGame', exact: true }).waitFor();
  const sigameSort = page.locator('.sigame-sort select');
  assert.deepEqual(
    await sigameSort.locator('option').allTextContents(),
    ['Сначала новые', 'Сначала старые', 'По названию А–Я', 'По названию Я–А']
  );
  assert.equal(
    (await sigameSort.locator('option').allTextContents())
      .some(label => label.toLocaleLowerCase('ru-RU').includes('оценк')),
    false
  );

  await page.getByRole('button', { name: 'Добавить пак', exact: true }).click();
  const sigameDialog = page.getByRole('dialog', { name: 'Добавить пак' });
  await sigameDialog.waitFor();
  const addPackButton = sigameDialog.getByRole(
    'button',
    { name: 'Добавить в библиотеку', exact: true }
  );
  assert.equal(await addPackButton.isDisabled(), true);
  await sigameDialog.locator('input[type="file"]').setInputFiles({
    name: 'Browser Smoke.siq',
    mimeType: 'application/octet-stream',
    buffer: browserSiqFile,
  });
  await sigameDialog.getByLabel('Название *').fill('Browser Smoke Pack');
  await sigameDialog.getByLabel('Теги через запятую, до 9').fill('кино, сложный, КИНО');
  assert.equal(await addPackButton.isEnabled(), true);
  await addPackButton.click();

  const sigameCard = page.locator('.sigame-card', { hasText: 'Browser Smoke Pack' });
  await sigameCard.waitFor();
  await page.getByRole('tab', { name: 'Не сыграны 1', exact: true }).waitFor();
  const sigameSearch = page.getByPlaceholder('Название или тег…');
  await sigameSearch.fill('browser smoke');
  await sigameCard.waitFor();
  await sigameSearch.fill('кино');
  await sigameCard.waitFor();
  await sigameSearch.fill('ничего-похожего');
  await page.getByRole(
    'heading',
    { name: 'По вашему запросу ничего не найдено', exact: true }
  ).waitFor();
  await sigameSearch.fill('');
  await sigameCard.getByRole(
    'button',
    { name: 'Отметить сыгранным', exact: true }
  ).click();
  await page.getByRole('tab', { name: 'Не сыграны 0', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Сыгранные 1', exact: true }).click();
  await sigameCard.waitFor();
  assert.deepEqual(
    await sigameSort.locator('option').allTextContents(),
    [
      'Недавно сыгранные',
      'Давно сыгранные',
      'С высокой оценкой',
      'С низкой оценкой',
      'По названию А–Я',
      'По названию Я–А',
    ]
  );
  await sigameCard.locator('.sigame-rating-control select').selectOption('9');
  await sigameCard.getByText('9.0', { exact: true }).waitFor();
  await sigameCard.getByRole(
    'button',
    { name: 'Вернуть в несыгранные', exact: true }
  ).click();
  await page.getByRole('tab', { name: 'Сыгранные 0', exact: true }).waitFor();

  await page.getByRole('button', { name: 'Просмотренные', exact: true }).click();
  await page.waitForURL(`${instance.baseUrl}/watched`);
  await page.getByRole('list', { name: 'Все просмотренные фильмы' }).waitFor();
  await page.locator('.watched-card-title strong', { hasText: 'Browser Smoke Film' }).waitFor();
  const userFilters = page.getByRole('group', { name: 'Выбор участников статистики' });
  const searchBox = await page.locator('.watched-toolbar').boundingBox();
  const filtersBox = await page.locator('.watched-scope-control').boundingBox();
  assert.ok(
    searchBox && filtersBox && filtersBox.y >= searchBox.y + searchBox.height,
    'user filter chips must appear below movie search'
  );
  assert.equal(
    await page.locator('.watched-scope-control').evaluate(element => (
      getComputedStyle(element).backgroundColor
    )),
    'rgba(0, 0, 0, 0)',
    'user filter chips must not have a shared background'
  );
  assert.equal(
    await userFilters.getByRole('button', { name: 'Сергей', exact: true }).count(),
    0,
    'current user must not appear among filter chips'
  );
  const antonFilter = userFilters.getByRole('button', { name: 'Антон', exact: true });
  await antonFilter.click();
  assert.equal(await antonFilter.getAttribute('aria-pressed'), 'false');
  await page.getByRole('list', { name: 'Просмотренные фильмы выбранных участников' }).waitFor();
  await page.getByRole('button', { name: 'Показать всех', exact: true }).click();
  await page.getByRole('list', { name: 'Все просмотренные фильмы' }).waitFor();
  const personalStatsButton = userFilters.getByRole(
    'button',
    { name: 'МОЯ СТАТИСТИКА', exact: true }
  );
  await personalStatsButton.click();
  await page.getByRole('list', { name: 'Фильмы с моими оценками' }).waitFor();
  assert.equal(await personalStatsButton.getAttribute('aria-pressed'), 'true');
  await antonFilter.click();
  await page.getByRole('list', { name: 'Фильмы с моими оценками' }).waitFor();
  assert.equal(await personalStatsButton.getAttribute('aria-pressed'), 'true');
  assert.equal(await antonFilter.getAttribute('aria-pressed'), 'false');
  await personalStatsButton.click();
  await page.getByRole(
    'list',
    { name: 'Просмотренные фильмы выбранных участников' }
  ).waitFor();
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
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.getByRole('button', { name: 'Обзоры', exact: true }).click();
  await page.waitForURL(`${instance.baseUrl}/reviews`);
  await page.getByRole('heading', { name: 'Обзоры', exact: true }).waitFor();
  const titleInput = page.getByLabel('Название фильма *');
  const reviewForm = page.locator('.review-form');
  await titleInput.waitFor();
  await titleInput.fill('Очень длинное название фильма, которое должно оставаться внутри формы');

  await page.evaluate(() => {
    const maxScroll = Math.max(
      0,
      (document.scrollingElement?.scrollHeight || document.body.scrollHeight)
        - window.innerHeight
    );
    window.scrollTo(0, Math.min(520, Math.max(0, maxScroll - 80)));
  });
  await page.waitForFunction(() => (
    document.querySelector('.nav-pages')?.classList.contains('is-hidden')
  ));
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForFunction(() => (
    !document.querySelector('.nav-pages')?.classList.contains('is-hidden')
  ));
  await page.waitForFunction(() => (
    document.querySelector('.nav-pages')?.classList.contains('is-hidden')
    && Number.parseFloat(getComputedStyle(document.querySelector('.admin-btn')).opacity) < 0.05
    && getComputedStyle(document.querySelector('.nav-pages')).visibility === 'hidden'
    && getComputedStyle(document.querySelector('.admin-btn')).visibility === 'hidden'
  ), null, { timeout: 3000 });
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForFunction(() => (
    !document.querySelector('.nav-pages')?.classList.contains('is-hidden')
  ));

  const assertReviewFormFits = async orientation => {
    const layout = await page.evaluate(() => {
      const form = document.querySelector('.review-form');
      const input = document.querySelector('#movie-review-title');
      const nav = document.querySelector('.nav-pages');
      const navLayer = document.querySelector('.nav-pages-layer');
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
        navLayerPosition: navLayer ? getComputedStyle(navLayer).position : null,
        navLayerBackground: navLayer ? getComputedStyle(navLayer).backgroundColor : null,
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
    assert.equal(
      layout.navPosition,
      'absolute',
      `${orientation}: iOS navigation must avoid Safari fixed-edge tinting`
    );
    assert.equal(
      layout.navLayerPosition,
      'fixed',
      `${orientation}: the transparent navigation layer must move natively`
    );
    assert.equal(
      layout.navLayerBackground,
      'rgba(0, 0, 0, 0)',
      `${orientation}: the fixed navigation layer must stay transparent`
    );
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
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForFunction(() => (
    !document.querySelector('.nav-pages')?.classList.contains('is-hidden')
  ));
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

  await page.setViewportSize({ width: 390, height: 844 });
  const auditTheme = async (optionName, className) => {
    await page.getByRole('button', { name: 'Открыть админ-панель' }).click();
    const adminDialog = page.getByRole('dialog', { name: '⚙️ Админ-панель' });
    await adminDialog.waitFor();
    await adminDialog.getByRole('button', { name: new RegExp(optionName) }).click();
    await page.waitForFunction(
      expectedClass => document.body.classList.contains(expectedClass),
      className
    );
    const themeAudit = await page.evaluate(() => {
      const parseRgb = value => {
        const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
        return channels?.length === 3 ? channels : null;
      };
      const luminance = channels => {
        const linear = channels.map(channel => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      };
      const ratio = (foreground, background) => {
        const foregroundLuminance = luminance(parseRgb(foreground));
        const backgroundLuminance = luminance(parseRgb(background));
        return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
          / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
      };
      const probePair = (foregroundToken, backgroundToken) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${foregroundToken})`;
        probe.style.backgroundColor = `var(${backgroundToken})`;
        document.body.append(probe);
        const styles = getComputedStyle(probe);
        const result = ratio(styles.color, styles.backgroundColor);
        probe.remove();
        return result;
      };
      const dialog = document.querySelector('.admin-modal-content');
      return {
        textOnSurface: probePair('--color-text', '--color-surface'),
        mutedOnSurface: probePair('--color-text-muted', '--color-surface'),
        textOnPrimary: probePair('--color-on-primary', '--color-primary'),
        dialogFits: Boolean(
          dialog
          && dialog.scrollWidth <= dialog.clientWidth
          && document.documentElement.scrollWidth <= window.innerWidth
        ),
      };
    });
    assert.ok(themeAudit.textOnSurface >= 7, `${optionName}: main text contrast is too low`);
    assert.ok(themeAudit.mutedOnSurface >= 4.5, `${optionName}: muted text contrast is too low`);
    assert.ok(themeAudit.textOnPrimary >= 4.5, `${optionName}: button text contrast is too low`);
    assert.equal(themeAudit.dialogFits, true, `${optionName}: admin dialog must fit mobile viewport`);
    await adminDialog.getByRole('button', { name: 'Закрыть админ-панель' }).click();
  };

  await auditTheme('Новогодняя тема', 'theme-newyear');
  await auditTheme('Весенняя тема', 'theme-spring');
  await auditTheme('Самурайская тема', 'theme-samurai');
  const samuraiPetals = page.locator('.samurai-petal');
  assert.equal(await samuraiPetals.count(), 32);
  assert.equal(
    await samuraiPetals.first().evaluate(element => getComputedStyle(element).animationName),
    'samuraiPetalFall'
  );
  await page.goto(instance.baseUrl, { waitUntil: 'domcontentloaded' });
  const samuraiSunIcon = page.locator('.wheel-not-ready-icon.is-samurai-sun');
  await samuraiSunIcon.waitFor();
  assert.equal(await samuraiSunIcon.count(), 1);
  await auditTheme('Сырная тема', 'theme-cheese');

  assert.deepEqual(browserErrors, []);
});
