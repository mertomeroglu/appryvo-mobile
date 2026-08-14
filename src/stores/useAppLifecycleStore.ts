import { create } from 'zustand';

interface AppLifecycleState {
  isForeground: boolean;
  isNetworkConnected: boolean;
  setForeground: (isForeground: boolean) => void;
  setNetworkConnected: (isConnected: boolean) => void;
}

export const useAppLifecycleStore = create<AppLifecycleState>((set) => ({
  isForeground: true,
  isNetworkConnected: true,
  setForeground: (isForeground: boolean) => set({ isForeground }),
  setNetworkConnected: (isNetworkConnected: boolean) => set({ isNetworkConnected }),
}));
