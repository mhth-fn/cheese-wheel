import { getSigamePackDownloadUrl } from '../../api';
import { formatFileSize, formatSigameDate } from './sigameUtils';
import SigamePackReviews from './SigamePackReviews';

export default function SigamePackCard({
  busy,
  canManage,
  isGuest,
  menuOpen,
  onEdit,
  onEditDate,
  onRate,
  onRemove,
  onSelectTag,
  onSetStatus,
  onToggleMenu,
  pack,
}) {
  return (
    <article className={`sigame-card ${pack.status}`}>
      <div className="sigame-card-topline">
        <div className="sigame-card-tags">
          {pack.tags.map(tag => (
            <button
              type="button"
              key={tag}
              onClick={() => onSelectTag(tag.toLocaleLowerCase('ru-RU'))}
            >
              {tag}
            </button>
          ))}
        </div>
        {canManage && (
          <div className="sigame-more">
            <button
              type="button"
              className="sigame-more-trigger"
              aria-label={`Действия с паком ${pack.title}`}
              aria-expanded={menuOpen}
              onClick={onToggleMenu}
            >
              •••
            </button>
            {menuOpen && (
              <div className="sigame-more-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => onEdit(pack)}>
                  Переименовать и изменить теги
                </button>
                {pack.status === 'played' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onEditDate(pack)}
                  >
                    Изменить дату игры
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => onRemove(pack)}
                  disabled={busy}
                >
                  Удалить
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sigame-card-heading">
        <h2>{pack.title}</h2>
        {pack.status === 'played' && pack.average_rating != null && (
          <div
            className="sigame-rating-summary"
            title={`${pack.ratings_count} оценок`}
          >
            <strong>{pack.average_rating.toFixed(1)}</strong>
            <span>★ · {pack.ratings_count}</span>
          </div>
        )}
      </div>

      <div className="sigame-file-info">
        <span aria-hidden="true">📄</span>
        <div>
          <strong>{pack.original_file_name || 'Файл не прикреплён'}</strong>
          <small>{formatFileSize(pack.file_size)}</small>
        </div>
      </div>

      <div className="sigame-card-meta">
        <span>Добавлен {formatSigameDate(pack.added_at)}</span>
        {pack.status === 'played' && (
          <span>
            {pack.played_at
              ? `Сыгран ${formatSigameDate(pack.played_at)}`
              : 'Сыгран — дата неизвестна'}
          </span>
        )}
      </div>

      <div className="sigame-card-footer">
        <div className="sigame-primary-actions">
          {pack.has_file ? (
            <a
              className="sigame-download-button"
              href={getSigamePackDownloadUrl(pack.id)}
              download={pack.original_file_name || undefined}
            >
              Скачать
            </a>
          ) : (
            <button className="sigame-download-button" type="button" disabled>
              Файл недоступен
            </button>
          )}

          {pack.status === 'unplayed' && !isGuest && (
            <button
              className="sigame-status-button"
              type="button"
              onClick={() => onSetStatus(pack, 'played')}
              disabled={busy}
            >
              {busy ? 'Сохраняем…' : 'Отметить сыгранным'}
            </button>
          )}
        </div>

        {pack.status === 'played' && (
          <div className="sigame-played-actions">
            {!isGuest && (
              <label className="sigame-rating-control">
                <span>{pack.my_rating == null ? 'Оценить' : 'Ваша оценка'}</span>
                <select
                  value={pack.my_rating ?? ''}
                  onChange={event => onRate(pack, event.target.value)}
                  disabled={busy}
                >
                  <option value="">Без оценки</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rating => (
                    <option key={rating} value={rating}>{rating} / 10</option>
                  ))}
                </select>
              </label>
            )}
            {canManage && (
              <button
                type="button"
                className="sigame-restore-button"
                onClick={() => onSetStatus(pack, 'unplayed')}
                disabled={busy}
              >
                Вернуть в несыгранные
              </button>
            )}
          </div>
        )}
      </div>
      {pack.status === 'played' && <SigamePackReviews pack={pack} />}
    </article>
  );
}
