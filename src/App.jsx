import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { io } from 'socket.io-client';
import { fetchUsers, fetchSettings, fetchTheme, fetchCenterImage, postMovie, deleteMovie, postGuestAuth } from './api';
import AuthPage from './components/AuthPage';
import Nav from './components/Nav';
import WheelPage from './components/WheelPage';
import WatchedPage from './components/WatchedPage';
import ResultModal from './components/ResultModal';
import AdminModal from './components/AdminModal';
import Toast from './components/Toast';
import ConnectionStatus from './components/ConnectionStatus';
import DrawerPanel from './components/DrawerPanel';
import GamesPage from './components/GamesPage';
import WineReviewsPage from './components/WineReviewsPage';
import MovieReviewsPage from './components/MovieReviewsPage';
import ThemeDecorations from './components/ThemeDecorations';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState('auth');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'cheese');
  const [spinDuration, setSpinDuration] = useState(5);
  const [spinEnabled, setSpinEnabled] = useState(null);
  const [addEnabled, setAddEnabled] = useState(null);
  const [decorationsEnabled, setDecorationsEnabled] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [winner, setWinner] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wheelMovies, setWheelMovies] = useState([]);
  const [centerImage, setCenterImage] = useState(null);
  const socketRef = useRef(null);
  const toastIdRef = useRef(0);

  // Spin broadcast state
  const [remoteSpin, setRemoteSpin] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const isLoggedIn = currentUser !== null || isGuest;

  // Socket setup
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('theme-changed', (data) => setThemeState(data.theme));
    socket.on('settings-changed', (settings) => {
      if (settings.spin_duration !== undefined) setSpinDuration(settings.spin_duration);
      if (settings.spin_enabled !== undefined) setSpinEnabled(settings.spin_enabled);
      if (settings.add_enabled !== undefined) setAddEnabled(settings.add_enabled);
      if (settings.decorations_enabled !== undefined) setDecorationsEnabled(settings.decorations_enabled);
    });
    socket.on('wheel-spinning', (data) => setRemoteSpin(data));
    socket.on('online-users', (users) => setOnlineUsers(users));
    socket.on('center-image-changed', (data) => setCenterImage(data.url));

    return () => socket.disconnect();
  }, []);

  // Emit user identity to socket for online tracking
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !currentUser || !connected) return;
    socket.emit('set-user', { userId: currentUser.id, userName: currentUser.name });
  }, [currentUser, connected]);

  // Initial data load
  useEffect(() => {
    (async () => {
      try {
        const u = await fetchUsers();
        setUsers(u);
      } catch (e) { console.error(e); }
      try {
        const s = await fetchSettings();
        setSpinDuration(s.spin_duration || 5);
        if (s.spin_enabled !== undefined) setSpinEnabled(s.spin_enabled);
        if (s.add_enabled !== undefined) setAddEnabled(s.add_enabled);
        if (s.decorations_enabled !== undefined) setDecorationsEnabled(s.decorations_enabled);
      } catch (e) { console.error(e); }
      try {
        const t = await fetchTheme();
        setThemeState(t.theme || 'cheese');
      } catch (e) { console.error(e); }
      try {
        const c = await fetchCenterImage();
        setCenterImage(c.url || null);
      } catch (e) { console.error(e); }
    })();
  }, []);

  // Session restore
  useEffect(() => {
    if (users.length === 0) return;
    const saved = localStorage.getItem('cheeseWheelSession');
    const token = localStorage.getItem('cheeseWheelToken');
    if (saved && token) {
      try {
        const session = JSON.parse(saved);
        const urlPage = location.pathname === '/watched' ? 'watched'
        : location.pathname === '/games' ? 'games'
        : location.pathname === '/wine-reviews' ? 'wine-reviews'
        : location.pathname === '/movie-reviews' ? 'movie-reviews'
        : 'wheel';
        if (session.isGuest) {
          setIsGuest(true);
          setPage(urlPage);
        } else if (session.userId) {
          const user = users.find(u => u.id === session.userId);
          if (user) {
            setCurrentUser(user);
            setPage(urlPage);
          }
        }
      } catch (e) {
        localStorage.removeItem('cheeseWheelSession');
        localStorage.removeItem('cheeseWheelToken');
      }
    } else if (saved && !token) {
      // Старая сессия без токена — чистим, отправляем на логин
      localStorage.removeItem('cheeseWheelSession');
    }
    setSessionChecked(true);
  }, [users]);

  // Apply theme class + cache
  useEffect(() => {
    document.body.classList.remove('theme-cheese', 'theme-newyear', 'theme-spring');
    if (theme === 'newyear') document.body.classList.add('theme-newyear');
    else if (theme === 'spring') document.body.classList.add('theme-spring');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Browser history
  useEffect(() => {
    if (!isLoggedIn) return;
    const path = page === 'watched' ? '/watched'
      : page === 'games' ? '/games'
      : page === 'wine-reviews' ? '/wine-reviews'
      : page === 'movie-reviews' ? '/movie-reviews'
      : '/';
    history.replaceState({ page }, '', path);
  }, [page, isLoggedIn]);

  useEffect(() => {
    const handler = (e) => {
      if (!isLoggedIn) return;
      const p = e.state?.page || (location.pathname === '/watched' ? 'watched'
        : location.pathname === '/games' ? 'games'
        : location.pathname === '/wine-reviews' ? 'wine-reviews'
        : location.pathname === '/movie-reviews' ? 'movie-reviews'
        : 'wheel');
      setPage(p);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [isLoggedIn]);

  const login = useCallback((user, token) => {
    setCurrentUser(user);
    setIsGuest(false);
    localStorage.setItem('cheeseWheelSession', JSON.stringify({ userId: user.id }));
    if (token) localStorage.setItem('cheeseWheelToken', token);
    setPage('wheel');
  }, []);

  const loginGuest = useCallback(async () => {
    try {
      const res = await postGuestAuth();
      const data = await res.json();
      if (data.token) localStorage.setItem('cheeseWheelToken', data.token);
    } catch (e) { console.error(e); }
    setCurrentUser(null);
    setIsGuest(true);
    localStorage.setItem('cheeseWheelSession', JSON.stringify({ isGuest: true }));
    setPage('wheel');
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('cheeseWheelSession');
    localStorage.removeItem('cheeseWheelToken');
    setCurrentUser(null);
    setIsGuest(false);
    setPage('auth');
    setAdminOpen(false);
    setDrawerOpen(false);
    history.replaceState(null, '', '/');
  }, []);

  const navigate = useCallback((p) => {
    setPage(p);
    setDrawerOpen(false);
    const navPath = p === 'watched' ? '/watched'
      : p === 'games' ? '/games'
      : p === 'wine-reviews' ? '/wine-reviews'
      : p === 'movie-reviews' ? '/movie-reviews'
      : '/';
    history.pushState({ page: p }, '', navPath);
  }, []);

  // Drawer handlers
  const handleDrawerAdd = useCallback(async (title) => {
    try {
      const res = await postMovie(title, currentUser?.id);
      if (res.ok) {
        showToast(`\u00AB${title}\u00BB добавлен в колесо`, 'success');
        return true;
      } else {
        const data = await res.json();
        showToast(data.error || 'Ошибка добавления', 'error');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    }
    return false;
  }, [currentUser, showToast]);

  const handleDrawerRemove = useCallback(async (id) => {
    try {
      await deleteMovie(id);
      showToast('Фильм удалён из колеса', 'info');
    } catch {
      showToast('Ошибка удаления', 'error');
    }
  }, [showToast]);

  const ctx = {
    currentUser, isGuest, users, page, theme, spinDuration,
    spinEnabled, addEnabled, decorationsEnabled,
    socket: socketRef.current, showToast, isLoggedIn,
    setSpinDuration, setSpinEnabled, setAddEnabled, setDecorationsEnabled, setThemeState,
    remoteSpin, setRemoteSpin,
    winner, setWinner, onlineUsers,
    drawerOpen, setDrawerOpen, wheelMovies, setWheelMovies,
    centerImage, setCenterImage,
  };

  return (
    <AppContext.Provider value={ctx}>
      {decorationsEnabled && <ThemeDecorations theme={theme} />}

      {currentUser?.id === 2 && (
        <button
          className={`admin-btn visible ${page === 'wheel' ? 'with-drawer' : ''}`}
          onClick={() => setAdminOpen(true)}
        >
          ⚙️
        </button>
      )}

      {adminOpen && (
        <AdminModal theme={theme} onClose={() => setAdminOpen(false)} />
      )}

      {isLoggedIn && !isGuest && page === 'wheel' && (
        <button
          className="drawer-toggle"
          onClick={() => setDrawerOpen(true)}
          title="Фильмы в колесе"
        >
          <span className="drawer-toggle-cheese">🧀</span>
        </button>
      )}

      {isLoggedIn && !isGuest && (
        <>
          <div
            className={`drawer-backdrop ${drawerOpen ? 'visible' : ''}`}
            onClick={() => setDrawerOpen(false)}
          />
          <DrawerPanel
            movies={wheelMovies}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onAdd={handleDrawerAdd}
            onRemove={handleDrawerRemove}
          />
        </>
      )}

      {!isLoggedIn && sessionChecked && (
        <AuthPage users={users} onLogin={login} onGuest={loginGuest} />
      )}

      {isLoggedIn && (
        <div className="app-container">
          <Nav activePage={page} onNavigate={navigate} onLogout={logout}
               userName={isGuest ? 'Гость' : currentUser?.name} />
          <div id="wheel-page" className={`page ${page === 'wheel' ? 'active' : ''}`}
               style={{ display: page === 'wheel' ? '' : 'none' }}>
            <WheelPage />
          </div>
          <div id="watched-page" className={`page ${page === 'watched' ? 'active' : ''}`}
               style={{ display: page === 'watched' ? '' : 'none' }}>
            <WatchedPage />
          </div>
          <div id="games-page" className={`page ${page === 'games' ? 'active' : ''}`}
               style={{ display: page === 'games' ? '' : 'none' }}>
            <GamesPage />
          </div>
          <div id="wine-reviews-page" className={`page ${page === 'wine-reviews' ? 'active' : ''}`}
               style={{ display: page === 'wine-reviews' ? '' : 'none' }}>
            <WineReviewsPage />
          </div>
          <div id="movie-reviews-page" className={`page ${page === 'movie-reviews' ? 'active' : ''}`}
               style={{ display: page === 'movie-reviews' ? '' : 'none' }}>
            <MovieReviewsPage />
          </div>
        </div>
      )}

      {winner && (
        <ResultModal title={winner.title} addedByName={winner.added_by_name} onClose={() => setWinner(null)} />
      )}

      <Toast toasts={toasts} />
      <ConnectionStatus connected={connected} onlineUsers={onlineUsers} />
    </AppContext.Provider>
  );
}
