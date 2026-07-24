# Проверяемые резервные копии

`scripts/backup.js` создаёт согласованную онлайн-копию SQLite через backup API,
проверяет `integrity_check` и `foreign_key_check`, сохраняет загрузки, формирует
и повторно проверяет `SHA256SUMS`. Незавершённая копия никогда не публикуется
как готовый снимок.

Снимки находятся вне каталога приложения:

```text
/var/backups/cheese-wheel/snapshot-YYYYMMDDTHHMMSSZ/
├── cheese_wheel.db
├── uploads.tar
└── SHA256SUMS
```

По умолчанию копия создаётся каждые шесть часов, а снимки старше 30 дней
удаляются. Очистка принимает только строго распознанные имена снимков,
расположенные непосредственно внутри каталога резервных копий.

## Установка

Команды выполняются от `root` после развёртывания приложения:

```bash
install -d -o root -g root -m 0700 /var/backups/cheese-wheel
install -o root -g root -m 0644 \
  /opt/cheese-wheel/deploy/cheese-wheel-backup.service \
  /etc/systemd/system/cheese-wheel-backup.service
install -o root -g root -m 0644 \
  /opt/cheese-wheel/deploy/cheese-wheel-backup.timer \
  /etc/systemd/system/cheese-wheel-backup.timer
systemctl daemon-reload
systemctl enable --now cheese-wheel-backup.timer
systemctl start cheese-wheel-backup.service
systemctl status cheese-wheel-backup.service --no-pager
systemctl list-timers cheese-wheel-backup.timer --no-pager
```

Сервис работает от `root`, потому что рабочая база намеренно имеет права
`0600` и принадлежит непривилегированному пользователю приложения. Каталог
копий доступен только `root`, а unit разрешает запись лишь в этот каталог.

## Проверка и восстановление

Проверка последнего снимка:

```bash
snapshot="$(find /var/backups/cheese-wheel -mindepth 1 -maxdepth 1 \
  -type d -name 'snapshot-????????T??????Z' -print | sort | tail -n 1)"
cd "$snapshot"
sha256sum --check SHA256SUMS
sqlite3 -readonly cheese_wheel.db 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
tar --list --file uploads.tar >/dev/null
```

Для учебного восстановления скопируйте снимок во временный каталог, откройте
копию базы с `sqlite3`, распакуйте `uploads.tar` и запустите приложение с
временными `DATA_DIR` и `UPLOADS_PATH`. Не заменяйте рабочую базу во время
работы процесса.

Эти снимки защищают от ошибок приложения, но остаются на том же сервере.
Для защиты от потери диска их следует дополнительно отправлять в
зашифрованное внешнее хранилище (например, через restic).
