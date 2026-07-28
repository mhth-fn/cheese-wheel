import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSigamePack,
  deleteSigamePack,
  deleteSigamePackRating,
  fetchSigamePacks,
  getSigamePackDownloadUrl,
  rateSigamePack,
  setSigamePackStatus,
  updateSigamePack,
} from '../api';
import { useApp } from '../App';

const EMPTY_FORM = { title: '', tags: '' };
const MAX_FILE_SIZE = 200 * 1024 * 1024;

const SORT_OPTIONS = {
  unplayed: [
    { value: 'created-desc', label: 'Сначала новые' },
    { value: 'created-asc', label: 'Сначала старые' },
    { value: 'title-asc', label: 'По названию А–Я' },
    { value: 'title-desc', label: 'По названию Я–А' },
  ],
  played: [
    { value: 'played-desc', label: 'Недавно сыгранные' },
    { value: 'played-asc', label: 'Давно сыгранные' },
    { value: 'rating-desc', label: 'С высокой оценкой' },
    { value: 'rating-asc', label: 'С низкой оценкой' },
    { value: 'title-asc', label: 'По названию А–Я' },
    { value: 'title-desc', label: 'По названию Я–А' },
  ],
};

const DEFAULT_SORT = {
  unplayed: 'created-desc',
  played: 'played-desc',
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

function formatFileSize(bytes) {
  if (bytes == null || !Number.isFinite(Number(bytes))) return 'Размер неизвестен';
  const value = Number(bytes);
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} МБ`;
}

function normalizeTags(rawTags) {
  const tags = [];
  const seen = new Set();
  String(rawTags || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
    .forEach(tag => {
      const key = tag.toLocaleLowerCase('ru-RU');
      if (seen.has(key)) return;
      seen.add(key);
      tags.push(tag);
    });
  return tags;
}

function validateSiqFile(file) {
  if (!file || !file.name.toLocaleLowerCase('ru-RU').endsWith('.siq')) {
    return 'Выберите файл пакета SIGame в формате .siq';
  }
  if (file.size < 1) return 'Выбранный файл пуст';
  if (file.size > MAX_FILE_SIZE) return 'Размер файла не должен превышать 200 МБ';
  return '';
}

function sortPacks(packs, sort) {
  return packs
    .map((pack, index) => ({ pack, index }))
    .sort((firstEntry, secondEntry) => {
      const first = firstEntry.pack;
      const second = secondEntry.pack;
      let result = 0;

      if (sort === 'created-desc') result = second.added_at - first.added_at;
      if (sort === 'created-asc') result = first.added_at - second.added_at;
      if (sort === 'played-desc') result = (second.played_at || 0) - (first.played_at || 0);
      if (sort === 'played-asc') result = (first.played_at || 0) - (second.played_at || 0);
      if (sort === 'title-asc') result = first.title.localeCompare(second.title, 'ru');
      if (sort === 'title-desc') result = second.title.localeCompare(first.title, 'ru');
      if (sort === 'rating-desc' || sort === 'rating-asc') {
        const firstMissing = first.average_rating == null;
        const secondMissing = second.average_rating == null;
        if (firstMissing !== secondMissing) result = firstMissing ? 1 : -1;
        else if (!firstMissing) {
          result = sort === 'rating-desc'
            ? second.average_rating - first.average_rating
            : first.average_rating - second.average_rating;
        }
      }

      return result || firstEntry.index - secondEntry.index;
    })
    .map(entry => entry.pack);
}

export default function SigamePacksPage() {
  const { currentUser, isGuest, isAdmin, socket, showToast } = useApp();
  const [packs, setPacks] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [activeTab, setActiveTab] = useState('unplayed');
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [sort, setSort] = useState(DEFAULT_SORT.unplayed);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [menuPackId, setMenuPackId] = useState(null);
  const fileInputRef = useRef(null);
  const formTags = normalizeTags(form.tags);
  const tagError = formTags.length > 8
    ? 'Можно указать не более 8 тегов'
    : formTags.some(tag => tag.length > 24)
      ? 'Каждый тег должен быть не длиннее 24 символов'
      : '';

  const loadPacks = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadState('loading');
    try {
      const data = await fetchSigamePacks();
      if (!Array.isArray(data)) throw new Error('Некорректный ответ сервера');
      setPacks(data);
      setLoadState('ready');
    } catch (error) {
      if (!quiet) setLoadState('error');
      else showToast(error.message || 'Не удалось обновить паки', 'error');
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

  useEffect(() => {
    const available = SORT_OPTIONS[activeTab].some(option => option.value === sort);
    if (!available) setSort(DEFAULT_SORT[activeTab]);
  }, [activeTab, sort]);

  useEffect(() => {
    const closeMenu = event => {
      if (!event.target.closest('.sigame-more')) setMenuPackId(null);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  useEffect(() => {
    if (!formOpen) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !formBusy) closeForm();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [formBusy, formOpen]);

  const counts = useMemo(() => ({
    unplayed: packs.filter(pack => pack.status === 'unplayed').length,
    played: packs.filter(pack => pack.status === 'played').length,
  }), [packs]);

  const tags = useMemo(() => {
    const tagMap = new Map();
    packs
      .filter(pack => pack.status === activeTab)
      .forEach(pack => {
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
  }, [activeTab, packs]);

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
      return [pack.title, ...pack.tags].some(value => (
        value.toLocaleLowerCase('ru-RU').includes(query)
      ));
    });
    return sortPacks(filtered, sort);
  }, [activeTab, activeTag, packs, search, sort]);

  const upsertPack = pack => {
    setPacks(previous => [
      pack,
      ...previous.filter(item => item.id !== pack.id),
    ]);
  };

  const selectTab = tab => {
    setActiveTab(tab);
    setActiveTag('');
    setSort(DEFAULT_SORT[tab]);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setFileError('');
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setFileError('');
    setFormOpen(true);
  };

  const openEditForm = pack => {
    setMenuPackId(null);
    setEditingId(pack.id);
    setForm({ title: pack.title, tags: pack.tags.join(', ') });
    setSelectedFile(null);
    setFileError('');
    setFormOpen(true);
  };

  const chooseFile = file => {
    const error = validateSiqFile(file);
    if (error) {
      setSelectedFile(null);
      setFileError(error);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setSelectedFile(file);
    setFileError('');
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submitPack = async event => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title || formBusy) return;
    if (tagError) {
      showToast(tagError, 'error');
      return;
    }
    if (!editingId && (!selectedFile || validateSiqFile(selectedFile))) {
      setFileError('Выберите файл пакета SIGame в формате .siq');
      return;
    }

    setFormBusy(true);
    try {
      const payload = { title, tags: formTags };
      const response = editingId
        ? await updateSigamePack(editingId, payload)
        : await createSigamePack(payload, selectedFile);
      const pack = await readResponse(response);
      upsertPack(pack);
      showToast(
        editingId ? 'Пак обновлён' : 'Пак добавлен в библиотеку',
        'success'
      );
      closeForm();
      selectTab(pack.status);
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить пак', 'error');
    } finally {
      setFormBusy(false);
    }
  };

  const changeStatus = async (pack, status) => {
    setBusyId(pack.id);
    try {
      const updated = await readResponse(await setSigamePackStatus(pack.id, status));
      upsertPack(updated);
      showToast(
        status === 'played'
          ? `«${pack.title}» отмечен сыгранным`
          : `«${pack.title}» возвращён в несыгранные`,
        'success'
      );
    } catch (error) {
      showToast(error.message || 'Не удалось изменить статус', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const changeRating = async (pack, rawRating) => {
    if (pack.status !== 'played') return;
    setBusyId(pack.id);
    try {
      const response = rawRating
        ? await rateSigamePack(pack.id, Number(rawRating))
        : await deleteSigamePackRating(pack.id);
      const updated = await readResponse(response);
      upsertPack(updated);
      showToast(rawRating ? `Ваша оценка — ${rawRating}` : 'Оценка удалена', 'success');
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить оценку', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const removePack = async pack => {
    setMenuPackId(null);
    if (!window.confirm(
      `Удалить пак “${pack.title}”? Файл будет удалён из библиотеки`
    )) {
      return;
    }
    setBusyId(pack.id);
    try {
      await readResponse(await deleteSigamePack(pack.id));
      setPacks(previous => previous.filter(item => item.id !== pack.id));
      showToast('Пак удалён', 'info');
    } catch (error) {
      showToast(error.message || 'Не удалось удалить пак', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const noStatusPacks = loadState === 'ready' && counts[activeTab] === 0;
  const noSearchResults = loadState === 'ready'
    && counts[activeTab] > 0
    && visiblePacks.length === 0;

  return (
    <main className="sigame-page">
      <section className="sigame-hero">
        <div>
          <h1>Паки SIGame</h1>
          <p>Файлы паков для следующей игры и история уже сыгранных.</p>
        </div>
        {!isGuest && (
          <button className="sigame-add-button" type="button" onClick={openCreateForm}>
            <span aria-hidden="true">+</span>
            Добавить пак
          </button>
        )}
      </section>

      <section className="sigame-controls" aria-label="Фильтры библиотеки">
        <div className="sigame-tabs" role="tablist" aria-label="Статус паков">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'unplayed'}
            className={activeTab === 'unplayed' ? 'active' : ''}
            onClick={() => selectTab('unplayed')}
          >
            Не сыграны <span>{counts.unplayed}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'played'}
            className={activeTab === 'played' ? 'active' : ''}
            onClick={() => selectTab('played')}
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
              placeholder="Название или тег…"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Очистить поиск">×</button>
            )}
          </label>
          <label className="sigame-sort">
            <span className="sr-only">Сортировка</span>
            <select value={sort} onChange={event => setSort(event.target.value)}>
              {SORT_OPTIONS[activeTab].map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
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
        </div>
      )}

      {loadState === 'error' && (
        <div className="sigame-empty" role="alert">
          <span aria-hidden="true">📡</span>
          <h2>Не удалось загрузить библиотеку</h2>
          <button className="button-primary" type="button" onClick={() => loadPacks()}>Повторить</button>
        </div>
      )}

      {noStatusPacks && (
        <div className="sigame-empty">
          <span aria-hidden="true">{activeTab === 'unplayed' ? '📦' : '🏁'}</span>
          <h2>{activeTab === 'unplayed' ? 'Нет несыгранных паков' : 'Пока ничего не сыграно'}</h2>
          <p>
            {activeTab === 'unplayed'
              ? 'Добавьте новый пак или верните сюда ранее сыгранный'
              : 'Отмечайте сыгранные паки — здесь появятся оценки и история'}
          </p>
          {activeTab === 'unplayed' && !isGuest && (
            <button className="button-primary" type="button" onClick={openCreateForm}>Добавить пак</button>
          )}
        </div>
      )}

      {noSearchResults && (
        <div className="sigame-empty sigame-empty-compact">
          <span aria-hidden="true">🔎</span>
          <h2>По вашему запросу ничего не найдено</h2>
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
                  {canManage && (
                    <div className="sigame-more">
                      <button
                        type="button"
                        className="sigame-more-trigger"
                        aria-label={`Действия с паком ${pack.title}`}
                        aria-expanded={menuPackId === pack.id}
                        onClick={() => setMenuPackId(
                          menuPackId === pack.id ? null : pack.id
                        )}
                      >
                        •••
                      </button>
                      {menuPackId === pack.id && (
                        <div className="sigame-more-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => openEditForm(pack)}>
                            Переименовать и изменить теги
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="danger"
                            onClick={() => removePack(pack)}
                            disabled={isBusy}
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
                    <div className="sigame-rating-summary" title={`${pack.ratings_count} оценок`}>
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
                  <span>Добавлен {formatDate(pack.added_at)}</span>
                  {pack.status === 'played' && (
                    <span>Сыгран {formatDate(pack.played_at)}</span>
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
                        onClick={() => changeStatus(pack, 'played')}
                        disabled={isBusy}
                      >
                        {isBusy ? 'Сохраняем…' : 'Отметить сыгранным'}
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
                            onChange={event => changeRating(pack, event.target.value)}
                            disabled={isBusy}
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
                          onClick={() => changeStatus(pack, 'unplayed')}
                          disabled={isBusy}
                        >
                          Вернуть в несыгранные
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

      {formOpen && (
        <div
          className="sigame-modal-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !formBusy) closeForm();
          }}
        >
          <form
            className="sigame-pack-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sigame-form-title"
            onSubmit={submitPack}
          >
            <div className="sigame-form-heading">
              <h2 id="sigame-form-title">{editingId ? 'Изменить пак' : 'Добавить пак'}</h2>
              <button
                type="button"
                className="sigame-form-close"
                onClick={closeForm}
                disabled={formBusy}
                aria-label="Закрыть форму"
              >
                ×
              </button>
            </div>

            {!editingId && (
              <div className="sigame-file-field">
                <span className="sigame-field-label">Файл пака *</span>
                {!selectedFile ? (
                  <label
                    className={`sigame-dropzone ${isDragging ? 'dragging' : ''} ${fileError ? 'invalid' : ''}`}
                    onDragEnter={event => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragOver={event => event.preventDefault()}
                    onDragLeave={event => {
                      event.preventDefault();
                      setIsDragging(false);
                    }}
                    onDrop={event => {
                      event.preventDefault();
                      setIsDragging(false);
                      chooseFile(event.dataTransfer.files?.[0]);
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".siq"
                      onChange={event => chooseFile(event.target.files?.[0])}
                    />
                    <span className="sigame-dropzone-icon" aria-hidden="true">⇧</span>
                    <strong>Перетащите .siq-файл сюда</strong>
                    <span>или выберите файл</span>
                  </label>
                ) : (
                  <div className="sigame-selected-file">
                    <span aria-hidden="true">📦</span>
                    <div>
                      <strong>{selectedFile.name}</strong>
                      <small>{formatFileSize(selectedFile.size)}</small>
                    </div>
                    <button
                      type="button"
                      onClick={removeSelectedFile}
                      disabled={formBusy}
                      aria-label="Удалить выбранный файл"
                    >
                      ×
                    </button>
                  </div>
                )}
                {fileError && <span className="sigame-file-error" role="alert">{fileError}</span>}
              </div>
            )}

            <label className="sigame-field">
              <span>Название *</span>
              <input
                value={form.title}
                onChange={event => setForm(previous => ({
                  ...previous,
                  title: event.target.value,
                }))}
                maxLength={200}
                placeholder="Например, История Древней Греции"
                required
                autoFocus={Boolean(editingId)}
              />
            </label>

            <label className="sigame-field">
              <span>Теги <small>через запятую, до 8</small></span>
              <input
                value={form.tags}
                onChange={event => setForm(previous => ({
                  ...previous,
                  tags: event.target.value,
                }))}
                placeholder="история, кино, сложный, 18+"
              />
              {tagError && (
                <span className="sigame-file-error" role="alert">{tagError}</span>
              )}
            </label>

            <div className="sigame-form-actions">
              <button className="button-ghost" type="button" onClick={closeForm} disabled={formBusy}>
                Отмена
              </button>
              <button
                className="button-primary"
                type="submit"
                disabled={
                  formBusy
                  || !form.title.trim()
                  || Boolean(tagError)
                  || (!editingId && (!selectedFile || Boolean(fileError)))
                }
              >
                {formBusy
                  ? (editingId ? 'Сохраняем…' : 'Загружаем…')
                  : (editingId ? 'Сохранить' : 'Добавить в библиотеку')}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
