import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createSigamePack,
  deleteSigamePack,
  deleteSigamePackRating,
  fetchSigamePacks,
  rateSigamePack,
  setSigamePackStatus,
  updateSigamePack,
  updateSigamePackPlayedDate,
} from '../api';
import { useApp } from '../app/AppContext';
import SigameDateDialog from '../features/sigame/SigameDateDialog';
import SigameFilters from '../features/sigame/SigameFilters';
import SigamePackCard from '../features/sigame/SigamePackCard';
import SigamePackForm from '../features/sigame/SigamePackForm';
import {
  DEFAULT_SIGAME_SORT,
  EMPTY_SIGAME_FORM,
  formatSigameDateInput,
  MAX_SIGAME_TAGS,
  normalizeSigameTags,
  SIGAME_SORT_OPTIONS,
  sortSigamePacks,
  validateSiqFile,
} from '../features/sigame/sigameUtils';
import { readResponse } from '../utils/readResponse';

export default function SigamePacksPage() {
  const { currentUser, isGuest, isAdmin, socket, showToast } = useApp();
  const [packs, setPacks] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [activeTab, setActiveTab] = useState('unplayed');
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [sort, setSort] = useState(DEFAULT_SIGAME_SORT.unplayed);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_SIGAME_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [menuPackId, setMenuPackId] = useState(null);
  const [datePack, setDatePack] = useState(null);
  const [playedDate, setPlayedDate] = useState('');
  const [dateBusy, setDateBusy] = useState(false);
  const formTags = normalizeSigameTags(form.tags);
  const tagError = formTags.length > MAX_SIGAME_TAGS
    ? `Можно указать не более ${MAX_SIGAME_TAGS} тегов`
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
    const available = SIGAME_SORT_OPTIONS[activeTab].some(
      option => option.value === sort
    );
    if (!available) setSort(DEFAULT_SIGAME_SORT[activeTab]);
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

  useEffect(() => {
    if (!datePack) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !dateBusy) setDatePack(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [dateBusy, datePack]);

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
    return sortSigamePacks(filtered, sort);
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
    setSort(DEFAULT_SIGAME_SORT[tab]);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_SIGAME_FORM);
    setSelectedFile(null);
    setFileError('');
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_SIGAME_FORM);
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

  const openDateForm = pack => {
    setMenuPackId(null);
    setDatePack(pack);
    setPlayedDate(formatSigameDateInput(pack.played_at));
  };

  const savePlayedDate = async nextDate => {
    if (!datePack || dateBusy) return;
    setDateBusy(true);
    try {
      const updated = await readResponse(
        await updateSigamePackPlayedDate(datePack.id, nextDate)
      );
      upsertPack(updated);
      showToast(
        nextDate === null ? 'Дата игры установлена как неизвестная' : 'Дата игры обновлена',
        'success'
      );
      setDatePack(null);
    } catch (error) {
      showToast(error.message || 'Не удалось изменить дату игры', 'error');
    } finally {
      setDateBusy(false);
    }
  };

  const chooseFile = file => {
    const error = validateSiqFile(file);
    if (error) {
      setSelectedFile(null);
      setFileError(error);
      return;
    }
    setSelectedFile(file);
    setFileError('');
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setFileError('');
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

      <SigameFilters
        activeTab={activeTab}
        activeTag={activeTag}
        counts={counts}
        search={search}
        sort={sort}
        tags={tags}
        onSearchChange={setSearch}
        onSelectTab={selectTab}
        onSelectTag={setActiveTag}
        onSortChange={setSort}
      />

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
            <button className="button-primary" type="button" onClick={openCreateForm}>
              Загрузить первый пак
            </button>
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
              <SigamePackCard
                key={pack.id}
                pack={pack}
                busy={isBusy}
                canManage={canManage}
                isGuest={isGuest}
                menuOpen={menuPackId === pack.id}
                onEdit={openEditForm}
                onEditDate={openDateForm}
                onRate={changeRating}
                onRemove={removePack}
                onSelectTag={setActiveTag}
                onSetStatus={changeStatus}
                onToggleMenu={() => setMenuPackId(
                  menuPackId === pack.id ? null : pack.id
                )}
              />
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
        <SigamePackForm
          busy={formBusy}
          editingId={editingId}
          fileError={fileError}
          form={form}
          selectedFile={selectedFile}
          setForm={setForm}
          tagError={tagError}
          onChooseFile={chooseFile}
          onClose={closeForm}
          onRemoveFile={removeSelectedFile}
          onSubmit={submitPack}
        />
      )}

      {datePack && (
        <SigameDateDialog
          busy={dateBusy}
          date={playedDate}
          pack={datePack}
          onChange={setPlayedDate}
          onClose={() => setDatePack(null)}
          onSave={savePlayedDate}
        />
      )}
    </main>
  );
}
