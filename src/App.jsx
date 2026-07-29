import {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
  lazy,
  Suspense,
} from 'react';
import { io } from 'socket.io-client';
import {
  fetchUsers,
  fetchAuthSession,
  fetchSettings,
  fetchTheme,
  fetchCenterImage,
  fetchWheelMovies,
  fetchWheelStatus,
  formWheel,
  formNextWheel,
  postMovie,
  deleteMovie,
  updateMovie,
  postGuestAuth,
  postLogout,
  fetchNextWheelMovies,
  postNextMovie,
  deleteNextMovie,
  fetchOneOffWheel,
} from './api';
import AuthPage from './components/AuthPage';
import Nav from './components/Nav';
import WheelPage from './components/WheelPage';
import ResultModal from './components/ResultModal';
import AdminModal from './components/AdminModal';
import Toast from './components/Toast';
import ConnectionStatus from './components/ConnectionStatus';
import DrawerPanel from './components/DrawerPanel';
import ThemeDecorations from './components/ThemeDecorations';
import ReviewsJournalPage from './components/ReviewsJournalPage';

const WatchedPage = lazy(() => import('./components/WatchedPage'));
const GamesPage = lazy(() => import('./components/GamesPage'));
const SigamePacksPage = lazy(() => import('./components/SigamePacksPage'));
const VpnPage = lazy(() => import('./components/VpnPage'));

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const BROWSER_THEME_COLORS = {
  cheese: '#f8dc78',
  newyear: '#1a472a',
  spring: '#e8f5e9',
};

function pageFromLocation() {
  if (location.pathname === '/watched') return 'watched';
  if (location.pathname === '/games') return 'games';
  if (location.pathname === '/sigame') return 'sigame';
  if (location.pathname === '/vpn') return 'vpn';
  if (location.pathname === '/reviews/wine' || location.pathname === '/wine-reviews') {
    return 'wine-reviews';
  }
  if (
    location.pathname === '/reviews'
    || location.pathname === '/reviews/movies'
    || location.pathname === '/movie-reviews'
  ) {
    return 'movie-reviews';
  }
  return 'wheel';
}

function pathForPage(page) {
  if (page === 'watched') return '/watched';
  if (page === 'games') return '/games';
  if (page === 'sigame') return '/sigame';
  if (page === 'vpn') return '/vpn';
  if (page === 'wine-reviews') return '/reviews/wine';
  if (page === 'movie-reviews') return '/reviews';
  return '/';
}

function PageLoading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="skeleton" aria-hidden="true" />
      Загружаем раздел…
    </div>
  );
}

