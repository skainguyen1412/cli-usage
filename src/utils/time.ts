/**
 * Utility functions for time formatting
 */

import { formatDistanceToNow, parseISO, differenceInSeconds } from 'date-fns';

/**
 * Format a date as relative time (e.g., "2h 15m")
 */
export function formatRelativeTime(date: Date | string | null): string {
  if (!date) return '-';

  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    const now = new Date();
    const diffSeconds = differenceInSeconds(d, now);

    if (diffSeconds < 0) {
      return 'expired';
    }

    if (diffSeconds < 60) {
      return `${diffSeconds}s`;
    }

    if (diffSeconds < 3600) {
      const mins = Math.floor(diffSeconds / 60);
      return `${mins}m`;
    }

    if (diffSeconds < 86400) {
      const hours = Math.floor(diffSeconds / 3600);
      const mins = Math.floor((diffSeconds % 3600) / 60);
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }

    const days = Math.floor(diffSeconds / 86400);
    const hours = Math.floor((diffSeconds % 86400) / 3600);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  } catch {
    return '-';
  }
}

/**
 * Get seconds until a date
 */
export function getSecondsUntil(date: Date | string | null): number | null {
  if (!date) return null;

  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    const now = new Date();
    const diff = differenceInSeconds(d, now);
    return diff > 0 ? diff : null;
  } catch {
    return null;
  }
}

/**
 * Format a date as ISO8601 string
 */
export function toISO8601(date: Date): string {
  return date.toISOString();
}

/**
 * Get current timestamp as ISO8601
 */
export function nowISO8601(): string {
  return new Date().toISOString();
}

/**
 * Format age in a human-readable way
 */
export function formatAge(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return `${Math.floor(seconds / 86400)}d ago`;
}
