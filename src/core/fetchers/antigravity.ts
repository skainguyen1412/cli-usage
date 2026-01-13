/**
 * Antigravity (Google Cloud Code) provider fetcher
 */

import fs from 'fs';
import path from 'path';
import { ProviderFetcher } from './base.js';
import { DiscoveredAccount, FetchResult, Config, PROVIDER_NAMES, ModelQuota } from '../../types/index.js';
import { debug } from '../../utils/logger.js';
import { expandPath } from '../../utils/config.js';
import { getAccessToken, isTokenExpired } from '../../utils/auth.js';

export class AntigravityFetcher extends ProviderFetcher {
  readonly providerName = PROVIDER_NAMES.ANTIGRAVITY;
  readonly supportsRefresh = true;

  async fetchQuota(account: DiscoveredAccount, config: Config): Promise<FetchResult> {
    const accessToken = getAccessToken(account.authData);
    
    // 1. Validate auth
    if (!accessToken) {
       // If no token, maybe we can't do API, but we might still have logs
       // But usually auth file has token.
       if (!account.authData.accessToken) {
         return this.needsReauthResult(account, 'No access token found');
       }
    }
    
    if (isTokenExpired(account.authData)) {
      return this.needsReauthResult(account, 'Access token expired');
    }

    // 2. Count usage from logs (local)
    let usageCount = 0;
    try {
      const geminiDir = expandPath('~/.gemini');
      const tmpDir = path.join(geminiDir, 'tmp');
      
      if (fs.existsSync(tmpDir)) {
         const subdirs = await fs.promises.readdir(tmpDir, { withFileTypes: true });
         
         const logPromises = subdirs
            .filter(d => d.isDirectory())
            .map(async (d) => {
               const logPath = path.join(tmpDir, d.name, 'logs.json');
               try {
                  if (fs.existsSync(logPath)) {
                     const content = await fs.promises.readFile(logPath, 'utf-8');
                     const logs = JSON.parse(content);
                     if (Array.isArray(logs)) {
                        return logs.filter((msg: any) => msg.type === 'user').length;
                     }
                  }
               } catch (err) { /* ignore */ }
               return 0;
            });
            
         const counts = await Promise.all(logPromises);
         usageCount = counts.reduce((a, b) => a + b, 0);
      }
    } catch (err) {
      debug('Failed to scan Antigravity logs', err);
    }
    
    // 3. Fetch Real Quota API
    let models: ModelQuota[] = [];
    let apiError: string | undefined;

    if (!config.noNetwork) {
        try {
            const response = await this.fetchWithTimeout(
                'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({})
                },
                config.timeout * 1000
            );

            if (response.ok) {
                const data = await response.json() as any;
                if (data && data.models) {
                    for (const [modelId, info] of Object.entries(data.models)) {
                        const mInfo = info as any;
                        if (mInfo.quotaInfo) {
                            const remainingFraction = mInfo.quotaInfo.remainingFraction ?? -1;
                            const percentage = remainingFraction >= 0 ? remainingFraction * 100 : -1;
                            
                            // Filter for relevant models if needed, or just include all
                            // We typically care about 'gemini' and 'claude'
                            if (modelId.includes('gemini') || modelId.includes('claude')) {
                                models.push(this.createModelQuota(modelId, percentage, mInfo.quotaInfo.resetTime, { used: usageCount }));
                            }
                        }
                    }
                }
            } else {
                apiError = `API ${response.status}`;
            }
        } catch (err) {
             debug('Antigravity API failed', err);
             apiError = 'API conn error';
        }
    }

    // Fallback if API failed or returned no relevant models
    if (models.length === 0) {
        models.push(this.createModelQuota('gemini-2.0-flash-exp', -1, null, { used: usageCount }));
        if (apiError) {
             // We return success but maybe with a note? 
             // Actually, if we have usage count, it's still useful.
        }
    } else {
        // Ensure usage count is attached to at least one model if not already (it is attached to all above)
    }

    return this.successResult(account, models, null);
  }
}
