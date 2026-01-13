/**
 * Cursor provider fetcher
 * Reads from local SQLite database (state.vscdb)
 */

import Database from 'better-sqlite3';
import { ProviderFetcher } from './base.js';
import { DiscoveredAccount, FetchResult, Config, PROVIDER_NAMES, ModelQuota } from '../../types/index.js';
import { debug } from '../../utils/logger.js';

export class CursorFetcher extends ProviderFetcher {
  readonly providerName = PROVIDER_NAMES.CURSOR;
  readonly supportsRefresh = false; // Local DB read, effectively instant "refresh"

  async fetchQuota(account: DiscoveredAccount, config: Config): Promise<FetchResult> {
    const dbPath = account.filePath;
    
    // Default values
    let planType = 'unknown';
    let email = account.account;
    const models: ModelQuota[] = [];

    try {
      if (!account.authData.accessToken) {
        return this.needsReauthResult(account, 'No access token found in Cursor DB');
      }

      const db = new Database(dbPath, { readonly: true });
      
      // Get subscription status
      const subStatusEntry = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/stripeSubscriptionStatus'").get() as { value: string } | undefined;
      if (subStatusEntry && subStatusEntry.value) {
        // Value example: "active" or similar, maybe JSON
        // Cursor often stores plain strings for this key, but let's be safe
        planType = subStatusEntry.value;
      }

      // Get membership type
      const membershipEntry = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/stripeMembershipType'").get() as { value: string } | undefined;
      if (membershipEntry && membershipEntry.value) {
        // Overwrite plan with more specific type if available (e.g. "pro")
        planType = membershipEntry.value;
      }
      
      db.close();

      // Create a generic model quota (unlimited for pro, maybe limits for free)
      // Since we don't know the usage, we return -1
      models.push(this.createModelQuota('cursor-requests', -1, null));
      models.push(this.createModelQuota('cursor-fast-requests', -1, null)); // For pro users

      return this.successResult(account, models, planType);

    } catch (error) {
      debug('Error reading Cursor DB', error);
      return this.errorResult(account, error instanceof Error ? error.message : 'Database read error');
    }
  }
}
