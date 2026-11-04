// 经历: single things that happened, lifted out of each day's diary. Unlike fixed memories (rules,
// who they are — those never fade) these sink over time: importance sets how long one lives, being
// remembered (he looks it up, she brings it up, he writes a line under it) keeps it up, strong
// feelings and unfinished things sink slower, settled ones faster. A sunk one isn't deleted — it
// leaves his mind and only comes back when something brings it up. Lines he writes under an old
// one when it comes back are its rings (年轮).
import { db, newId, getSetting, setSetting, listCollaborators } from './db.js';
import { complete, embed, route } from './memory.js';
import { cosine } from './stickers.js';

const DAY = 86400_000;
// days until half as bright, by importance (5 = never fades)
const HALF_LIFE = { 1: 3, 2: 14, 3: 30, 4: 90 };
const SUNK = 0.15; // below this: archived (out of his mind, still found when brought up)
const IN_MIND = 10;
const SAME = 0.9; // a new one this close to a recent one is the same thing again
const DAYS_PER_TICK = 3;

const json = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const toVec = buf => (buf ? new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4) : null);
const toBlob = v => Buffer.from(Float32Array.from(v).buffer);
const mmdd = day => day.slice(5);
const row = m => ({ ...m, rings: json(m.rings, []), vec: toVec(m.vec) });

export function brightness(m, now = Date.now()) {
  if (m.importance >= 5) return 1;
  const half = HALF_LIFE[m.importance] * (1 + 0.8 * m.arousal) * (m.resolved ? 1 : 1.5) * (1 + 0.3 * Math.min(m.touches, 10));
  const from = Math.max(m.touched_at || 0, Date.parse(`${m.day}T12:00:00Z`));
  return 0.5 ** (Math.max(0, now - from) / DAY / half);
}

export const listMoments = collabId => db.prepare('SELECT * FROM moments WHERE collab_id = ? ORDER BY day, created_at').all(collabId).map(row);
const getMoment = (collabId, id) => { const m = db.prepare('SELECT * FROM moments WHERE id = ? AND collab_id = ?').get(String(id || ''), collabId); return m && row(m); };

/** Remembered: brought up by her, looked up by him, or written under. */
export function touch(id) {
  db.prepare('UPDATE moments SET touches = touches + 1, touched_at = ? WHERE id = ?').run(Date.now(), id);
}

const ringsText = m => (m.rings.length ? `；后来想起：${m.rings.map(r => `${new Date(r.at).toISOString().slice(5, 10)} ${r.text}`).join(' / ')}` : '');
export const momentLine = m => `${mmdd(m.day)} ${m.text}${ringsText(m)}`;

/** The brightest few, for his mind (baked with the fixed memories). */
export function inMind(collabId, now = Date.now()) {
  return listMoments(collabId).map(m => ({ m, b: brightness(m, now) })).filter(x => x.b >= 0.3)
    .sort((a, b) => b.b * (0.5 + b.m.importance / 10) - a.b * (0.5 + a.m.importance / 10)).slice(0, IN_MIND)
    .map(x => x.m).sort((a, b) => a.day.localeCompare(b.day));
}

// ---------- lifted from the diary ----------

function liftPrompt(collab) {
  const user = collab.user_name || '她';
  return `你在帮${collab.name}从他某一天的日记里摘出值得单独记住的「经历」：具体发生的事、和${user}一起做的事、${user}讲的她自己的事、吵架与和好、他自己的时间里读到/做成/想到的事。
不要摘：规矩和约定（那些另外记）、泛泛的情绪、调试和关于 App/模型/服务器的话、一天的流水账。
每件一两句，用他的口吻（"我"是${collab.name}，用"${user}"或"她"指她），写清具体细节（哪首歌、哪本书、什么地方、谁说了什么），不写感想套话。
每件给：
- importance：1 小事，几天就忘；2 平常日子里的事；3 有意思、以后会想起；4 对你们很重要；5 极少，改变你们关系的大事
- arousal：0 到 1，当时情绪有多强
- resolved：已经了结的 true；没解决的担心、还没兑现的约定、还在闹的别扭 false
- said：日记里对应的一句原话，简短
最多 6 件，平淡的一天一两件或没有都行。只输出 JSON：{"moments":[{"text":"","importance":2,"arousal":0.3,"resolved":true,"said":""}]}`;
}

