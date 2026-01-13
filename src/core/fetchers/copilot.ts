/**
 * GitHub Copilot provider fetcher
 */

import { ProviderFetcher } from './base.js';
import { DiscoveredAccount, FetchResult, Config, PROVIDER_NAMES } from '../../types/index.js';
import { getAccessToken, isTokenExpired } from '../../utils/auth.js';
import { debug } from '../../utils/logger.js';

export class CopilotFetcher extends ProviderFetcher {
  readonly providerName = PROVIDER_NAMES.COPILOT;
  readonly supportsRefresh = true;

  private readonly COPILOT_API = 'https://api.github.com/copilot_internal/v2/token';
  private readonly COPILOT_ENTITLEMENT = 'https://api.github.com/copilot_internal/v2/entitlements';

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
        this.createModelQuota('copilot-quota', -1, null),
      ], null);
    }

    try {
      // Try to fetch entitlement/usage info
      const response = await this.fetchWithTimeout(
        this.COPILOT_ENTITLEMENT,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'User-Agent': 'quota-cli/1.0',
          },
        },
        config.timeout * 1000
      );

      if (response.status === 401) {
        return this.needsReauthResult(account, 'Unauthorized - token expired or invalid');
      }

      if (response.status === 403) {
        return this.forbiddenResult(account, 'Access forbidden - check Copilot subscription');
      }

      if (!response.ok) {
        debug(`Copilot entitlement returned ${response.status}`);
        return this.successResult(account, [
          this.createModelQuota('copilot-monthly', -1, null),
        ], this.detectPlanType(account.authData));
      }

      const data = await response.json();
      return this.parseEntitlementResponse(account, data);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return this.errorResult(account, 'Request timeout');
      }

      debug(`Copilot fetch error: ${error}`);
      return this.successResult(account, [
        this.createModelQuota('copilot-quota', -1, null),
      ], this.detectPlanType(account.authData));
    }
  }

  private parseEntitlementResponse(account: DiscoveredAccount, data: unknown): FetchResult {
    if (typeof data === 'object' && data !== null) {
      const entitlement = data as Record<string, unknown>;

      // Try to extract useful info
      const planType = entitlement.sku_name as string || 
                       entitlement.plan as string || 
                       this.detectPlanType(account.authData);

      // Check for rate limit info
      const percentage = typeof entitlement.remaining_percentage === 'number'
        ? entitlement.remaining_percentage
        : -1;

      const resetTime = typeof entitlement.resets_at === 'string'
        ? entitlement.resets_at
        : null;

      return this.successResult(account, [
        this.createModelQuota('copilot-monthly', percentage, resetTime),
      ], planType);
    }

    return this.successResult(account, [
      this.createModelQuota('copilot-quota', -1, null),
    ], this.detectPlanType(account.authData));
  }

  private detectPlanType(authData: Record<string, unknown>): string | null {
    if (authData.sku) return String(authData.sku);
    if (authData.plan) return String(authData.plan);
    if (authData.organization) return 'business';
    return null;
  }
}
