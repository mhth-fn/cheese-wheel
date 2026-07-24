#!/usr/bin/env node
'use strict';

const os = require('os');

const UNIT_NAME_RE = /^[A-Za-z0-9@_.-]{1,160}$/;
const ALLOWED_WEBHOOK_HOSTS = new Set([
  'discord.com',
  'www.discord.com',
  'discordapp.com',
  'www.discordapp.com',
]);

function parseWebhookUrl(value) {
  if (!value) throw new Error('BACKUP_ALERT_WEBHOOK_URL is not configured');

  let webhook;
  try {
    webhook = new URL(value);
  } catch {
    throw new Error('BACKUP_ALERT_WEBHOOK_URL is invalid');
  }
  if (
    webhook.protocol !== 'https:'
    || !ALLOWED_WEBHOOK_HOSTS.has(webhook.hostname)
    || !webhook.pathname.startsWith('/api/webhooks/')
  ) {
    throw new Error('BACKUP_ALERT_WEBHOOK_URL must be an HTTPS Discord webhook');
  }
  return webhook;
}

async function sendBackupAlert(unitName, options = {}) {
  if (!UNIT_NAME_RE.test(unitName || '')) {
    throw new Error('Invalid failed systemd unit name');
  }

  const environment = options.env || process.env;
  const webhook = parseWebhookUrl(environment.BACKUP_ALERT_WEBHOOK_URL);
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('A Fetch API implementation is required');
  }

  const hostname = (options.hostname || os.hostname()).replace(/[^A-Za-z0-9_.-]/g, '?');
  const occurredAt = (options.now || new Date()).toISOString();
  const response = await fetchImpl(webhook, {
    method: 'POST',
    redirect: 'error',
    signal: options.signal || AbortSignal.timeout(10_000),
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      content: [
        '🚨 Резервное копирование «Сырного колеса» завершилось ошибкой.',
        `Сервис: ${unitName}`,
        `Сервер: ${hostname}`,
        `Время: ${occurredAt}`,
        'Проверьте: journalctl -u ' + unitName,
      ].join('\n'),
      allowed_mentions: { parse: [] },
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord rejected the backup alert with HTTP ${response.status}`);
  }
}

if (require.main === module) {
  sendBackupAlert(process.argv[2])
    .then(() => {
      console.log('[cheese-wheel] Backup failure alert delivered.');
    })
    .catch(error => {
      console.error(`[cheese-wheel] Could not deliver backup alert: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  parseWebhookUrl,
  sendBackupAlert,
};
