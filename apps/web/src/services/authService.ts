import { apiRequest, authenticatedApiRequest } from './apiClient';
import { getStoredSessionWithStorage } from '../stores/authStore';
import type {
  AdminRegisterRequest,
  LoginPayload,
  LoginRequest,
  OAuthCurrentUserLinkResponse,
  OAuthExchangePayload,
  OAuthIdentitiesResponse,
  OAuthLinkAccountRequest,
  OAuthLinkCurrentUserRequest,
  OAuthRegisterAccountRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SendEmailCodeRequest,
} from '../types/api';

function buildRefreshTokenRequestBody(fallbackRefreshToken?: string): string {
  const refreshToken = getStoredSessionWithStorage()?.session.refreshToken ?? fallbackRefreshToken;
  return JSON.stringify({ refresh_token: refreshToken });
}

export function login(payload: LoginRequest): Promise<LoginPayload> {
  return apiRequest<LoginPayload>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getCurrentUser(): Promise<LoginPayload['user']> {
  return authenticatedApiRequest<LoginPayload['user']>('/auth/me');
}

export function sendEmailCode(payload: SendEmailCodeRequest): Promise<{ email: string; expire_in_seconds: number }> {
  return apiRequest('/auth/email/send-code', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function register(payload: RegisterRequest): Promise<unknown> {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function registerAdmin(payload: AdminRegisterRequest): Promise<unknown> {
  return apiRequest('/auth/register/admin', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resetPassword(payload: ResetPasswordRequest): Promise<unknown> {
  return apiRequest('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function exchangeOAuthTicket(ticket: string): Promise<OAuthExchangePayload> {
  return apiRequest<OAuthExchangePayload>('/auth/oauth/exchange', {
    method: 'POST',
    body: JSON.stringify({ ticket }),
  });
}

export function bindOAuthEmail(payload: { ticket: string; email: string; email_code: string }): Promise<LoginPayload> {
  return apiRequest<LoginPayload>('/auth/oauth/bind-email', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function linkOAuthAccount(payload: OAuthLinkAccountRequest): Promise<LoginPayload> {
  return apiRequest<LoginPayload>('/auth/oauth/link-account', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function linkOAuthCurrentUser(payload: OAuthLinkCurrentUserRequest): Promise<OAuthCurrentUserLinkResponse> {
  return authenticatedApiRequest<OAuthCurrentUserLinkResponse>('/auth/oauth/link-current-user', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function registerOAuthAccount(payload: OAuthRegisterAccountRequest): Promise<LoginPayload> {
  return apiRequest<LoginPayload>('/auth/oauth/register-account', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function changePassword(payload: { old_password: string; new_password: string }): Promise<void> {
  return authenticatedApiRequest<void>('/auth/password', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function revokeOtherSessions(): Promise<{ revoked_count: number; kept_current_session: boolean }> {
  return authenticatedApiRequest<{ revoked_count: number; kept_current_session: boolean }>('/auth/sessions/revoke-others', {
    method: 'POST',
    body: buildRefreshTokenRequestBody(),
    rebuildAfterRefresh: (session) => ({
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    }),
  });
}

export function logoutCurrentSession(fallbackRefreshToken?: string): Promise<void> {
  return authenticatedApiRequest<void>('/auth/logout', {
    method: 'POST',
    body: buildRefreshTokenRequestBody(fallbackRefreshToken),
    invalidateOnAuthFailure: false,
    invalidateOnRefreshFailure: false,
    rebuildAfterRefresh: (session) => ({
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    }),
  });
}

export function listOAuthIdentities(): Promise<OAuthIdentitiesResponse> {
  return authenticatedApiRequest<OAuthIdentitiesResponse>('/auth/oauth/identities');
}

export function unlinkOAuthIdentity(provider: string): Promise<{ provider: string; unlinked: boolean }> {
  return authenticatedApiRequest<{ provider: string; unlinked: boolean }>(`/auth/oauth/identities/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
  });
}
