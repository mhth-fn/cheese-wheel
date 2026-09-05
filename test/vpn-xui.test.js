'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { X509Certificate } = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createVpnService } = require('../server/vpn-service');

test('VLESS provisioning supports legacy sessions and v3 token API without weakening TLS pinning', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cheese-wheel-xui-test-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const keyPath = path.join(tempDir, 'key.pem');
  const certPath = path.join(tempDir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-subj', '/CN=localhost', '-days', '1', '-keyout', keyPath, '-out', certPath],
  { stdio: 'ignore' });
  const cert = fs.readFileSync(certPath);
  const requests = [];
  let tlsConnections = 0;
  const panel = https.createServer({ key: fs.readFileSync(keyPath), cert }, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
    if (req.url === '/private/login') res.setHeader('Set-Cookie', 'session=legacy-session; HttpOnly; Secure');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, obj: {} }));
  });
  panel.on('secureConnection', () => { tlsConnections++; });
  await new Promise(resolve => panel.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => panel.close(resolve)));
  const config = {
    id: 'test', baseUrl: `https://127.0.0.1:${panel.address().port}/private/`,
    inboundId: 7, tlsFingerprint: new X509Certificate(cert).fingerprint256,
  };
  const service = createVpnService();
  const client = { id: 'temporary-uuid', email: 'device+phone@example.test',
    flow: 'xtls-rprx-vision', tgId: '', enable: true };
  const modern = { ...config, id: 'v3', apiVersion: 3, apiToken: 'test-api-token' };
  assert.equal(service.isVpnServerConfigured(modern), true);
  await service.createVlessClient(modern, client);
  await service.deleteVlessClient(modern, 7, client.id, client.email);
  assert.equal(requests.length, 2, 'token API must not perform a browser login');
  assert.equal(tlsConnections, 2, 'requests must reuse the exact sockets whose certificates were checked');
  assert.equal(requests[0].url, '/private/panel/api/clients/add');
  assert.deepEqual(JSON.parse(requests[0].body), {
    client: { ...client, tgId: 0 }, inboundIds: [7],
  });
  assert.equal(requests[1].url, '/private/panel/api/clients/del/device%2Bphone%40example.test');
  for (const req of requests) {
    assert.equal(req.headers.authorization, 'Bearer test-api-token');
    assert.equal(req.headers.cookie, undefined);
  }

  requests.length = 0;
  const legacy = { ...config, id: 'legacy', username: 'test-user', password: 'test-password' };
  await service.createVlessClient(legacy, client);
  await service.deleteVlessClient(legacy, 7, client.id, client.email);
  assert.deepEqual(requests.map(req => req.url), [
    '/private/login', '/private/panel/api/inbounds/addClient',
    '/private/panel/api/inbounds/7/delClient/temporary-uuid',
  ]);
  assert.equal(new URLSearchParams(requests[0].body).get('username'), 'test-user');
  assert.deepEqual(JSON.parse(requests[1].body), {
    id: 7, settings: JSON.stringify({ clients: [client] }),
  });
  assert.equal(requests[1].headers.cookie, 'session=legacy-session');
  assert.equal(requests[2].headers.cookie, 'session=legacy-session');
  assert.equal(requests[1].headers.authorization, undefined);

  requests.length = 0;
  await assert.rejects(service.createVlessClient({ ...modern, tlsFingerprint: '00'.repeat(32) }, client),
    /TLS fingerprint mismatch/);
  assert.equal(requests.length, 0, 'a mismatched certificate must receive no credentials');
});
