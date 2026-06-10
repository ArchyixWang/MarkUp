import type { ApiEnvelope, ApiErrorEnvelope, LoginPayload } from '../types/api';
import {
  clearAllStoredSessions,
  getStoredSessionWithStorage,
  markSessionInvalidated,
  markSessionUpdated,
  persistSession,
  type AuthSession,
} from '../stores/authStore';
import { markConnected, markDisconnected } from './connectivityStatus';

const DEFAULT_API_BASE_URL = '/api/v1';
const TOKEN_EXPIRED_CODE = 40102;
const AUTH_REQUIRED_CODE = 40101;

export class ApiClientError extends Error {
  readonly code: number;
  readonly detail: unknown;
  readonly requestId: string | null;
  readonly status: number;

  constructor(message: string, options: { code: number; detail?: unknown; requestId?: string | null; status: number }) {
    super(message);
    this.name = 'ApiClientError';
    this.code = options.code;
    this.detail = options.detail;
    this.requestId = options.requestId ?? null;
    this.status = options.status;
  }
}

function formatApiErrorMessage(payload: ApiErrorEnvelope | null, fallback: string): string {
  if (!payload) return fallback;
  if (Array.isArray(payload.detail) && payload.detail.length > 0) {
    const messages = payload.detail
      .map((item) => {
        if (item && typeof item === 'object' && 'message' in item && typeof item.message === 'string') {
          return item.message.replace(/^Value error,\s*/, '');
        }
        return null;
      })
      .filter((message): message is string => Boolean(message));
    if (messages.length > 0) return messages.join('；');
  }
  return payload.message || fallback;
}

interface AuthenticatedRequestInit extends RequestInit {
  rebuildAfterRefresh?: (session: AuthSession) => RequestInit;
  invalidateOnAuthFailure?: boolean;
  invalidateOnRefreshFailure?: boolean;
}

export interface UploadProgressInfo {
  loaded: number;
  total: number;
  percent: number;
  lengthComputable: boolean;
}

interface AuthenticatedUploadRequestOptions {
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: HeadersInit;
  body: FormData;
  onProgress?: (progress: UploadProgressInfo) => void;
  fallbackMessage?: string;
}

interface RefreshStoredSessionResult {
  session: AuthSession | null;
  failureResponse?: Response;
}

export const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
};

function invalidateSession(reason: 'refresh_failed' | 'unauthorized'): void {
  clearAllStoredSessions();
  markSessionInvalidated({ reason });
}

function isServerFailureStatus(status: number): boolean {
  return status >= 500;
}

function trackResponseConnectivity(response: Response) {
  if (response.ok) {
    markConnected();
    return;
  }
  if (isServerFailureStatus(response.status)) {
    markDisconnected();
  }
}

function trackErrorConnectivity(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    markDisconnected();
    return;
  }
  if (error instanceof TypeError) {
    markDisconnected();
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      credentials: 'include',
      ...init,
      headers: withDefaultJsonContentType(init.headers, init.body),
    });
  } catch (error) {
    trackErrorConnectivity(error);
    throw error;
  }
  trackResponseConnectivity(response);

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorEnvelope | null;

  if (!response.ok || !payload || payload.code !== 0) {
    const errorPayload = payload as ApiErrorEnvelope | null;
    throw new ApiClientError(formatApiErrorMessage(errorPayload, '请求失败，请稍后重试'), {
      code: errorPayload?.code ?? response.status,
      detail: errorPayload?.detail,
      requestId: errorPayload?.request_id ?? null,
      status: response.status,
    });
  }

  return (payload as ApiEnvelope<T>).data;
}

function buildApiErrorResponse(payload: ApiErrorEnvelope | null, status: number): Response {
  return new Response(JSON.stringify(payload ?? {
    code: status,
    message: '请重新登录',
    detail: null,
    request_id: null,
    timestamp: new Date().toISOString(),
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function refreshStoredSession(invalidateOnFailure = true): Promise<RefreshStoredSessionResult> {
  const stored = getStoredSessionWithStorage();
  if (!stored) return { session: null };

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: stored.session.refreshToken }),
    });
  } catch (error) {
    trackErrorConnectivity(error);
    if (invalidateOnFailure) {
      invalidateSession('refresh_failed');
    }
    return { session: null };
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<LoginPayload> | ApiErrorEnvelope | null;
  if (!response.ok || !payload || payload.code !== 0) {
    if (invalidateOnFailure) {
      invalidateSession('refresh_failed');
    }
    return { session: null, failureResponse: buildApiErrorResponse(payload as ApiErrorEnvelope | null, response.status) };
  }

  const session = persistSession((payload as ApiEnvelope<LoginPayload>).data, stored.storage);
  markSessionUpdated();
  return { session };
}

