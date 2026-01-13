/**
 * Explore Cursor DB
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.homedir(), 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');

try {
  console.log(`Opening DB: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true });
  
  // List tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables:', tables);

  // Check ItemTable if exists
  if (tables.some((t: any) => t.name === 'ItemTable')) {
    const keys = db.prepare("SELECT key FROM ItemTable WHERE key LIKE '%auth%' OR key LIKE '%token%'").all();
    console.log('Keys matching "auth" or "token":');
    keys.forEach((k: any) => console.log(`- ${k.key}`));
    
    // Check specific Cursor keys
    const cursorKeys = db.prepare("SELECT key FROM ItemTable WHERE key LIKE 'cursor%'").all();
    console.log('\nKeys starting with "cursor":');
    cursorKeys.forEach((k: any) => console.log(`- ${k.key}`));
  }

} catch (err) {
  console.error('Error:', err);
}
