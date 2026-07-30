'use strict';

const fs = require('node:fs');
const path = require('node:path');

function registerSettingsRoutes(context) {
  const {
    MAX_SPIN_DURATION,
    MIN_SPIN_DURATION,
    app,
    db,
    io,
    parseIntStrict,
    requireAdmin,
    stmts,
    uploadsPath,
  } = context;

app.get('/api/settings', (req, res) => {
  const spinDuration = stmts.getSpinDuration.get();
  const spinEnabled = db.prepare("SELECT value FROM settings WHERE key = 'spin_enabled'").get();
  const addEnabled = db.prepare("SELECT value FROM settings WHERE key = 'add_enabled'").get();
  const decorationsEnabled = db.prepare("SELECT value FROM settings WHERE key = 'decorations_enabled'").get();
  res.json({
    spin_duration: parseInt(spinDuration?.value || '5'),
    spin_enabled: spinEnabled?.value !== '0',
    add_enabled: addEnabled?.value !== '0',
    decorations_enabled: decorationsEnabled?.value !== '0',
  });
});

app.post('/api/settings/spin-duration', requireAdmin, (req, res) => {
  const duration = parseIntStrict(req.body.duration);
  if (isNaN(duration) || duration < MIN_SPIN_DURATION || duration > MAX_SPIN_DURATION) {
    return res.status(400).json({ error: `Время от ${MIN_SPIN_DURATION} до ${MAX_SPIN_DURATION} секунд` });
  }

  stmts.setSpinDuration.run(duration.toString());
  io.emit('settings-changed', { spin_duration: duration });
  res.json({ success: true });
});

app.post('/api/settings/spin-enabled', requireAdmin, (req, res) => {
  const val = req.body.enabled ? '1' : '0';
  db.prepare("UPDATE settings SET value = ? WHERE key = 'spin_enabled'").run(val);
  io.emit('settings-changed', { spin_enabled: val === '1' });
  res.json({ success: true });
});

app.post('/api/settings/add-enabled', requireAdmin, (req, res) => {
  const val = req.body.enabled ? '1' : '0';
  db.prepare("UPDATE settings SET value = ? WHERE key = 'add_enabled'").run(val);
  io.emit('settings-changed', { add_enabled: val === '1' });
  res.json({ success: true });
});

app.post('/api/settings/decorations-enabled', requireAdmin, (req, res) => {
  const val = req.body.enabled ? '1' : '0';
  db.prepare("UPDATE settings SET value = ? WHERE key = 'decorations_enabled'").run(val);
  io.emit('settings-changed', { decorations_enabled: val === '1' });
  res.json({ success: true });
});

// Center image
app.get('/api/center-image', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'center_image'").get();
  res.json({ url: row?.value || null });
});

function detectImageExtension(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return '.png';
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) return '.jpg';
  if (
    buffer.length >= 6
    && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
  ) return '.gif';
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return '.webp';
  return null;
}

app.post('/api/center-image', requireAdmin, (req, res) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return res.status(400).json({ error: 'Нужен файл' });
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB

  req.on('data', (chunk) => {
    if (tooLarge) return;
    size += chunk.length;
    if (size > MAX_SIZE) {
      tooLarge = true;
      res.status(413).json({ error: 'Файл слишком большой (макс 5МБ)' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (res.writableEnded) return;
    try {
      const buf = Buffer.concat(chunks);
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      const boundary = (boundaryMatch?.[1] || boundaryMatch?.[2] || '').trim();
      if (!boundary || boundary.length > 200) {
        return res.status(400).json({ error: 'Неверный формат' });
      }

      const parts = buf.toString('latin1').split(`--${boundary}`);
      let fileData = null;
      for (const part of parts) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const headers = part.slice(0, headerEnd);
        if (!/content-disposition:[^\r\n]*filename="[^"]+"/i.test(headers)) continue;
        const bodyEnd = part.lastIndexOf('\r\n');
        if (bodyEnd <= headerEnd + 4) continue;
        fileData = Buffer.from(part.slice(headerEnd + 4, bodyEnd), 'latin1');
        break;
      }

      if (!fileData?.length) {
        return res.status(400).json({ error: 'Файл не найден в запросе' });
      }

      const ext = detectImageExtension(fileData);
      if (!ext) {
        return res.status(400).json({ error: 'Файл должен быть настоящим PNG, JPG, GIF или WebP' });
      }

      const newName = `center${ext}`;
      const targetPath = path.join(uploadsPath, newName);
      fs.writeFileSync(targetPath, fileData, { mode: 0o644 });
      for (const file of fs.readdirSync(uploadsPath)) {
        if (file.startsWith('center.') && file !== newName) {
          fs.unlinkSync(path.join(uploadsPath, file));
        }
      }
      const url = `/uploads/${newName}?t=${Date.now()}`;
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('center_image', ?)").run(url);
      io.emit('center-image-changed', { url });
      res.json({ url });
    } catch (error) {
      console.error('[cheese-wheel] Center image upload failed:', error.message);
      if (!res.headersSent) res.status(500).json({ error: 'Ошибка сохранения изображения' });
    }
  });
});

app.delete('/api/center-image', requireAdmin, (req, res) => {
  for (const f of fs.readdirSync(uploadsPath)) {
    if (f.startsWith('center.')) {
      fs.unlinkSync(path.join(uploadsPath, f));
    }
  }
  db.prepare("DELETE FROM settings WHERE key = 'center_image'").run();
  io.emit('center-image-changed', { url: null });
  res.json({ success: true });
});

}

module.exports = { registerSettingsRoutes };
