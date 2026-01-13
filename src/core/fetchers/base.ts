/**
 * Base provider fetcher interface
 */

import { DiscoveredAccount, FetchResult, ProviderQuotaData, ModelQuota, Config } from '../../types/index.js';
import { nowISO8601, getSecondsUntil } from '../../utils/time.js';

/**
 * Abstract base class for provider fetchers
 */
export abstract class ProviderFetcher {
  abstract readonly providerName: string;
  abstract readonly supportsRefresh: boolean;

  /**
   * Fetch quota for a discovered account
   */
  abstract fetchQuota(account: DiscoveredAccount, config: Config): Promise<FetchResult>;

  /**
   * Create a successful result with quota data
   */
  protected successResult(
    account: DiscoveredAccount,
    models: ModelQuota[],
    planType: string | null = null
  ): FetchResult {
    return {
      success: true,
      data: {
        provider: account.provider,
        account: account.account,
        planType,
        isForbidden: false,
        isStale: false,
        needsReauth: false,
        lastUpdated: nowISO8601(),
        models,
      },
    };
  }

  /**
   * Create a forbidden result (403)
   */
  protected forbiddenResult(account: DiscoveredAccount, message?: string): FetchResult {
    return {
      success: false,
      data: {
        provider: account.provider,
        account: account.account,
        planType: null,
        isForbidden: true,
        isStale: false,
        needsReauth: false,
        lastUpdated: nowISO8601(),
        models: [],
        error: message || 'Access forbidden',
      },
      error: message || 'Access forbidden',
    };
  }

  /**
   * Create a needs-reauth result (401 or expired token)
   */
  protected needsReauthResult(account: DiscoveredAccount, message?: string): FetchResult {
    return {
      success: false,
      data: {
        provider: account.provider,
        account: account.account,
        planType: null,
        isForbidden: false,
        isStale: false,
        needsReauth: true,
        lastUpdated: nowISO8601(),
        models: [],
        error: message || 'Token expired or invalid',
      },
      error: message || 'Token expired or invalid',
      needsReauth: true,
    };
  }

  /**
   * Create an error result
   */
  protected errorResult(account: DiscoveredAccount, error: string): FetchResult {
    return {
      success: false,
      data: {
        provider: account.provider,
        account: account.account,
        planType: null,
        isForbidden: false,
        isStale: false,
        needsReauth: false,
        lastUpdated: nowISO8601(),
        models: [],
        error,
      },
      error,
    };
  }

  /**
   * Create a model quota entry
   */
  protected createModelQuota(
    name: string,
    percentage: number,
    resetTime: string | null = null,
    extras?: { used?: number; limit?: number; remaining?: number }
  ): ModelQuota {
    return {
      name,
      percentage,
      resetTime,
      resetInSeconds: getSecondsUntil(resetTime),
      ...extras,
    };
  }

  /**
   * Helper to make HTTP request with timeout
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
