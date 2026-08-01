import { MUSIC_TYPES } from './musicReviewOptions';
import { RECOMMEND_OPTIONS } from './reviewUtils';

export default function MusicReviewForm({
  compact = false,
  fields,
  onCancel,
  onChange,
  onSubmit,
  submitting = false,
  submitLabel = 'Опубликовать находку',
}) {
  const setField = field => event => onChange({
    ...fields,
    [field]: event.target.value,
  });

  return (
    <form className={`review-form music-review-form${compact ? ' compact' : ''}`} onSubmit={onSubmit}>
      {!compact && (
        <div className="music-discovery-note">
          <span aria-hidden="true">🎧</span>
          <div>
            <strong>Принесли музыку, которую хочется передать дальше?</strong>
            <p>Добавьте ссылку, пару слов о находке и свою рекомендацию.</p>
          </div>
        </div>
      )}

      <div className="music-fields-row">
        <label className="review-form-field music-title-field">
          <span>Название *</span>
          <input
            id={onCancel ? undefined : 'music-review-title'}
            className="review-form-input"
            type="text"
            placeholder="Трек, альбом или плейлист"
            value={fields.title}
            onChange={setField('title')}
            maxLength={200}
            required
            autoFocus={Boolean(onCancel)}
          />
        </label>
        <label className="review-form-field music-artist-field">
          <span>Исполнитель</span>
          <input
            className="review-form-input"
            type="text"
            placeholder="Кто звучит"
            value={fields.artist}
            onChange={setField('artist')}
            maxLength={120}
          />
        </label>
      </div>

      <fieldset className="review-choice-fieldset">
        <legend>Что это за находка</legend>
        <div className="music-type-toggle">
          {MUSIC_TYPES.map(type => (
            <button
              key={type.value}
              className={`music-type-btn${fields.musicType === type.value ? ' active' : ''}`}
              type="button"
              aria-pressed={fields.musicType === type.value}
              onClick={() => onChange({ ...fields, musicType: type.value })}
            >
              <span aria-hidden="true">{type.icon}</span>
              {type.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="review-form-field">
        <span>Ссылка, где послушать</span>
        <input
          className="review-form-input"
          type="url"
          inputMode="url"
          placeholder="https://music.yandex.ru/…"
          value={fields.sourceUrl}
          onChange={setField('sourceUrl')}
          maxLength={2048}
        />
        <small className="review-field-hint">
          Подойдёт Яндекс Музыка, YouTube, Spotify, VK, Bandcamp или другой сервис.
        </small>
      </label>

      <label className="review-form-field">
        <span>Ваш обзор *</span>
        <textarea
          className="review-form-textarea"
          placeholder="Чем зацепило, когда лучше слушать и кому посоветуете"
          value={fields.content}
          onChange={setField('content')}
          maxLength={5000}
          rows={5}
          required
        />
      </label>

      <div className="review-form-footer">
        <fieldset className="review-choice-fieldset">
          <legend>Рекомендация</legend>
          <div className="recommend-toggle-group">
            {RECOMMEND_OPTIONS.map(option => (
              <button
                key={option.value}
                className={`review-recommend-toggle ${option.cls}${fields.recommend === option.value ? ' active' : ''}`}
                type="button"
                aria-pressed={fields.recommend === option.value}
                onClick={() => onChange({ ...fields, recommend: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        {onCancel && (
          <button className="review-edit-cancel" type="button" onClick={onCancel}>
            Отмена
          </button>
        )}
        <button
          className="review-submit-btn"
          type="submit"
          disabled={submitting || !fields.title.trim() || !fields.content.trim()}
        >
          {submitting ? 'Сохраняем…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
