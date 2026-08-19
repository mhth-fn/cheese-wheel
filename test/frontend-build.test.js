'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { resolveFrontendBuild } = require('../lib/frontend-build');

const fsp = fs.promises;

test('mobile viewport extends behind Safari controls without forcing a solid toolbar color', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /classList\.add\(['"]ios-safari['"]\)/);
  assert.doesNotMatch(html, /<meta\s+name=["']theme-color["']/i);
});

test('Safari mobile dock follows the viewport without scroll-position JavaScript', () => {
  const navComponent = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'Nav.jsx'),
    'utf8'
  );
  const navCss = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'css', 'nav.css'),
    'utf8'
  );

  assert.match(navComponent, /className=["']nav-pages-layer["']/);
  assert.doesNotMatch(navComponent, /visualViewport|--mobile-nav-top/);
  assert.match(
    navCss,
    /html\.ios-safari \.nav-pages-layer\s*\{[^}]*position:\s*fixed;[^}]*width:\s*0;/s
  );
  assert.match(
    navCss,
    /html\.ios-safari \.nav-pages\s*\{[^}]*position:\s*absolute;[^}]*100dvh/s
  );
});

test('mobile navigation stays hidden while Balda is open', () => {
  const baldaComponent = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'game', 'BaldaGame.jsx'),
    'utf8'
  );
  const navCss = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'css', 'nav.css'),
    'utf8'
  );

  assert.match(
    baldaComponent,
    /document\.body\.classList\.add\(['"]balda-game-active['"]\)/
  );
  assert.match(
    baldaComponent,
    /classList\.remove\(['"]balda-game-active['"]\)/
  );
  assert.match(
    navCss,
    /@media[\s\S]*body\.balda-game-active \.nav-pages\s*\{[^}]*display:\s*none;/
  );
});

test('Balda exposes two rooms and direct board input with drag selection', () => {
  const baldaComponent = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'game', 'BaldaGame.jsx'),
    'utf8'
  );
  const gamesCss = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'css', 'games.css'),
    'utf8'
  );

  assert.match(baldaComponent, /\[1, 2\]\.map\(nextRoomId/);
  assert.match(baldaComponent, /className="balda-room-tabs surface"/);
  assert.match(baldaComponent, /data-balda-cell/);
  assert.match(baldaComponent, /aria-label="Новая буква"/);
  assert.match(baldaComponent, /onPointerDown=\{handleBoardPointerDown\}/);
  assert.match(baldaComponent, /onPointerMove=\{handleBoardPointerMove\}/);
  assert.match(baldaComponent, /event\.button !== 0 && event\.button !== 2/);
  assert.match(baldaComponent, /onMouseDown=\{handleBoardMouseDown\}/);
  assert.match(baldaComponent, /onMouseMove=\{handleBoardMouseMove\}/);
  assert.match(baldaComponent, /onContextMenu=\{event => event\.preventDefault\(\)\}/);
  assert.match(baldaComponent, /onClick=\{\(\) => handleCellClick\(row, column\)\}/);
  assert.match(baldaComponent, /className="balda-rejection-flash"/);
  assert.match(baldaComponent, /Слова «\{unknownNotice\.word\}» нет в словаре/);
  assert.match(gamesCss, /@keyframes balda-rejection-flash/);
  assert.match(gamesCss, /\.balda-rejection-flash\s*\{[^}]*border:\s*5px solid var\(--color-danger\)/s);
  assert.doesNotMatch(baldaComponent, /<label>\s*Новая буква/);
});

test('desktop navigation fills the header with equal menu targets', () => {
  const navComponent = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'Nav.jsx'),
    'utf8'
  );
  const navCss = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'css', 'nav.css'),
    'utf8'
  );

  assert.match(
    navComponent,
    /<header className="nav">[\s\S]*<nav className="nav-pages-layer" aria-label="Основные разделы">/,
    'the user panel should sit beside the primary navigation in the header'
  );
  assert.match(
    navComponent,
    /data-page-count=\{pages\.length\}/,
    'dense navigation should expose its page count for compact labels'
  );
  assert.match(
    navCss,
    /\.nav\s*\{[^}]*gap:\s*var\(--space-4\);/s,
    'header panels should keep a fixed 16px gap'
  );
  assert.match(
    navCss,
    /\.nav-pages\s*\{[^}]*flex:\s*1 1 0;/s,
    'main navigation should fill the available header width'
  );
  assert.match(
    navCss,
    /\.nav-btn\s*\{[^}]*flex:\s*1 1 0;/s,
    'navigation targets should share the available width equally'
  );
  assert.match(
    navCss,
    /\.nav-user\s*\{[^}]*flex:\s*0 0 auto;[^}]*align-self:\s*stretch;/s,
    'the user panel should keep its content width and match navigation height'
  );
  assert.match(
    navCss,
    /@container\s*\(max-width:\s*1020px\)[\s\S]*\.nav-pages\[data-page-count='6'\]\s+\.nav-label-full\s*\{[^}]*display:\s*none;/,
    'dense navigation should use compact labels before text can overflow'
  );
});

