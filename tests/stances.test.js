import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'stances-'));
const { db } = await import('../server/db.js');
db.prepare("INSERT INTO collaborators (id, name, user_name, created_at, updated_at) VALUES ('c1', '阿树', '小满', 1, 1)").run();
const stances = await import('../server/stances.js');
const memory = await import('../server/memory.js');
const collab = { id: 'c1', name: '阿树', user_name: '小满' };
const pull = (id, day) => db.prepare("INSERT INTO pulls (id, collab_id, day, sides, chose, created_at) VALUES (?, 'c1', ?, '她想熬夜 / 想让她睡', '先陪她说完心事', 1)").run(id, day);
const stance = (id, status, last = '2026-11-03') => db.prepare("INSERT INTO stances (id, collab_id, label, obs, status, pull_ids, first_day, last_day, created_at) VALUES (?, 'c1', ?, '之前几次，你都先陪她把心事说完，再催她睡', ?, '[\"p1\",\"p2\"]', '2026-10-20', ?, ?)").run(id, id, status, last, Date.now());

test('only the ones he said are him go into his mind, worded as what he did, not a rule', () => {
  stance('她熬夜时', 'held'); stance('她生气时', 'pending');
  const b = stances.block(collab);
  assert.match(b, /她熬夜时：之前几次/);
  assert.match(b, /不是规定/);
  assert.doesNotMatch(b, /她生气时/);
});

test('he reviews a new one with the pulls it grew from; she strikes one, he hears it once and cannot take it back', () => {
  pull('p1', '2026-10-20'); pull('p2', '2026-10-27');
  const text = stances.reviewText([stances.listStances('c1').find(s => s.id === '她生气时')]);
  assert.match(text, /10\/20 她想熬夜 \/ 想让她睡/);
  assert.match(stances.tool(collab, { action: 'drop', id: '她生气时', note: '那只是那天' }), /不是你/);
  assert.ok(stances.strike('c1', '她熬夜时', '不是这样'));
  assert.match(stances.news(collab), /划掉了.*「她熬夜时」（她说：不是这样）/);
  assert.equal(stances.news(collab), '');
  assert.match(stances.tool(collab, { action: 'keep', id: '她熬夜时' }), /不能再认回来/);
  assert.equal(stances.block(collab), '');
  assert.ok(stances.restore('c1', '她熬夜时'));
  assert.match(stances.block(collab), /她熬夜时/);
});

test('too few pulls: nothing grows, no helper call', async () => {
  db.prepare('DELETE FROM pulls').run();
  pull('p9', '2026-11-01');
  assert.equal(await stances.grow(collab, '2026-11-04'), 0);
});

test('fixed memories carry the kind he chose and sit in their own group in his mind', () => {
  const a = memory.addMemory('c1', { content: '小满的生日是 3 月 2 日', kind: 'her' });
  const b = memory.addMemory('c1', { content: '不写括号里的动作', kind: 'rule' });
  memory.addMemory('c1', { content: '一句旧的', kind: 'fact' });
  assert.equal(a.kind, 'her');
  assert.equal(memory.updateMemory(b.id, { content: b.content, kind: 'self' }).kind, 'self');
  const block = memory.memoryBlock({ ...collab, settings: {} });
  assert.match(block, /关于小满：\n- 小满的生日/);
  assert.match(block, /关于你自己：\n- 不写括号/);
  assert.match(block, /其他：\n- 一句旧的/);
});
