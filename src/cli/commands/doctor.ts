/**
 * Doctor command - Diagnostic check for available data sources
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config, ExitCode } from '../../types/index.js';
import { discoverAuthFiles, discoverGeminiAuth, discoverCursorAuth } from '../../utils/auth.js';
import { checkProxyHealth } from '../../core/clients/index.js';
import { formatDoctorTable, DoctorDiagnostics } from '../formatters/index.js';
import { getCacheDirectory, expandPath } from '../../utils/index.js';
import { info, debug } from '../../utils/logger.js';
import { isTokenExpired } from '../../utils/auth.js';
import { formatRelativeTime } from '../../utils/time.js';

export interface DoctorOptions {
  authDir: string;
  baseUrl: string;
  timeout: number;
}

export async function doctorCommand(options: DoctorOptions): Promise<number> {
  const expandedAuthDir = expandPath(options.authDir);

  const diagnostics: DoctorDiagnostics = {
    config: {
      authDir: expandedAuthDir,
      baseUrl: options.baseUrl,
      timeout: options.timeout,
    },
    cacheDir: getCacheDirectory(),
    authFiles: [],
    geminiCli: { found: false },
    proxy: { reachable: false },
    warnings: [],
  };

  // Check auth files
  const authFiles = discoverAuthFiles(options.authDir);
  for (const authFile of authFiles) {
    const filename = path.basename(authFile.filePath);
    const expired = isTokenExpired(authFile.data);

    // Check expiry
    let expiry: string | undefined;
    if (authFile.data.expires_at || authFile.data.expiresAt) {
      const expiresAt = authFile.data.expires_at || authFile.data.expiresAt;
      if (expired) {
        expiry = 'expired';
        diagnostics.warnings.push(`${authFile.provider} token is expired`);
      } else {
        expiry = `expires in ${formatRelativeTime(expiresAt!)}`;
      }
    }

    // Check file permissions
    try {
      const stats = fs.statSync(authFile.filePath);
      if (stats.mode & 0o004) {
        diagnostics.warnings.push(
          `Auth file ${filename} is world-readable (chmod 600 recommended)`
        );
      }
    } catch {
      // Ignore
    }

    diagnostics.authFiles.push({
      provider: authFile.provider,
      filename,
      valid: !expired,
      expiry,
    });
  }

  // Check Gemini CLI
  const geminiAuth = discoverGeminiAuth();
  if (geminiAuth) {
    diagnostics.geminiCli = {
      found: true,
      account: geminiAuth.account,
    };
  }

  // Check Cursor
  const cursorAuth = discoverCursorAuth();
  if (cursorAuth) {
    diagnostics.cursor = {
      found: true,
      account: cursorAuth.account,
    };
  }

  // Check proxy connectivity
  const config: Config = {
    authDir: options.authDir,
    baseUrl: options.baseUrl,
    timeout: options.timeout,
    format: 'table',
    strict: false,
    noNetwork: false,
    rateLimit: { maxConcurrency: 1, perProvider: 1 },
    cache: { enabled: false, ttlSeconds: 0 },
  };

  const proxyHealth = await checkProxyHealth(config);
  diagnostics.proxy = proxyHealth;

  // Output
  info(formatDoctorTable(diagnostics));

  return ExitCode.SUCCESS;
}
