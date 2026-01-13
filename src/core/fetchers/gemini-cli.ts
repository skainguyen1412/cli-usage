/**
 * Gemini CLI provider fetcher
 * Only detects account presence - quota is unknown
 */

import { ProviderFetcher } from './base.js';
import { DiscoveredAccount, FetchResult, Config, PROVIDER_NAMES } from '../../types/index.js';
import { debug } from '../../utils/logger.js';

export class GeminiCliFetcher extends ProviderFetcher {
  readonly providerName = PROVIDER_NAMES.GEMINI_CLI;
  readonly supportsRefresh = false;

  async fetchQuota(account: DiscoveredAccount, config: Config): Promise<FetchResult> {
    // Gemini CLI doesn't have a known quota API
    // We just confirm the account is configured and return unknown quota
    debug(`Gemini CLI account detected: ${account.account}`);

    // Return with percentage = -1 (unknown quota convention)
    return this.successResult(account, [
      this.createModelQuota('gemini-quota', -1, null),
    ], null);
  }
}
