// Minimal database layer so these modules run on their own. The full app has more here; this is only what the memory system needs.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || join(import.meta.dirname, 'data');
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, 'memory.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'moments'").get()) db.exec(readFileSync(join(import.meta.dirname, 'schema.sql'), 'utf8'));

export const newId = () => randomUUID();
const DEFAULTS = { timezone: process.env.TZ || 'UTC' };

export function getSettings() {
  const out = { ...DEFAULTS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}
export const getSetting = key => getSettings()[key];
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}
const collaborator = row => (row ? { ...row, settings: JSON.parse(row.settings || '{}') } : null);
export const listCollaborators = () => db.prepare('SELECT * FROM collaborators ORDER BY sort, created_at').all().map(collaborator);
export const getCollaborator = id => collaborator(db.prepare('SELECT * FROM collaborators WHERE id = ?').get(id));
export function updateCollaborator(id, fields) {
  if ('instructions' in fields) db.prepare('UPDATE collaborators SET instructions = ?, updated_at = ? WHERE id = ?').run(String(fields.instructions ?? ''), Date.now(), id);
  return getCollaborator(id);
}
