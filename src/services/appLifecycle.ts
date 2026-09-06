import { nativeApp } from '../native/app';
import { nativeNetwork } from '../native/network';
import { socketService } from './socket/socketService';
import { useAppLifecycleStore } from '../stores/useAppLifecycleStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useAppLocaleStore } from '../i18n/appLocale';
import { localReengagement } from './notifications/localReengagement';

export const appLifecycleManager = {
  /** Returns a cleanup function that removes both listeners. */
  async init(): Promise<() => void> {
    // 1. App State Listener (Foreground / Background)
    const stateHandle = await nativeApp.addStateChangeListener((state) => {
      const isForeground = state.isActive;
      useAppLifecycleStore.getState().setForeground(isForeground);

      if (isForeground) {
        void localReengagement.cancel();
        // Reconnect socket if authenticated
        socketService.connect();
      } else {
        const user = useAuthStore.getState().user;
        if (useAuthStore.getState().isAuthenticated && user?.pushNotificationsEnabled !== false) {
          void localReengagement.schedule(useAppLocaleStore.getState().locale);
        }
      }
    });

    // 2. Network Connectivity Listener
    const networkHandle = await nativeNetwork.addStatusListener((status) => {
      const isConnected = status.connected;
      useAppLifecycleStore.getState().setNetworkConnected(isConnected);

      if (isConnected) {
        socketService.connect();
      }
    });

    return () => {
      stateHandle.remove();
      networkHandle.remove();
    };
  },
};
