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
      
      // usage count
      let promptCount = -1;
      const promptCountEntry = db.prepare("SELECT value FROM ItemTable WHERE key = 'freeBestOfN.promptCount'").get() as { value: string } | undefined;
      if (promptCountEntry && promptCountEntry.value) {
        promptCount = parseInt(promptCountEntry.value, 10);
      }
      
      db.close();

      // Map status to plan name
      if (planType === 'active') planType = 'Pro';
      if (planType === 'trialing') planType = 'Pro Trial';

      // 1. Fetch Real Usage API
      if (!config.noNetwork && account.authData.accessToken) {
        try {
          const response = await this.fetchWithTimeout(
            'https://api2.cursor.sh/auth/usage-summary',
            {
              headers: {
                Authorization: `Bearer ${account.authData.accessToken}`,
                Accept: 'application/json',
              },
            },
            config.timeout * 1000
          );

          if (response.ok) {
            const data = await response.json() as any;
            
            // Plan Usage
            if (data.individualUsage?.plan) {
               const p = data.individualUsage.plan;
               const limit = p.limit || 0;
               const remaining = p.remaining ?? -1;
               const percentage = limit > 0 ? (remaining / limit) * 100 : -1;
               models.push(this.createModelQuota('cursor-plan', percentage, data.billingCycleEnd, {
                 used: p.used,
                 limit: limit,
                 remaining: remaining
               }));
            }
            
            // On Demand
            if (data.individualUsage?.onDemand?.enabled) {
               const od = data.individualUsage.onDemand;
               const limit = od.limit || 0;
               const remaining = od.remaining ?? -1;
               // If no limit, treat as 100% remaining or -1
               const percentage = limit > 0 ? (remaining / limit) * 100 : (od.limit === null ? 100 : -1);
               models.push(this.createModelQuota('cursor-on-demand', percentage, data.billingCycleEnd, {
                 used: od.used,
                 limit: limit,
                 remaining: remaining
               }));
            }
          }
        } catch (err) {
          debug('Cursor API failed', err);
        }
      }

      // 2. Add Local Metrics (as supplementary "cursor-local-prompts")
      // We rename it to distinguish from official plan usage
      models.push(this.createModelQuota('cursor-local-prompts', -1, null, { used: promptCount }));

      return this.successResult(account, models, planType);

    } catch (error) {
      debug('Error reading Cursor DB', error);
      return this.errorResult(account, error instanceof Error ? error.message : 'Database read error');
    }
  }
}
