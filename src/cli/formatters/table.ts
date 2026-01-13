/**
 * Table output formatter
 */

import Table from 'cli-table3';
import chalk from 'chalk';
import { ProviderQuotaData, UsageStats, CLIError } from '../../types/index.js';
import { formatRelativeTime, formatAge } from '../../utils/time.js';

/**
 * Format provider quota data as a table
 */
export function formatQuotaTable(providers: ProviderQuotaData[], errors: CLIError[]): string {
  if (providers.length === 0) {
    return chalk.yellow('No provider accounts found.\n\nRun `quota doctor` to see available data sources.');
  }

  const table = new Table({
    head: [
      chalk.bold('Provider'),
      chalk.bold('Account'),
      chalk.bold('Plan'),
      chalk.bold('Remaining'),
      chalk.bold('Reset'),
      chalk.bold('Notes'),
    ],
    style: {
      head: [],
      border: [],
    },
  });

  for (const provider of providers) {
    const lowestModel = getLowestModel(provider);
    const percentage = lowestModel?.percentage ?? -1;
    const resetTime = lowestModel?.resetTime ?? null;

    // Format percentage
    let percentageStr: string;
    if (percentage < 0) {
      percentageStr = chalk.gray('unknown');
    } else if (percentage < 25) {
      percentageStr = chalk.red(`${percentage.toFixed(0)}%`);
    } else if (percentage < 50) {
      percentageStr = chalk.yellow(`${percentage.toFixed(0)}%`);
    } else {
      percentageStr = chalk.green(`${percentage.toFixed(0)}%`);
    }

    // Format reset time
    const resetStr = formatRelativeTime(resetTime);

    // Build notes
    const notes: string[] = [];

    if (provider.isForbidden) {
      notes.push(chalk.red('forbidden'));
    }
    if (provider.needsReauth) {
      notes.push(chalk.yellow('needs re-auth ⚠️'));
    }
    if (provider.isStale && provider.ageSeconds) {
      notes.push(chalk.gray(`stale (${formatAge(provider.ageSeconds)}) ⚠️`));
    }
    if (provider.error && !provider.isForbidden && !provider.needsReauth) {
      notes.push(chalk.red(provider.error));
    }
    if (provider.models.length > 1 && lowestModel) {
      notes.push(chalk.gray(`(lowest: ${lowestModel.name})`));
    }

    table.push([
      capitalizeFirst(provider.provider),
      provider.account,
      provider.planType || '-',
      percentageStr,
      resetStr,
      notes.join(' '),
    ]);
  }

  let output = table.toString();

  // Add warnings summary
  const warnings = getWarnings(providers, errors);
  if (warnings.length > 0) {
    output += '\n\n' + warnings.map((w) => chalk.yellow(`⚠️  ${w}`)).join('\n');
  }

  // Add needs reauth details
  const needsReauth = providers.filter((p) => p.needsReauth);
  if (needsReauth.length > 0) {
    output += '\n\n' + chalk.yellow(`⚠️  ${needsReauth.length} account(s) need re-authentication:`);
    for (const p of needsReauth) {
      output += `\n  - ${capitalizeFirst(p.provider)} (${p.account}): ${p.error || 'token expired/invalid'}`;
      output += '\n    → Re-authenticate using your IDE or auth tool to generate a new token';
    }
  }

  return output;
}

/**
 * Format usage stats as a table
 */
export function formatUsageTable(stats: UsageStats, baseUrl: string): string {
  let output = '';

  if (!stats.isReachable) {
    return chalk.red(`CLIProxyAPI not reachable at ${baseUrl}\n`) +
           chalk.gray(`Error: ${stats.error || 'Connection failed'}`);
  }

  output += chalk.bold(`CLIProxyAPI Usage Stats (${baseUrl})\n`);
  output += chalk.gray(`Last updated: ${stats.lastUpdated.toLocaleString()}\n\n`);

  const { data } = stats;

  // Request stats
  const successRate = data.totalRequests > 0
    ? ((data.successCount / data.totalRequests) * 100).toFixed(1)
    : '0.0';
  const failureRate = data.totalRequests > 0
    ? ((data.failureCount / data.totalRequests) * 100).toFixed(1)
    : '0.0';

  output += `Total Requests:     ${formatNumber(data.totalRequests)}\n`;
  output += chalk.green(`  ✓ Success:        ${formatNumber(data.successCount)} (${successRate}%)\n`);
  output += chalk.red(`  ✗ Failed:         ${formatNumber(data.failureCount)} (${failureRate}%)\n`);

  output += '\nToken Usage:\n';
  output += `  Input tokens:     ${formatNumber(data.inputTokens)}\n`;
  output += `  Output tokens:    ${formatNumber(data.outputTokens)}\n`;
  output += `  Total tokens:     ${formatNumber(data.totalTokens)}\n`;

  return output;
}

/**
 * Format doctor output
 */
