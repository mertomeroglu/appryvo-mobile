import { secureStorage } from '../../native/secureStorage';
import { notifyVpnBlocked } from '../security/vpnAccess';
import { translateSync } from '../../i18n/appLocale';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.appryvo.online';

export class ApiException extends Error {
  statusCode: number;
  code?: string;
  rawDetails?: any;

  constructor(message: string, statusCode: number, code?: string, rawDetails?: any) {
    super(message);
    this.name = 'ApiException';
    this.statusCode = statusCode;
    this.code = code;
    this.rawDetails = rawDetails;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function getAuthHeaders(): Promise<Record<string, string>> {
  let token = await secureStorage.getAccessToken();
  // A valid refresh token can outlive a missing/corrupt/expired access-token entry. Without
  // this recovery every authenticated feature (coins, subscriptions, frames, verification)
  // sends the same unauthenticated request until the user manually logs in again.
  if (!token && await secureStorage.getRefreshToken()) {
    const refreshed = await refreshTokenFlow();
    if (refreshed) token = await secureStorage.getAccessToken();
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse(response: Response): Promise<any> {
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/html') || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
    throw new ApiException(translateSync('apiHtmlResponseError'), response.status, 'HTML_RESPONSE');
  }

  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err: any) {
    throw new ApiException(translateSync('apiJsonParseError'), response.status, 'INVALID_JSON', err.message);
  }

  if (response.ok) {
    return data;
  }

  const message = data?.message || data?.error || translateSync('apiGenericServerError');
  const code = data?.code || (response.status === 401 ? 'UNAUTHORIZED' : 'API_ERROR');
  if (code === 'VPN_NOT_ALLOWED') {
    notifyVpnBlocked(data?.localizedMessage);
  }
  throw new ApiException(message, response.status, code, data);
}

export async function refreshTokenFlow(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const refreshToken = await secureStorage.getRefreshToken();
      if (!refreshToken) return false;

      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (res.status === 403) {
        const blockedData = await res.json().catch(() => ({}));
        if (blockedData?.code === 'VPN_NOT_ALLOWED') {
          notifyVpnBlocked(blockedData.localizedMessage);
          // A temporary network policy restriction must not destroy a recoverable session.
          return false;
        }
      }

      // Definitive invalidation: Refresh token expired or rejected by server with 401
      if (res.status === 401) {
        await secureStorage.clearAll();
        return false;
      }

      if (res.ok) {
        const data = await res.json();
        if (data?.status === 'success' && data?.data?.accessToken) {
          await secureStorage.setAccessToken(data.data.accessToken);
          if (data.data.refreshToken) {
            await secureStorage.setRefreshToken(data.data.refreshToken);
          }
          return true;
        }
      }

      // Temporary server 5xx or bad gateway -- do NOT wipe stored tokens!
      if (res.status >= 500) {
        return false;
      }
    } catch {
      // Network failure, DNS error, offline, timeout:
      // A temporary network problem MUST NOT delete the user's stored session!
      return false;
    }

    return false;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  skipAuth?: boolean;
}

export async function customFetch(path: string, options: RequestOptions = {}): Promise<any> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const { timeoutMs = 15000, skipAuth = false, headers: customHeaders, body, ...rest } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const authHeaders = skipAuth ? { Accept: 'application/json' } : await getAuthHeaders();
  const isFormData = body instanceof FormData;
  const isJsonObject = body && typeof body === 'object' && !isFormData;

  const headers: Record<string, string> = {
    ...authHeaders,
    ...(isJsonObject ? { 'Content-Type': 'application/json' } : {}),
    ...(customHeaders as Record<string, string>),
  };

  const payload = isJsonObject ? JSON.stringify(body) : body;

  try {
    let response = await fetch(url, {
      ...rest,
      headers,
      body: payload as BodyInit,
      signal: controller.signal,
    });

    // 401 Unauthorized handling & automatic token refresh retry
    // A failed destructive-action re-authentication is not an expired app session.
    // Retrying it after a token refresh would double-count the password attempt and can
    // prematurely trigger the account-deletion limiter.
    if (response.status === 401 && !skipAuth && !path.includes('/api/auth/') && path !== '/api/account') {
      const refreshed = await refreshTokenFlow();
      if (refreshed) {
        const retryHeaders = await getAuthHeaders();
        response = await fetch(url, {
          ...rest,
          headers: {
            ...retryHeaders,
            ...(isJsonObject ? { 'Content-Type': 'application/json' } : {}),
            ...(customHeaders as Record<string, string>),
          },
          body: payload as BodyInit,
          signal: controller.signal,
        });
      }
    }

    return await handleResponse(response);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ApiException(translateSync('apiRequestTimeoutError'), 408, 'TIMEOUT');
    }
    if (err instanceof ApiException) {
      throw err;
    }
    throw new ApiException(err.message || translateSync('apiNetworkConnectionError'), 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchAuthenticatedBlob(path: string, timeoutMs = 30000): Promise<Blob> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response = await fetch(url, {
      method: 'GET',
      headers: await getAuthHeaders(),
      signal: controller.signal,
    });

    if (response.status === 401 && await refreshTokenFlow()) {
      response = await fetch(url, {
        method: 'GET',
        headers: await getAuthHeaders(),
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiException(data?.message || translateSync('apiMediaFetchFailedError'), response.status, data?.code || 'MEDIA_FETCH_FAILED');
    }
    return await response.blob();
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ApiException(translateSync('apiMediaRequestTimeoutError'), 408, 'TIMEOUT');
    }
    if (err instanceof ApiException) throw err;
    throw new ApiException(err?.message || translateSync('apiMediaFetchFailedError'), 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiClient = {
  get: (path: string, options?: RequestOptions) => customFetch(path, { ...options, method: 'GET' }),
  post: (path: string, body?: any, options?: RequestOptions) => customFetch(path, { ...options, method: 'POST', body }),
  put: (path: string, body?: any, options?: RequestOptions) => customFetch(path, { ...options, method: 'PUT', body }),
  patch: (path: string, body?: any, options?: RequestOptions) => customFetch(path, { ...options, method: 'PATCH', body }),
  delete: (path: string, body?: any, options?: RequestOptions) => customFetch(path, { ...options, method: 'DELETE', body }),
};
