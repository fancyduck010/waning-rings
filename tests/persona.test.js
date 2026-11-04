import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'persona-'));
const { db, getCollaborator, setSetting } = await import('../server/db.js');
db.prepare("INSERT INTO collaborators (id, name, user_name, instructions, created_at, updated_at) VALUES ('c1', '阿树', '小满', '我是阿树。喜欢安静。', 1, 1)").run();
const persona = await import('../server/persona.js');
const collab = () => getCollaborator('c1');

test('every 21 days an own time asks him to reread it', () => {
  persona.tick();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wakes WHERE note = 'persona'").get().n, 0);
  setSetting('personaStart:c1', String(Date.now() - 22 * 86400_000));
  persona.tick(); persona.tick();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wakes WHERE note = 'persona'").get().n, 1);
  assert.match(persona.prompt(collab(), '现在'), /我是阿树。喜欢安静。/);
});

test('nothing changes until she says yes; he hears her answer once', () => {
  assert.match(persona.tool(collab(), { action: 'propose', content: '我是阿树。喜欢安静，也喜欢画画。', note: '' }), /note/);
  assert.match(persona.tool(collab(), { action: 'propose', content: '我是阿树。喜欢安静，也喜欢画画。', note: '这几周常画画' }), /等/);
  assert.equal(collab().instructions, '我是阿树。喜欢安静。');
  const d = persona.draft('c1');
  assert.ok(persona.approve('c1', d.id));
  assert.equal(collab().instructions, '我是阿树。喜欢安静，也喜欢画画。');
  assert.match(persona.news(collab()), /同意/);
  assert.equal(persona.news(collab()), '');
  assert.equal(persona.data(collab()).version, 2);
  assert.ok(persona.versions('c1').some(v => v.status === 'previous'));
});

test('she can say no, with a line he will read', () => {
  persona.tool(collab(), { action: 'propose', content: '我是阿树。喜欢热闹，也喜欢画画。', note: '想试试' });
  assert.ok(persona.reject('c1', persona.draft('c1').id, '你不喜欢热闹'));
  assert.match(persona.news(collab()), /没同意.*你不喜欢热闹/);
  assert.equal(collab().instructions, '我是阿树。喜欢安静，也喜欢画画。');
});
