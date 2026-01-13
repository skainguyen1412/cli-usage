/**
 * Watch command - Periodically refresh and display quota
 */

import { ExitCode } from '../../types/index.js';
import { statusCommand, StatusOptions } from './status.js';
import { info, error as logError } from '../../utils/logger.js';

export interface WatchOptions extends StatusOptions {
  interval: number; // seconds
}

export async function watchCommand(options: WatchOptions): Promise<number> {
  const { interval, ...statusOptions } = options;

  // Validate interval
  if (interval < 5) {
    logError('Interval must be at least 5 seconds');
    return ExitCode.INVALID_USAGE;
  }

  info(`Watching quota every ${interval}s (Ctrl+C to stop)\n`);

  const runRefresh = async () => {
    // Clear screen (works in most terminals)
    if (options.format === 'table') {
      process.stdout.write('\x1Bc');
    }

    const timestamp = new Date().toLocaleString();
    info(`[${timestamp}] Refreshing...\n`);

    try {
      await statusCommand(statusOptions);
    } catch (err) {
      logError('Error during refresh', err);
    }

    if (options.format === 'table') {
      info(`\nNext refresh in ${interval}s (Ctrl+C to stop)`);
    }
  };

  // Run initial refresh
  await runRefresh();

  // Set up interval
  const intervalId = setInterval(runRefresh, interval * 1000);

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    info('\n\nStopped watching.');
    process.exit(0);
  });

  // Keep process running
  await new Promise(() => {});

  return ExitCode.SUCCESS;
}
