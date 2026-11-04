import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'moments-'));
const { db } = await import('../server/db.js');
const moments = await import('../server/moments.js');

const DAY = 86400_000;
const day = n => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const add = (id, ago, importance, extra = {}) => db.prepare('INSERT INTO moments (id, collab_id, day, text, importance, arousal, resolved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run(id, 'c1', day(ago), extra.text || id, importance, extra.arousal ?? 0, extra.resolved ?? 1, Date.now());

test('importance sets how long a thing lives; 5 never fades', () => {
  const m = (importance, ago, more = {}) => ({ importance, day: day(ago), arousal: 0, resolved: 1, touches: 0, touched_at: null, ...more });
  assert.ok(Math.abs(moments.brightness(m(2, 14)) - 0.5) < 0.05);
  assert.ok(moments.brightness(m(1, 14)) < 0.1);
  assert.ok(moments.brightness(m(4, 14)) > 0.8);
  assert.equal(moments.brightness(m(5, 900)), 1);
  // strong feelings and unfinished things sink slower; being remembered brings it back up
  assert.ok(moments.brightness(m(2, 20, { arousal: 1, resolved: 0 })) > moments.brightness(m(2, 20)));
  assert.ok(moments.brightness(m(2, 20, { touches: 1, touched_at: Date.now() })) > 0.99);
});

test('only the brighter ones stay in mind; a ring is kept and remembers it', async () => {
  add('old-small', 40, 1);
  add('recent', 2, 2, { text: '一起听了《夜曲》' });
  add('big', 60, 5, { text: '第一次打电话' });
  const mind = moments.inMind('c1').map(m => m.id);
  assert.deepEqual(mind.sort(), ['big', 'recent']);
  assert.match(await moments.momentsTool({ id: 'c1' }, { action: 'ring', id: 'old-small', text: '现在想起来有点好笑' }), /写在/);
  const m = moments.listMoments('c1').find(x => x.id === 'old-small');
  assert.equal(m.rings.length, 1);
  assert.equal(m.touches, 1);
  assert.ok(moments.inMind('c1').some(x => x.id === 'old-small'));
  assert.match(moments.momentLine(m), /后来想起：.*有点好笑/);
});

test('an old thing comes back now and then, at most three times without a ring', () => {
  add('sinking', 90, 3, { text: '那次吵架' });
  const real = Math.random;
  Math.random = () => 0.01;
  try {
    let seen = 0;
    for (let i = 0; i < 5; i++) if (moments.toRevisit('c1', Date.now() + i * 8 * DAY)?.id === 'sinking') seen++;
    assert.equal(seen, 3);
  } finally { Math.random = real; }
});
