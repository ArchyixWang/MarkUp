const AUTH_RETURN_TO_KEY = 'markup_auth_return_to';

const SAFE_RETURN_PREFIXES = ['/onboarding', '/workspace', '/platform', '/tasks/assigned'];

function browserOrigin(): string {
  return window.location.origin;
}

function normalizeSameOriginUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, browserOrigin());
    if (url.origin !== browserOrigin()) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function relativeUrlFrom(url: URL): string {
  const relative = `${url.pathname}${url.search}${url.hash}`;
  return relative.startsWith('/') ? relative : `/${relative}`;
}

export function isSafeAppRelativePath(value: string): boolean {
  const url = normalizeSameOriginUrl(value);
  if (!url) return false;
  const relative = relativeUrlFrom(url);
  return SAFE_RETURN_PREFIXES.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`) || relative.startsWith(`${prefix}?`));
}

export function normalizeAppRelativePath(value: string): string | null {
  if (!isSafeAppRelativePath(value)) return null;
  const url = normalizeSameOriginUrl(value);
  return url ? relativeUrlFrom(url) : null;
}

export function toAbsoluteAppUrl(value: string): string {
  const url = normalizeSameOriginUrl(value);
  if (url) return url.toString();
  return new URL(value, browserOrigin()).toString();
}

export function setAuthReturnTarget(value: string): void {
  const normalized = normalizeAppRelativePath(value);
  if (!normalized) return;
  window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, normalized);
}

export function getAuthReturnTarget(): string | null {
  const value = window.sessionStorage.getItem(AUTH_RETURN_TO_KEY);
  if (!value) return null;
  return normalizeAppRelativePath(value);
}

export function clearAuthReturnTarget(): void {
  window.sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
}

export function currentRelativeAppUrl(locationLike: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location): string {
  return `${locationLike.pathname}${locationLike.search}${locationLike.hash}`;
}

export function isInviteJoinPath(value: string): boolean {
  const normalized = normalizeAppRelativePath(value);
  if (!normalized) return false;
  const url = new URL(normalized, browserOrigin());
  return url.pathname === '/onboarding'
    && url.searchParams.get('organization_action') === 'join'
    && Boolean(url.searchParams.get('invite_code')?.trim());
}
