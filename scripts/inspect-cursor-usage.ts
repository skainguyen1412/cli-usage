/**
 * Inspect specific Cursor DB keys
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.homedir(), 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');

try {
  const db = new Database(dbPath, { readonly: true });
  
  const keysToInspect = [
    'freeBestOfN.promptCount',
    'languageStatus.interactCount',
    'aiPane.tooltipShowCount',
    'cursor.featureStatus.dataPrivacyOnboarding',
    'cursorAuth/stripeSubscriptionStatus'
  ];

  // Also look for any key with 'usage'
  const usageKeys = db.prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%usage%' OR key LIKE '%count%'").all();

  console.log('--- Specific Keys ---');
  keysToInspect.forEach(key => {
    const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(key) as { value: string } | undefined;
    if (row) {
      console.log(`${key}: ${row.value}`);
    }
  });

  console.log('\n--- Usage/Count Keys (Full Value) ---');
  usageKeys.forEach((row: any) => {
     // Skip if it looks like a binary blob or huge JSON, but print first 200 chars
     let val = row.value;
     if (row.key.includes('timestamps') || row.key.includes('history')) {
         console.log(`${row.key}: [Skipped long history]`);
     } else {
         console.log(`${row.key}: ${val}`);
     }
  });

} catch (err) {
  console.error('Error:', err);
}
