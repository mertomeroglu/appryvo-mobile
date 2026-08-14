import { create } from 'zustand';

interface UiState {
  unreadCount: number;
  activeTab: string;
  setUnreadCount: (count: number) => void;
  setActiveTab: (tab: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  unreadCount: 0,
  activeTab: 'discover',
  setUnreadCount: (unreadCount: number) => set({ unreadCount }),
  setActiveTab: (activeTab: string) => set({ activeTab }),
}));

