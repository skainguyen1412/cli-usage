/**
 * Proxy-usage command - Show CLIProxyAPI usage stats
 */

import { Config, ExitCode } from '../../types/index.js';
import { fetchProxyUsage } from '../../core/clients/index.js';
import { formatUsageTable, formatUsageJson } from '../formatters/index.js';
import { getCachedProxyUsage, setCachedProxyUsage } from '../../utils/cache.js';
import { info } from '../../utils/logger.js';

export interface ProxyUsageOptions {
  format: 'table' | 'json';
  baseUrl: string;
  timeout: number;
  managementKey?: string;
}

export async function proxyUsageCommand(options: ProxyUsageOptions): Promise<number> {
  const config: Config = {
    authDir: '',
    baseUrl: options.baseUrl,
    timeout: options.timeout,
    format: options.format,
    strict: false,
    noNetwork: false,
    managementKey: options.managementKey,
    rateLimit: { maxConcurrency: 1, perProvider: 1 },
    cache: { enabled: true, ttlSeconds: 15 },
  };

  const stats = await fetchProxyUsage(config);

  // Cache if successful
  if (stats.isReachable) {
    setCachedProxyUsage(stats.data, 15);
  }

  // Output
  if (options.format === 'json') {
    info(formatUsageJson(stats.data, stats.isReachable, stats.error));
  } else {
    info(formatUsageTable(stats, options.baseUrl));
  }

  return stats.isReachable ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR;
}
