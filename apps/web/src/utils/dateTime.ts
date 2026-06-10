const dateTimeZonePattern = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseApiDateTime(value?: string | null): Date | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (dateOnlyPattern.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const withTimeSeparator = trimmed.includes(' ') && !trimmed.includes('T') ? trimmed.replace(' ', 'T') : trimmed;
  const normalized = dateTimeZonePattern.test(withTimeSeparator) ? withTimeSeparator : `${withTimeSeparator}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatApiDateTime(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = {},
  fallback = '-',
): string {
  const date = parseApiDateTime(value);
  if (!date) return value || fallback;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options,
  });
}

export function formatApiShortDateTime(value?: string | null, fallback = '-'): string {
  return formatApiDateTime(value, { year: undefined }, fallback);
}

export function formatApiDate(value?: string | null, fallback = '-'): string {
  const date = parseApiDateTime(value);
  if (!date) return value || fallback;
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatApiTime(value?: string | null, fallback = '-'): string {
  const date = parseApiDateTime(value);
  if (!date) return value || fallback;
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function apiDateTimeValue(value?: string | null): number {
  return parseApiDateTime(value)?.getTime() ?? 0;
}
