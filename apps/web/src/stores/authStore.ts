import type { ApiUser, LoginPayload } from '../types/api';

const ACCESS_TOKEN_KEY = 'markup_access_token';
const REFRESH_TOKEN_KEY = 'markup_refresh_token';
const USER_KEY = 'markup_user';
const SESSION_INVALIDATED_EVENT = 'markup:session-invalidated';
const SESSION_UPDATED_EVENT = 'markup:session-updated';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

export interface SessionInvalidatedDetail {
  reason: 'refresh_failed' | 'unauthorized' | 'manual_logout';
}

export function persistSession(payload: LoginPayload, storage: Storage = window.localStorage): AuthSession {
  const session: AuthSession = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    user: payload.user,
  };
  storage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  storage.setItem(USER_KEY, JSON.stringify(session.user));
  return session;
}

export function getStoredSession(storage: Storage = window.localStorage): AuthSession | null {
  const accessToken = storage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = storage.getItem(REFRESH_TOKEN_KEY);
  const userJson = storage.getItem(USER_KEY);
  if (!accessToken || !refreshToken || !userJson) return null;

  try {
    return { accessToken, refreshToken, user: JSON.parse(userJson) as ApiUser };
  } catch {
    clearStoredSession(storage);
    return null;
  }
}

export function clearStoredSession(storage: Storage = window.localStorage): void {
  storage.removeItem(ACCESS_TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
  storage.removeItem(USER_KEY);
}

export function clearAllStoredSessions(): void {
  clearStoredSession(window.localStorage);
  clearStoredSession(window.sessionStorage);
}

export function markSessionInvalidated(detail: SessionInvalidatedDetail): void {
  window.dispatchEvent(new CustomEvent<SessionInvalidatedDetail>(SESSION_INVALIDATED_EVENT, { detail }));
}

export function markSessionUpdated(): void {
  window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT));
}

export function subscribeToSessionInvalidated(
  listener: (detail: SessionInvalidatedDetail) => void,
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<SessionInvalidatedDetail>;
    listener(customEvent.detail);
  };

  window.addEventListener(SESSION_INVALIDATED_EVENT, handler);
  return () => window.removeEventListener(SESSION_INVALIDATED_EVENT, handler);
}

export function getStoredSessionWithStorage(): { session: AuthSession; storage: Storage } | null {
  const localSession = getStoredSession(window.localStorage);
  if (localSession) return { session: localSession, storage: window.localStorage };

  const transientSession = getStoredSession(window.sessionStorage);
  if (transientSession) return { session: transientSession, storage: window.sessionStorage };

  return null;
}

export function updateStoredSessionUser(userPatch: Partial<ApiUser>): AuthSession | null {
  const storage = window.localStorage.getItem(ACCESS_TOKEN_KEY) ? window.localStorage : window.sessionStorage;
  const session = getStoredSession(storage);
  if (!session) return null;

  const updatedSession = {
    ...session,
    user: {
      ...session.user,
      ...userPatch,
    },
  };

  storage.setItem(USER_KEY, JSON.stringify(updatedSession.user));
  return updatedSession;
}

export function updateStoredSessionTokens(payload: Pick<LoginPayload, 'access_token' | 'refresh_token' | 'user'>): AuthSession | null {
  const storage = window.localStorage.getItem(ACCESS_TOKEN_KEY) ? window.localStorage : window.sessionStorage;
  const session = getStoredSession(storage);
  if (!session) return null;

  const updatedSession: AuthSession = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    user: payload.user,
  };

  storage.setItem(ACCESS_TOKEN_KEY, updatedSession.accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, updatedSession.refreshToken);
  storage.setItem(USER_KEY, JSON.stringify(updatedSession.user));
  return updatedSession;
}
