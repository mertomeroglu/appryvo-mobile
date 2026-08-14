import { nativeApp } from '../native/app';
import { nativeNetwork } from '../native/network';
import { socketService } from './socket/socketService';
import { useAppLifecycleStore } from '../stores/useAppLifecycleStore';

export const appLifecycleManager = {
  /** Returns a cleanup function that removes both listeners. */
  async init(): Promise<() => void> {
    // 1. App State Listener (Foreground / Background)
    const stateHandle = await nativeApp.addStateChangeListener((state) => {
      const isForeground = state.isActive;
      useAppLifecycleStore.getState().setForeground(isForeground);

      if (isForeground) {
        // Reconnect socket if authenticated
        socketService.connect();
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
