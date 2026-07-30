import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  fetchCenterImage,
  fetchNextWheelMovies,
  fetchOneOffWheel,
  fetchSettings,
  fetchTheme,
  fetchWheelMovies,
  fetchWheelStatus,
} from '../api';

const MAX_PROCESSED_SPINS = 20;

export function useRealtimeSocket({
  isLoggedIn,
  setCurrentUser,
  settings,
  wheel,
}) {
  const {
    setAddEnabled,
    setDecorationsEnabled,
    setSpinDuration,
    setSpinEnabled,
    setThemeState,
  } = settings;
  const {
    setCenterImage,
    setNextWheelMovies,
    setOneOffState,
    setRemoteOneOffSpin,
    setRemoteSpin,
    setWheelMovies,
    setWheelStatus,
    setWheelStatusLoadState,
  } = wheel;
  const [socket] = useState(() => io({ autoConnect: false, auth: {} }));
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('connecting');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const processedSpinIdsRef = useRef(new Set());

  useEffect(() => {
    const applySettings = data => {
      if (data.spin_duration !== undefined) setSpinDuration(data.spin_duration);
      if (data.spin_enabled !== undefined) setSpinEnabled(data.spin_enabled);
      if (data.add_enabled !== undefined) setAddEnabled(data.add_enabled);
      if (data.decorations_enabled !== undefined) {
        setDecorationsEnabled(data.decorations_enabled);
      }
    };

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
        if (settingsResult.status === 'fulfilled') applySettings(settingsResult.value);
        if (themeResult.status === 'fulfilled') {
          setThemeState(themeResult.value.theme || 'cheese');
        }
        if (centerResult.status === 'fulfilled') {
          setCenterImage(centerResult.value.url || null);
        }
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
    const onMovieAdded = movie => setWheelMovies(previous => [
      ...previous.filter(item => (
        item.id !== movie.id && item.added_by !== movie.added_by
      )),
      movie,
    ]);
    const onMovieRemoved = ({ id }) => {
      setWheelMovies(previous => previous.filter(movie => movie.id !== id));
    };
    const onMovieWatched = movie => {
      setWheelMovies(previous => previous.filter(item => item.id !== movie.id));
    };
    const onMovieUpdated = movie => {
      setWheelMovies(previous => previous.map(item => (
        item.id === movie.id ? { ...item, ...movie } : item
      )));
    };
    const onNextMovieAdded = movie => setNextWheelMovies(previous => [
      ...previous.filter(item => (
        item.id !== movie.id && item.added_by !== movie.added_by
      )),
      movie,
    ]);
    const onNextMovieUpdated = movie => {
      setNextWheelMovies(previous => previous.map(item => (
        item.id === movie.id ? { ...item, ...movie } : item
      )));
    };
    const onNextMovieRemoved = ({ id }) => {
      setNextWheelMovies(previous => previous.filter(movie => movie.id !== id));
    };
    const onNextWheelPromoted = movies => {
      setNextWheelMovies([]);
      setWheelMovies(movies);
    };
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
    const onThemeChanged = data => setThemeState(data.theme);
    const onSettingsChanged = data => applySettings(data);
    const onWheelSpinning = data => {
      if (data.spinId && processedSpinIdsRef.current.has(data.spinId)) return;
      if (data.spinId) {
        processedSpinIdsRef.current.add(data.spinId);
        if (processedSpinIdsRef.current.size > MAX_PROCESSED_SPINS) {
          const oldest = processedSpinIdsRef.current.values().next().value;
          processedSpinIdsRef.current.delete(oldest);
        }
      }
      setRemoteSpin({
        ...data,
        initiatedByThisClient: data.initiatorSocketId === socket.id,
      });
    };
    const onOnlineUsers = users => {
      setOnlineUsers(users);
      setLastSyncedAt(Date.now());
    };
    const onCenterImageChanged = data => setCenterImage(data.url);
    const onOneOffStateChanged = data => setOneOffState(data);
    const onOneOffSpinning = data => setRemoteOneOffSpin(data);

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
    socket.on('theme-changed', onThemeChanged);
    socket.on('settings-changed', onSettingsChanged);
    socket.on('wheel-spinning', onWheelSpinning);
    socket.on('online-users', onOnlineUsers);
    socket.on('center-image-changed', onCenterImageChanged);
    socket.on('next-movie-added', onNextMovieAdded);
    socket.on('next-movie-updated', onNextMovieUpdated);
    socket.on('next-movie-removed', onNextMovieRemoved);
    socket.on('next-wheel-promoted', onNextWheelPromoted);
    socket.on('one-off-state-changed', onOneOffStateChanged);
    socket.on('one-off-spinning', onOneOffSpinning);

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
      socket.off('theme-changed', onThemeChanged);
      socket.off('settings-changed', onSettingsChanged);
      socket.off('wheel-spinning', onWheelSpinning);
      socket.off('online-users', onOnlineUsers);
      socket.off('center-image-changed', onCenterImageChanged);
      socket.off('next-movie-added', onNextMovieAdded);
      socket.off('next-movie-updated', onNextMovieUpdated);
      socket.off('next-movie-removed', onNextMovieRemoved);
      socket.off('next-wheel-promoted', onNextWheelPromoted);
      socket.off('one-off-state-changed', onOneOffStateChanged);
      socket.off('one-off-spinning', onOneOffSpinning);
      socket.disconnect();
    };
  }, [
    setAddEnabled,
    setCenterImage,
    setCurrentUser,
    setDecorationsEnabled,
    setNextWheelMovies,
    setOneOffState,
    setRemoteOneOffSpin,
    setRemoteSpin,
    setSpinDuration,
    setSpinEnabled,
    setThemeState,
    setWheelMovies,
    setWheelStatus,
    setWheelStatusLoadState,
    socket,
  ]);

  useEffect(() => {
    if (isLoggedIn) {
      socket.auth = {};
      setConnectionState('connecting');
      if (!socket.connected) socket.connect();
      return;
    }
    socket.disconnect();
    setConnected(false);
    setConnectionState('offline');
    setOnlineUsers([]);
  }, [isLoggedIn, socket]);

  const reconnect = useCallback(() => {
    setConnectionState('connecting');
    socket.auth = {};
    socket.connect();
  }, [socket]);

  return {
    connected,
    connectionState,
    lastSyncedAt,
    onlineUsers,
    reconnect,
    socket,
  };
}
