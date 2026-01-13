import { describe, it, expect } from 'vitest';
import { formatQuotaTable, formatDoctorTable } from '../../../src/cli/formatters/table';
import { ProviderQuotaData, CLIError } from '../../../src/types';

describe('Table Formatter', () => {
  describe('formatQuotaTable', () => {
    it('should handle empty providers', () => {
      const output = formatQuotaTable([], []);
      expect(output).toContain('No provider accounts found');
    });

    it('should format provider data', () => {
      const mockProvider: ProviderQuotaData = {
        provider: 'codex',
        account: 'test@example.com',
        planType: 'pro',
        isForbidden: false,
        isStale: false,
        needsReauth: false,
        lastUpdated: new Date().toISOString(),
        models: [
          {
             name: 'codex-model',
             percentage: 50,
             resetTime: null,
             resetInSeconds: null,
          }
        ]
      };

      const output = formatQuotaTable([mockProvider], []);
      expect(output).toContain('Codex');
      expect(output).toContain('test@example.com');
      expect(output).toContain('50%');
    });

    it('should show Unlimited for Pro plans with unknown quota', () => {
       const mockProvider: ProviderQuotaData = {
        provider: 'cursor',
        account: 'test',
        planType: 'Pro',
        isForbidden: false,
        isStale: false,
        needsReauth: false,
        lastUpdated: new Date().toISOString(),
        models: [{ name: 'cursor-requests', percentage: -1, resetTime: null, resetInSeconds: null }]
      };
      
      const output = formatQuotaTable([mockProvider], []);
      expect(output).toContain('Unlimited');
    });

    it('should show No API note for Antigravity', () => {
       const mockProvider: ProviderQuotaData = {
        provider: 'antigravity',
        account: 'test',
        planType: null,
        isForbidden: false,
        isStale: false,
        needsReauth: false,
        lastUpdated: new Date().toISOString(),
        models: [{ name: 'model', percentage: -1, resetTime: null, resetInSeconds: null }]
      };
      
      const output = formatQuotaTable([mockProvider], []);
      expect(output).toContain('(No public quota API)');
    });

    it('should show warnings for forbidden/reauth', () => {
       const mockProvider: ProviderQuotaData = {
        provider: 'claude',
        account: 'test',
        planType: null,
        isForbidden: true,
        isStale: false,
        needsReauth: false,
        lastUpdated: new Date().toISOString(),
        models: []
      };
      
      const output = formatQuotaTable([mockProvider], []);
      expect(output).toContain('forbidden');
    });
  });

  describe('formatDoctorTable', () => {
    it('should format diagnostic info', () => {
      const output = formatDoctorTable({
        config: { authDir: '/tmp', baseUrl: 'http://localhost', timeout: 10 },
        cacheDir: '/tmp/cache',
        authFiles: [],
        geminiCli: { found: false },
        proxy: { reachable: true, latencyMs: 50 },
        warnings: []
      });

      expect(output).toContain('Configuration');
      expect(output).toContain('Proxy: reachable');
    });
  });
});
