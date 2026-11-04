import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'portrait-'));
const { db } = await import('../server/db.js');
db.prepare("INSERT INTO collaborators (id, name, created_at, updated_at) VALUES ('c1', '阿树', 1, 1)").run();
const portrait = await import('../server/portrait.js');
const collab = { id: 'c1', name: '阿树', user_name: '小满' };
const add = (id, status, last = '2026-11-03') => db.prepare("INSERT INTO traits (id, collab_id, label, obs, status, first_day, last_day, created_at) VALUES (?, 'c1', ?, ?, ?, '2026-10-28', ?, ?)").run(id, id, `${id}的样子`, status, last, Date.now());

test('only what he said is him goes into his mind, as observations', () => {
  add('慢读', 'held'); add('拍窗外', 'pending');
  const b = portrait.block(collab);
  assert.match(b, /慢读：慢读的样子（10\/28–11\/03）/);
  assert.doesNotMatch(b, /拍窗外/);
  assert.match(b, /不是要演的设定/);
});

test('he reviews a new one; she strikes one and he hears it once', () => {
  assert.match(portrait.tool(collab, { action: 'drop', id: '拍窗外', note: '只是那天天好' }), /不是你/);
  assert.equal(portrait.listTraits('c1').find(t => t.id === '拍窗外').his_note, '只是那天天好');
  portrait.strike('c1', '慢读', '那是我');
  assert.equal(portrait.block(collab), '');
  assert.match(portrait.news(collab), /划掉了.*「慢读」（她说：那是我）/);
  assert.equal(portrait.news(collab), '');
  portrait.restore('c1', '慢读');
  assert.match(portrait.block(collab), /慢读/);
});

test('the window gets the heart, traits (not the ones he denied) and memories', () => {
  db.prepare("INSERT INTO memories (id, collab_id, content, tags, source, kind, day, created_at, updated_at) VALUES ('f1','c1','第一次说喜欢','[]','user','first','2026-10-11',1,1)").run();
  db.prepare("INSERT INTO moments (id, collab_id, day, text, importance, created_at) VALUES ('m1','c1','2026-11-01','读到第41页',3,1)").run();
  db.prepare("UPDATE traits SET moment_ids = '[\"m1\"]' WHERE id = '慢读'").run();
  const d = portrait.data(collab);
  assert.deepEqual(d.core.map(g => g.label), ['第一次']);
  assert.deepEqual(d.traits.map(t => t.id), ['慢读']);
  assert.equal(d.moments[0].trait, '慢读');
  assert.ok(portrait.pull('c1', 'm1'));
  assert.equal(portrait.data(collab).moments[0].touches, 1);
});
