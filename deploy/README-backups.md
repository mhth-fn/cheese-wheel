# Проверяемые резервные копии

`scripts/backup.js` создаёт согласованную онлайн-копию SQLite через backup API,
проверяет `integrity_check` и `foreign_key_check`, сохраняет изображения и
файлы паков SIGame, формирует и повторно проверяет `SHA256SUMS`. Незавершённая
копия никогда не публикуется как готовый снимок.

Для паков SIGame строится индекс с SHA-256 каждого файла. Если состав и
содержимое паков не изменились, новый снимок использует жёсткую ссылку на
уже проверенный `sigame-packs.tar`. Каждый снимок по-прежнему самодостаточен, но
неизменные паки занимают место на диске только один раз.

Снимки находятся вне каталога приложения:

```text
/var/backups/cheese-wheel/snapshot-YYYYMMDDTHHMMSSZ/
├── cheese_wheel.db
├── sigame-packs.index.json
├── sigame-packs.tar
├── uploads.tar
└── SHA256SUMS
```

По умолчанию локальная копия создаётся каждые шесть часов, а снимки старше
3 дней удаляются. Очистка принимает только строго распознанные имена снимков,
расположенные непосредственно внутри каталога резервных копий.

После успешного локального снимка systemd запускает отдельный
`cheese-wheel-offsite-backup.service`. Если настроен `/etc/cheese-wheel/offsite.env`,
снимок ещё раз проверяется и отправляется во внешнее хранилище через `restic`.
Restic шифрует базу, изображения и паки SIGame до отправки. Локальный сервис
при этом остаётся без сетевого доступа.

При ошибке локального или внешнего бэкапа
`cheese-wheel-backup-alert@.service` отправляет уведомление в Discord. Webhook
хранится отдельно от репозитория в `/etc/cheese-wheel/backup-alert.env`.

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

Установщик автоматически создаёт конфигурацию уведомлений из существующего
`DISCORD_WEBHOOK_URL`, если webhook уже настроен в `/opt/cheese-wheel/.env`.
Для ручной настройки:

```bash
install -d -o root -g root -m 0700 /etc/cheese-wheel
install -o root -g root -m 0600 \
  /opt/cheese-wheel/deploy/backup-alert.env.example \
  /etc/cheese-wheel/backup-alert.env
editor /etc/cheese-wheel/backup-alert.env
systemctl daemon-reload
```

## Зашифрованная внешняя копия

Нужен отдельный внешний target: S3/R2/B2, SFTP-сервер или другой backend,
который поддерживает restic. Он не может быть создан автоматически без
реквизитов выбранного хранилища.

```bash
apt-get update
apt-get install -y restic
install -d -o root -g root -m 0700 \
  /etc/cheese-wheel \
  /var/cache/cheese-wheel-restic
install -o root -g root -m 0600 \
  /opt/cheese-wheel/deploy/offsite.env.example \
  /etc/cheese-wheel/offsite.env
openssl rand -base64 48 > /etc/cheese-wheel/restic-password
chown root:root /etc/cheese-wheel/restic-password
chmod 0600 /etc/cheese-wheel/restic-password
editor /etc/cheese-wheel/offsite.env
```

После заполнения target и реквизитов один раз инициализируйте репозиторий:

```bash
set -a
. /etc/cheese-wheel/offsite.env
set +a
restic init
systemctl daemon-reload
systemctl start cheese-wheel-offsite-backup.service
systemctl status cheese-wheel-offsite-backup.service --no-pager
```

По умолчанию во внешнем репозитории сохраняются 14 ежедневных, 8 еженедельных
и 12 ежемесячных копий. Каждый запуск подтверждает загруженный snapshot,
применяет retention и выполняет `restic check`.

## Проверка и восстановление

Проверка последнего снимка:

```bash
snapshot="$(find /var/backups/cheese-wheel -mindepth 1 -maxdepth 1 \
  -type d -name 'snapshot-????????T??????Z' -print | sort | tail -n 1)"
cd "$snapshot"
sha256sum --check SHA256SUMS
sqlite3 -readonly cheese_wheel.db 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
tar --list --file uploads.tar >/dev/null
tar --list --file sigame-packs.tar >/dev/null
```

Для учебного восстановления скопируйте снимок во временный каталог, откройте
копию базы с `sqlite3`, распакуйте `uploads.tar` и `sigame-packs.tar`, затем
запустите приложение с временными `DATA_DIR` и `UPLOADS_PATH`. Не заменяйте
рабочую базу во время работы процесса.

Проверить всю цепочку и последние сообщения:

```bash
systemctl start cheese-wheel-backup.service
systemctl status cheese-wheel-backup.service --no-pager
systemctl status cheese-wheel-offsite-backup.service --no-pager
journalctl -u cheese-wheel-backup.service \
  -u cheese-wheel-offsite-backup.service --since today --no-pager
```
