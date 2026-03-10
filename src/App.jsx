import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { io } from 'socket.io-client';
import { fetchUsers, fetchSettings, fetchTheme } from './api';
import AuthPage from './components/AuthPage';
import Nav from './components/Nav';
import WheelPage from './components/WheelPage';
import WatchedPage from './components/WatchedPage';
import ResultModal from './components/ResultModal';
import AdminModal from './components/AdminModal';
import Toast from './components/Toast';
import ConnectionStatus from './components/ConnectionStatus';
import ThemeDecorations from './components/ThemeDecorations';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState('auth');
  const [theme, setThemeState] = useState('cheese');
  const [spinDuration, setSpinDuration] = useState(5);
  const [toasts, setToasts] = useState([]);
  const [winner, setWinner] = useState(null);
  const [connected, setConnected] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
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
    socket.on('settings-changed', (settings) => setSpinDuration(settings.spin_duration));
    socket.on('wheel-spinning', (data) => setRemoteSpin(data));

    return () => socket.disconnect();
  }, []);

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
      } catch (e) { console.error(e); }
      try {
        const t = await fetchTheme();
        setThemeState(t.theme || 'cheese');
      } catch (e) { console.error(e); }
    })();
  }, []);

  // Session restore
  useEffect(() => {
    if (users.length === 0) return;
    const saved = localStorage.getItem('cheeseWheelSession');
    if (saved) {
      try {
        const session = JSON.parse(saved);
        if (session.isGuest) {
          setIsGuest(true);
          setPage('wheel');
        } else if (session.userId) {
          const user = users.find(u => u.id === session.userId);
          if (user) {
            setCurrentUser(user);
            setPage('wheel');
          }
        }
      } catch (e) {
        localStorage.removeItem('cheeseWheelSession');
      }
    }
  }, [users]);

  // Apply theme class
  useEffect(() => {
    document.body.classList.remove('theme-cheese', 'theme-newyear', 'theme-spring');
    if (theme === 'newyear') document.body.classList.add('theme-newyear');
    else if (theme === 'spring') document.body.classList.add('theme-spring');
  }, [theme]);

  // Browser history
  useEffect(() => {
    if (!isLoggedIn) return;
    const path = page === 'watched' ? '/watched' : '/';
    history.replaceState({ page }, '', path);
  }, [page, isLoggedIn]);

  useEffect(() => {
    const handler = (e) => {
      if (!isLoggedIn) return;
      const p = e.state?.page || (location.pathname === '/watched' ? 'watched' : 'wheel');
      setPage(p);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [isLoggedIn]);

  const login = useCallback((user) => {
    setCurrentUser(user);
    setIsGuest(false);
    localStorage.setItem('cheeseWheelSession', JSON.stringify({ userId: user.id }));
    setPage('wheel');
  }, []);

  const loginGuest = useCallback(() => {
    setCurrentUser(null);
    setIsGuest(true);
    localStorage.setItem('cheeseWheelSession', JSON.stringify({ isGuest: true }));
    setPage('wheel');
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('cheeseWheelSession');
    setCurrentUser(null);
    setIsGuest(false);
    setPage('auth');
    setAdminOpen(false);
    history.replaceState(null, '', '/');
  }, []);

  const navigate = useCallback((p) => {
    setPage(p);
    history.pushState({ page: p }, '', p === 'watched' ? '/watched' : '/');
  }, []);

  const ctx = {
    currentUser, isGuest, users, page, theme, spinDuration,
    socket: socketRef.current, showToast, isLoggedIn,
    setSpinDuration, setThemeState,
    remoteSpin, setRemoteSpin,
    winner, setWinner,
  };

  return (
    <AppContext.Provider value={ctx}>
      <ThemeDecorations theme={theme} />

      {currentUser?.id === 2 && (
        <button className="admin-btn visible" onClick={() => setAdminOpen(true)}>
          ⚙️
        </button>
      )}

      {adminOpen && (
        <AdminModal theme={theme} onClose={() => setAdminOpen(false)} />
      )}

      {!isLoggedIn && (
        <AuthPage users={users} onLogin={login} onGuest={loginGuest} />
      )}

      {isLoggedIn && (
        <>
          <div id="wheel-page" className={`page wheel-page ${page === 'wheel' ? 'active' : ''}`}
               style={{ display: page === 'wheel' ? '' : 'none' }}>
            <Nav activePage={page} onNavigate={navigate} onLogout={logout}
                 userName={isGuest ? 'Гость' : currentUser?.name} />
            <WheelPage />
          </div>
          <div id="watched-page" className={`page watched-page ${page === 'watched' ? 'active' : ''}`}
               style={{ display: page === 'watched' ? '' : 'none' }}>
            <Nav activePage={page} onNavigate={navigate} onLogout={logout}
                 userName={isGuest ? 'Гость' : currentUser?.name} />
            <WatchedPage />
          </div>
        </>
      )}

      {winner && (
        <ResultModal title={winner.title} onClose={() => setWinner(null)} movieId={winner.id} />
      )}

      <Toast toasts={toasts} />
      <ConnectionStatus connected={connected} />
    </AppContext.Provider>
  );
}