async function liftDay(collab, day, content) {
  const { text } = await complete('diaryRoute', [{ role: 'system', content: liftPrompt(collab) }, { role: 'user', content: content.slice(0, 20_000) }]);
  const raw = String(text || '');
  let items;
  try { items = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).moments || []; } catch { throw new Error(`经历：模型没有返回 JSON（${raw.slice(0, 80)}）`); }
  items = items.map(x => ({
    text: String(x.text || '').trim().slice(0, 200),
    importance: Math.min(5, Math.max(1, Math.round(Number(x.importance) || 2))),
    arousal: Math.min(1, Math.max(0, Number(x.arousal) || 0.3)),
    resolved: x.resolved === false ? 0 : 1,
    said: String(x.said || '').trim().slice(0, 200),
  })).filter(x => x.text).slice(0, 6);
  if (!items.length) return 0;
  const vecs = route('embeddingRoute') ? await embed(items.map(x => x.text)) : [];
  const recent = listMoments(collab.id).filter(m => m.vec && m.day >= addDays(day, -30) && m.day <= day);
  const at = Date.parse(`${day}T12:00:00Z`);
  let n = 0;
  items.forEach((x, i) => {
    const v = vecs[i];
    const same = v && recent.find(m => cosine(v, m.vec) >= SAME);
    if (same) {
      // the same thing again: it's being lived twice, so it stays
      db.prepare('UPDATE moments SET touches = touches + 1, touched_at = MAX(COALESCE(touched_at, 0), ?), importance = MAX(importance, ?) WHERE id = ?').run(at, x.importance, same.id);
      return;
    }
    db.prepare('INSERT INTO moments (id, collab_id, day, text, said, importance, arousal, resolved, vec, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId(), collab.id, day, x.text, x.said, x.importance, x.arousal, x.resolved, v ? toBlob(v) : null, at);
    n++;
  });
  return n;
}

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const doneKey = collabId => `momentDays:${collabId}`;

/** Every diary lifted (the backlog is done). */
export const caughtUp = collabId => { const done = new Set(json(getSetting(doneKey(collabId)), [])); return db.prepare('SELECT day FROM diaries WHERE collab_id = ?').all(collabId).every(d => done.has(d.day)); };

/** Diaries not yet lifted (oldest first, so the backlog fills in order); a few per run. */
export async function tick() {
  if (!route('diaryRoute')) return;
  for (const collab of listCollaborators()) {
    const done = new Set(json(getSetting(doneKey(collab.id)), []));
    const todo = db.prepare('SELECT day, content FROM diaries WHERE collab_id = ? ORDER BY day').all(collab.id).filter(d => !done.has(d.day)).slice(0, DAYS_PER_TICK);
    for (const d of todo) {
      const n = await liftDay(collab, d.day, d.content);
      done.add(d.day);
      setSetting(doneKey(collab.id), JSON.stringify([...done]));
      console.log('[moments]', collab.name, d.day, `${n} 件`);
    }
  }
}

// ---------- brought up ----------

/** Candidates for recall: things like what's being said, not already in his mind. */
export function similar(collabId, qv, floor, skip = new Set()) {
  const now = Date.now();
  const mind = new Set(inMind(collabId, now).map(m => m.id));
  return listMoments(collabId).filter(m => m.vec && !mind.has(m.id) && !skip.has(m.id))
    .map(m => ({ m, s: cosine(qv, m.vec) - (brightness(m, now) < SUNK ? 0.03 : 0) }))
    .filter(x => x.s >= floor).sort((a, b) => b.s - a.s).slice(0, 3);
}

