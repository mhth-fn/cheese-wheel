import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createSigamePack,
  deleteSigamePack,
  deleteSigamePackRating,
  fetchSigamePacks,
  rateSigamePack,
  setSigamePackStatus,
  updateSigamePack,
} from '../api';
import { useApp } from '../App';

const EMPTY_FORM = {
  title: '',
  pack_author: '',
  source_url: '',
  description: '',
  tags: '',
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Сервер отклонил запрос');
  return data;
}

function formatDate(timestamp) {
  return timestamp ? dateFormatter.format(new Date(timestamp)) : '';
}

function normalizeTags(rawTags) {
  return [...new Set(
    String(rawTags || '')
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)
  )];
}

export default function SigamePacksPage() {
  const { currentUser, isGuest, isAdmin, socket, showToast } = useApp();
  const [packs, setPacks] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [activeTab, setActiveTab] = useState('planned');
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [sort, setSort] = useState('recent');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadPacks = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadState('loading');
    try {
      const data = await fetchSigamePacks();
      if (!Array.isArray(data)) throw new Error('Некорректный ответ сервера');
      setPacks(data);
      setLoadState('ready');
    } catch (error) {
      if (!quiet) setLoadState('error');
      if (quiet) showToast(error.message || 'Не удалось обновить паки', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  useEffect(() => {
    if (!socket) return undefined;
    const handleChange = () => loadPacks({ quiet: true });
    socket.on('sigame-packs-changed', handleChange);
    return () => socket.off('sigame-packs-changed', handleChange);
  }, [loadPacks, socket]);

  const counts = useMemo(() => ({
    planned: packs.filter(pack => pack.status === 'planned').length,
    played: packs.filter(pack => pack.status === 'played').length,
  }), [packs]);

  const tags = useMemo(() => {
    const tagMap = new Map();
    packs.forEach(pack => {
      pack.tags.forEach(tag => {
        const key = tag.toLocaleLowerCase('ru-RU');
        const current = tagMap.get(key);
        tagMap.set(key, {
          label: current?.label || tag,
          count: (current?.count || 0) + 1,
        });
      });
    });
    return [...tagMap.values()].sort((first, second) => (
      second.count - first.count || first.label.localeCompare(second.label, 'ru')
    ));
  }, [packs]);

  const visiblePacks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    const filtered = packs.filter(pack => {
      if (pack.status !== activeTab) return false;
      if (
        activeTag
        && !pack.tags.some(tag => tag.toLocaleLowerCase('ru-RU') === activeTag)
      ) {
        return false;
      }
      if (!query) return true;
      return [
        pack.title,
        pack.pack_author,
        pack.description,
        pack.added_by_name,
        ...pack.tags,
      ].some(value => String(value || '').toLocaleLowerCase('ru-RU').includes(query));
    });

    return filtered.sort((first, second) => {
      if (sort === 'title') return first.title.localeCompare(second.title, 'ru');
      if (sort === 'rating') {
        return (second.average_rating ?? -1) - (first.average_rating ?? -1)
          || second.ratings_count - first.ratings_count;
      }
      const firstDate = activeTab === 'played' ? first.played_at : first.added_at;
      const secondDate = activeTab === 'played' ? second.played_at : second.added_at;
      return secondDate - firstDate;
    });
  }, [activeTab, activeTag, packs, search, sort]);

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEditForm = pack => {
    setEditingId(pack.id);
    setForm({
      title: pack.title,
      pack_author: pack.pack_author,
      source_url: pack.source_url,
      description: pack.description,
      tags: pack.tags.join(', '),
    });
    setFormOpen(true);
    window.requestAnimationFrame(() => {
      document.querySelector('.sigame-pack-form')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const updateForm = (field, value) => {
    setForm(previous => ({ ...previous, [field]: value }));
  };

  const submitPack = async event => {
    event.preventDefault();
    if (formBusy || !form.title.trim()) return;
    setFormBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        pack_author: form.pack_author.trim(),
        source_url: form.source_url.trim(),
        description: form.description.trim(),
        tags: normalizeTags(form.tags),
      };
      const response = editingId
        ? await updateSigamePack(editingId, payload)
        : await createSigamePack(payload);
      await readResponse(response);
      showToast(editingId ? 'Пак обновлён' : 'Пак добавлен в библиотеку', 'success');
      closeForm();
      setActiveTab('planned');
      await loadPacks({ quiet: true });
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить пак', 'error');
    } finally {
      setFormBusy(false);
    }
  };

  const changeStatus = async (pack, status) => {
    setBusyId(pack.id);
    try {
      await readResponse(await setSigamePackStatus(pack.id, status));
      showToast(
        status === 'played'
          ? `«${pack.title}» перенесён в сыгранные`
          : `«${pack.title}» возвращён в планы`,
        'success'
      );
      await loadPacks({ quiet: true });
      if (visiblePacks.length === 1) setActiveTab(status);
    } catch (error) {
      showToast(error.message || 'Не удалось изменить статус', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const changeRating = async (pack, rawRating) => {
    setBusyId(pack.id);
    try {
      const response = rawRating
        ? await rateSigamePack(pack.id, Number(rawRating))
        : await deleteSigamePackRating(pack.id);
      await readResponse(response);
      showToast(rawRating ? `Ваша оценка — ${rawRating}` : 'Оценка удалена', 'success');
      await loadPacks({ quiet: true });
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить оценку', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const removePack = async pack => {
    if (!window.confirm(`Удалить пак «${pack.title}»? Оценки тоже будут удалены.`)) return;
    setBusyId(pack.id);
    try {
      await readResponse(await deleteSigamePack(pack.id));
      showToast('Пак удалён', 'info');
      if (editingId === pack.id) closeForm();
      await loadPacks({ quiet: true });
    } catch (error) {
      showToast(error.message || 'Не удалось удалить пак', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const showEmptyLibrary = loadState === 'ready' && packs.length === 0;

  return (
    <main className="sigame-page">
      <section className="sigame-hero">
        <div className="sigame-hero-copy">
          <span className="sigame-kicker">Библиотека для своих игр</span>
          <h1>Паки SIGame</h1>
          <p>
            Собирайте интересные пакеты, выбирайте игру на вечер и сохраняйте
            общую историю с оценками.
          </p>
        </div>
        <div className="sigame-summary" aria-label="Статистика библиотеки">
          <div><strong>{counts.planned}</strong><span>на игру</span></div>
          <div><strong>{counts.played}</strong><span>сыграно</span></div>
        </div>
        {!isGuest && (
          <button
            className="sigame-add-button"
            type="button"
            onClick={formOpen && !editingId ? closeForm : openCreateForm}
          >
            <span aria-hidden="true">{formOpen && !editingId ? '×' : '+'}</span>
            {formOpen && !editingId ? 'Закрыть форму' : 'Добавить пак'}
          </button>
        )}
      </section>

      {formOpen && !isGuest && (
        <form className="sigame-pack-form" onSubmit={submitPack}>
          <div className="sigame-form-heading">
            <div>
              <span>{editingId ? 'Редактирование' : 'Новая находка'}</span>
              <h2>{editingId ? 'Обновить пак' : 'Добавить пак в библиотеку'}</h2>
            </div>
            <button type="button" className="sigame-form-close" onClick={closeForm} aria-label="Закрыть форму">×</button>
          </div>
          <div className="sigame-form-grid">
            <label className="sigame-field sigame-field-wide">
              <span>Название *</span>
              <input
                value={form.title}
                onChange={event => updateForm('title', event.target.value)}
                maxLength={200}
                placeholder="Например, Наука вокруг нас"
                required
                autoFocus
              />
            </label>
            <label className="sigame-field">
              <span>Автор пака</span>
              <input
                value={form.pack_author}
                onChange={event => updateForm('pack_author', event.target.value)}
                maxLength={120}
                placeholder="Ник или имя автора"
              />
            </label>
            <label className="sigame-field">
              <span>Ссылка на пак</span>
              <input
                type="url"
                value={form.source_url}
                onChange={event => updateForm('source_url', event.target.value)}
                maxLength={1000}
                placeholder="https://…"
              />
            </label>
            <label className="sigame-field sigame-field-wide">
              <span>Теги <small>через запятую, до 8</small></span>
              <input
                value={form.tags}
                onChange={event => updateForm('tags', event.target.value)}
                placeholder="кино, музыка, сложный, 18+"
              />
            </label>
            <label className="sigame-field sigame-field-wide">
              <span>Коротко о паке</span>
              <textarea
                value={form.description}
                onChange={event => updateForm('description', event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Чем он хорош и для какой компании подойдёт?"
              />
              <small className="sigame-symbol-count">{form.description.length}/2000</small>
            </label>
          </div>
          <div className="sigame-form-actions">
            <button className="button-ghost" type="button" onClick={closeForm}>Отмена</button>
            <button className="button-primary" type="submit" disabled={formBusy || !form.title.trim()}>
              {formBusy ? 'Сохраняем…' : editingId ? 'Сохранить изменения' : 'Добавить в планы'}
            </button>
          </div>
        </form>
      )}

      <section className="sigame-controls" aria-label="Фильтры библиотеки">
        <div className="sigame-tabs" role="tablist" aria-label="Статус паков">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'planned'}
            className={activeTab === 'planned' ? 'active' : ''}
            onClick={() => setActiveTab('planned')}
          >
            На игру <span>{counts.planned}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'played'}
            className={activeTab === 'played' ? 'active' : ''}
            onClick={() => setActiveTab('played')}
          >
            Сыгранные <span>{counts.played}</span>
          </button>
        </div>
        <div className="sigame-search-row">
          <label className="sigame-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Поиск паков</span>
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Название, автор или тег…"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Очистить поиск">×</button>
            )}
          </label>
          <label className="sigame-sort">
            <span className="sr-only">Сортировка</span>
            <select value={sort} onChange={event => setSort(event.target.value)}>
              <option value="recent">Сначала новые</option>
              <option value="rating">По оценке</option>
              <option value="title">По названию</option>
            </select>
          </label>
        </div>
        {tags.length > 0 && (
          <div className="sigame-tags-filter" aria-label="Фильтр по тегам">
            <button
              type="button"
              className={!activeTag ? 'active' : ''}
              onClick={() => setActiveTag('')}
            >
              Все
            </button>
            {tags.map(tag => {
              const key = tag.label.toLocaleLowerCase('ru-RU');
              return (
                <button
                  key={key}
                  type="button"
                  className={activeTag === key ? 'active' : ''}
                  onClick={() => setActiveTag(activeTag === key ? '' : key)}
                >
                  {tag.label} <span>{tag.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {loadState === 'loading' && (
        <div className="sigame-loading" role="status">
          <div className="sigame-card-skeleton" />
          <div className="sigame-card-skeleton" />
          <div className="sigame-card-skeleton" />
        </div>
      )}

      {loadState === 'error' && (
        <div className="sigame-empty" role="alert">
          <span aria-hidden="true">📡</span>
          <h2>Не удалось загрузить библиотеку</h2>
          <p>Проверьте соединение и попробуйте ещё раз.</p>
          <button className="button-primary" type="button" onClick={() => loadPacks()}>Повторить</button>
        </div>
      )}

      {showEmptyLibrary && (
        <div className="sigame-empty">
          <span aria-hidden="true">🧠</span>
          <h2>Здесь появится первая игра</h2>
          <p>Добавьте найденный пак, чтобы не потерять его до следующей встречи.</p>
          {!isGuest && <button className="button-primary" type="button" onClick={openCreateForm}>Добавить первый пак</button>}
        </div>
      )}

      {loadState === 'ready' && packs.length > 0 && visiblePacks.length === 0 && (
        <div className="sigame-empty sigame-empty-compact">
          <span aria-hidden="true">🔎</span>
          <h2>Ничего не нашлось</h2>
          <p>Попробуйте убрать тег или изменить запрос.</p>
          <button
            className="button-ghost"
            type="button"
            onClick={() => {
              setSearch('');
              setActiveTag('');
            }}
          >
            Сбросить фильтры
          </button>
        </div>
      )}

      {loadState === 'ready' && visiblePacks.length > 0 && (
        <div className="sigame-grid">
          {visiblePacks.map(pack => {
            const canManage = !isGuest && (
              isAdmin || Number(pack.added_by) === Number(currentUser?.id)
            );
            const isBusy = busyId === pack.id;
            return (
              <article className={`sigame-card ${pack.status}`} key={pack.id}>
                <div className="sigame-card-topline">
                  <div className="sigame-card-tags">
                    {pack.tags.map(tag => (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => setActiveTag(tag.toLocaleLowerCase('ru-RU'))}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  {pack.status === 'played' && (
                    <span className="sigame-played-badge">Сыгран</span>
                  )}
                </div>
                <div className="sigame-card-heading">
                  <div>
                    <h2>{pack.title}</h2>
                    {pack.pack_author && <p>Автор пака: {pack.pack_author}</p>}
                  </div>
                  <div
                    className={`sigame-rating-summary ${pack.average_rating == null ? 'empty' : ''}`}
                    title={`${pack.ratings_count} оценок`}
                  >
                    <strong>{pack.average_rating == null ? '—' : pack.average_rating.toFixed(1)}</strong>
                    <span>★ · {pack.ratings_count}</span>
                  </div>
                </div>
                {pack.description && <p className="sigame-description">{pack.description}</p>}
                <div className="sigame-card-meta">
                  <span>Добавил {pack.added_by_name}</span>
                  <span>{formatDate(pack.added_at)}</span>
                  {pack.status === 'played' && pack.played_by_name && (
                    <span>Сыграл: {pack.played_by_name}, {formatDate(pack.played_at)}</span>
                  )}
                </div>
                <div className="sigame-card-footer">
                  <div className="sigame-card-links">
                    {pack.source_url && (
                      <a href={pack.source_url} target="_blank" rel="noopener noreferrer">
                        Открыть пак <span aria-hidden="true">↗</span>
                      </a>
                    )}
                    {canManage && (
                      <>
                        <button type="button" onClick={() => openEditForm(pack)}>Изменить</button>
                        <button className="danger" type="button" onClick={() => removePack(pack)} disabled={isBusy}>Удалить</button>
                      </>
                    )}
                  </div>
                  {pack.status === 'planned' && !isGuest && (
                    <button
                      className="sigame-play-button"
                      type="button"
                      onClick={() => changeStatus(pack, 'played')}
                      disabled={isBusy}
                    >
                      <span aria-hidden="true">✓</span>
                      {isBusy ? 'Переносим…' : 'Отметить сыгранным'}
                    </button>
                  )}
                  {pack.status === 'played' && (
                    <div className="sigame-rating-control">
                      {!isGuest ? (
                        <label>
                          <span>Ваша оценка</span>
                          <select
                            value={pack.my_rating ?? ''}
                            onChange={event => changeRating(pack, event.target.value)}
                            disabled={isBusy}
                          >
                            <option value="">Без оценки</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rating => (
                              <option key={rating} value={rating}>{rating} / 10</option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span>Войдите участником, чтобы оценить</span>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className="sigame-restore-button"
                          onClick={() => changeStatus(pack, 'planned')}
                          disabled={isBusy}
                        >
                          Вернуть в планы
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isGuest && (
        <p className="sigame-guest-note">
          Гостям доступен просмотр. Войдите участником, чтобы добавлять и оценивать паки.
        </p>
      )}
    </main>
  );
}
