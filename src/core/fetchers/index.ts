/**
 * Provider fetcher registry and factory
 */

import { ProviderFetcher } from './base.js';
import { CodexFetcher } from './codex.js';
import { CopilotFetcher } from './copilot.js';
import { ClaudeFetcher } from './claude.js';
import { AntigravityFetcher } from './antigravity.js';
import { GeminiCliFetcher } from './gemini-cli.js';
import { CursorFetcher } from './cursor.js';
import { PROVIDER_NAMES, ProviderName } from '../../types/index.js';

// Export all fetchers
export { ProviderFetcher } from './base.js';
export { CodexFetcher } from './codex.js';
export { CopilotFetcher } from './copilot.js';
export { ClaudeFetcher } from './claude.js';
export { AntigravityFetcher } from './antigravity.js';
export { GeminiCliFetcher } from './gemini-cli.js';
export { CursorFetcher } from './cursor.js';

/**
 * Registry of all available fetchers
 */
const fetcherRegistry: Map<string, ProviderFetcher> = new Map();

// Initialize registry
fetcherRegistry.set(PROVIDER_NAMES.CODEX, new CodexFetcher());
fetcherRegistry.set(PROVIDER_NAMES.COPILOT, new CopilotFetcher());
fetcherRegistry.set(PROVIDER_NAMES.CLAUDE, new ClaudeFetcher());
fetcherRegistry.set(PROVIDER_NAMES.ANTIGRAVITY, new AntigravityFetcher());
fetcherRegistry.set(PROVIDER_NAMES.GEMINI_CLI, new GeminiCliFetcher());
fetcherRegistry.set(PROVIDER_NAMES.CURSOR, new CursorFetcher());

/**
 * Get fetcher for a provider
 */
export function getFetcher(provider: string): ProviderFetcher | undefined {
  return fetcherRegistry.get(provider);
}

/**
 * Get all registered fetchers
 */
export function getAllFetchers(): ProviderFetcher[] {
  return Array.from(fetcherRegistry.values());
}

/**
 * Get all provider names
 */
export function getAllProviderNames(): string[] {
  return Array.from(fetcherRegistry.keys());
}

/**
 * Check if a provider is supported
 */
export function isProviderSupported(provider: string): boolean {
  return fetcherRegistry.has(provider);
}
