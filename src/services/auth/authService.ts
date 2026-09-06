import { apiClient, ApiException, refreshTokenFlow } from '../api/apiClient';
import { secureStorage } from '../../native/secureStorage';
import { pushRegistrationService } from '../push/pushRegistrationService';
import { translateSync } from '../../i18n/appLocale';
import { crashReporting } from '../../native/crashReporting';

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  username?: string;
  birthDate: string;
  gender: string;
  targetGender: string;
  city?: string;
  job?: string;
  bio?: string;
  interests?: string[];
  relationshipGoal?: string;
  latitude?: number;
  longitude?: number;
  photoUploadTokens: string[];
  /** The app locale already selected at the pre-auth language gate (see appLocale.ts), so the
   * new account's notification/UI language starts correct instead of defaulting server-side. */
  targetLang?: string;
}

export interface LoginPayload {
  /** Email or username. `email` is also still accepted alone for older call sites. */
  identifier?: string;
  email?: string;
  password: string;
}

export const authService = {
  async register(payload: RegisterPayload) {
    const res = await apiClient.post('/api/auth/register', payload, { skipAuth: true });
    if (res?.status === 'success' && res?.data) {
      // Backend sends `accessToken`, not `token` -- reading the wrong key here meant the
      // access token never got stored at register/login time, so the very next request
      // (getCurrentUser, right below in useAuthStore) always went out unauthenticated, always
      // 401'd, and only succeeded after apiClient's refresh-token fallback round-trip. That
      // guaranteed extra failed request + refresh was silently adding latency to every signup.
      const { accessToken, refreshToken, user } = res.data;
      if (accessToken) await secureStorage.setAccessToken(accessToken);
      if (refreshToken) await secureStorage.setRefreshToken(refreshToken);
      if (user) await secureStorage.setUserData(user);
    }
    return res;
  },

  async login(payload: LoginPayload) {
    const res = await apiClient.post('/api/auth/login', payload, { skipAuth: true });
    if (res?.status === 'success' && res?.data) {
      const { accessToken, refreshToken, user } = res.data;
      if (accessToken) await secureStorage.setAccessToken(accessToken);
      if (refreshToken) await secureStorage.setRefreshToken(refreshToken);
      if (user) await secureStorage.setUserData(user);
    }
    return res;
  },

  async getCurrentUser() {
    const res = await apiClient.get('/api/me');
    const accountStatus = res?.data?.status?.toUpperCase();
    if (accountStatus === 'SUSPENDED' || accountStatus === 'BANNED') {
      await secureStorage.clearAll();
      throw new ApiException(
        accountStatus === 'SUSPENDED' ? translateSync('realtimeAccountSuspendedError') : translateSync('realtimeAccountDisabledError'),
        403,
        'ACCOUNT_SUSPENDED',
      );
    }
    if (res?.status === 'success' && res?.data) {
      await secureStorage.setUserData(res.data);
    }
    return res;
  },

  async logout() {
    const pushToken = await pushRegistrationService.getCurrentToken();
    try {
      // Deactivate only this physical device. Other phones/tablets owned by the same user
      // remain valid. The auth logout receives the same token as a fallback if this first
      // request is interrupted between the two calls.
      if (pushToken) await apiClient.delete('/api/devices/push-token', { token: pushToken }).catch(() => {});
      const refreshToken = await secureStorage.getRefreshToken();
      await apiClient.post('/api/auth/logout', { refreshToken, pushToken });
    } catch {
      // Ignore logout request failure
    } finally {
      await pushRegistrationService.clearAssociation();
      await secureStorage.clearAll();
    }
  },

  async restoreSession() {
    let token = await secureStorage.getAccessToken();
    const cachedUser = await secureStorage.getUserData();
    if (!token) {
      const refreshToken = await secureStorage.getRefreshToken();
      if (!refreshToken) return null;
      if (await refreshTokenFlow()) token = await secureStorage.getAccessToken();
      // A transient refresh/network failure must not turn a known user into a logged-out user.
      // A definitive invalid refresh clears storage inside refreshTokenFlow, so cachedUser is
      // returned only while a recoverable credential still exists.
      if (!token) return await secureStorage.getRefreshToken() ? cachedUser : null;
    }

    try {
      const res = await this.getCurrentUser();
      return res?.data || null;
    } catch (err: any) {
      // 1. Account suspended or banned: getCurrentUser() already threw after clearing storage.
      if (err instanceof ApiException && err.code === 'ACCOUNT_SUSPENDED') {
        await secureStorage.clearAll();
        return null;
      }

      // 2. A /me 401 is definitive only when refreshTokenFlow also removed/rejected the
      // refresh credential. If refresh itself was temporarily unavailable, customFetch still
      // surfaces the original 401 and the recoverable session must be preserved.
      if (err instanceof ApiException && err.statusCode === 401) {
        const recoverableRefreshToken = await secureStorage.getRefreshToken();
        if (!recoverableRefreshToken) {
          await secureStorage.clearAll();
          return null;
        }
        return cachedUser;
      }

      // 3. Transient failure: offline, timeout, network error, 5xx server glitch.
      // NEVER delete the user's stored tokens for temporary issues!
      // Fallback to the cached user profile so the authenticated shell remains active.
      crashReporting.log(
        `[AUTH] Session restore fallback to cache: transient error (${err?.statusCode || err?.code || err?.message})`
      );

      if (cachedUser) {
        return cachedUser;
      }

      // If no cached user profile exists yet but credentials exist, do not wipe tokens.
      return null;
    }
  },

  async forgotPassword(email: string) {
    return await apiClient.post('/api/auth/password/forgot', { email }, { skipAuth: true });
  },
};