test('mobile wheel tabs use explicit names and keep counters inside their buttons', () => {
  const drawer = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'DrawerPanel.jsx'),
    'utf8'
  );
  const moviesCss = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'css', 'movies.css'),
    'utf8'
  );

  assert.match(drawer, /key:\s*'participants',\s*label:\s*'Текущее колесо'/);
  assert.match(drawer, /key:\s*'next',\s*label:\s*'Следующее колесо'/);
  assert.match(
    moviesCss,
    /\.wm-tab-count\s*\{[^}]*position:\s*static;[^}]*order:\s*-1;[^}]*transform:\s*none;/s
  );
  assert.doesNotMatch(
    moviesCss,
    /\.wm-tab-count\s*\{[^}]*position:\s*absolute;[^}]*translate\(/s
  );
});

test('movie cards expose safe Kinopoisk and IMDb searches for every title', async () => {
  const linksModule = pathToFileURL(path.join(
    __dirname,
    '..',
    'src',
    'features',
    'movies',
    'movieLinks.mjs'
  )).href;
  const { imdbMovieUrl, kinopoiskMovieUrl } = await import(linksModule);
  const movie = {
    title: 'Чужой',
    alternative_title: 'Alien',
    year: 1979,
  };

  assert.equal(
    kinopoiskMovieUrl(movie),
    'https://www.kinopoisk.ru/index.php?kp_query=%D0%A7%D1%83%D0%B6%D0%BE%D0%B9%201979'
  );
  assert.equal(
    imdbMovieUrl(movie),
    'https://www.imdb.com/find/?q=Alien%201979&s=tt'
  );

  const component = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'movies', 'MovieExternalLinks.jsx'),
    'utf8'
  );
  assert.match(component, /target="_blank"/);
  assert.match(component, /rel="noopener noreferrer"/);
});

test('startup shows an animated cheese wheel illustration instead of initials', () => {
  const appView = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'AppView.jsx'),
    'utf8'
  );
  const authPage = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'AuthPage.jsx'),
    'utf8'
  );
  const wheel = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'MiniCheeseWheel.jsx'),
    'utf8'
  );
  const authCss = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'css', 'auth.css'),
    'utf8'
  );
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.match(
    appView,
    /<MiniCheeseWheel\s+spinning\s+onReady=\{\(\) => setImageReady\(true\)\}\s*\/>/s
  );
  assert.match(authPage, /<MiniCheeseWheel\s*\/>/);
  assert.doesNotMatch(appView, />СК</);
  assert.doesNotMatch(authPage, />СК</);
  assert.match(wheel, /<img[\s\S]*src=["']\/cheese-loader\.png["']/);
  assert.doesNotMatch(wheel, /<svg|mini-cheese-pointer/);
  assert.match(html, /<link rel="preload" as="image" href="\/cheese-loader\.png">/);
  assert.match(appView, /<h1 className="auth-title">Сырное колесо<\/h1>/);
  assert.doesNotMatch(appView, /Собираем компанию|Загружаем участников/);
  assert.match(appView, /STARTUP_SPLASH_MIN_MS\s*=\s*1000/);
  assert.match(
    appView,
    /!imageReady \|\| !minimumElapsed \|\| usersLoadState === 'loading'/
  );
  assert.match(appView, /startup-splash.*imageReady \? ' is-ready'/);
  assert.match(
    authCss,
    /\.startup-splash\s*\{[^}]*position:\s*fixed;[^}]*background:\s*var\(--theme-bg\);/s
  );
  assert.match(
    authCss,
    /\.startup-splash\.is-ready > \.mini-cheese-wheel,[\s\S]*opacity:\s*1;/
  );
  assert.match(
    authCss,
    /\.mini-cheese-wheel\.is-spinning\s*\{[^}]*animation:\s*miniCheeseLoaderFloat/s
  );
  assert.match(authCss, /@keyframes miniCheeseLoaderFloat/);
});

test('production refuses to start without the current frontend build', async t => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-frontend-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  assert.throws(
    () => resolveFrontendBuild(root, 'production'),
    /Production frontend build is missing/
  );
});

test('development never treats public legacy files as a frontend build', async t => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-frontend-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  await fsp.mkdir(path.join(root, 'public'), { recursive: true });
  await fsp.writeFile(path.join(root, 'public', 'index.html'), 'retired interface');

  const missing = resolveFrontendBuild(root, 'development');
  assert.equal(missing.available, false);

  await fsp.mkdir(path.join(root, 'dist'), { recursive: true });
  await fsp.writeFile(path.join(root, 'dist', 'index.html'), 'current interface');

  const current = resolveFrontendBuild(root, 'production');
  assert.equal(current.available, true);
  assert.equal(current.indexPath, path.join(root, 'dist', 'index.html'));

  const explicitlyMissing = resolveFrontendBuild(
    root,
    'test',
    path.join(root, 'test-disabled-dist')
  );
  assert.equal(explicitlyMissing.available, false);
});
