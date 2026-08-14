import { create } from 'zustand';
import { authService, LoginPayload, RegisterPayload } from '../services/auth/authService';
import { socketService } from '../services/socket/socketService';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  bio?: string;
  city?: string;
  job?: string;
  age?: number;
  gender?: string;
  targetGender?: string;
  relationshipGoal?: string;
  interests?: string[];
  photos?: any[];
  isPremium?: boolean;
  verified?: boolean;
  activeFrameId?: string;
  profileCompletion?: number;
  pushNotificationsEnabled?: boolean;
  boostCount?: number;
  superlikeCount?: number;
  heightCm?: number;
  smokingStatus?: string;
  drinkingStatus?: string;
  childrenStatus?: string;
  familyPlans?: string;
  languages?: string[];
  languageCode?: string;
  chatLanguage?: string | null;
  countryCode?: string | null;
  showCountryFlag?: boolean;
  [key: string]: any;
}

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionChecked: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  fetchMe: () => Promise<UserProfile | null>;
  setUser: (user: UserProfile | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  sessionChecked: false,

  login: async (payload: LoginPayload) => {
    set({ isLoading: true });
    try {
      const res = await authService.login(payload);
      const user = res?.data?.user || null;
      set({ user, isAuthenticated: !!user, isLoading: false });
      // The login response's user object is not guaranteed to carry the full profile
      // (e.g. photos) — fetch the authoritative /api/me record so SessionGate's
      // profile-completeness check doesn't false-negative right after a real login.
      if (user) {
        const meRes = await authService.getCurrentUser().catch(() => null);
        if (meRes?.data) set({ user: meRes.data });
      }
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  register: async (payload: RegisterPayload) => {
    set({ isLoading: true });
    try {
      const res = await authService.register(payload);
      const user = res?.data?.user || null;
      set({ user, isAuthenticated: !!user, isLoading: false });
      if (user) {
        const meRes = await authService.getCurrentUser().catch(() => null);
        if (meRes?.data) set({ user: meRes.data });
      }
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    await authService.logout();
    socketService.disconnect();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  restoreSession: async () => {
    set({ isLoading: true });
    const user = await authService.restoreSession();
    set({ user, isAuthenticated: !!user, isLoading: false, sessionChecked: true });
  },

  fetchMe: async () => {
    const res = await authService.getCurrentUser();
    const user = res?.data || null;
    if (user) set({ user, isAuthenticated: true });
    return user;
  },

  setUser: (user: UserProfile | null) => {
    set({ user, isAuthenticated: !!user });
  },
}));
