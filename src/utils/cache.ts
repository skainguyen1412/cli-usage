/**
 * Cache manager for quota data
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProviderQuotaData, UsageData } from '../types/index.js';
import { debug } from './logger.js';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlSeconds: number;
}

interface CacheStore {
  providers: Record<string, Record<string, CacheEntry<ProviderQuotaData>>>;
  proxyUsage?: CacheEntry<UsageData>;
}

/**
 * Get cache directory path
 */
function getCacheDir(): string {
  const home = os.homedir();

  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Caches', 'quota');
  }

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'quota', 'cache');
  }

  // Linux / XDG
  const xdgCache = process.env.XDG_CACHE_HOME || path.join(home, '.cache');
  return path.join(xdgCache, 'quota');
}

/**
 * Get cache file path
 */
function getCacheFilePath(): string {
  return path.join(getCacheDir(), 'cache.json');
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
  const cacheDir = getCacheDir();
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load cache from disk
 */
function loadCache(): CacheStore {
  const cachePath = getCacheFilePath();

  try {
    if (fs.existsSync(cachePath)) {
      const content = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    debug('Failed to load cache', err);
  }

  return { providers: {} };
}

/**
 * Save cache to disk
 */
function saveCache(cache: CacheStore): void {
  try {
    ensureCacheDir();
    const cachePath = getCacheFilePath();
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), { mode: 0o600 });
  } catch (err) {
    debug('Failed to save cache', err);
  }
}

/**
 * Check if cache entry is still valid
 */
function isEntryValid<T>(entry: CacheEntry<T> | undefined): boolean {
  if (!entry) return false;
  const ageSeconds = (Date.now() - entry.timestamp) / 1000;
  return ageSeconds < entry.ttlSeconds;
}

/**
 * Get cached provider quota data
 */
export function getCachedProviderQuota(
  provider: string,
  account: string
): { data: ProviderQuotaData; ageSeconds: number } | null {
  const cache = loadCache();
  const entry = cache.providers[provider]?.[account];

  if (entry) {
    const ageSeconds = Math.floor((Date.now() - entry.timestamp) / 1000);

    // Return even stale data (caller can check isStale)
    return {
      data: {
        ...entry.data,
        isStale: !isEntryValid(entry),
        cachedAt: new Date(entry.timestamp).toISOString(),
        ageSeconds,
      },
      ageSeconds,
    };
  }

  return null;
}

/**
 * Set cached provider quota data
 */
export function setCachedProviderQuota(
  provider: string,
  account: string,
  data: ProviderQuotaData,
  ttlSeconds: number = 300
): void {
  const cache = loadCache();

  if (!cache.providers[provider]) {
    cache.providers[provider] = {};
  }

  cache.providers[provider][account] = {
    data,
    timestamp: Date.now(),
    ttlSeconds,
  };

  saveCache(cache);
}

/**
 * Get cached proxy usage data
 */
export function getCachedProxyUsage(): { data: UsageData; ageSeconds: number } | null {
  const cache = loadCache();

  if (cache.proxyUsage) {
    const ageSeconds = Math.floor((Date.now() - cache.proxyUsage.timestamp) / 1000);

    return {
      data: cache.proxyUsage.data,
      ageSeconds,
    };
  }

  return null;
}

/**
 * Set cached proxy usage data
 */
export function setCachedProxyUsage(data: UsageData, ttlSeconds: number = 15): void {
  const cache = loadCache();

  cache.proxyUsage = {
    data,
    timestamp: Date.now(),
    ttlSeconds,
  };

  saveCache(cache);
}

/**
 * Clear all cache
 */
export function clearCache(): void {
  const cachePath = getCacheFilePath();

  try {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  } catch (err) {
    debug('Failed to clear cache', err);
  }
}

/**
 * Get cache directory for doctor command
 */
export function getCacheDirectory(): string {
  return getCacheDir();
}
