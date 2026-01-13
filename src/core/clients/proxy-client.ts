/**
 * CLIProxyAPI management client
 * Fetches usage stats from the proxy's management API
 */

import { UsageStats, UsageData, Config } from '../../types/index.js';
import { debug } from '../../utils/logger.js';
import { nowISO8601 } from '../../utils/time.js';

/**
 * Fetch usage stats from CLIProxyAPI
 */
export async function fetchProxyUsage(config: Config): Promise<UsageStats> {
  const url = `${config.baseUrl}/usage`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout * 1000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add management key if configured
    if (config.managementKey) {
      headers['X-Management-Key'] = config.managementKey;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      debug(`Proxy usage API returned ${response.status}`);
      return {
        data: createEmptyUsageData(),
        lastUpdated: new Date(),
        isReachable: true,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const usageData = parseUsageResponse(data);

    return {
      data: usageData,
      lastUpdated: new Date(),
      isReachable: true,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        data: createEmptyUsageData(),
        lastUpdated: new Date(),
        isReachable: false,
        error: 'Request timeout',
      };
    }

    debug(`Proxy usage fetch error: ${error}`);
    return {
      data: createEmptyUsageData(),
      lastUpdated: new Date(),
      isReachable: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Check if proxy is reachable
 */
export async function checkProxyHealth(config: Config): Promise<{ reachable: boolean; latencyMs?: number; error?: string }> {
  const url = `${config.baseUrl}/health`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout for health check

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    return {
      reachable: response.ok,
      latencyMs,
    };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Parse usage response from proxy
 */
function parseUsageResponse(data: unknown): UsageData {
  if (typeof data !== 'object' || data === null) {
    return createEmptyUsageData();
  }

  const response = data as Record<string, unknown>;

  // Handle nested structure (e.g., { usage: { ... } })
  const usage = (response.usage || response.data || response) as Record<string, unknown>;

  return {
    totalRequests: parseNumber(usage.total_requests || usage.totalRequests),
    successCount: parseNumber(usage.success_count || usage.successCount),
    failureCount: parseNumber(usage.failure_count || usage.failureCount),
    totalTokens: parseNumber(usage.total_tokens || usage.totalTokens),
    inputTokens: parseNumber(usage.input_tokens || usage.inputTokens),
    outputTokens: parseNumber(usage.output_tokens || usage.outputTokens),
  };
}

/**
 * Parse a number from unknown input
 */
function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Create empty usage data
 */
function createEmptyUsageData(): UsageData {
  return {
    totalRequests: 0,
    successCount: 0,
    failureCount: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
}
