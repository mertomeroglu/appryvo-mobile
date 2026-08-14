import { Network, ConnectionStatus } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';

export const nativeNetwork = {
  async getStatus(): Promise<ConnectionStatus> {
    if (Capacitor.isNativePlatform()) {
      return await Network.getStatus();
    }
    return { connected: navigator.onLine, connectionType: 'wifi' };
  },

  async addStatusListener(callback: (status: ConnectionStatus) => void) {
    if (Capacitor.isNativePlatform()) {
      return await Network.addListener('networkStatusChange', callback);
    }
    const onlineHandler = () => callback({ connected: true, connectionType: 'wifi' });
    const offlineHandler = () => callback({ connected: false, connectionType: 'none' });
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return {
      remove: () => {
        window.removeEventListener('online', onlineHandler);
        window.removeEventListener('offline', offlineHandler);
      },
    };
  },
};
