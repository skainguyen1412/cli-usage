/**
 * Antigravity (Google Cloud Code) provider fetcher
 */

import { ProviderFetcher } from './base.js';
import { DiscoveredAccount, FetchResult, Config, PROVIDER_NAMES, ModelQuota } from '../../types/index.js';
import { getAccessToken, isTokenExpired } from '../../utils/auth.js';
import { debug } from '../../utils/logger.js';

export class AntigravityFetcher extends ProviderFetcher {
  readonly providerName = PROVIDER_NAMES.ANTIGRAVITY;
  readonly supportsRefresh = true;

  // Internal Cloud Code endpoints (these may change)
  private readonly MODELS_API = 'https://cloudcode.googleapis.com/v1/models';

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
        this.createModelQuota('antigravity-quota', -1, null),
      ], null);
    }

    try {
      // Try to fetch available models with quota info
      const response = await this.fetchWithTimeout(
        this.MODELS_API,
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
        return this.forbiddenResult(account, 'Access forbidden - check Google account access');
      }

      if (!response.ok) {
        debug(`Antigravity models API returned ${response.status}`);
        return this.successResult(account, [
          this.createModelQuota('gemini-2.0-flash-exp', -1, null),
          this.createModelQuota('claude-3-5-sonnet', -1, null),
        ], null);
      }

      const data = await response.json();
      return this.parseModelsResponse(account, data);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return this.errorResult(account, 'Request timeout');
      }

      debug(`Antigravity fetch error: ${error}`);
      // Return placeholder models
      return this.successResult(account, [
        this.createModelQuota('gemini-2.0-flash-exp', -1, null),
        this.createModelQuota('claude-3-5-sonnet', -1, null),
      ], null);
    }
  }

  private parseModelsResponse(account: DiscoveredAccount, data: unknown): FetchResult {
    const models: ModelQuota[] = [];

    if (typeof data === 'object' && data !== null) {
      const response = data as Record<string, unknown>;

      // Parse models array if present
      if (Array.isArray(response.models)) {
        for (const model of response.models) {
          if (typeof model === 'object' && model !== null) {
            const m = model as Record<string, unknown>;
            const name = String(m.name || m.model_id || 'unknown');

            // Extract quota info
            let percentage = -1;
            let resetTime: string | null = null;

            if (typeof m.remaining_percentage === 'number') {
              percentage = m.remaining_percentage;
            } else if (m.quota && typeof m.quota === 'object') {
              const quota = m.quota as Record<string, unknown>;
              if (typeof quota.remaining === 'number' && typeof quota.limit === 'number' && quota.limit > 0) {
                percentage = (quota.remaining / quota.limit) * 100;
              }
              if (typeof quota.reset_time === 'string') {
                resetTime = quota.reset_time;
              }
            }

            models.push(this.createModelQuota(name, percentage, resetTime));
          }
        }
      }
    }

    // If no models found, return placeholders
    if (models.length === 0) {
      models.push(
        this.createModelQuota('gemini-2.0-flash-exp', -1, null),
        this.createModelQuota('claude-3-5-sonnet', -1, null)
      );
    }

    return this.successResult(account, models, null);
  }
}
