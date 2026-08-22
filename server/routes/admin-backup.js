'use strict';

function registerAdminBackupRoutes(context) {
  const {
    DUMMY_PASSWORD_HASH,
    app,
    consumeRateLimit,
    createPortableBackup,
    dataDir,
    rejectRateLimited,
    requireAdmin,
    rootDir,
    sigamePacksPath,
    stmts,
    uploadsPath,
    verifyPassword,
  } = context;
  let exportInProgress = false;

  app.post('/api/admin/portable-backup', requireAdmin, async (req, res, next) => {
    const userId = Number(req.tokenData.userId);
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length < 1 || password.length > 200) {
      return res.status(400).json({ error: 'Введите текущий пароль' });
    }

    const limit = consumeRateLimit('admin-portable-backup', userId, 3, 60 * 60 * 1000);
    if (!limit.allowed) return rejectRateLimited(res, limit);

    const user = stmts.getUserWithPassword.get(userId);
    const validPassword = verifyPassword(
      password,
      user?.password_hash || DUMMY_PASSWORD_HASH
    );
    if (!user || user.role !== 'admin' || !validPassword) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }
    if (exportInProgress) {
      return res.status(409).json({ error: 'Другой бэкап уже создаётся. Подождите немного.' });
    }

    exportInProgress = true;
    let portable;
    try {
      portable = await createPortableBackup({
        dataDir,
        rootDir,
        sigamePacksPath,
        uploadsPath,
      });
    } catch (error) {
      exportInProgress = false;
      console.error('[cheese-wheel] Portable backup failed:', error.message);
      return res.status(500).json({ error: 'Не удалось создать переносимый бэкап' });
    }

    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/gzip',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.download(portable.archivePath, portable.fileName, error => {
      portable.cleanup()
        .catch(cleanupError => {
          console.error('[cheese-wheel] Portable backup cleanup failed:', cleanupError.message);
        })
        .finally(() => {
          exportInProgress = false;
          if (error && !res.headersSent) next(error);
          else if (error) console.error('[cheese-wheel] Portable backup download failed:', error.message);
        });
    });
  });
}

module.exports = { registerAdminBackupRoutes };
