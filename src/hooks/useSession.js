import { useCallback, useEffect, useState } from 'react';
import {
  fetchAuthSession,
  fetchUsers,
  postGuestAuth,
  postLogout,
} from '../api';
import {
  canVisitPage,
  pageFromLocation,
  pathForPage,
} from '../app/routing';

function clearSessionHints() {
  localStorage.removeItem('cheeseWheelSession');
  localStorage.removeItem('cheeseWheelToken');
}

function pathForCurrentLocation(page) {
  const path = pathForPage(page);
  if (
    page === 'conquiztador'
    && new URLSearchParams(window.location.search).get('conquizDev') === '1'
  ) {
    return `${path}?conquizDev=1`;
  }
  return path;
}

export function normalizeServerSession(data, users) {
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

export function useSession({ onLogout, showToast }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [page, setPage] = useState('auth');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoadState, setUsersLoadState] = useState('loading');

  const isLoggedIn = currentUser !== null || isGuest;
  const isAdmin = currentUser?.role === 'admin';

  const refreshSession = useCallback(async () => {
    const response = await fetchAuthSession();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        setCurrentUser(null);
        setIsGuest(false);
        clearSessionHints();
        return null;
      }
      throw new Error('Не удалось проверить сессию');
    }

    const data = await response.json();
    const session = normalizeServerSession(data, users);
    if (!session) {
      setCurrentUser(null);
      setIsGuest(false);
      clearSessionHints();
      return null;
    }

    setCurrentUser(session.user);
    setIsGuest(session.isGuest);
    localStorage.setItem(
      'cheeseWheelSession',
      JSON.stringify(session.isGuest ? { active: true, isGuest: true } : { active: true })
    );
    localStorage.removeItem('cheeseWheelToken');
    return session;
  }, [users]);

  const retryUsers = useCallback(async () => {
    setUsersLoadState('loading');
    try {
      const loadedUsers = await fetchUsers();
      if (!Array.isArray(loadedUsers)) throw new Error('Некорректный список участников');
      setUsers(loadedUsers);
      setUsersLoadState('ready');
      return loadedUsers;
    } catch {
      setUsersLoadState('error');
      return null;
    }
  }, []);

  useEffect(() => {
    retryUsers().catch(() => {});
  }, [retryUsers]);

  useEffect(() => {
    if (usersLoadState !== 'ready') {
      if (usersLoadState === 'error') setSessionChecked(true);
      return undefined;
    }
    let cancelled = false;

    (async () => {
      try {
        const session = await refreshSession();
        if (cancelled || !session) return;
        const requestedPage = pageFromLocation();
        const nextPage = canVisitPage(requestedPage, session) ? requestedPage : 'wheel';
        if (nextPage !== requestedPage) {
          history.replaceState({ page: nextPage }, '', pathForPage(nextPage));
        }
        setPage(nextPage);
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

  useEffect(() => {
    if (!isLoggedIn || page === 'auth') return;
    history.replaceState({ page }, '', pathForCurrentLocation(page));
  }, [isLoggedIn, page]);

  useEffect(() => {
    const handlePopState = event => {
      if (!isLoggedIn) return;
      const requestedPage = event.state?.page || pageFromLocation();
      const session = { isGuest, user: currentUser };
      const nextPage = canVisitPage(requestedPage, session) ? requestedPage : 'wheel';
      if (nextPage !== requestedPage) {
        history.replaceState({ page: nextPage }, '', pathForPage(nextPage));
      }
      setPage(nextPage);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentUser, isGuest, isLoggedIn]);

  const login = useCallback(async () => {
    try {
      await retryUsers();
      const session = await refreshSession();
      if (!session?.user || session.isGuest) return false;
      const requestedPage = pageFromLocation();
      setPage(canVisitPage(requestedPage, session) ? requestedPage : 'wheel');
      return true;
    } catch (error) {
      console.error(error);
      showToast('Вход выполнен, но сессию не удалось проверить', 'error');
      return false;
    }
  }, [refreshSession, retryUsers, showToast]);

  const loginGuest = useCallback(async () => {
    try {
      const response = await postGuestAuth();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось войти в гостевой режим');
      const session = await refreshSession();
      if (!session?.isGuest) throw new Error('Не удалось проверить гостевую сессию');
      const requestedPage = pageFromLocation();
      setPage(canVisitPage(requestedPage, session) ? requestedPage : 'wheel');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Не удалось войти в гостевой режим', 'error');
    }
  }, [refreshSession, showToast]);

  const logout = useCallback(async () => {
    try {
      await postLogout();
    } catch (error) {
      console.error(error);
    } finally {
      clearSessionHints();
      setCurrentUser(null);
      setIsGuest(false);
      setPage('auth');
      history.replaceState(null, '', '/');
      onLogout?.();
    }
  }, [onLogout]);

  const navigate = useCallback(nextPage => {
    const session = { isGuest, user: currentUser };
    const allowedPage = canVisitPage(nextPage, session) ? nextPage : 'wheel';
    setPage(allowedPage);
    history.pushState({ page: allowedPage }, '', pathForPage(allowedPage));
  }, [currentUser, isGuest]);

  return {
    currentUser,
    isAdmin,
    isGuest,
    isLoggedIn,
    login,
    loginGuest,
    logout,
    navigate,
    page,
    refreshSession,
    retryUsers,
    sessionChecked,
    setCurrentUser,
    users,
    usersLoadState,
  };
}
