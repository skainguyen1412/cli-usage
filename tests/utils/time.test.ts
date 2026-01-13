import { describe, it, expect } from 'vitest';
import { formatRelativeTime, formatAge, getSecondsUntil } from '../../src/utils/time';
import { addHours, subMinutes, subHours } from 'date-fns';

describe('Time Utils', () => {
  describe('formatRelativeTime', () => {
    it('should format null/undefined as "-"', () => {
      expect(formatRelativeTime(null)).toBe('-');
      // @ts-ignore
      expect(formatRelativeTime(undefined)).toBe('-');
    });

    it('should format future dates correctly', () => {
      const now = new Date();
      const future = addHours(now, 2);
      // Approximately "2h" or "1h 59m" depends on seconds execution
      expect(formatRelativeTime(future.toISOString())).toMatch(/^\d+h/);
    });

    it('should handle past dates', () => {
      const past = subHours(new Date(), 1).toISOString();
      expect(formatRelativeTime(past)).toBe('expired');
    });
  });

  describe('formatAge', () => {
    it('should format seconds into readable string', () => {
      expect(formatAge(30)).toBe('30s ago');
      expect(formatAge(120)).toBe('2m ago');
      expect(formatAge(3600)).toBe('1h ago');
    });
  });

  describe('getSecondsUntil', () => {
    it('should return correct seconds difference', () => {
      const future = addHours(new Date(), 1);
      const seconds = getSecondsUntil(future.toISOString());
      expect(seconds).toBeGreaterThan(3500);
      expect(seconds).toBeLessThan(3700);
    });

    it('should return null for past dates', () => {
      const past = subMinutes(new Date(), 10);
      expect(getSecondsUntil(past.toISOString())).toBeNull();
    });
  });
});
