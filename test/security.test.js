'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  base32Encode,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpCode,
  hashLoginChallenge,
  hashRecoveryCode,
  hashSessionToken,
  normalizeRecoveryCode,
  parseTotpEncryptionKey,
  verifyTotpCode,
} = require('../lib/security');

test('session and login challenge hashes are deterministic but not bearer values', () => {
  const raw = 'ab'.repeat(32);
  const expected = crypto.createHash('sha256').update(raw).digest('hex');
  assert.equal(hashSessionToken(raw), expected);
  assert.equal(hashLoginChallenge(raw), expected);
  assert.notEqual(expected, raw);
  assert.equal(hashSessionToken('not-a-token'), null);
});

test('TOTP secret encryption authenticates both ciphertext and user id', () => {
  const key = parseTotpEncryptionKey('42'.repeat(32));
  const secret = Buffer.from('12345678901234567890');
  const encrypted = encryptTotpSecret(secret, key, 2);
  assert.deepEqual(decryptTotpSecret(encrypted, key, 2), secret);
  assert.throws(() => decryptTotpSecret(encrypted, key, 3));
  assert.throws(() => decryptTotpSecret(`${encrypted.slice(0, -1)}0`, key, 2));
});

test('base32 encoding and RFC 6238 SHA-1 vector are correct', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.equal(base32Encode(Buffer.from('foo')), 'MZXW6');
  assert.equal(
    generateTotpCode(secret, 1, { digits: 8 }),
    '94287082'
  );
});

test('TOTP verification accepts the configured window and rejects replayed steps', () => {
  const secret = Buffer.from('12345678901234567890');
  const now = 59_000;
  const code = generateTotpCode(secret, 1);
  assert.equal(verifyTotpCode(secret, code, { now, window: 1 }), 1);
  assert.equal(verifyTotpCode(secret, code, { now, window: 1, lastUsedStep: 1 }), null);
});

test('recovery codes are high entropy, normalized and hashed', () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    const normalized = normalizeRecoveryCode(code.toLowerCase());
    assert.match(normalized, /^[A-F0-9]{20}$/);
    assert.match(hashRecoveryCode(code), /^[a-f0-9]{64}$/);
  }
});
