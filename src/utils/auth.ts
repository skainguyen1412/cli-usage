/**
 * Auth file reader utility
 * Discovers and reads auth files from the configured directory
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import { AuthFile, AuthFileData, DiscoveredAccount, PROVIDER_NAMES } from '../types/index.js';
import { debug, warn } from './logger.js';
import { expandPath } from './config.js';

// Auth file patterns for each provider
const AUTH_PATTERNS: Record<string, { pattern: RegExp; provider: string }> = {
  codex: { pattern: /^codex-(.+)\.json$/, provider: PROVIDER_NAMES.CODEX },
  copilot: { pattern: /^github-copilot-(.+)\.json$/, provider: PROVIDER_NAMES.COPILOT },
  claude: { pattern: /^claude-(.+)\.json$/, provider: PROVIDER_NAMES.CLAUDE },
  antigravity: { pattern: /^antigravity-(.+)\.json$/, provider: PROVIDER_NAMES.ANTIGRAVITY },
};

/**
 * Check file permissions and warn if overly permissive
 */
function checkFilePermissions(filePath: string): void {
  try {
    const stats = fs.statSync(filePath);
    const mode = (stats.mode & 0o777).toString(8);

    // Warn if world-readable (last digit > 0)
    if (stats.mode & 0o004) {
      warn(`Auth file ${path.basename(filePath)} is world-readable. Consider: chmod 600 ${filePath}`);
    }
  } catch {
    // Ignore permission check errors
  }
}

/**
 * Read and parse an auth file
 */
