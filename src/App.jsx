import { useCallback, useEffect, useState } from 'react';
import { AppContext } from './app/AppContext';
import AppView from './app/AppView';
import { useAppSettings } from './hooks/useAppSettings';
import { useDocumentTheme } from './hooks/useDocumentTheme';
import { useInterfaceTheme } from './hooks/useInterfaceTheme';
import { useRealtimeSocket } from './hooks/useRealtimeSocket';
import { useSession } from './hooks/useSession';
import { useToasts } from './hooks/useToasts';
import { useWheelActions } from './hooks/useWheelActions';
import { useWheelState } from './hooks/useWheelState';

export { AppContext, useApp } from './app/AppContext';

export default function App() {
  const [adminOpen, setAdminOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { showToast, toasts } = useToasts();

  const closePrivatePanels = useCallback(() => {
    setAdminOpen(false);
    setDrawerOpen(false);
  }, []);

  const session = useSession({
    onLogout: closePrivatePanels,
    showToast,
  });
  const settings = useAppSettings();
  const interfaceTheme = useInterfaceTheme();
  const wheel = useWheelState(session.isLoggedIn);
  const realtime = useRealtimeSocket({
    isLoggedIn: session.isLoggedIn,
    setCurrentUser: session.setCurrentUser,
    settings,
    wheel,
  });
  const wheelActions = useWheelActions({
    connected: realtime.connected,
    showToast,
    wheel,
  });

  useDocumentTheme(settings.theme);

  useEffect(() => {
    if (adminOpen && !session.isAdmin) setAdminOpen(false);
  }, [adminOpen, session.isAdmin]);

  const navigate = useCallback(nextPage => {
    setDrawerOpen(false);
    session.navigate(nextPage);
  }, [session.navigate]);

  const oneOffVisible = Boolean(
    wheel.oneOffState.enabled
    || wheel.oneOffIsSpinning
    || wheel.remoteOneOffSpin
  );

  const context = {
    ...session,
    ...settings,
    ...interfaceTheme,
    ...wheel,
    ...realtime,
    ...wheelActions,
    adminOpen,
    drawerOpen,
    navigate,
    oneOffVisible,
    setAdminOpen,
    setDrawerOpen,
    showToast,
    toasts,
  };

  return (
    <AppContext.Provider value={context}>
      <AppView />
    </AppContext.Provider>
  );
}
