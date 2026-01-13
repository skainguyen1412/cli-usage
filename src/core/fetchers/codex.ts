/**
 * Codex/OpenAI provider fetcher
 */

import { ProviderFetcher } from './base.js';
import { DiscoveredAccount, FetchResult, Config, PROVIDER_NAMES } from '../../types/index.js';
import { getAccessToken, isTokenExpired } from '../../utils/auth.js';
import { debug } from '../../utils/logger.js';

export class CodexFetcher extends ProviderFetcher {
  readonly providerName = PROVIDER_NAMES.CODEX;
  readonly supportsRefresh = true;

  async fetchQuota(account: DiscoveredAccount, config: Config): Promise<FetchResult> {
    const accessToken = getAccessToken(account.authData);

    if (!accessToken) {
      return this.needsReauthResult(account, 'No access token found');
    }

    if (isTokenExpired(account.authData)) {
      return this.needsReauthResult(account, 'Access token expired');
    }

    if (config.noNetwork) {
      // Return placeholder with unknown quota
      return this.successResult(account, [
        this.createModelQuota('codex-quota', -1, null),
      ], null);
    }

    try {
      // Call OpenAI-compatible usage endpoint
      // Note: The actual endpoint may vary based on the proxy/provider setup
      const response = await this.fetchWithTimeout(
        'https://api.openai.com/v1/usage',
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
        // Try alternative approach - just return success with placeholder
        // since many Codex setups don't have a standard usage endpoint
        debug(`Codex usage endpoint returned ${response.status}, using placeholder`);
        return this.successResult(account, [
          this.createModelQuota('codex-weekly', -1, null),
        ], this.detectPlanType(account.authData));
      }

      const data = await response.json();
      return this.parseUsageResponse(account, data);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return this.errorResult(account, 'Request timeout');
      }

      // For network errors, return placeholder
      debug(`Codex fetch error: ${error}`);
      return this.successResult(account, [
        this.createModelQuota('codex-quota', -1, null),
      ], this.detectPlanType(account.authData));
    }
  }

  private parseUsageResponse(account: DiscoveredAccount, data: unknown): FetchResult {
    // Parse OpenAI usage response
    // The actual structure depends on the endpoint
    if (typeof data === 'object' && data !== null) {
      const usage = data as Record<string, unknown>;

      // Try to extract quota info
      const percentage = typeof usage.percentage === 'number' ? usage.percentage : -1;
      const resetTime = typeof usage.reset_at === 'string' ? usage.reset_at : null;

      return this.successResult(account, [
        this.createModelQuota('codex-weekly', percentage, resetTime),
      ], this.detectPlanType(account.authData));
    }

    return this.successResult(account, [
      this.createModelQuota('codex-quota', -1, null),
    ], this.detectPlanType(account.authData));
  }

  private detectPlanType(authData: Record<string, unknown>): string | null {
    // Try to detect plan type from auth data
    if (authData.plan_type) return String(authData.plan_type);
    if (authData.planType) return String(authData.planType);
    if (authData.subscription) return String(authData.subscription);
    return null;
  }
}