function headersToRecord(headers: Headers): Record<string, string> {
  const canonicalHeaderNames: Record<string, string> = {
    authorization: 'Authorization',
    'content-type': 'Content-Type',
    'x-team-id': 'X-Team-ID',
  };
  return Object.fromEntries(
    Array.from(headers.entries()).map(([key, value]) => [canonicalHeaderNames[key] ?? key, value]),
  );
}

function mergeHeaders(initHeaders: HeadersInit | undefined, authHeaders: Record<string, string>): Record<string, string> {
  const headers = new Headers(initHeaders);
  Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value));
  return headersToRecord(headers);
}

function isFormDataBody(body: BodyInit | null | undefined): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function withDefaultJsonContentType(initHeaders: HeadersInit | undefined, body?: BodyInit | null): Record<string, string> {
  const headers = new Headers(initHeaders);
  if (!headers.has('Content-Type') && !isFormDataBody(body)) {
    headers.set('Content-Type', 'application/json');
  }
  return headersToRecord(headers);
}

function stripAuthenticatedRequestInit(init: AuthenticatedRequestInit): RequestInit {
  const requestInit = { ...init };
  delete requestInit.rebuildAfterRefresh;
  delete requestInit.invalidateOnAuthFailure;
  delete requestInit.invalidateOnRefreshFailure;
  return requestInit;
}

export async function authenticatedFetch(path: string, init: AuthenticatedRequestInit = {}, retryOnExpired = true): Promise<Response> {
  const stored = getStoredSessionWithStorage();
  const shouldInvalidateOnAuthFailure = init.invalidateOnAuthFailure ?? true;
  const shouldInvalidateOnRefreshFailure = init.invalidateOnRefreshFailure ?? true;
  const requestInit = stripAuthenticatedRequestInit(init);
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...requestInit,
      credentials: 'include',
      headers: stored
        ? mergeHeaders(requestInit.headers, { Authorization: `Bearer ${stored.session.accessToken}` })
        : requestInit.headers,
    });
  } catch (error) {
    trackErrorConnectivity(error);
    throw error;
  }
  trackResponseConnectivity(response);

  if (!retryOnExpired || response.status !== 401) return response;

  const payload = (await response.clone().json().catch(() => null)) as ApiErrorEnvelope | null;
  if (payload?.code === AUTH_REQUIRED_CODE) {
    if (shouldInvalidateOnAuthFailure) {
      invalidateSession('unauthorized');
    }
    return response;
  }
  if (payload?.code !== TOKEN_EXPIRED_CODE) return response;

  const refreshResult = await refreshStoredSession(shouldInvalidateOnRefreshFailure);
  if (!refreshResult.session) return refreshResult.failureResponse ?? response;

  const rebuiltInit = init.rebuildAfterRefresh ? init.rebuildAfterRefresh(refreshResult.session) : requestInit;
  const retriedRequestInit = stripAuthenticatedRequestInit(rebuiltInit);
  let retriedResponse: Response;
  try {
    retriedResponse = await fetch(`${getApiBaseUrl()}${path}`, {
      ...retriedRequestInit,
      credentials: 'include',
      headers: mergeHeaders(retriedRequestInit.headers, { Authorization: `Bearer ${refreshResult.session.accessToken}` }),
    });
  } catch (error) {
    trackErrorConnectivity(error);
    throw error;
  }
  trackResponseConnectivity(retriedResponse);
  if (retriedResponse.status !== 401) return retriedResponse;

  const retriedPayload = (await retriedResponse.clone().json().catch(() => null)) as ApiErrorEnvelope | null;
  if (retriedPayload?.code === AUTH_REQUIRED_CODE || retriedPayload?.code === TOKEN_EXPIRED_CODE) {
    if (shouldInvalidateOnAuthFailure) {
      invalidateSession('unauthorized');
    }
  }

  return retriedResponse;
}

