import { lazy, Suspense } from 'react';
import AdminModal from '../components/AdminModal';
import AuthPage from '../components/AuthPage';
import ConnectionStatus from '../components/ConnectionStatus';
import DrawerPanel from '../components/DrawerPanel';
import Nav from '../components/Nav';
import ResultModal from '../components/ResultModal';
import ReviewsJournalPage from '../components/ReviewsJournalPage';
import ThemeDecorations from '../components/ThemeDecorations';
import Toast from '../components/Toast';
import WheelPage from '../components/WheelPage';
import { useApp } from './AppContext';

const GamesPage = lazy(() => import('../components/GamesPage'));
const SigamePacksPage = lazy(() => import('../components/SigamePacksPage'));
const VpnPage = lazy(() => import('../components/VpnPage'));
const WatchedPage = lazy(() => import('../components/WatchedPage'));

function PageLoading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="skeleton" aria-hidden="true" />
      Загружаем раздел…
    </div>
  );
}

function AuthState() {
  const {
    isLoggedIn,
    login,
    loginGuest,
    retryUsers,
    sessionChecked,
    users,
    usersLoadState,
  } = useApp();

  if (isLoggedIn) return null;
  if (usersLoadState === 'loading') {
    return (
      <div className="auth-page active" aria-live="polite">
        <div className="auth-logo">🧀</div>
        <h1 className="auth-title">Собираем компанию…</h1>
        <p className="auth-subtitle">Загружаем участников и настройки.</p>
      </div>
    );
  }
  if (usersLoadState === 'error') {
    return (
      <div className="auth-page active" role="alert">
        <div className="auth-logo">📡</div>
        <h1 className="auth-title">Сервер не ответил</h1>
        <p className="auth-subtitle">Проверьте соединение и попробуйте снова.</p>
        <button className="button-primary" type="button" onClick={retryUsers}>
          Повторить
        </button>
      </div>
    );
  }
  return sessionChecked
    ? <AuthPage users={users} onLogin={login} onGuest={loginGuest} />
    : null;
}

function PageContent() {
  const { isGuest, navigate, page } = useApp();

  return (
    <>
      <div
        id="wheel-page"
        className={`page ${page === 'wheel' ? 'active' : ''}`}
        style={{ display: page === 'wheel' ? '' : 'none' }}
      >
        <WheelPage />
      </div>
      {page === 'watched' && (
        <div id="watched-page" className="page active">
          <Suspense fallback={<PageLoading />}>
            <WatchedPage />
          </Suspense>
        </div>
      )}
      {page === 'games' && (
        <div id="games-page" className="page active">
          <Suspense fallback={<PageLoading />}>
            <GamesPage />
          </Suspense>
        </div>
      )}
      {page === 'sigame' && (
        <div id="sigame-page" className="page active">
          <Suspense fallback={<PageLoading />}>
            <SigamePacksPage />
          </Suspense>
        </div>
      )}
      {!isGuest && page === 'vpn' && (
        <div id="vpn-page" className="page active">
          <Suspense fallback={<PageLoading />}>
            <VpnPage />
          </Suspense>
        </div>
      )}
      {(page === 'movie-reviews' || page === 'wine-reviews') && (
        <div id="reviews-page" className="page active">
          <ReviewsJournalPage
            kind={page === 'wine-reviews' ? 'wine' : 'movies'}
            onKindChange={kind => navigate(
              kind === 'wine' ? 'wine-reviews' : 'movie-reviews'
            )}
          />
        </div>
      )}
    </>
  );
}

function AppNavigation() {
  const {
    currentUser,
    isGuest,
    isLoggedIn,
    logout,
    navigate,
    oneOffVisible,
    page,
  } = useApp();

  if (!isLoggedIn) return null;
  return (
    <div
      className={[
        'app-container',
        page === 'wheel' ? 'wheel-active' : '',
        page === 'wheel' && oneOffVisible ? 'one-off-active' : '',
      ].filter(Boolean).join(' ')}
    >
      <Nav
        activePage={page}
        onNavigate={navigate}
        onLogout={logout}
        userName={isGuest ? 'Гость' : currentUser?.name}
      />
      <PageContent />
    </div>
  );
}

function AppControls() {
  const {
    addCurrentMovie,
    addNextMovie,
    adminOpen,
    decorationsEnabled,
    drawerOpen,
    formCurrentWheel,
    formUpcomingWheel,
    isAdmin,
    isLoggedIn,
    nextWheelMovies,
    oneOffVisible,
    page,
    removeCurrentMovie,
    removeNextMovie,
    setAdminOpen,
    setDrawerOpen,
    theme,
    updateCurrentMovie,
    wheelIsSpinning,
    wheelMovies,
  } = useApp();

  return (
    <>
      {decorationsEnabled && <ThemeDecorations theme={theme} />}
      {isAdmin && (
        <div className="admin-btn-layer">
          <button
            className={`admin-btn visible ${page === 'wheel' ? 'with-drawer' : ''}`}
            type="button"
            onClick={() => setAdminOpen(true)}
            aria-expanded={adminOpen}
            aria-label="Открыть админ-панель"
            title="Админ-панель"
          >
            ⚙️
          </button>
        </div>
      )}
      {adminOpen && (
        <AdminModal theme={theme} onClose={() => setAdminOpen(false)} />
      )}
      {isLoggedIn && page === 'wheel' && !oneOffVisible && (
        <div className="drawer-toggle-layer">
          <button
            className="drawer-toggle"
            type="button"
            onClick={() => setDrawerOpen(true)}
            disabled={wheelIsSpinning}
            aria-expanded={drawerOpen}
            aria-label="Открыть управление колесом"
            title="Управление колесом"
          >
            <span className="drawer-toggle-cheese">{theme === 'samurai' ? '⚔️' : '🧀'}</span>
          </button>
        </div>
      )}
      {isLoggedIn && (
        <DrawerPanel
          movies={wheelMovies}
          nextMovies={nextWheelMovies}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onAdd={addCurrentMovie}
          onRemove={removeCurrentMovie}
          onUpdate={updateCurrentMovie}
          onForm={formCurrentWheel}
          onFormNext={formUpcomingWheel}
          onAddNext={addNextMovie}
          onRemoveNext={removeNextMovie}
        />
      )}
    </>
  );
}

function GlobalFeedback() {
  const {
    centerImage,
    connectionState,
    currentUser,
    lastSyncedAt,
    navigate,
    onlineUsers,
    reconnect,
    setWinner,
    toasts,
    winner,
  } = useApp();

  return (
    <>
      {winner && (
        <ResultModal
          title={winner.title}
          addedByName={winner.added_by_name}
          centerImage={centerImage}
          onClose={() => setWinner(null)}
          onViewHistory={() => {
            setWinner(null);
            navigate('watched');
          }}
        />
      )}
      <Toast toasts={toasts} />
      <ConnectionStatus
        state={connectionState}
        onlineUsers={onlineUsers}
        currentUser={currentUser}
        lastSyncedAt={lastSyncedAt}
        onReconnect={reconnect}
      />
    </>
  );
}

export default function AppView() {
  return (
    <>
      <AppControls />
      <AuthState />
      <AppNavigation />
      <GlobalFeedback />
    </>
  );
}
