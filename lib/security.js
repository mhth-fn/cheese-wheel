'use strict';

const crypto = require('crypto');

const RFC4648_BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SESSION_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const LOGIN_CHALLENGE_PATTERN = /^[a-f0-9]{64}$/i;
const RECOVERY_CODE_PATTERN = /^[A-F0-9]{20}$/;

function normalizeHexToken(value, pattern = SESSION_TOKEN_PATTERN) {
  if (typeof value !== 'string' || !pattern.test(value)) return null;
  return value.toLowerCase();
}

function hashSessionToken(rawToken) {
  const normalized = normalizeHexToken(rawToken);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function createLoginChallenge() {
  return crypto.randomBytes(32).toString('hex');
}

function hashLoginChallenge(rawChallenge) {
  const normalized = normalizeHexToken(rawChallenge, LOGIN_CHALLENGE_PATTERN);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function parseTotpEncryptionKey(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('TOTP_ENCRYPTION_KEY must be exactly 32 bytes encoded as 64 hexadecimal characters');
  }
  return Buffer.from(value, 'hex');
}

function totpAad(userId) {
  if (!Number.isInteger(Number(userId)) || Number(userId) < 1) {
    throw new Error('A valid user id is required for TOTP encryption');
  }
  return Buffer.from(`cheese-wheel:totp:user:${Number(userId)}`, 'utf8');
}

function encryptTotpSecret(secret, key, userId) {
  if (!Buffer.isBuffer(secret) || secret.length < 20) {
    throw new Error('TOTP secret must contain at least 20 bytes');
  }
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('TOTP encryption key must contain 32 bytes');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(totpAad(userId));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decryptTotpSecret(value, key, userId) {
  if (typeof value !== 'string') throw new Error('Invalid encrypted TOTP secret');
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('TOTP encryption key must contain 32 bytes');
  }

  const [version, ivHex, tagHex, ciphertextHex] = value.split(':');
  if (
    version !== 'v1' ||
    !/^[a-f0-9]{24}$/i.test(ivHex || '') ||
    !/^[a-f0-9]{32}$/i.test(tagHex || '') ||
    !/^(?:[a-f0-9]{2})+$/i.test(ciphertextHex || '')
  ) {
    throw new Error('Invalid encrypted TOTP secret');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAAD(totpAad(userId));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
}

function base32Encode(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('base32Encode expects a Buffer');
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += RFC4648_BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += RFC4648_BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function generateTotpSecret() {
  return crypto.randomBytes(20);
}

function normalizeTotpCode(value, digits = 6) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return new RegExp(`^\\d{${digits}}$`).test(trimmed) ? trimmed : null;
}

function generateTotpCode(secret, step, options = {}) {
  if (!Buffer.isBuffer(secret) || secret.length === 0) {
    throw new Error('A TOTP secret is required');
  }
  const digits = options.digits ?? 6;
  const algorithm = options.algorithm ?? 'sha1';
  const counter = BigInt(step);
  if (counter < 0n) throw new Error('TOTP step cannot be negative');

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = crypto.createHmac(algorithm, secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  ) >>> 0;
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

function verifyTotpCode(secret, submittedCode, options = {}) {
  const digits = options.digits ?? 6;
  const code = normalizeTotpCode(submittedCode, digits);
  if (!code) return null;

  const periodSeconds = options.periodSeconds ?? 30;
  const now = options.now ?? Date.now();
  const window = options.window ?? 1;
  const lastUsedStep = options.lastUsedStep;
  const currentStep = Math.floor(now / 1000 / periodSeconds);
  const deltas = [0];
  for (let delta = 1; delta <= window; delta++) deltas.push(-delta, delta);

  for (const delta of deltas) {
    const step = currentStep + delta;
    if (step < 0 || (lastUsedStep != null && step <= Number(lastUsedStep))) continue;
    const expected = generateTotpCode(secret, step, { digits });
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step;
  }
  return null;
}

function generateRecoveryCodes(count = 10) {
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new Error('Invalid recovery code count');
  }
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(10).toString('hex').toUpperCase();
    return raw.match(/.{1,5}/g).join('-');
  });
}

function normalizeRecoveryCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/[\s-]/g, '');
  return RECOVERY_CODE_PATTERN.test(normalized) ? normalized : null;
}

function hashRecoveryCode(value) {
  const normalized = normalizeRecoveryCode(value);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

module.exports = {
  base32Encode,
  createLoginChallenge,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpCode,
  generateTotpSecret,
  hashLoginChallenge,
  hashRecoveryCode,
  hashSessionToken,
  normalizeRecoveryCode,
  normalizeTotpCode,
  parseTotpEncryptionKey,
  verifyTotpCode,
};
