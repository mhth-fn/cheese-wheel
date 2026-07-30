'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
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
