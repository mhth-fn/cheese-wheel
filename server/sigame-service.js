'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_SIGAME_TAGS = 9;
const MAX_SIGAME_PACK_BYTES = 200 * 1024 * 1024;

function createSigameService({ sanitizeTitle, sigamePacksPath, sigameStmts }) {

function sanitizeSigameTags(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SIGAME_TAGS) return null;
  const tags = [];
  const seen = new Set();
  for (const rawTag of value) {
    if (typeof rawTag !== 'string') return null;
    const tag = rawTag.trim();
    if (!tag || tag.length > 24 || /[\p{Cc}\p{Cf}]/u.test(tag)) return null;
    const key = tag.toLocaleLowerCase('ru-RU');
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

function readSigamePackInput(body, existing = null) {
  const source = body && typeof body === 'object' ? body : {};
  const title = source.title === undefined && existing
    ? existing.title
    : sanitizeTitle(source.title);
  const tags = source.tags === undefined && existing
    ? sigameStmts.getTags.all(existing.id).map(row => row.tag)
    : sanitizeSigameTags(source.tags);

  if (!title || tags === null) return null;
  return { title, tags };
}

function sanitizeSigameOriginalFileName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (
    trimmed.length < 5
    || trimmed.length > 255
    || !trimmed.toLocaleLowerCase('ru-RU').endsWith('.siq')
    || /[\\/\p{Cc}\p{Cf}]/u.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function parseSigameUploadTags(value) {
  if (value === undefined) return [];
  if (typeof value !== 'string' || value.length > 1000) return null;
  try {
    return sanitizeSigameTags(JSON.parse(value));
  } catch {
    return null;
  }
}

function parseSigamePlayedDate(value) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day, 12);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return timestamp;
}

function sigameUploadError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function receiveSigamePackFile(req, temporaryPath, expectedSize) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let received = 0;
    let signature = Buffer.alloc(0);
    const output = fs.createWriteStream(temporaryPath, {
      flags: 'wx',
      mode: 0o640,
    });

    const fail = error => {
      if (settled) return;
      settled = true;
      req.unpipe(output);
      output.destroy();
      req.resume();
      reject(error);
    };

    req.on('data', chunk => {
      received += chunk.length;
      if (signature.length < 4) {
        signature = Buffer.concat([signature, chunk]).subarray(0, 4);
      }
      if (received > MAX_SIGAME_PACK_BYTES || received > expectedSize) {
        fail(sigameUploadError(413, 'Файл пака слишком большой'));
      }
    });
    req.once('aborted', () => fail(sigameUploadError(400, 'Загрузка файла прервана')));
    req.once('error', fail);
    output.once('error', fail);
    output.once('finish', () => {
      if (settled) return;
      settled = true;
      if (received !== expectedSize || received === 0) {
        reject(sigameUploadError(400, 'Не удалось полностью загрузить файл пака'));
        return;
      }
      const isZip = signature.length === 4
        && signature[0] === 0x50
        && signature[1] === 0x4b
        && (
          (signature[2] === 0x03 && signature[3] === 0x04)
          || (signature[2] === 0x05 && signature[3] === 0x06)
          || (signature[2] === 0x07 && signature[3] === 0x08)
        );
      if (!isZip) {
        reject(sigameUploadError(
          400,
          'Выберите файл пакета SIGame в формате .siq'
        ));
        return;
      }
      resolve(received);
    });
    req.pipe(output);
  });
}

function getSigamePackFilePath(storageKey) {
  if (typeof storageKey !== 'string' || !/^[a-f0-9-]{36}\.siq$/i.test(storageKey)) {
    return null;
  }
  return path.join(sigamePacksPath, storageKey);
}

function serializeSigamePack(row) {
  if (!row) return null;
  const isPlayed = row.status === 'played';
  return {
    id: Number(row.id),
    title: row.title,
    status: isPlayed ? 'played' : 'unplayed',
    tags: sigameStmts.getTags.all(row.id).map(item => item.tag),
    original_file_name: row.original_file_name || '',
    file_size: row.file_size == null ? null : Number(row.file_size),
    has_file: Boolean(row.storage_key),
    added_by: Number(row.added_by),
    added_by_name: row.added_by_name,
    added_at: Number(row.added_at),
    played_by: row.played_by == null ? null : Number(row.played_by),
    played_by_name: row.played_by_name || null,
    played_at: row.played_at == null ? null : Number(row.played_at),
    average_rating: isPlayed && row.average_rating != null
      ? Number(row.average_rating)
      : null,
    ratings_count: isPlayed ? Number(row.ratings_count || 0) : 0,
    my_rating: isPlayed && row.my_rating != null ? Number(row.my_rating) : null,
  };
}

function getSigamePackForViewer(packId, viewerId) {
  return serializeSigamePack(sigameStmts.getById.get(viewerId || null, packId));
}

function canManageSigamePack(pack, tokenData) {
  return Boolean(
    pack
    && tokenData
    && (
      Number(pack.added_by) === Number(tokenData.userId)
      || tokenData.role === 'admin'
    )
  );
}

function replaceSigamePackTags(packId, tags) {
  sigameStmts.deleteTags.run(packId);
  tags.forEach(tag => sigameStmts.insertTag.run(packId, tag));
}


  return {
    MAX_SIGAME_PACK_BYTES,
    MAX_SIGAME_TAGS,
    canManageSigamePack,
    getSigamePackFilePath,
    getSigamePackForViewer,
    parseSigamePlayedDate,
    parseSigameUploadTags,
    readSigamePackInput,
    receiveSigamePackFile,
    replaceSigamePackTags,
    sanitizeSigameOriginalFileName,
    serializeSigamePack,
  };
}

module.exports = { createSigameService };
