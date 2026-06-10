import { describe, expect, it } from 'vitest';
import { formatApiDateTime, parseApiDateTime } from './dateTime';

describe('dateTime utils', () => {
  it('treats API datetime strings without timezone as UTC instants', () => {
    expect(parseApiDateTime('2026-05-29T00:00:00')?.toISOString()).toBe('2026-05-29T00:00:00.000Z');
  });

  it('keeps explicit timezone strings as absolute instants', () => {
    expect(parseApiDateTime('2026-05-29T08:00:00+08:00')?.toISOString()).toBe('2026-05-29T00:00:00.000Z');
  });

  it('formats UTC API timestamps through the browser locale timezone', () => {
    expect(formatApiDateTime('2026-05-29T00:00:00Z')).not.toContain('T');
  });
});