function normalizeServerSession(data, users) {
  if (!data || data.authenticated === false) return null;
  const isGuest = Boolean(data.isGuest ?? data.is_guest ?? data.guest);
  if (isGuest) return { isGuest: true, user: null };

  const rawUser = data.user || (
    data.user_id || data.userId
      ? {
          id: data.user_id || data.userId,
          name: data.name || data.user_name,
          role: data.role,
        }
      : null
  );
  const userId = Number(rawUser?.id);
  if (!Number.isInteger(userId)) return null;
  const listedUser = users.find(user => Number(user.id) === userId);
  return {
    isGuest: false,
    user: {
      ...(listedUser || {}),
      ...rawUser,
      id: userId,
      name: rawUser.name || listedUser?.name || 'Участник',
      role: rawUser.role || 'member',
    },
  };
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoadState, setUsersLoadState] = useState('loading');
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
  const [connectionState, setConnectionState] = useState('connecting');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wheelMovies, setWheelMovies] = useState([]);
  const [wheelStatus, setWheelStatus] = useState({
    formed: false,
    movies: [],
    round_movies: [],
    current_count: 0,
  });
  const [wheelStatusLoadState, setWheelStatusLoadState] = useState('loading');
  const [nextWheelMovies, setNextWheelMovies] = useState([]);
  const [centerImage, setCenterImage] = useState(null);
  const [wheelIsSpinning, setWheelIsSpinning] = useState(false);
  const [oneOffIsSpinning, setOneOffIsSpinning] = useState(false);
  const [oneOffState, setOneOffState] = useState({
    enabled: false,
    mode: 'selection',
    spin_duration: 5,
    movies: [],
    result: null,
    spinning_until: null,
  });
  const socketRef = useRef(null);
  const processedSpinIdsRef = useRef(new Set());
  const toastIdRef = useRef(0);

  // Spin broadcast state
  const [remoteSpin, setRemoteSpin] = useState(null);
  const [remoteOneOffSpin, setRemoteOneOffSpin] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const isLoggedIn = currentUser !== null || isGuest;
  const isAdmin = currentUser?.role === 'admin';

  const refreshSession = useCallback(async () => {
    const response = await fetchAuthSession();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        setCurrentUser(null);
        setIsGuest(false);
        localStorage.removeItem('cheeseWheelSession');
        localStorage.removeItem('cheeseWheelToken');
        return null;
      }
      throw new Error('Не удалось проверить сессию');
    }

    const data = await response.json();
    const session = normalizeServerSession(data, users);
    if (!session) {
      setCurrentUser(null);
      setIsGuest(false);
      localStorage.removeItem('cheeseWheelSession');
      localStorage.removeItem('cheeseWheelToken');
      return null;
    }

    setCurrentUser(session.user);
    setIsGuest(session.isGuest);
    localStorage.setItem(
      'cheeseWheelSession',
      JSON.stringify(session.isGuest ? { active: true, isGuest: true } : { active: true })
    );
    // Старый Bearer-токен нужен только для однократного переноса сессии в HttpOnly cookie.
    localStorage.removeItem('cheeseWheelToken');
    return session;
  }, [users]);

  const refreshWheelData = useCallback(async () => {
    setWheelStatusLoadState('loading');
    try {
      const [currentMovies, nextMovies, status, oneOff] = await Promise.all([
        fetchWheelMovies(),
        fetchNextWheelMovies(),
        fetchWheelStatus(),
        fetchOneOffWheel(),
      ]);
      if (
        !Array.isArray(currentMovies)
        || !Array.isArray(nextMovies)
        || !Array.isArray(status.movies)
        || !Array.isArray(oneOff.movies)
      ) {
        throw new Error('Некорректный ответ сервера');
      }
      setWheelMovies(currentMovies);
      setNextWheelMovies(nextMovies);
      setWheelStatus(status);
      setOneOffState(oneOff);
      setWheelStatusLoadState('ready');
    } catch {
      setWheelStatusLoadState('error');
    }
  }, []);

  // Socket setup
  useEffect(() => {
    const socket = io({
      autoConnect: false,
      auth: {},
    });
    socketRef.current = socket;

    const onConnect = () => {
      setConnected(true);
      setConnectionState('online');
      setLastSyncedAt(Date.now());
      Promise.allSettled([
        fetchSettings(),
        fetchTheme(),
        fetchCenterImage(),
        fetchWheelMovies(),
        fetchNextWheelMovies(),
        fetchWheelStatus(),
        fetchOneOffWheel(),
      ]).then(([
        settingsResult,
        themeResult,
        centerResult,
        wheelResult,
        nextResult,
        wheelStatusResult,
        oneOffResult,
      ]) => {
        if (settingsResult.status === 'fulfilled') {
          const settings = settingsResult.value;
          if (settings.spin_duration !== undefined) setSpinDuration(settings.spin_duration);
          if (settings.spin_enabled !== undefined) setSpinEnabled(settings.spin_enabled);
          if (settings.add_enabled !== undefined) setAddEnabled(settings.add_enabled);
          if (settings.decorations_enabled !== undefined) setDecorationsEnabled(settings.decorations_enabled);
        }
        if (themeResult.status === 'fulfilled') setThemeState(themeResult.value.theme || 'cheese');
        if (centerResult.status === 'fulfilled') setCenterImage(centerResult.value.url || null);
        if (wheelResult.status === 'fulfilled') setWheelMovies(wheelResult.value);
        if (nextResult.status === 'fulfilled') setNextWheelMovies(nextResult.value);
        if (wheelStatusResult.status === 'fulfilled') {
          setWheelStatus(wheelStatusResult.value);
          setWheelStatusLoadState('ready');
        }
        if (oneOffResult.status === 'fulfilled') setOneOffState(oneOffResult.value);
        setLastSyncedAt(Date.now());
      });
    };
    const onDisconnect = () => {
      setConnected(false);
      setConnectionState(socket.active ? 'reconnecting' : 'offline');
    };
    const onConnectError = () => {
      setConnected(false);
      setConnectionState(socket.active ? 'reconnecting' : 'error');
    };
    const onReconnectAttempt = () => setConnectionState('reconnecting');
    const onMovieAdded = movie => setWheelMovies(prev => [
      ...prev.filter(item => item.id !== movie.id && item.added_by !== movie.added_by),
      movie,
    ]);
    const onMovieRemoved = ({ id }) => setWheelMovies(prev => prev.filter(movie => movie.id !== id));
    const onMovieWatched = movie => setWheelMovies(prev => prev.filter(item => item.id !== movie.id));
    const onMovieUpdated = movie => setWheelMovies(prev => prev.map(item => item.id === movie.id ? { ...item, ...movie } : item));
    const onNextMovieAdded = movie => setNextWheelMovies(prev => [
      ...prev.filter(item => item.id !== movie.id && item.added_by !== movie.added_by),
      movie,
    ]);
    const onNextMovieUpdated = movie => setNextWheelMovies(prev => prev.map(item => item.id === movie.id ? { ...item, ...movie } : item));
    const onWheelStatusChanged = status => {
      setWheelStatus(status);
      setWheelStatusLoadState('ready');
    };
    const onUserRoleChanged = ({ user_id: userId, role }) => {
      setCurrentUser(previous => (
        previous && Number(previous.id) === Number(userId)
          ? { ...previous, role: role === 'admin' ? 'admin' : 'member' }
          : previous
      ));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.on('movie-added', onMovieAdded);
    socket.on('movie-removed', onMovieRemoved);
    socket.on('movie-watched', onMovieWatched);
    socket.on('movie-updated', onMovieUpdated);
    socket.on('wheel-status-changed', onWheelStatusChanged);
    socket.on('user-role-changed', onUserRoleChanged);
    socket.on('theme-changed', (data) => setThemeState(data.theme));
    socket.on('settings-changed', (settings) => {
      if (settings.spin_duration !== undefined) setSpinDuration(settings.spin_duration);
      if (settings.spin_enabled !== undefined) setSpinEnabled(settings.spin_enabled);
      if (settings.add_enabled !== undefined) setAddEnabled(settings.add_enabled);
      if (settings.decorations_enabled !== undefined) setDecorationsEnabled(settings.decorations_enabled);
    });
    socket.on('wheel-spinning', (data) => {
      if (data.spinId && processedSpinIdsRef.current.has(data.spinId)) return;
      if (data.spinId) {
        processedSpinIdsRef.current.add(data.spinId);
        if (processedSpinIdsRef.current.size > 20) {
          const oldest = processedSpinIdsRef.current.values().next().value;
          processedSpinIdsRef.current.delete(oldest);
        }
      }
      setRemoteSpin({
        ...data,
        initiatedByThisClient: data.initiatorSocketId === socket.id,
      });
    });
    socket.on('online-users', (connectedUsers) => {
      setOnlineUsers(connectedUsers);
      setLastSyncedAt(Date.now());
    });
    socket.on('center-image-changed', (data) => setCenterImage(data.url));
    socket.on('next-movie-added', onNextMovieAdded);
    socket.on('next-movie-updated', onNextMovieUpdated);
    socket.on('next-movie-removed', ({ id }) => setNextWheelMovies(prev => prev.filter(m => m.id !== id)));
    socket.on('next-wheel-promoted', (movies) => {
      setNextWheelMovies([]);
      setWheelMovies(movies);
    });
    socket.on('one-off-state-changed', setOneOffState);
    socket.on('one-off-spinning', setRemoteOneOffSpin);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.off('movie-added', onMovieAdded);
      socket.off('movie-removed', onMovieRemoved);
      socket.off('movie-watched', onMovieWatched);
      socket.off('movie-updated', onMovieUpdated);
      socket.off('wheel-status-changed', onWheelStatusChanged);
      socket.off('user-role-changed', onUserRoleChanged);
      socket.off('next-movie-added', onNextMovieAdded);
      socket.off('next-movie-updated', onNextMovieUpdated);
      socket.off('one-off-state-changed', setOneOffState);
      socket.off('one-off-spinning', setRemoteOneOffSpin);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (isLoggedIn) {
      socket.auth = {};
      setConnectionState('connecting');
      if (!socket.connected) socket.connect();
    } else {
      socket.disconnect();
      setConnected(false);
      setConnectionState('offline');
      setOnlineUsers([]);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) refreshWheelData();
  }, [isLoggedIn, refreshWheelData]);

  // Only the participant list is public. Authenticated data is loaded after
  // session restoration, which also avoids putting 401 error objects into
  // array state during a fresh login.
  useEffect(() => {
    (async () => {
      try {
        const u = await fetchUsers();
        if (!Array.isArray(u)) throw new Error('Некорректный список участников');
        setUsers(u);
        setUsersLoadState('ready');
      } catch (e) {
        console.error(e);
        setUsersLoadState('error');
        setSessionChecked(true);
      }
    })();
  }, []);

  // Session restore. Local storage is only a display hint; identity and role always
  // come from the server-side HttpOnly session.
  useEffect(() => {
    if (usersLoadState !== 'ready') return;
    let cancelled = false;

    (async () => {
      try {
        const session = await refreshSession();
        if (cancelled || !session) return;
        const requestedPage = pageFromLocation();
        if (session.isGuest && requestedPage === 'vpn') {
          history.replaceState({ page: 'wheel' }, '', '/');
          setPage('wheel');
        } else {
          setPage(requestedPage);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshSession, usersLoadState]);

  // Apply theme class + cache
  useEffect(() => {
    document.body.classList.remove('theme-cheese', 'theme-newyear', 'theme-spring');
    if (theme === 'newyear') document.body.classList.add('theme-newyear');
    else if (theme === 'spring') document.body.classList.add('theme-spring');
    const browserThemeColor = BROWSER_THEME_COLORS[theme] || BROWSER_THEME_COLORS.cheese;
    document.documentElement.style.backgroundColor = browserThemeColor;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', browserThemeColor);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Browser history
  useEffect(() => {
    if (!isLoggedIn) return;
    history.replaceState({ page }, '', pathForPage(page));
  }, [page, isLoggedIn]);

  useEffect(() => {
    const handler = (e) => {
      if (!isLoggedIn) return;
      const p = e.state?.page || pageFromLocation();
      if (p === 'vpn' && (isGuest || !currentUser)) {
        history.replaceState({ page: 'wheel' }, '', '/');
        setPage('wheel');
        return;
      }
      setPage(p);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [isLoggedIn, isGuest, currentUser]);

  const login = useCallback(async () => {
    try {
      const session = await refreshSession();
      if (!session?.user || session.isGuest) return false;
      setPage('wheel');
      return true;
    } catch (error) {
      console.error(error);
      showToast('Вход выполнен, но сессию не удалось проверить', 'error');
      return false;
    }
  }, [refreshSession, showToast]);

  const loginGuest = useCallback(async () => {
    try {
      const res = await postGuestAuth();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось войти в гостевой режим');
      const session = await refreshSession();
      if (!session?.isGuest) throw new Error('Не удалось проверить гостевую сессию');
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Не удалось войти в гостевой режим', 'error');
      return;
    }
    setPage('wheel');
  }, [refreshSession, showToast]);

  const logout = useCallback(async () => {
    try {
      await postLogout();
    } catch (e) {
      console.error(e);
    } finally {
      localStorage.removeItem('cheeseWheelSession');
      localStorage.removeItem('cheeseWheelToken');
      setCurrentUser(null);
      setIsGuest(false);
      setPage('auth');
      setAdminOpen(false);
      setDrawerOpen(false);
      history.replaceState(null, '', '/');
    }
  }, []);

  const navigate = useCallback((p) => {
    if (p === 'vpn' && (isGuest || !currentUser)) {
      setPage('wheel');
      setDrawerOpen(false);
      history.replaceState({ page: 'wheel' }, '', '/');
      return;
    }
    setPage(p);
    setDrawerOpen(false);
    history.pushState({ page: p }, '', pathForPage(p));
  }, [isGuest, currentUser]);

  // Drawer handlers
  const handleDrawerAdd = useCallback(async (title) => {
    if (!connected) {
      showToast('Нет соединения с сервером', 'error');
      return false;
    }
    if (wheelIsSpinning) {
      showToast('Дождитесь окончания прокрутки', 'info');
      return false;
    }
    try {
      const res = await postMovie(title);
      if (res.ok) {
        const data = await res.json();
        showToast(data.replaced ? 'Ваш фильм заменён' : `\u00AB${title}\u00BB выбран для колеса`, 'success');
        return true;
      } else {
        const data = await res.json();
        showToast(data.error || 'Ошибка добавления', 'error');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    }
    return false;
  }, [connected, showToast, wheelIsSpinning]);

  const handleDrawerRemove = useCallback(async (id) => {
    if (!connected || wheelIsSpinning) {
      showToast(!connected ? 'Нет соединения с сервером' : 'Дождитесь окончания прокрутки', 'error');
      return;
    }
    try {
      const response = await deleteMovie(id);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось удалить фильм');
      showToast('Фильм удалён из колеса', 'info');
    } catch (error) {
      showToast(error.message || 'Ошибка удаления', 'error');
    }
  }, [connected, showToast, wheelIsSpinning]);

  const handleDrawerUpdate = useCallback(async (id, title) => {
    if (!connected || wheelIsSpinning) {
      showToast(!connected ? 'Нет соединения с сервером' : 'Дождитесь окончания прокрутки', 'error');
      return false;
    }
    try {
      const response = await updateMovie(id, { title });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка обновления');
      showToast('Фильм обновлён', 'success');
      return true;
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
      return false;
    }
  }, [connected, showToast, wheelIsSpinning]);

  const handleFormWheel = useCallback(async () => {
    if (!connected || wheelIsSpinning) {
      showToast(!connected ? 'Нет соединения с сервером' : 'Дождитесь окончания прокрутки', 'error');
      return false;
    }
    try {
      const response = await formWheel();
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сформировать колесо');
      setWheelStatus(data);
      setWheelStatusLoadState('ready');
      return true;
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
      return false;
    }
  }, [connected, showToast, wheelIsSpinning]);

  const handleNextAdd = useCallback(async (title) => {
    if (!connected) {
      showToast('Нет соединения с сервером', 'error');
      return false;
    }
    try {
      const res = await postNextMovie(title);
      if (res.ok) {
        const data = await res.json();
        showToast(data.replaced ? 'Ваш фильм для следующего раунда заменён' : `«${title}» выбран для следующего раунда`, 'success');
        return true;
      } else {
        const data = await res.json();
        showToast(data.error || 'Ошибка добавления', 'error');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    }
    return false;
  }, [connected, showToast]);

  const handleNextRemove = useCallback(async (id) => {
    if (!connected) {
      showToast('Нет соединения с сервером', 'error');
      return;
    }
    try {
      const response = await deleteNextMovie(id);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось удалить фильм');
      showToast('Фильм удалён из следующего раунда', 'info');
    } catch (error) {
      showToast(error.message || 'Ошибка удаления', 'error');
    }
  }, [connected, showToast]);

  const handleFormNextWheel = useCallback(async () => {
    if (!connected || wheelIsSpinning) {
      showToast(!connected ? 'Нет соединения с сервером' : 'Дождитесь окончания прокрутки', 'error');
      return false;
    }
    try {
      const response = await formNextWheel();
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сформировать следующее колесо');
      setWheelStatus(data);
      setWheelStatusLoadState('ready');
      setNextWheelMovies([]);
      setWheelMovies(data.movies);
      showToast('Следующее колесо сформировано', 'success');
      return true;
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
      return false;
    }
  }, [connected, showToast, wheelIsSpinning]);

  const reconnect = useCallback(() => {
    setConnectionState('connecting');
    const socket = socketRef.current;
    if (!socket) return;
    socket.auth = {};
    socket.connect();
  }, []);

  const retryUsers = useCallback(async () => {
    setUsersLoadState('loading');
    try {
      const loadedUsers = await fetchUsers();
      setUsers(loadedUsers);
      setUsersLoadState('ready');
    } catch {
      setUsersLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (adminOpen && !isAdmin) setAdminOpen(false);
  }, [adminOpen, isAdmin]);

  const oneOffVisible = Boolean(
    oneOffState.enabled || oneOffIsSpinning || remoteOneOffSpin
  );

  const ctx = {
    currentUser, isGuest, isAdmin, users, page, theme, spinDuration,
    spinEnabled, addEnabled, decorationsEnabled,
    socket: socketRef.current, showToast, isLoggedIn,
    setSpinDuration, setSpinEnabled, setAddEnabled, setDecorationsEnabled, setThemeState,
    remoteSpin, setRemoteSpin,
    winner, setWinner, onlineUsers,
    drawerOpen, setDrawerOpen, wheelMovies, setWheelMovies,
    wheelStatus, setWheelStatus, wheelStatusLoadState, refreshWheelData,
    nextWheelMovies, setNextWheelMovies,
    centerImage, setCenterImage,
    connected, connectionState, lastSyncedAt, reconnect,
    wheelIsSpinning, setWheelIsSpinning,
    oneOffState, setOneOffState,
    oneOffIsSpinning, setOneOffIsSpinning,
    remoteOneOffSpin, setRemoteOneOffSpin,
    refreshSession,
  };

  return (
    <AppContext.Provider value={ctx}>
      {decorationsEnabled && <ThemeDecorations theme={theme} />}

      {isAdmin && (
        <button
          className={`admin-btn visible ${page === 'wheel' ? 'with-drawer' : ''}`}
          onClick={() => setAdminOpen(true)}
          aria-expanded={adminOpen}
          aria-label="Открыть админ-панель"
          title="Админ-панель"
        >
          ⚙️
        </button>
      )}

      {adminOpen && (
        <AdminModal theme={theme} onClose={() => setAdminOpen(false)} />
      )}

      {isLoggedIn && page === 'wheel' && !oneOffVisible && (
        <button
          className="drawer-toggle"
          onClick={() => setDrawerOpen(true)}
          disabled={wheelIsSpinning}
          aria-expanded={drawerOpen}
          aria-label="Открыть управление колесом"
          title="Управление колесом"
        >
          <span className="drawer-toggle-cheese">🧀</span>
        </button>
      )}

      {isLoggedIn && (
        <>
          <DrawerPanel
            movies={wheelMovies}
            nextMovies={nextWheelMovies}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onAdd={handleDrawerAdd}
            onRemove={handleDrawerRemove}
            onUpdate={handleDrawerUpdate}
            onForm={handleFormWheel}
            onFormNext={handleFormNextWheel}
            onAddNext={handleNextAdd}
            onRemoveNext={handleNextRemove}
          />
        </>
      )}

      {!isLoggedIn && usersLoadState === 'loading' && (
        <div className="auth-page active" aria-live="polite">
          <div className="auth-logo">🧀</div>
          <h1 className="auth-title">Собираем компанию…</h1>
          <p className="auth-subtitle">Загружаем участников и настройки.</p>
        </div>
      )}

      {!isLoggedIn && usersLoadState === 'error' && (
        <div className="auth-page active" role="alert">
          <div className="auth-logo">📡</div>
          <h1 className="auth-title">Сервер не ответил</h1>
          <p className="auth-subtitle">Проверьте соединение и попробуйте снова.</p>
          <button className="button-primary" type="button" onClick={retryUsers}>Повторить</button>
        </div>
      )}

      {!isLoggedIn && sessionChecked && usersLoadState === 'ready' && (
        <AuthPage users={users} onLogin={login} onGuest={loginGuest} />
      )}

      {isLoggedIn && (
        <div className={`app-container${page === 'wheel' ? ' wheel-active' : ''}${page === 'wheel' && oneOffVisible ? ' one-off-active' : ''}`}>
          <Nav activePage={page} onNavigate={navigate} onLogout={logout}
               userName={isGuest ? 'Гость' : currentUser?.name} />
          <div id="wheel-page" className={`page ${page === 'wheel' ? 'active' : ''}`}
               style={{ display: page === 'wheel' ? '' : 'none' }}>
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
                onKindChange={kind => navigate(kind === 'wine' ? 'wine-reviews' : 'movie-reviews')}
              />
            </div>
          )}
        </div>
      )}

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
    </AppContext.Provider>
  );
}
