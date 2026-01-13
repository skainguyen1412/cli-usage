/**
 * JSON output formatter
 */

import { CLIOutput, ProviderQuotaData, UsageData, CLIError } from '../../types/index.js';
import { nowISO8601 } from '../../utils/time.js';

const SCHEMA_VERSION = 1;

/**
 * Format provider quota data as JSON
 */
export function formatQuotaJson(providers: ProviderQuotaData[], errors: CLIError[]): string {
  const output: CLIOutput = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: nowISO8601(),
    providers: {},
    errors,
  };

  // Group by provider
  for (const provider of providers) {
    if (!output.providers[provider.provider]) {
      output.providers[provider.provider] = { accounts: {} };
    }
    output.providers[provider.provider].accounts[provider.account] = provider;
  }

  return JSON.stringify(output, null, 2);
}

/**
 * Format usage stats as JSON
 */
export function formatUsageJson(proxyUsage: UsageData | null, isReachable: boolean, error?: string): string {
  const output = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: nowISO8601(),
    proxyUsage: proxyUsage,
    isReachable,
    error,
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Format complete status (providers + proxy) as JSON
 */
export function formatCompleteJson(
  providers: ProviderQuotaData[],
  proxyUsage: UsageData | null,
  errors: CLIError[]
): string {
  const output: CLIOutput = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: nowISO8601(),
    proxyUsage,
    providers: {},
    errors,
  };

  // Group by provider
  for (const provider of providers) {
    if (!output.providers[provider.provider]) {
      output.providers[provider.provider] = { accounts: {} };
    }
    output.providers[provider.provider].accounts[provider.account] = provider;
  }

  return JSON.stringify(output, null, 2);
}

/**
 * Format export output
 */
export function formatExportJson(
  providers: ProviderQuotaData[],
  proxyUsage: UsageData | null,
  errors: CLIError[]
): string {
  return formatCompleteJson(providers, proxyUsage, errors);
}
