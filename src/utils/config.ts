/**
 * Configuration loader with precedence:
 * CLI flags → Environment variables → Config file → Defaults
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config, DEFAULT_CONFIG } from '../types/index.js';
import { debug } from './logger.js';

/**
 * Expand ~ to home directory
 */
export function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  if (p === '~') {
    return os.homedir();
  }
  return p;
}

/**
 * Get config file paths to check (in order of priority)
 */
function getConfigPaths(): string[] {
  const home = os.homedir();
  const paths: string[] = [];

  // Current directory
  paths.push(path.join(process.cwd(), 'quota.config.json'));

  // XDG config (Linux/macOS)
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  paths.push(path.join(xdgConfig, 'quota', 'config.json'));

  // macOS Application Support
  if (process.platform === 'darwin') {
    paths.push(path.join(home, 'Library', 'Application Support', 'quota', 'config.json'));
  }

  // Windows AppData
  if (process.platform === 'win32' && process.env.APPDATA) {
    paths.push(path.join(process.env.APPDATA, 'quota', 'config.json'));
  }

  return paths;
}

/**
 * Load config from file
 */
function loadConfigFile(): Partial<Config> | null {
  const configPaths = getConfigPaths();

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        debug(`Loading config from ${configPath}`);
        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (err) {
      debug(`Failed to load config from ${configPath}`, err);
    }
  }

  return null;
}

/**
 * Load config from environment variables
 */
function loadEnvConfig(): Partial<Config> {
  const config: Partial<Config> = {};

  if (process.env.AIQUOTA_AUTH_DIR) {
    config.authDir = process.env.AIQUOTA_AUTH_DIR;
  }
  if (process.env.AIQUOTA_BASE_URL) {
    config.baseUrl = process.env.AIQUOTA_BASE_URL;
  }
  if (process.env.AIQUOTA_TIMEOUT) {
    config.timeout = parseInt(process.env.AIQUOTA_TIMEOUT, 10);
  }
  if (process.env.AIQUOTA_FORMAT) {
    config.format = process.env.AIQUOTA_FORMAT as 'table' | 'json';
  }

  return config;
}

/**
 * Merge configs with precedence
 */
export function mergeConfig(...configs: (Partial<Config> | null | undefined)[]): Config {
  const result = { ...DEFAULT_CONFIG };

  for (const config of configs) {
    if (!config) continue;

    if (config.authDir !== undefined) result.authDir = config.authDir;
    if (config.baseUrl !== undefined) result.baseUrl = config.baseUrl;
    if (config.timeout !== undefined) result.timeout = config.timeout;
    if (config.format !== undefined) result.format = config.format;
    if (config.strict !== undefined) result.strict = config.strict;
    if (config.noNetwork !== undefined) result.noNetwork = config.noNetwork;
    if (config.provider !== undefined) result.provider = config.provider;
    if (config.account !== undefined) result.account = config.account;
    if (config.managementKey !== undefined) result.managementKey = config.managementKey;

    if (config.rateLimit) {
      result.rateLimit = { ...result.rateLimit, ...config.rateLimit };
    }
    if (config.cache) {
      result.cache = { ...result.cache, ...config.cache };
    }
  }

  // Expand paths
  result.authDir = expandPath(result.authDir);

  return result;
}

/**
 * Load full config with precedence:
 * CLI options → Environment variables → Config file → Defaults
 */
export function loadConfig(cliOptions?: Partial<Config>): Config {
  const fileConfig = loadConfigFile();
  const envConfig = loadEnvConfig();

  const config = mergeConfig(
    DEFAULT_CONFIG,
    fileConfig,
    envConfig,
    cliOptions
  );

  debug('Loaded config', config);
  return config;
}
