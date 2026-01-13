/**
 * Deep explore Cursor DB for usage numbers
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.homedir(), 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Get all keys
  const rows = db.prepare("SELECT key, value FROM ItemTable").all();
  
  console.log(`Analyzing ${rows.length} keys...`);

  // Look for keys with "usage", "limit", "quota", "request", "count"
  const keywords = ['usage', 'limit', 'quota', 'request', 'count', 'remaining'];
  
  const relevant = rows.filter((r: any) => {
    const k = r.key.toLowerCase();
    return keywords.some(w => k.includes(w));
  });

  console.log('\nPotential Usage Keys:');
  relevant.forEach((r: any) => {
    // Truncate value if too long
    let val = r.value;
    if (val && val.length > 50) val = val.substring(0, 50) + '...';
    console.log(`- ${r.key}: ${val}`);
  });

} catch (err) {
  console.error('Error:', err);
}
