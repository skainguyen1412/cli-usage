/**
 * Claude/Anthropic provider fetcher
 */

import { ProviderFetcher } from './base.js';
import { DiscoveredAccount, FetchResult, Config, PROVIDER_NAMES } from '../../types/index.js';
import { getAccessToken, isTokenExpired } from '../../utils/auth.js';
import { debug } from '../../utils/logger.js';

export class ClaudeFetcher extends ProviderFetcher {
  readonly providerName = PROVIDER_NAMES.CLAUDE;
  readonly supportsRefresh = false; // OAuth refresh may not be standardized

  private readonly CLAUDE_USAGE_API = 'https://api.anthropic.com/api/oauth/usage';

  async fetchQuota(account: DiscoveredAccount, config: Config): Promise<FetchResult> {
    const accessToken = getAccessToken(account.authData);

    if (!accessToken) {
      return this.needsReauthResult(account, 'No access token found');
    }

    if (isTokenExpired(account.authData)) {
      return this.needsReauthResult(account, 'Access token expired');
    }

    if (config.noNetwork) {
      return this.successResult(account, [
        this.createModelQuota('claude-quota', -1, null),
      ], null);
    }

    try {
      const response = await this.fetchWithTimeout(
        this.CLAUDE_USAGE_API,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
        config.timeout * 1000
      );

      if (response.status === 401) {
        return this.needsReauthResult(account, 'Unauthorized - token expired or invalid');
      }

      if (response.status === 403) {
        return this.forbiddenResult(account, 'Access forbidden - quota exceeded or account issue');
      }

      if (!response.ok) {
        debug(`Claude usage API returned ${response.status}`);
        return this.successResult(account, [
          this.createModelQuota('claude-pro', -1, null),
        ], this.detectPlanType(account.authData));
      }

      const data = await response.json();
      return this.parseUsageResponse(account, data);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return this.errorResult(account, 'Request timeout');
      }

      debug(`Claude fetch error: ${error}`);
      return this.successResult(account, [
        this.createModelQuota('claude-quota', -1, null),
      ], this.detectPlanType(account.authData));
    }
  }

  private parseUsageResponse(account: DiscoveredAccount, data: unknown): FetchResult {
    if (typeof data === 'object' && data !== null) {
      const usage = data as Record<string, unknown>;

      // Extract quota info from Anthropic response
      const planType = usage.plan_type as string || 
                       usage.subscription_type as string || 
                       this.detectPlanType(account.authData);

      // Try different response formats
      let percentage = -1;
      let resetTime: string | null = null;

      if (typeof usage.remaining_percentage === 'number') {
        percentage = usage.remaining_percentage;
      } else if (typeof usage.used === 'number' && typeof usage.limit === 'number' && usage.limit > 0) {
        percentage = ((usage.limit - usage.used) / usage.limit) * 100;
      }

      if (typeof usage.resets_at === 'string') {
        resetTime = usage.resets_at;
      } else if (typeof usage.reset_time === 'string') {
        resetTime = usage.reset_time;
      }

      return this.successResult(account, [
        this.createModelQuota('claude-pro', percentage, resetTime),
      ], planType);
    }

    return this.successResult(account, [
      this.createModelQuota('claude-quota', -1, null),
    ], this.detectPlanType(account.authData));
  }

  private detectPlanType(authData: Record<string, unknown>): string | null {
    if (authData.plan) return String(authData.plan);
    if (authData.subscription) return String(authData.subscription);
    if (authData.tier) return String(authData.tier);
    return null;
  }
}
