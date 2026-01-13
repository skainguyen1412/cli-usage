/**
 * Shared types for the CLI Quota Tracker
 */

// ============================================================================
// Usage Stats (from CLIProxyAPI)
// ============================================================================

export interface UsageData {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageStats {
  data: UsageData;
  lastUpdated: Date;
  isReachable: boolean;
  error?: string;
}

// ============================================================================
// Provider Quota (normalized across all providers)
// ============================================================================

export interface ModelQuota {
  name: string;
  /** Percentage remaining (0-100). -1 means unknown. */
  percentage: number;
  /** ISO8601 timestamp when quota resets, null if unknown */
  resetTime: string | null;
  /** Seconds until reset, null if unknown */
  resetInSeconds: number | null;
  /** Optional: actual values for providers that expose them */
  used?: number;
  limit?: number;
  remaining?: number;
}

export interface ProviderQuotaData {
  provider: string;
  account: string;
  planType: string | null;
  isForbidden: boolean;
  isStale: boolean;
  needsReauth: boolean;
  lastUpdated: string;
  cachedAt?: string;
  ageSeconds?: number;
  models: ModelQuota[];
  error?: string;
}

// ============================================================================
// Auth File Types
// ============================================================================

export interface AuthFile {
  provider: string;
  account: string;
  filePath: string;
  data: AuthFileData;
}

export interface AuthFileData {
  email?: string;
  username?: string;
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  id_token?: string;
  idToken?: string;
  expires_at?: string;
  expiresAt?: string;
  expiry_date?: number;
  expired?: boolean;
  [key: string]: unknown;
}

// ============================================================================
// Configuration
// ============================================================================

export interface Config {
  authDir: string;
  baseUrl: string;
  timeout: number;
  format: 'table' | 'json';
  strict: boolean;
  noNetwork: boolean;
  provider?: string;
  account?: string;
  managementKey?: string;
  rateLimit: {
    maxConcurrency: number;
    perProvider: number;
  };
  cache: {
    enabled: boolean;
    ttlSeconds: number;
  };
}

export const DEFAULT_CONFIG: Config = {
  authDir: '~/.cli-proxy-api',
  baseUrl: 'http://localhost:8317',
  timeout: 15,
  format: 'table',
  strict: false,
  noNetwork: false,
  rateLimit: {
    maxConcurrency: 4,
    perProvider: 2,
  },
  cache: {
    enabled: true,
    ttlSeconds: 300,
  },
};

// ============================================================================
// CLI Output Types
// ============================================================================

export interface CLIOutput {
  schemaVersion: number;
  generatedAt: string;
  proxyUsage?: UsageData | null;
  providers: Record<string, ProviderAccountsOutput>;
  errors: CLIError[];
}

export interface ProviderAccountsOutput {
  accounts: Record<string, ProviderQuotaData>;
}

export interface CLIError {
  provider: string;
  account: string;
  error: string;
  message: string;
  fallbackUsed: boolean;
}

// ============================================================================
// Provider Fetcher Interface
// ============================================================================

export interface DiscoveredAccount {
  provider: string;
  account: string;
  filePath: string;
  authData: AuthFileData;
}

export interface FetchResult {
  success: boolean;
  data?: ProviderQuotaData;
  error?: string;
  needsReauth?: boolean;
}

// ============================================================================
// Exit Codes
// ============================================================================

export enum ExitCode {
  SUCCESS = 0,
  GENERAL_ERROR = 1,
  INVALID_USAGE = 2,
  NO_ACCOUNTS = 3,
  STRICT_FAILURE = 4,
}

// ============================================================================
// Provider Names
// ============================================================================

export const PROVIDER_NAMES = {
  CODEX: 'codex',
  COPILOT: 'copilot',
  CLAUDE: 'claude',
  ANTIGRAVITY: 'antigravity',
  GEMINI_CLI: 'gemini-cli',
  CURSOR: 'cursor',
} as const;

export type ProviderName = (typeof PROVIDER_NAMES)[keyof typeof PROVIDER_NAMES];
