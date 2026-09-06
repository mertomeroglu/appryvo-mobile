import { create } from 'zustand';
import { authService, LoginPayload, RegisterPayload } from '../services/auth/authService';
import { socketService } from '../services/socket/socketService';
import { useUiStore } from './useUiStore';
import { localReengagement } from '../services/notifications/localReengagement';

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
  relationshipGoals?: string[];
  interests?: string[];
  photos?: any[];
  isPremium?: boolean;
  verified?: boolean;
  /** Canonical face/profile badge state. `verified` remains its compatibility alias. */
  faceVerified?: boolean;
  /** Email ownership is independent from face/profile verification. */
  emailVerified?: boolean;
  verificationState?: 'UNVERIFIED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVERIFICATION_REQUIRED';
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
  zodiac?: string | null;
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

let userStateVersion = 0;
let latestFetchMeRequest = 0;

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
    await localReengagement.cancel();
    await authService.logout();
    socketService.disconnect();
    userStateVersion += 1;
    // Explicit reset, not just reliance on the next socket connect's server reconciliation --
    // otherwise the prior account's unread badge could flash on the login screen for an instant.
    useUiStore.getState().setUnreadCount(0);
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  restoreSession: async () => {
    set({ isLoading: true });
    const user = await authService.restoreSession();
    set({ user, isAuthenticated: !!user, isLoading: false, sessionChecked: true });
  },

  fetchMe: async () => {
    const requestId = ++latestFetchMeRequest;
    const versionAtStart = userStateVersion;
    const res = await authService.getCurrentUser();
    const user = res?.data || null;
    // A resume/socket fetch that started before a local profile save must never overwrite the
    // optimistic, newer photo list. Likewise, only the newest overlapping reconciliation wins.
    if (user && requestId === latestFetchMeRequest && versionAtStart === userStateVersion) {
      set({ user, isAuthenticated: true });
      return user;
    }
    return null;
  },

  setUser: (user: UserProfile | null) => {
    userStateVersion += 1;
    set({ user, isAuthenticated: !!user });
  },
}));
