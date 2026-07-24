'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseWebhookUrl, sendBackupAlert } = require('../scripts/backup-alert');

test('backup alert only accepts Discord HTTPS webhook URLs', () => {
  assert.equal(
    parseWebhookUrl('https://discord.com/api/webhooks/123/token').hostname,
    'discord.com'
  );
  assert.throws(
    () => parseWebhookUrl('http://discord.com/api/webhooks/123/token'),
    /HTTPS Discord webhook/
  );
  assert.throws(
    () => parseWebhookUrl('https://example.com/api/webhooks/123/token'),
    /HTTPS Discord webhook/
  );
});

test('backup alert sends a non-mentioning diagnostic message', async () => {
  let request;
  await sendBackupAlert('cheese-wheel-backup.service', {
    env: {
      BACKUP_ALERT_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/token',
    },
    hostname: 'backup-host',
    now: new Date('2026-07-25T12:00:00Z'),
    fetch: async (url, options) => {
      request = { url: String(url), options };
      return { ok: true, status: 204 };
    },
  });

  assert.equal(request.url, 'https://discord.com/api/webhooks/123/token');
  const body = JSON.parse(request.options.body);
  assert.match(body.content, /cheese-wheel-backup\.service/);
  assert.match(body.content, /backup-host/);
  assert.deepEqual(body.allowed_mentions, { parse: [] });
});