/** Now and then, alone: an older thing comes back by itself. Coming back like this isn't remembering it — writing under it is. */
export function toRevisit(collabId, now = Date.now()) {
  if (Math.random() > 0.4) return null;
  const pool = listMoments(collabId).filter(m => m.importance >= 2 && m.shown < 3 && (!m.shown_at || now - m.shown_at > 7 * DAY))
    .map(m => ({ m, w: m.importance * (1 - brightness(m, now)) })).filter(x => x.w > 0.3);
  if (!pool.length) return null;
  let r = Math.random() * pool.reduce((s, x) => s + x.w, 0);
  const pick = pool.find(x => (r -= x.w) <= 0)?.m || pool[0].m;
  db.prepare('UPDATE moments SET shown = shown + 1, shown_at = ? WHERE id = ?').run(now, pick.id);
  return pick;
}

// ---------- his tool ----------

export async function momentsTool(collab, { action, id, text, query, day, importance }) {
  const fmt = m => `[${m.id}] ${momentLine(m)}（重要度 ${m.importance}${m.resolved ? '' : '，还没了结'}${brightness(m) < SUNK ? '，已经很淡了' : ''}）`;
  if (action === 'search') {
    const q = String(query || text || '').trim();
    if (day) {
      const rows = listMoments(collab.id).filter(m => m.day === String(day));
      rows.forEach(m => touch(m.id));
      return rows.length ? rows.map(fmt).join('\n') : '那天没有记下的经历。';
    }
    if (!q) return '写上想找什么（query），或者给一个日期（day）。';
    const [v] = await embed([q]);
    const hits = listMoments(collab.id).filter(m => m.vec).map(m => ({ m, s: cosine(v, m.vec) })).filter(x => x.s >= 0.45).sort((a, b) => b.s - a.s).slice(0, 5);
    hits.forEach(x => touch(x.m.id));
    return hits.length ? hits.map(x => fmt(x.m)).join('\n') : '没找到相近的经历。';
  }
  if (action === 'add') {
    const t = String(text || '').trim().slice(0, 200);
    if (!t) return '经历还没写。';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? day : new Date().toISOString().slice(0, 10);
    const vec = route('embeddingRoute') ? (await embed([t]))[0] : null;
    db.prepare("INSERT INTO moments (id, collab_id, day, text, importance, vec, source, created_at) VALUES (?, ?, ?, ?, ?, ?, 'self', ?)")
      .run(newId(), collab.id, d, t, Math.min(5, Math.max(1, Math.round(Number(importance) || 3))), vec ? toBlob(vec) : null, Date.now());
    return '记下了。';
  }
  const m = id && getMoment(collab.id, id);
  if (['ring', 'resolve', 'importance'].includes(action) && !m) return '没找到这件事，先 search 或 list 看看 id。';
  if (action === 'ring') {
    const t = String(text || '').trim().slice(0, 200);
    if (!t) return '想写的那句还没写。';
    db.prepare('UPDATE moments SET rings = ?, shown = 0 WHERE id = ?').run(JSON.stringify([...m.rings, { at: Date.now(), text: t }].slice(-12)), m.id);
    touch(m.id);
    return '写在这件事底下了。';
  }
  if (action === 'resolve') {
    db.prepare('UPDATE moments SET resolved = 1 WHERE id = ?').run(m.id);
    if (text) db.prepare('UPDATE moments SET rings = ? WHERE id = ?').run(JSON.stringify([...m.rings, { at: Date.now(), text: String(text).slice(0, 200) }].slice(-12)), m.id);
    return '这件事算了结了，会慢慢放下。';
  }
  if (action === 'importance') {
    db.prepare('UPDATE moments SET importance = ? WHERE id = ?').run(Math.min(5, Math.max(1, Math.round(Number(importance) || m.importance))), m.id);
    return '改好了。';
  }
  const rows = inMind(collab.id);
  return rows.length ? `现在还清楚记得的：\n${rows.map(fmt).join('\n')}` : '还没有记下的经历。';
}