function readAuthFile(filePath: string): AuthFileData | null {
  try {
    checkFilePermissions(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    debug(`Failed to read auth file ${filePath}`, err);
    return null;
  }
}

/**
 * Extract account identifier from auth file data
 */
function extractAccount(data: AuthFileData, filename: string): string {
  // Try common account fields
  if (data.email) return data.email;
  if (data.username) return data.username;

  // Fall back to filename extraction
  for (const { pattern } of Object.values(AUTH_PATTERNS)) {
    const match = filename.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return 'unknown';
}

/**
 * Discover auth files in the auth directory
 */
export function discoverAuthFiles(authDir: string): AuthFile[] {
  const expandedDir = expandPath(authDir);
  const authFiles: AuthFile[] = [];

  if (!fs.existsSync(expandedDir)) {
    debug(`Auth directory does not exist: ${expandedDir}`);
    return authFiles;
  }

  try {
    const files = fs.readdirSync(expandedDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      for (const [key, { pattern, provider }] of Object.entries(AUTH_PATTERNS)) {
        if (pattern.test(file)) {
          const filePath = path.join(expandedDir, file);
          const data = readAuthFile(filePath);

          if (data) {
            authFiles.push({
              provider,
              account: extractAccount(data, file),
              filePath,
              data,
            });
          }
          break;
        }
      }
    }
  } catch (err) {
    debug(`Failed to read auth directory ${expandedDir}`, err);
  }

  debug(`Discovered ${authFiles.length} auth files`, authFiles.map((f) => ({ provider: f.provider, account: f.account })));
  return authFiles;
}

/**
 * Discover Gemini CLI auth files
 */
export function discoverGeminiAuth(): AuthFile | null {
  const geminiDir = path.join(os.homedir(), '.gemini');
  const oauthCredsPath = path.join(geminiDir, 'oauth_creds.json');
  const accountsPath = path.join(geminiDir, 'google_accounts.json');

  let email = 'unknown';
  let authData: AuthFileData = {};

  // Try to read oauth_creds.json
  if (fs.existsSync(oauthCredsPath)) {
    try {
      const content = fs.readFileSync(oauthCredsPath, 'utf-8');
      authData = JSON.parse(content);
      debug('Found Gemini CLI oauth_creds.json');
    } catch (err) {
      debug('Failed to read Gemini CLI oauth_creds.json', err);
    }
  }

  // Try to read google_accounts.json for email
  if (fs.existsSync(accountsPath)) {
    try {
      const content = fs.readFileSync(accountsPath, 'utf-8');
      const accounts = JSON.parse(content);

      // Try to extract email from accounts
      if (Array.isArray(accounts) && accounts.length > 0) {
        email = accounts[0].email || accounts[0].account || 'unknown';
      } else if (accounts.email) {
        email = accounts.email;
      }
      debug('Found Gemini CLI google_accounts.json', { email });
    } catch (err) {
      debug('Failed to read Gemini CLI google_accounts.json', err);
    }
  }

  // Return if we found any Gemini auth
  if (fs.existsSync(oauthCredsPath) || fs.existsSync(accountsPath)) {
    return {
      provider: PROVIDER_NAMES.GEMINI_CLI,
      account: email,
      filePath: oauthCredsPath,
      data: authData,
    };
  }

  return null;
}

/**
 * Discover Cursor auth from state.vscdb
 */
export function discoverCursorAuth(): AuthFile | null {
  const dbPath = path.join(os.homedir(), 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');

  if (!fs.existsSync(dbPath)) {
    return null;
  }

  let email = 'unknown';
  let accessToken: string | undefined;

  try {
    const db = new Database(dbPath, { readonly: true });
    
    // Check ItemTable exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'").get();
    
    if (tables) {
      // Try to get cached email
      const emailEntry = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/cachedEmail'").get() as { value: string } | undefined;
      if (emailEntry && emailEntry.value) {
         email = emailEntry.value;
      }

      // Try to get access token (just to confirm checks)
      const tokenEntry = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'").get() as { value: string } | undefined;
      if (tokenEntry && tokenEntry.value) {
        accessToken = tokenEntry.value;
      }
    }
    
    db.close();

    // Map to AuthFile format
    // We store the DB path as filePath, and minimal auth data
    // The Fetcher will re-open the DB to get more details if needed
    return {
      provider: PROVIDER_NAMES.CURSOR,
      account: email,
      filePath: dbPath,
      data: {
        email,
        accessToken, // Might be empty if not found
        dbPath, // Custom field for Cursor fetcher
      },
    };

  } catch (err) {
    debug(`Failed to read Cursor DB at ${dbPath}`, err);
    return null;
  }
}

/**
 * Discover all accounts across all providers
 */
export function discoverAllAccounts(authDir: string): DiscoveredAccount[] {
  const accounts: DiscoveredAccount[] = [];

  // Discover from auth directory
  const authFiles = discoverAuthFiles(authDir);
  for (const authFile of authFiles) {
    accounts.push({
      provider: authFile.provider,
      account: authFile.account,
      filePath: authFile.filePath,
      authData: authFile.data,
    });
  }

  // Discover Gemini CLI
  const geminiAuth = discoverGeminiAuth();
  if (geminiAuth) {
    accounts.push({
      provider: geminiAuth.provider,
      account: geminiAuth.account,
      filePath: geminiAuth.filePath,
      authData: geminiAuth.data,
    });
  }

  // Discover Cursor
  const cursorAuth = discoverCursorAuth();
  if (cursorAuth) {
     accounts.push({
      provider: cursorAuth.provider,
      account: cursorAuth.account,
      filePath: cursorAuth.filePath,
      authData: cursorAuth.data,
    });
  }

  return accounts;
}

/**
 * Get access token from auth data (handles different field names)
 */
export function getAccessToken(authData: AuthFileData): string | undefined {
  return authData.access_token || authData.accessToken;
}

/**
 * Get refresh token from auth data
 */
export function getRefreshToken(authData: AuthFileData): string | undefined {
  return authData.refresh_token || authData.refreshToken;
}

/**
 * Check if token appears expired based on auth data
 */
export function isTokenExpired(authData: AuthFileData): boolean {
  // Check explicit expired flag
  if (authData.expired === true) {
    return true;
  }

  // Check expires_at string
  if (authData.expires_at || authData.expiresAt) {
    try {
      const expiresAt = new Date(authData.expires_at || authData.expiresAt!);
      return expiresAt <= new Date();
    } catch {
      // Invalid date format
    }
  }

  // Check expiry_date (ms timestamp)
  if (authData.expiry_date) {
    return authData.expiry_date <= Date.now();
  }

  // Can't determine, assume not expired
  return false;
}
