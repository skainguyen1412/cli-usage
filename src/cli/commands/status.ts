/**
 * Status command - Show provider quota status
 */

import { Config, ProviderQuotaData, CLIError, DiscoveredAccount, ExitCode } from '../../types/index.js';
import { discoverAllAccounts, getCachedProviderQuota, setCachedProviderQuota } from '../../utils/index.js';
import { getFetcher } from '../../core/fetchers/index.js';
import { formatQuotaTable, formatQuotaJson } from '../formatters/index.js';
import { debug, info, error as logError } from '../../utils/logger.js';
import pLimit from 'p-limit';

export interface StatusOptions {
  format: 'table' | 'json';
  authDir: string;
  provider?: string;
  account?: string;
  strict: boolean;
  noNetwork: boolean;
  timeout: number;
  rateLimit: {
    maxConcurrency: number;
    perProvider: number;
  };
  cache: {
    enabled: boolean;
    ttlSeconds: number;
  };
}

export async function statusCommand(options: StatusOptions): Promise<number> {
  const config: Config = {
    authDir: options.authDir,
    baseUrl: '',
    timeout: options.timeout,
    format: options.format,
    strict: options.strict,
    noNetwork: options.noNetwork,
    rateLimit: options.rateLimit,
    cache: options.cache,
  };

  // Discover accounts
  let accounts = discoverAllAccounts(options.authDir);

  // Filter by provider if specified
  if (options.provider) {
    const providerFilter = options.provider;
    accounts = accounts.filter((a: DiscoveredAccount) => a.provider === providerFilter.toLowerCase());
  }

  // Filter by account if specified
  if (options.account) {
    const accountFilter = options.account;
    accounts = accounts.filter((a: DiscoveredAccount) => a.account.includes(accountFilter));
  }

  debug(`Discovered ${accounts.length} accounts`, accounts.map((a) => ({ provider: a.provider, account: a.account })));

  if (accounts.length === 0) {
    if (options.format === 'json') {
      info(formatQuotaJson([], []));
    } else {
      info(formatQuotaTable([], []));
    }
    return options.strict ? ExitCode.NO_ACCOUNTS : ExitCode.SUCCESS;
  }

  // Fetch quota for all accounts
  const results = await fetchAllQuotas(accounts, config);

  // Separate successful results and errors
  const providers: ProviderQuotaData[] = [];
  const errors: CLIError[] = [];

  for (const result of results) {
    if (result.data) {
      providers.push(result.data);
    }
    if (result.error) {
      errors.push({
        provider: result.provider,
        account: result.account,
        error: result.errorType || 'unknown',
        message: result.error,
        fallbackUsed: result.fallbackUsed,
      });
    }
  }

  // Output
  if (options.format === 'json') {
    info(formatQuotaJson(providers, errors));
  } else {
    info(formatQuotaTable(providers, errors));
  }

  // Determine exit code
  if (options.strict && errors.length > 0) {
    return ExitCode.STRICT_FAILURE;
  }

  return ExitCode.SUCCESS;
}

interface FetchResultWithMeta {
  provider: string;
  account: string;
  data?: ProviderQuotaData;
  error?: string;
  errorType?: string;
  fallbackUsed: boolean;
}

async function fetchAllQuotas(
  accounts: DiscoveredAccount[],
  config: Config
): Promise<FetchResultWithMeta[]> {
  const limit = pLimit(config.rateLimit.maxConcurrency);
  const results: FetchResultWithMeta[] = [];

  const fetchTasks = accounts.map((account) =>
    limit(async () => {
      const fetcher = getFetcher(account.provider);

      if (!fetcher) {
        debug(`No fetcher for provider: ${account.provider}`);
        return {
          provider: account.provider,
          account: account.account,
          error: 'Unsupported provider',
          errorType: 'unsupported',
          fallbackUsed: false,
        };
      }

      try {
        const result = await fetcher.fetchQuota(account, config);

        if (result.success && result.data) {
          // Cache successful result
          if (config.cache.enabled) {
            setCachedProviderQuota(
              account.provider,
              account.account,
              result.data,
              config.cache.ttlSeconds
            );
          }

          return {
            provider: account.provider,
            account: account.account,
            data: result.data,
            fallbackUsed: false,
          };
        }

        // Check for cached fallback
        if (config.cache.enabled) {
          const cached = getCachedProviderQuota(account.provider, account.account);
          if (cached) {
            return {
              provider: account.provider,
              account: account.account,
              data: cached.data,
              error: result.error,
              errorType: result.needsReauth ? 'auth' : 'fetch',
              fallbackUsed: true,
            };
          }
        }

        // Return error result
        return {
          provider: account.provider,
          account: account.account,
          data: result.data, // May still have partial data
          error: result.error,
          errorType: result.needsReauth ? 'auth' : 'fetch',
          fallbackUsed: false,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        debug(`Error fetching ${account.provider}/${account.account}: ${errorMsg}`);

        // Try cache fallback
        if (config.cache.enabled) {
          const cached = getCachedProviderQuota(account.provider, account.account);
          if (cached) {
            return {
              provider: account.provider,
              account: account.account,
              data: cached.data,
              error: errorMsg,
              errorType: 'exception',
              fallbackUsed: true,
            };
          }
        }

        return {
          provider: account.provider,
          account: account.account,
          error: errorMsg,
          errorType: 'exception',
          fallbackUsed: false,
        };
      }
    })
  );

  const taskResults = await Promise.all(fetchTasks);
  results.push(...taskResults);

  return results;
}