export async function authenticatedApiRequest<T>(path: string, init: AuthenticatedRequestInit = {}): Promise<T> {
  const rebuildAfterRefresh = init.rebuildAfterRefresh
    ? (session: AuthSession): RequestInit => {
        const rebuilt = init.rebuildAfterRefresh?.(session) ?? {};
        return {
          ...rebuilt,
          headers: withDefaultJsonContentType(rebuilt.headers, rebuilt.body),
        };
      }
    : undefined;
  const response = await authenticatedFetch(path, {
    ...init,
    headers: withDefaultJsonContentType(init.headers, init.body),
    rebuildAfterRefresh,
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorEnvelope | null;

  if (!response.ok || !payload || payload.code !== 0) {
    const errorPayload = payload as ApiErrorEnvelope | null;
    throw new ApiClientError(formatApiErrorMessage(errorPayload, '请求失败，请稍后重试'), {
      code: errorPayload?.code ?? response.status,
      detail: errorPayload?.detail,
      requestId: errorPayload?.request_id ?? null,
      status: response.status,
    });
  }

  return (payload as ApiEnvelope<T>).data;
}

export async function authenticatedUploadRequest<T>(path: string, options: AuthenticatedUploadRequestOptions): Promise<T> {
  const stored = getStoredSessionWithStorage();
  const response = await xhrUpload(path, options, stored?.session.accessToken ?? null);
  if (response.status !== 401) return parseUploadResponse<T>(response, options.fallbackMessage);

  const payload = parseUploadPayload(response.body);
  if (payload?.code === AUTH_REQUIRED_CODE) {
    invalidateSession('unauthorized');
    return parseUploadResponse<T>(response, options.fallbackMessage);
  }
  if (payload?.code !== TOKEN_EXPIRED_CODE) {
    return parseUploadResponse<T>(response, options.fallbackMessage);
  }

  const refreshResult = await refreshStoredSession(true);
  if (!refreshResult.session) {
    return parseUploadResponse<T>(response, options.fallbackMessage);
  }
  const retried = await xhrUpload(path, options, refreshResult.session.accessToken);
  if (retried.status === 401) {
    const retriedPayload = parseUploadPayload(retried.body);
    if (retriedPayload?.code === AUTH_REQUIRED_CODE || retriedPayload?.code === TOKEN_EXPIRED_CODE) {
      invalidateSession('unauthorized');
    }
  }
  return parseUploadResponse<T>(retried, options.fallbackMessage);
}

function xhrUpload(path: string, options: AuthenticatedUploadRequestOptions, accessToken: string | null): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method ?? 'POST', `${getApiBaseUrl()}${path}`);
    xhr.withCredentials = true;
    const headers = new Headers(options.headers);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    headers.forEach((value, key) => xhr.setRequestHeader(key, value));

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : 0;
      const percent = total > 0 ? Math.min(99, Math.round((event.loaded / total) * 100)) : 0;
      options.onProgress?.({
        loaded: event.loaded,
        total,
        percent,
        lengthComputable: event.lengthComputable,
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 500) markDisconnected();
      else markConnected();
      resolve({ status: xhr.status, body: xhr.responseText });
    };
    xhr.onerror = () => {
      markDisconnected();
      reject(new TypeError('上传失败，请检查网络连接'));
    };
    xhr.onabort = () => {
      markDisconnected();
      reject(new DOMException('上传已取消', 'AbortError'));
    };
    xhr.send(options.body);
  });
}

function parseUploadResponse<T>(response: { status: number; body: string }, fallbackMessage = '上传失败，请稍后重试'): T {
  const payload = parseUploadPayload(response.body) as ApiEnvelope<T> | ApiErrorEnvelope | null;
  if (response.status < 200 || response.status >= 300 || !payload || payload.code !== 0) {
    const errorPayload = payload as ApiErrorEnvelope | null;
    throw new ApiClientError(formatApiErrorMessage(errorPayload, fallbackMessage), {
      code: errorPayload?.code ?? response.status,
      detail: errorPayload?.detail,
      requestId: errorPayload?.request_id ?? null,
      status: response.status,
    });
  }
  return (payload as ApiEnvelope<T>).data;
}

function parseUploadPayload(body: string): ApiEnvelope<unknown> | ApiErrorEnvelope | null {
  try {
    return JSON.parse(body) as ApiEnvelope<unknown> | ApiErrorEnvelope;
  } catch {
    return null;
  }
}
