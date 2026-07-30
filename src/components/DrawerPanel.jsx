import { useState } from 'react';
import { useApp } from '../app/AppContext';
import DrawerNextTab from '../features/wheel/DrawerNextTab';
import DrawerParticipantsTab, {
  countReadyParticipants,
} from '../features/wheel/DrawerParticipantsTab';
import DrawerSettingsTab from '../features/wheel/DrawerSettingsTab';
import { useDialogA11y } from '../hooks/useDialogA11y';

const TABS = [
  { key: 'participants', icon: '👥', label: 'Участники' },
  { key: 'next', icon: '⏭', label: 'Следующие' },
  { key: 'settings', icon: '⚙️', label: 'Настройки' },
];

export default function DrawerPanel({
  movies,
  nextMovies,
  open,
  onClose,
  onAdd,
  onRemove,
  onUpdate,
  onForm,
  onFormNext,
  onAddNext,
  onRemoveNext,
}) {
  const {
    users,
    currentUser,
    isGuest,
    isAdmin,
    addEnabled,
    connected,
    wheelIsSpinning,
    wheelStatus,
  } = useApp();
  const [activeTab, setActiveTab] = useState('participants');
  const dialogRef = useDialogA11y(open, onClose);
  const tabs = isAdmin ? TABS : TABS.filter(tab => tab.key !== 'settings');
  const readyCount = countReadyParticipants(users, movies, wheelStatus);

  if (!open) return null;

  return (
    <div className="wheel-modal-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className="wheel-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wheel-settings-title"
        tabIndex={-1}
      >
        <header className="wm-header">
          <div>
            <p className="wm-kicker">Управление колесом</p>
            <h2 id="wheel-settings-title">Состав вечера</h2>
          </div>
          <button className="wm-close icon-button" type="button" onClick={onClose} aria-label="Закрыть настройки">
            ✕
          </button>
        </header>

        <div className="wm-tabs" role="tablist" aria-label="Разделы настроек">
          {tabs.map(tab => {
            const count = tab.key === 'participants'
              ? `${readyCount}/${users.length}`
              : tab.key === 'next'
                ? nextMovies.length
                : null;
            return (
              <button
                key={tab.key}
                className={`wm-tab ${activeTab === tab.key ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                <span aria-hidden="true">{tab.icon}</span>
                <span>{tab.label}</span>
                {count !== null && <span className="wm-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {activeTab === 'participants' && (
          <DrawerParticipantsTab
            movies={movies}
            users={users}
            currentUser={currentUser}
            isGuest={isGuest}
            isAdmin={isAdmin}
            addEnabled={addEnabled}
            connected={connected}
            wheelIsSpinning={wheelIsSpinning}
            wheelStatus={wheelStatus}
            onAdd={onAdd}
            onRemove={onRemove}
            onUpdate={onUpdate}
            onForm={onForm}
          />
        )}

        {activeTab === 'next' && (
          <DrawerNextTab
            movies={nextMovies}
            currentUser={currentUser}
            isGuest={isGuest}
            isAdmin={isAdmin}
            connected={connected}
            wheelIsSpinning={wheelIsSpinning}
            wheelStatus={wheelStatus}
            onAdd={onAddNext}
            onRemove={onRemoveNext}
            onUpdate={onUpdate}
            onForm={onFormNext}
          />
        )}

        {activeTab === 'settings' && isAdmin && <DrawerSettingsTab />}
      </section>
    </div>
  );
}
