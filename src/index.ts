#!/usr/bin/env node

/**
 * CLI Quota Tracker - Track quota and usage across AI tooling
 */

import { Command } from 'commander';
import { statusCommand } from './cli/commands/status.js';
import { proxyUsageCommand } from './cli/commands/proxy-usage.js';
import { doctorCommand } from './cli/commands/doctor.js';
import { exportCommand } from './cli/commands/export.js';
import { watchCommand } from './cli/commands/watch.js';
import { loadConfig, setDebugMode, expandPath } from './utils/index.js';
import { DEFAULT_CONFIG, ExitCode } from './types/index.js';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('quota')
  .description('Track quota and usage across AI tooling')
  .version(VERSION)
  .option('--debug', 'Enable debug output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.debug) {
      setDebugMode(true);
    }
  });

// Status command (default)
program
  .command('status', { isDefault: true })
  .description('Show provider quota status')
  .option('--format <type>', 'output format (table|json)', 'table')
  .option('--auth-dir <path>', 'auth directory path', DEFAULT_CONFIG.authDir)
  .option('--provider <name>', 'filter by provider name')
  .option('--account <id>', 'filter by account')
  .option('--strict', 'fail on any error', false)
  .option('--no-network', 'skip network calls, use local data only')
  .option('--timeout <seconds>', 'request timeout', String(DEFAULT_CONFIG.timeout))
  .action(async (options) => {
    const exitCode = await statusCommand({
      format: options.format,
      authDir: expandPath(options.authDir),
      provider: options.provider,
      account: options.account,
      strict: options.strict,
      noNetwork: !options.network,
      timeout: parseInt(options.timeout, 10) || DEFAULT_CONFIG.timeout,
      rateLimit: DEFAULT_CONFIG.rateLimit,
      cache: DEFAULT_CONFIG.cache,
    });
    process.exit(exitCode);
  });

// Proxy usage command
program
  .command('proxy-usage')
  .description('Show CLIProxyAPI usage stats')
  .option('--format <type>', 'output format (table|json)', 'table')
  .option('--base-url <url>', 'proxy base URL', DEFAULT_CONFIG.baseUrl)
  .option('--management-key <key>', 'management API key')
  .option('--timeout <seconds>', 'request timeout', String(DEFAULT_CONFIG.timeout))
  .action(async (options) => {
    const exitCode = await proxyUsageCommand({
      format: options.format,
      baseUrl: options.baseUrl,
      timeout: parseInt(options.timeout, 10) || DEFAULT_CONFIG.timeout,
      managementKey: options.managementKey,
    });
    process.exit(exitCode);
  });

// Doctor command
program
  .command('doctor')
  .description('Diagnostic check for available data sources')
  .option('--auth-dir <path>', 'auth directory path', DEFAULT_CONFIG.authDir)
  .option('--base-url <url>', 'proxy base URL', DEFAULT_CONFIG.baseUrl)
  .option('--timeout <seconds>', 'request timeout', String(DEFAULT_CONFIG.timeout))
  .action(async (options) => {
    const exitCode = await doctorCommand({
      authDir: expandPath(options.authDir),
      baseUrl: options.baseUrl,
      timeout: parseInt(options.timeout, 10) || DEFAULT_CONFIG.timeout,
    });
    process.exit(exitCode);
  });

// Export command
program
  .command('export')
  .description('Export quota snapshot to file')
  .requiredOption('--out <path>', 'output file path')
  .option('--format <type>', 'output format', 'json')
  .option('--auth-dir <path>', 'auth directory path', DEFAULT_CONFIG.authDir)
  .option('--base-url <url>', 'proxy base URL', DEFAULT_CONFIG.baseUrl)
  .option('--timeout <seconds>', 'request timeout', String(DEFAULT_CONFIG.timeout))
  .option('--no-network', 'skip network calls')
  .action(async (options) => {
    const exitCode = await exportCommand({
      format: 'json',
      out: options.out,
      authDir: expandPath(options.authDir),
      baseUrl: options.baseUrl,
      timeout: parseInt(options.timeout, 10) || DEFAULT_CONFIG.timeout,
      noNetwork: !options.network,
      rateLimit: DEFAULT_CONFIG.rateLimit,
      cache: DEFAULT_CONFIG.cache,
    });
    process.exit(exitCode);
  });

// Watch command
program
  .command('watch')
  .description('Periodically refresh and display quota')
  .option('--interval <seconds>', 'refresh interval', '30')
  .option('--format <type>', 'output format (table|json)', 'table')
  .option('--auth-dir <path>', 'auth directory path', DEFAULT_CONFIG.authDir)
  .option('--provider <name>', 'filter by provider name')
  .option('--strict', 'fail on any error', false)
  .option('--timeout <seconds>', 'request timeout', String(DEFAULT_CONFIG.timeout))
  .action(async (options) => {
    const exitCode = await watchCommand({
      interval: parseInt(options.interval, 10) || 30,
      format: options.format,
      authDir: expandPath(options.authDir),
      provider: options.provider,
      strict: options.strict,
      noNetwork: false,
      timeout: parseInt(options.timeout, 10) || DEFAULT_CONFIG.timeout,
      rateLimit: DEFAULT_CONFIG.rateLimit,
      cache: DEFAULT_CONFIG.cache,
    });
    process.exit(exitCode);
  });

// Parse and run
program.parse();