export function formatDoctorTable(diagnostics: DoctorDiagnostics): string {
  let output = chalk.bold.underline('Quota Tracker Diagnostics\n\n');

  // Configuration
  output += chalk.bold('Configuration\n');
  output += chalk.gray('─'.repeat(40) + '\n');
  output += `Auth directory:     ${diagnostics.config.authDir}\n`;
  output += `Proxy base URL:     ${diagnostics.config.baseUrl}\n`;
  output += `Timeout:            ${diagnostics.config.timeout}s\n`;
  output += `Cache directory:    ${diagnostics.cacheDir}\n\n`;

  // Auth files
  output += chalk.bold('Auth Files Discovered\n');
  output += chalk.gray('─'.repeat(40) + '\n');

  if (diagnostics.authFiles.length === 0) {
    output += chalk.yellow('No auth files found\n');
  } else {
    for (const file of diagnostics.authFiles) {
      const status = file.valid ? chalk.green('✓') : chalk.red('✗');
      output += `${status} ${capitalizeFirst(file.provider)}:`.padEnd(20);
      output += `${file.filename}`;
      if (file.expiry) {
        output += chalk.gray(` (${file.expiry})`);
      }
      output += '\n';
    }
  }

  // Gemini CLI
  output += '\n';
  if (diagnostics.geminiCli.found) {
    output += chalk.green('✓') + ` Gemini CLI:       ~/.gemini/ (${diagnostics.geminiCli.account})\n`;
  } else {
    output += chalk.gray('✗') + ` Gemini CLI:       not found\n`;
  }

  // Cursor
  if (diagnostics.cursor && diagnostics.cursor.found) {
    output += chalk.green('✓') + ` Cursor:           ~/Libra.../state.vscdb (${diagnostics.cursor.account})\n`;
  } else {
    output += chalk.gray('✗') + ` Cursor:           not found\n`;
  }

  // Proxy connectivity
  output += '\n' + chalk.bold('Proxy Connectivity\n');
  output += chalk.gray('─'.repeat(40) + '\n');
  if (diagnostics.proxy.reachable) {
    output += chalk.green('✓') + ` Management API:   ${diagnostics.config.baseUrl} (reachable, ${diagnostics.proxy.latencyMs}ms)\n`;
  } else {
    output += chalk.red('✗') + ` Management API:   ${diagnostics.config.baseUrl} (${diagnostics.proxy.error || 'not reachable'})\n`;
  }

  // Warnings
  if (diagnostics.warnings.length > 0) {
    output += '\n' + chalk.bold('Warnings\n');
    output += chalk.gray('─'.repeat(40) + '\n');
    for (const warning of diagnostics.warnings) {
      output += chalk.yellow('⚠️  ' + warning + '\n');
    }
  }

  // Summary
  output += '\n' + chalk.bold('Summary\n');
  output += chalk.gray('─'.repeat(40) + '\n');
  output += `${diagnostics.authFiles.length} provider auth files found\n`;
  output += `Gemini CLI: ${diagnostics.geminiCli.found ? 'configured' : 'not found'}\n`;
  output += `Cursor: ${diagnostics && diagnostics.cursor && diagnostics.cursor.found ? 'configured' : 'not found'}\n`;
  output += `Proxy: ${diagnostics.proxy.reachable ? 'reachable' : 'not reachable'}\n`;

  return output;
}

// Helper types
export interface DoctorDiagnostics {
  config: {
    authDir: string;
    baseUrl: string;
    timeout: number;
  };
  cacheDir: string;
  authFiles: Array<{
    provider: string;
    filename: string;
    valid: boolean;
    expiry?: string;
  }>;
  geminiCli: {
    found: boolean;
    account?: string;
  };
  cursor?: {
    found: boolean;
    account?: string;
  };
  proxy: {
    reachable: boolean;
    latencyMs?: number;
    error?: string;
  };
  warnings: string[];
}

// Helper functions
function getLowestModel(provider: ProviderQuotaData) {
  if (provider.models.length === 0) return null;

  // Find model with lowest percentage (ignoring -1/unknown)
  const knownModels = provider.models.filter((m) => m.percentage >= 0);
  if (knownModels.length === 0) return provider.models[0];

  return knownModels.reduce((min, m) => (m.percentage < min.percentage ? m : min), knownModels[0]);
}

function getWarnings(providers: ProviderQuotaData[], errors: CLIError[]): string[] {
  const warnings: string[] = [];

  const lowQuota = providers.filter((p) => {
    const lowest = getLowestModel(p);
    return lowest && lowest.percentage >= 0 && lowest.percentage < 50;
  });

  if (lowQuota.length > 0) {
    warnings.push(`${lowQuota.length} provider(s) have low quota (< 50%)`);
  }

  const stale = providers.filter((p) => p.isStale);
  if (stale.length > 0) {
    warnings.push(`${stale.length} provider(s) returned stale data (network error)`);
  }

  if (errors.length > 0) {
    warnings.push(`${errors.length} error(s) occurred during fetch`);
  }

  return warnings;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}
