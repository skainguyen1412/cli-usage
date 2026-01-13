/**
 * Export command - Save quota snapshot to file
 */

import * as fs from 'fs';
import * as path from 'path';
import { Config, ProviderQuotaData, CLIError, DiscoveredAccount, ExitCode } from '../../types/index.js';
import { discoverAllAccounts, getCachedProviderQuota, setCachedProviderQuota, expandPath } from '../../utils/index.js';
import { getFetcher } from '../../core/fetchers/index.js';
import { fetchProxyUsage } from '../../core/clients/index.js';
import { formatExportJson } from '../formatters/index.js';
import { debug, info, error as logError } from '../../utils/logger.js';
import pLimit from 'p-limit';

export interface ExportOptions {
  format: 'json';
  out: string;
  authDir: string;
  baseUrl: string;
  timeout: number;
  noNetwork: boolean;
  rateLimit: {
    maxConcurrency: number;
    perProvider: number;
  };
  cache: {
    enabled: boolean;
    ttlSeconds: number;
  };
}

export async function exportCommand(options: ExportOptions): Promise<number> {
  const config: Config = {
    authDir: options.authDir,
    baseUrl: options.baseUrl,
    timeout: options.timeout,
    format: options.format,
    strict: false,
    noNetwork: options.noNetwork,
    rateLimit: options.rateLimit,
    cache: options.cache,
  };

  // Discover accounts
  const accounts = discoverAllAccounts(options.authDir);

  // Fetch all quotas
  const limit = pLimit(config.rateLimit.maxConcurrency);
  const providers: ProviderQuotaData[] = [];
  const errors: CLIError[] = [];

  const fetchTasks = accounts.map((account) =>
    limit(async () => {
      const fetcher = getFetcher(account.provider);
      if (!fetcher) return null;

      try {
        const result = await fetcher.fetchQuota(account, config);
        if (result.data) {
          providers.push(result.data);
          if (config.cache.enabled) {
            setCachedProviderQuota(account.provider, account.account, result.data, config.cache.ttlSeconds);
          }
        }
        if (result.error) {
          errors.push({
            provider: account.provider,
            account: account.account,
            error: 'fetch_error',
            message: result.error,
            fallbackUsed: false,
          });
        }
      } catch (err) {
        errors.push({
          provider: account.provider,
          account: account.account,
          error: 'exception',
          message: err instanceof Error ? err.message : 'Unknown error',
          fallbackUsed: false,
        });
      }
    })
  );

  await Promise.all(fetchTasks);

  // Fetch proxy usage (optional)
  let proxyUsage = null;
  if (!options.noNetwork) {
    try {
      const stats = await fetchProxyUsage(config);
      if (stats.isReachable) {
        proxyUsage = stats.data;
      }
    } catch {
      // Ignore proxy errors for export
    }
  }

  // Generate JSON
  const json = formatExportJson(providers, proxyUsage, errors);

  // Write to file
  const outputPath = expandPath(options.out);
  const outputDir = path.dirname(outputPath);

  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, json, 'utf-8');
    info(`Exported quota snapshot to ${outputPath}`);
    info(`${providers.length} providers, ${accounts.length} accounts`);
    return ExitCode.SUCCESS;
  } catch (err) {
    logError(`Failed to write to ${outputPath}`, err);
    return ExitCode.GENERAL_ERROR;
  }
}
