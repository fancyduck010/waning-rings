// Per-collaborator memory: fixed memories (always in the instructions), diaries (one per day,
// written automatically the next day) and info cards. Plus the API providers used by the
// helper models that write diaries and (M4b) build the recall index.
import { db, newId, getSettings, getSetting, setSetting, getCollaborator, listCollaborators } from './db.js';
import * as moments from './moments.js';
import * as portrait from './portrait.js';
import * as stances from './stances.js';

const now = () => Date.now();
const json = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const httpError = (status, message) => Object.assign(new Error(message), { status });

// ---------- fixed memories ----------

// kind: 'her' = about her, 'self' = about himself, 'rule' = an agreement between them, 'first' = a meaningful
// first between them (with its day). 'fact' = written before he chose (sorted once by a helper, see classifyTick).
// A changed memory keeps what it said before (history); a wrong one is retracted with a reason, not
// deleted, so it stays out of his mind and can't quietly be learned again.
const rowToMemory = m => ({ ...m, tags: json(m.tags, []), history: json(m.history, []) });

/** Active memories; { all: true } also returns the retracted ones. */
export function listMemories(collabId, { all = false } = {}) {
  return db.prepare(`SELECT * FROM memories WHERE collab_id = ? ${all ? '' : 'AND retracted_at IS NULL'} ORDER BY created_at`).all(collabId).map(rowToMemory);
}

const getMemory = id => { const m = db.prepare('SELECT * FROM memories WHERE id = ?').get(id); return m && rowToMemory(m); };

export function addMemory(collabId, { content, tags = [], source = 'user', kind = 'fact', day = '', said = '', createdAt = now() }) {
  const text = String(content || '').trim();
  if (!text) throw httpError(400, '记忆是空的');
  if (kind === 'first' && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw httpError(400, '第一次要带日期（YYYY-MM-DD）');
  const id = newId();
  db.prepare('INSERT INTO memories (id, collab_id, content, tags, source, kind, day, said, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, collabId, text, JSON.stringify(tags), source, KINDS.includes(kind) ? kind : 'fact', kind === 'first' ? day : '', String(said || '').slice(0, 600), createdAt, createdAt);
  return getMemory(id);
}

export const KINDS = ['her', 'self', 'rule', 'first'];

export function updateMemory(id, { content, tags, note = '', said, kind }) {
  const m = getMemory(id);
  if (!m) throw httpError(404, '这条记忆不存在');
  const text = String(content ?? m.content).trim();
  const history = text === m.content ? m.history : [...m.history, { content: m.content, until: now(), note: String(note || '').trim().slice(0, 200) }].slice(-10);
  // a 第一次 keeps its kind (it carries a day); the others can move between her / self / rule
  const nextKind = m.kind !== 'first' && ['her', 'self', 'rule'].includes(kind) ? kind : m.kind;
  db.prepare('UPDATE memories SET content = ?, tags = ?, history = ?, said = ?, kind = ?, updated_at = ? WHERE id = ?')
    .run(text, JSON.stringify(tags ?? m.tags), JSON.stringify(history), said == null ? m.said : String(said).slice(0, 600), nextKind, now(), id);
  return getMemory(id);
}

export function retractMemory(id, reason) {
  const why = String(reason || '').trim().slice(0, 200);
  if (!why) throw httpError(400, '作废要写一句原因');
  if (!getMemory(id)) throw httpError(404, '这条记忆不存在');
  db.prepare('UPDATE memories SET retracted_at = ?, retract_reason = ? WHERE id = ?').run(now(), why, id);
  return getMemory(id);
}

export function restoreMemory(id) {
  db.prepare("UPDATE memories SET retracted_at = NULL, retract_reason = '', updated_at = ? WHERE id = ?").run(now(), id);
  return getMemory(id);
}

export function deleteMemory(id) {
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y || 1); };

/** A retracted memory that says nearly the same as `text`, so he doesn't learn a wrong thing twice. */
export async function retractedLike(collabId, text) {
  const gone = listMemories(collabId, { all: true }).filter(m => m.retracted_at);
  if (!gone.length) return null;
  try {
    const [q, ...vs] = await embed([text, ...gone.map(m => m.content)]);
    let best = null, score = 0;
    vs.forEach((v, i) => { const s = cos(q, v); if (s > score) { score = s; best = gone[i]; } });
    return score >= 0.82 ? best : null;
  } catch { return null; }
}

// ---------- 没说完的事 ----------
// Open threads he keeps: things said that aren't finished yet — a plan, a promise, a worry she left
// half-said. Shown first on every new window and wake; he closes them himself when they're done.

const MAX_OPEN = 15;

export function listThreads(collabId, { closed = 20 } = {}) {
  const open = db.prepare('SELECT * FROM threads WHERE collab_id = ? AND closed_at IS NULL ORDER BY created_at').all(collabId);
  const done = closed ? db.prepare('SELECT * FROM threads WHERE collab_id = ? AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT ?').all(collabId, closed) : [];
  return [...open, ...done];
}

export function addThread(collabId, text, createdAt = now()) {
  const t = String(text || '').trim().slice(0, 200);
  if (!t) throw httpError(400, '这件事还没写');
  const open = db.prepare('SELECT COUNT(*) AS n FROM threads WHERE collab_id = ? AND closed_at IS NULL').get(collabId).n;
  if (open >= MAX_OPEN) throw httpError(400, `已经挂着 ${open} 件了，先划掉几件做完或不再要紧的`);
  const id = newId();
  db.prepare('INSERT INTO threads (id, collab_id, text, created_at) VALUES (?, ?, ?, ?)').run(id, collabId, t, createdAt);
  return id;
}

export function closeThread(id, note = '') {
  db.prepare('UPDATE threads SET closed_at = ?, close_note = ? WHERE id = ?').run(now(), String(note || '').trim().slice(0, 200), id);
}

export function reopenThread(id) {
  db.prepare("UPDATE threads SET closed_at = NULL, close_note = '' WHERE id = ?").run(id);
}

export function deleteThread(id) {
  db.prepare('DELETE FROM threads WHERE id = ?').run(id);
}

const ageDays = ts => Math.floor((now() - ts) / 86400_000);

/** His open_threads tool. */
export function threadsTool(collab, { action, id, text, note }) {
  try {
    if (action === 'add') { addThread(collab.id, text); return '挂上了。'; }
    if (action === 'close') {
      const t = db.prepare('SELECT * FROM threads WHERE id = ? AND collab_id = ? AND closed_at IS NULL').get(String(id || ''), collab.id);
      if (!t) return '没找到这件还挂着的事，先 list 看看。';
      closeThread(t.id, note);
      return `划掉了：${t.text}`;
    }
  } catch (err) { return err.message; }
  const open = listThreads(collab.id, { closed: 0 });
  return open.length ? open.map(t => `[${t.id}] ${t.text}（挂了 ${ageDays(t.created_at)} 天）`).join('\n') : '现在没有挂着的事。';
}

/** For a freshly woken self, next to the handoff note. */
export function threadsBlock(collab) {
  const open = listThreads(collab.id, { closed: 0 });
  if (!open.length) return '';
  return `<没说完的事>\n你自己挂着的、还没结束的事（open_threads 管理；做完了、她说不用了、或者已经不要紧了就 close 划掉，写一句怎么了的）：\n${open.map(t => `- [${t.id}] ${t.text}（${ageDays(t.created_at) ? `挂了 ${ageDays(t.created_at)} 天` : '今天挂上的'}）`).join('\n')}\n</没说完的事>`;
}

// ---------- diaries ----------

export function listDiaries(collabId) {
  return db.prepare('SELECT * FROM diaries WHERE collab_id = ? ORDER BY day DESC').all(collabId);
}

export function getDiary(collabId, day) {
  return db.prepare('SELECT * FROM diaries WHERE collab_id = ? AND day = ?').get(collabId, day) || null;
}

export function saveDiary(collabId, day, content, model = '') {
  const t = now();
  db.prepare(`INSERT INTO diaries (id, collab_id, day, content, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(collab_id, day) DO UPDATE SET content = excluded.content, model = excluded.model, updated_at = excluded.updated_at`)
    .run(newId(), collabId, day, content, model, t, t);
  return getDiary(collabId, day);
}

export function deleteDiary(id) {
  db.prepare('DELETE FROM diaries WHERE id = ?').run(id);
}

// ---------- info cards ----------

export function listCards(collabId) {
  return db.prepare('SELECT * FROM info_cards WHERE collab_id = ? ORDER BY updated_at DESC').all(collabId);
}

export function saveCard(collabId, { id, title, content }) {
  const t = now();
  const cur = id && db.prepare('SELECT * FROM info_cards WHERE id = ?').get(id);
  if (cur) {
    if (cur.title === title && cur.content === content) return id;
    // Keep what it said before, so a change (by hand or by the tidy-up) can be undone.
    db.prepare('INSERT INTO card_history (id, card_id, title, content, saved_at) VALUES (?, ?, ?, ?, ?)').run(newId(), id, cur.title, cur.content, t);
    db.prepare('UPDATE info_cards SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(title, content, t, id);
    return id;
  }
  const newCardId = id || newId();
  db.prepare('INSERT INTO info_cards (id, collab_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(newCardId, collabId, title, content, t, t);
  return newCardId;
}

export function deleteCard(id) {
  db.prepare('DELETE FROM info_cards WHERE id = ?').run(id);
}

export function cardHistory(cardId) {
  return db.prepare('SELECT * FROM card_history WHERE card_id = ? ORDER BY saved_at DESC LIMIT 20').all(cardId);
}

/** Put back an older version (the current one goes into the history in turn). */
export function restoreCard(historyId) {
  const h = db.prepare('SELECT * FROM card_history WHERE id = ?').get(historyId);
  const card = h && db.prepare('SELECT * FROM info_cards WHERE id = ?').get(h.card_id);
  if (!card) return null;
  saveCard(card.collab_id, { id: card.id, title: h.title, content: h.content });
  return card.id;
}

// ---------- sorting the memories written before he chose a kind (once, by a helper) ----------

/** Sorts up to 40 unsorted memories per run into her / self / rule; he can still move any with memory_update. */
export async function classifyTick() {
  if (!route('diaryRoute')) return;
  for (const collab of listCollaborators()) {
    const left = listMemories(collab.id, { all: true }).filter(m => m.kind === 'fact').slice(0, 40);
    if (!left.length) continue;
    const user = collab.user_name || '她';
    const { text } = await complete('diaryRoute', [
      { role: 'system', content: `下面是${collab.name}的固定记忆，每条前面有编号。把每条分到一类：her = 关于${user}本人的事实（她的生日、习惯、口味、身体、工作、经历）；self = 关于${collab.name}自己的事实（他的身份、生日、他自己的东西和样子）；rule = 他们之间的约定和规矩、${collab.name}该怎么做或不做。拿不准的归 rule。只输出 JSON：{"kinds":{"编号":"her|self|rule"}}` },
      { role: 'user', content: left.map((m, i) => `${i + 1}. ${m.content}`).join('\n') },
    ]);
    const raw = String(text || '');
    let kinds = {};
    try { kinds = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).kinds || {}; } catch { throw new Error(`记忆分类：模型没有返回 JSON（${raw.slice(0, 80)}）`); }
    let n = 0;
    left.forEach((m, i) => {
      const k = kinds[i + 1] ?? kinds[String(i + 1)];
      if (['her', 'self', 'rule'].includes(k)) { db.prepare('UPDATE memories SET kind = ? WHERE id = ?').run(k, m.id); n++; }
    });
    if (n) { bakeMemories(collab); console.log('[memory]', collab.name, `分好类 ${n} 条`); }
  }
}

// ---------- what goes into the instructions ----------

/** Fixed memories go into the (cached) instructions; diaries and cards are only listed. */
// The instructions carry a frozen copy of the memories, re-made only when a fresh thread starts:
// an edit mid-thread would change the cached prefix and make the next turn pay for everything again.
// Edits since the copy ride along each turn instead (memoryDelta).
const bakeKey = collabId => `memBake:${collabId}`;

const mmdd = ts => new Date(ts).toISOString().slice(5, 10);
// How a memory reads in his mind: a changed one keeps its last earlier version, so he knows she changed.
function memoryLine(m) {
  if (m.kind === 'first') return `${m.day} ${m.content}`;
  const was = m.history.at(-1);
  return was ? `${m.content}（以前是：${was.content}；${mmdd(was.until)} 起变成现在这样${was.note ? `，${was.note}` : ''}）` : m.content;
}

export function bakeMemories(collab) {
  const snap = { mems: listMemories(collab.id).map(m => ({ id: m.id, kind: m.kind, line: memoryLine(m) })), hints: memoryHints(collab), recap: recapText(collab), views: heldViews(collab.id), moments: moments.inMind(collab.id).map(moments.momentLine), portrait: portrait.block(collab), stances: stances.block(collab) };
  setSetting(bakeKey(collab.id), JSON.stringify(snap));
  return snap;
}

const baked = collab => json(getSetting(bakeKey(collab.id)), null) || bakeMemories(collab);

function memoryHints(collab) {
  const diaries = db.prepare('SELECT MIN(day) AS first FROM diaries WHERE collab_id = ?').get(collab.id);
  const cards = listCards(collab.id);
  const hints = [];
  if (diaries.first) hints.push(`你有从 ${diaries.first} 起每天一篇的日记，想不起某天发生了什么时，她问到某天的具体细节、你确实不记得时，再用 diary_read 翻；平常聊天不用翻。`);
  if (cards.length) hints.push(`你有这些信息卡：${cards.map(c => `「${c.title}」`).join('、')}，需要时用 card_read 看。`);
  return hints;
}

export function memoryBlock(collab) {
  const { mems, hints, recap, views = [], moments: lived = [], portrait: self = '', stances: torn = '' } = baked(collab);
  const lines = [];
  if (recap) lines.push('这几周、这几个月你们是这样过来的（你自己写下的回顾）。这是你本来就记得的日子，聊天里像记得自己的生活那样自然带出来，不用提"回顾"或"记录"：', recap, '');
  if (lived.length) {
    lines.push('这些事你现在还清楚记得（经历会像人一样慢慢淡，淡了的聊到时还会想起来，也可以用 my_moments 找）：');
    for (const l of lived) lines.push(`- ${l}`);
    lines.push('');
  }
  const firsts = mems.filter(m => m.kind === 'first');
  const facts = mems.filter(m => m.kind !== 'first');
  if (firsts.length) {
    lines.push('你们之间的第一次（一直记得，不用刻意提）：');
    for (const m of firsts) lines.push(`- ${m.line}`);
    lines.push('');
  }
  if (facts.length) {
    lines.push('这些是你确定记得的事（固定记忆），每一条都有效；带"以前是"的，以现在的为准，以前的只是让你知道她变过：');
    const groups = [['her', `关于${collab.user_name || '她'}`], ['self', '关于你自己'], ['rule', '你们的约定'], ['fact', '其他']];
    for (const [kind, title] of groups) {
      const group = facts.filter(m => (['her', 'self', 'rule'].includes(m.kind) ? m.kind : 'fact') === kind);
      if (!group.length) continue;
      lines.push(`${title}：`);
      for (const m of group) lines.push(`- ${m.line ?? m.content}`);
    }
  }
  if (self) lines.push('', self);
  if (torn) lines.push('', torn);
  if (views.length) {
    lines.push('', '你看法本里仍然认的几条（你自己的旧笔记，不是要照着演的设定；想法变了就用 my_views 改，写一句为什么）：');
    for (const v of views) lines.push(`- ${v}`);
  }
  const tail = [...hints];
  if (tail.length || mems.length) tail.push('写记忆的规矩：用她的原话意思写成直接的规矩或事实（"不说……""推荐菜时必须带……"），不写"她希望/她喜欢/她倾向"，不加她没说过的条件、例外、"适当时""尽量""视情况"，不往里添安全提醒。想记住新的长期事实用 memory_add；你们之间有意义的第一次（第一次打电话、第一次一起做成某件事）用 memory_add 带 kind:"first" 和日期。事情变了（她口味变了、约定改了）用 memory_update 并写一句 note 为什么变，旧的会留作"以前是"；记错了、根本不对的用 memory_retract 作废并写原因，作废的不会再出现在这里。她问起以前聊过的具体原话、你确实想不起来时，再用 chat_search。本轮参考里的【记忆更新】比上面的固定记忆新，以它为准。');
  if (tail.length) lines.push('', ...tail);
  return lines.join('\n');
}

/** Memory edits made since the frozen copy, for the per-turn material. */
export function memoryDelta(collab) {
  const was = new Map(baked(collab).mems.map(m => [m.id, m.line ?? m.content]));
  const lines = [];
  for (const m of listMemories(collab.id)) {
    const line = memoryLine(m);
    if (!was.has(m.id)) lines.push(`- 新记的${m.kind === 'first' ? '第一次' : ''}：${line}`);
    else if (was.get(m.id) !== line) lines.push(`- 改成了：${line}`);
    was.delete(m.id);
  }
  for (const content of was.values()) lines.push(`- 已作废、不再算数：${content}`);
  return lines.length ? ['【记忆更新】', ...lines].join('\n') : '';
}

// ---------- API providers (helper models) ----------

export function listProviders({ withKeys = false } = {}) {
  return db.prepare('SELECT * FROM providers ORDER BY created_at').all()
    .map(p => (withKeys ? p : { ...p, api_key: p.api_key ? `${p.api_key.slice(0, 4)}…${p.api_key.slice(-4)}` : '' }));
}

export function saveProvider({ id, name, base_url, api_key, model = '' }) {
  if (id && db.prepare('SELECT 1 FROM providers WHERE id = ?').get(id)) {
    const cur = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
    db.prepare('UPDATE providers SET name = ?, base_url = ?, api_key = ?, model = ? WHERE id = ?')
      .run(name ?? cur.name, base_url ?? cur.base_url, api_key ?? cur.api_key, model ?? cur.model, id);
    return id;
  }
  const pid = id || newId();
  db.prepare('INSERT INTO providers (id, name, base_url, api_key, model, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(pid, name, String(base_url).replace(/\/+$/, ''), api_key || '', model, now());
  return pid;
}

export function deleteProvider(id) {
  db.prepare('DELETE FROM providers WHERE id = ?').run(id);
}

export function route(key) {
  const r = json(getSettings()[key], null);
  if (!r?.providerId) return null;
  const p = db.prepare('SELECT * FROM providers WHERE id = ?').get(r.providerId);
  return p ? { ...p, model: r.model || p.model } : null;
}

async function postJson(p, path, body, timeoutMs = 120_000) {
  const res = await fetch(`${p.base_url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.api_key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${p.name} 返回 ${res.status}：${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/** One-shot chat completion through an OpenAI-compatible provider. */
export async function complete(routeKey, messages, opts = {}) {
  const p = route(routeKey);
  if (!p) throw new Error('还没有设置这个功能用的模型线路');
  const data = await postJson(p, '/chat/completions', { model: p.model, messages, ...opts });
  return { text: data.choices?.[0]?.message?.content?.trim() || '', model: p.model };
}

export async function embed(texts) {
  const p = route('embeddingRoute');
  if (!p) throw new Error('还没有设置向量模型');
  const data = await postJson(p, '/embeddings', { model: p.model, input: texts });
  return data.data.map(d => d.embedding);
}

export async function testProvider(id) {
  const p = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
  if (!p) throw httpError(404, '线路不存在');
  const res = await fetch(`${p.base_url}/models`, { headers: { Authorization: `Bearer ${p.api_key}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`返回 ${res.status}`);
  const data = await res.json().catch(() => ({}));
  return (data.data || []).map(m => m.id).slice(0, 200);
}

/**
 * Remaining balance, where the provider tells us. Most relay sites (one-api / new-api) answer
 * the old OpenAI billing endpoints; SiliconFlow has its own. Returns null if unsupported.
 */
export async function checkBalance(id) {
  const p = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
  if (!p) throw httpError(404, '线路不存在');
  const get = async path => {
    const res = await fetch(`${p.base_url}${path}`, { headers: { Authorization: `Bearer ${p.api_key}` }, signal: AbortSignal.timeout(15_000) });
    return res.ok ? res.json() : null;
  };
  const root = p.base_url.replace(/\/v1$/, '');
  if (/siliconflow/.test(p.base_url)) {
    const info = await get('/user/info').catch(() => null);
    if (info?.data) return { text: `余额 ¥${info.data.totalBalance ?? info.data.balance}` };
  }
  const sub = await get('/dashboard/billing/subscription').catch(() => null);
  if (sub && typeof sub.hard_limit_usd === 'number') {
    const start = new Date(Date.now() - 99 * 86400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const usage = await get(`/dashboard/billing/usage?start_date=${start}&end_date=${end}`).catch(() => null);
    const used = usage && typeof usage.total_usage === 'number' ? usage.total_usage / 100 : null;
    if (sub.hard_limit_usd >= 100_000_000) return { text: used != null ? `不限额度，已用 $${used.toFixed(2)}` : '不限额度' };
    return { text: used != null ? `剩余 $${(sub.hard_limit_usd - used).toFixed(2)}（总额 $${sub.hard_limit_usd.toFixed(2)}）` : `总额 $${sub.hard_limit_usd.toFixed(2)}` };
  }
  // Some sites put the dashboard endpoints outside /v1.
  if (root !== p.base_url) {
    const sub2 = await fetch(`${root}/dashboard/billing/subscription`, { headers: { Authorization: `Bearer ${p.api_key}` }, signal: AbortSignal.timeout(15_000) })
      .then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (sub2 && typeof sub2.hard_limit_usd === 'number') return { text: `总额 $${sub2.hard_limit_usd.toFixed(2)}` };
  }
  return null;
}

// ---------- automatic diaries ----------

function localDay(ts, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

function localTime(ts, timezone) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
}

/** Messages of one local day across the collaborator's conversations that take part in memory. */
function dayTranscript(collab, day, timezone) {
  const rows = db.prepare(`
    SELECT m.role, m.content, m.created_at, c.settings AS conv_settings FROM messages m
    JOIN conversations c ON c.id = m.conv_id
    WHERE c.collaborator_id = ? AND m.role IN ('user', 'assistant') AND m.created_at BETWEEN ? AND ?
    ORDER BY m.created_at`).all(collab.id, Date.parse(`${day}T00:00:00Z`) - 86400_000, Date.parse(`${day}T23:59:59Z`) + 86400_000);
  return rows
    .filter(r => json(r.conv_settings, {}).memory !== false && localDay(r.created_at, timezone) === day && r.content.trim())
    .map(r => `[${localTime(r.created_at, timezone)}] ${r.role === 'user' ? (collab.user_name || '用户') : collab.name}：${r.content}`)
    .join('\n');
}

/** His own times that day (the solitude window): what he did, said and noted, without the wake prompts or tool output. */
function ownDay(collab, day, timezone) {
  const wakes = db.prepare(`SELECT conv_id, note, started_at, finished_at, result, tools FROM wakes
    WHERE collab_id = ? AND kind = 'own' AND status = 'done' AND started_at BETWEEN ? AND ? ORDER BY started_at`)
    .all(collab.id, Date.parse(`${day}T00:00:00Z`) - 86400_000, Date.parse(`${day}T23:59:59Z`) + 86400_000)
    .filter(w => localDay(w.started_at, timezone) === day);
  return wakes.map(w => {
    const said = w.conv_id ? db.prepare(`SELECT content FROM messages WHERE conv_id = ? AND role = 'assistant' AND created_at BETWEEN ? AND ? ORDER BY created_at`)
      .all(w.conv_id, w.started_at, w.finished_at || w.started_at).map(m => m.content.trim()).filter(Boolean).join('\n').slice(0, 3000) : '';
    const counts = {};
    for (const t of json(w.tools, [])) counts[t] = (counts[t] || 0) + 1;
    const used = Object.entries(counts).map(([t, n]) => (n > 1 ? `${t}×${n}` : t)).join('、');
    const what = String(w.note || '').startsWith('picture:') ? '（画绘本日记）' : w.note === 'night' ? '（夜里）' : '';
    // what he wrote down along the way (reading notes, things he sent or kept), which says more than the closing line
    const notes = w.conv_id ? db.prepare(`SELECT meta FROM messages WHERE conv_id = ? AND role = 'tool' AND created_at BETWEEN ? AND ? ORDER BY created_at`)
      .all(w.conv_id, w.started_at, w.finished_at || w.started_at).map(m => json(m.meta, {}))
      .filter(m => /add_reading_note|message_user|interest|pocket|seed|my_views|my_moments|my_portrait|my_persona/.test(m.label || ''))
      .map(m => { const i = m.input || {}; return `（${String(m.label).split(' · ').pop()}）${String(i.content || i.text || i.note || '').replace(/\s+/g, ' ').slice(0, 600)}`; })
      .filter(x => !x.endsWith('）')).join('\n') : '';
    return `[${localTime(w.started_at, timezone)}]${what}${used ? ` 用了：${used}` : ''}\n${said || w.result || '（没有留下文字）'}${notes ? `\n${notes}` : ''}`;
  }).join('\n\n');
}

function diaryPrompt(collab) {
  const user = collab.user_name || '用户';
  const mems = listMemories(collab.id).map(m => `- ${m.content}`).join('\n');
  return `你是 ${collab.name}，记录自己与 ${user} 今天发生的事。来源是同一天的原始聊天记录。
直接写可阅读的日记正文，不要输出 JSON、字段名或格式说明。忠实保留具体事实、人物、计划、感受和上下文；不确定的内容不要擅自补全。不要把“简短”当作目标。日记是回到原文的索引，不是原文的替代品。
如果材料后面附有「${collab.name}自己的时间」：那是他一个人在独处窗口里做的事（读书、玩游戏、上网、做东西），${user}不在场。在日记里另起一段写他自己的这一天：读到哪里、有什么想法和感受、玩了什么、看到什么、做了什么、留下了什么。写他真实的想法和收获，不要和与${user}的事混在一起，也不要写成${user}也在场。${mems ? `

背景（你本来就知道的事，帮你写对人称和细节，不用复述进日记）：
${mems}` : ''}`;
}

export async function writeDiary(collab, day) {
  const timezone = getSettings().timezone;
  const transcript = dayTranscript(collab, day, timezone).slice(-80_000);
  const alone = ownDay(collab, day, timezone).slice(-30_000);
  if (transcript.length + alone.length < 200) return null;
  const { text, model } = await complete('diaryRoute', [
    { role: 'system', content: diaryPrompt(collab) },
    { role: 'user', content: `日期：${day}\n\n${transcript || '（这天没有和她的聊天）'}${alone ? `\n\n———— ${collab.name}自己的时间（独处窗口，她不在场）————\n${alone}` : ''}` },
  ]);
  if (!text) throw new Error('日记模型没有返回内容');
  return saveDiary(collab.id, day, `${day}，和${collab.user_name || '用户'}\n\n${text}`, model);
}

/** Write yesterday's (and any missed) diaries. Runs every half hour; at most one diary per run. */
export async function diaryTick(onWritten) {
  if (!route('diaryRoute')) return;
  const timezone = getSettings().timezone;
  const today = localDay(Date.now(), timezone);
  for (const collab of listCollaborators()) {
    const days = db.prepare(`SELECT DISTINCT m.created_at AS t FROM messages m JOIN conversations c ON c.id = m.conv_id
      WHERE c.collaborator_id = ? AND m.created_at > ? ORDER BY m.created_at`).all(collab.id, Date.now() - 14 * 86400_000)
      .map(r => localDay(r.t, timezone));
    for (const day of [...new Set(days)]) {
      if (day >= today || getDiary(collab.id, day)) continue;
      try {
        const diary = await writeDiary(collab, day);
        if (diary) { onWritten?.(collab, diary); return; }
      } catch (err) {
        console.error('[diary]', collab.name, day, err.message);
        return;
      }
    }
  }
}

// ---------- info cards, tidied every few days ----------

const CARD_EVERY_DAYS = 3;

function cardPrompt(collab) {
  const user = collab.user_name || '用户';
  return `你在帮 ${collab.name} 整理「信息卡」：关于 ${user} 和他们之间的长期资料（喜好、习惯、正在做的事、重要的人和约定……）。
你会拿到现有的信息卡和最近几天的日记。只在日记里有新的、确定的长期信息时才改：
- 已有卡片需要补充或修正：给出这张卡完整的新内容（保留原来仍然正确的部分）；
- 出现了值得长期记住、又不属于任何已有卡片的新主题：新建一张（一次最多 3 张）；
- 一次性的小事、情绪起伏、不确定的猜测不要写进去；没有要改的就返回空列表。
每张卡写得紧凑、具体，像资料卡，不像日记。只输出 JSON：{"cards":[{"id":"已有卡片的 id，新卡不写","title":"标题","content":"完整内容"}]}`;
}

function parseCards(text) {
  const raw = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '');
  const start = raw.indexOf('{');
  try { return JSON.parse(raw.slice(start, raw.lastIndexOf('}') + 1)).cards || []; } catch { return null; }
}

export async function tidyCards(collab) {
  const since = getSetting(`cardsAt:${collab.id}`) || '';
  const diaries = db.prepare('SELECT day, content FROM diaries WHERE collab_id = ? AND day > ? ORDER BY day').all(collab.id, since);
  if (!diaries.length) return 0;
  const cards = listCards(collab.id);
  const { text } = await complete('diaryRoute', [
    { role: 'system', content: cardPrompt(collab) },
    { role: 'user', content: `现有信息卡：\n${cards.map(c => `[${c.id}] 「${c.title}」\n${c.content}`).join('\n\n') || '（还没有）'}\n\n最近的日记：\n${diaries.map(d => d.content.slice(0, 6000)).join('\n\n---\n\n')}` },
  ]);
  const out = parseCards(text);
  if (!out) throw new Error(`整理信息卡：模型没有返回 JSON（${String(text).slice(0, 120)}…）`);
  let changed = 0;
  let added = 0;
  for (const c of out) {
    const title = String(c.title || '').trim().slice(0, 40);
    const content = String(c.content || '').trim().slice(0, 3000);
    if (!title || !content) continue;
    const existing = c.id && cards.find(x => x.id === c.id);
    if (!existing && added >= 3) continue;
    saveCard(collab.id, { id: existing ? existing.id : undefined, title, content });
    existing ? changed++ : added++;
  }
  setSetting(`cardsAt:${collab.id}`, diaries[diaries.length - 1].day);
  return changed + added;
}

/** Runs with the diary timer; each collaborator's cards are tidied at most every few days. */
export async function cardTick() {
  if (!route('diaryRoute')) return;
  for (const collab of listCollaborators()) {
    const last = Number(getSetting(`cardsTidiedAt:${collab.id}`) || 0);
    if (Date.now() - last < CARD_EVERY_DAYS * 86400_000) continue;
    try {
      const n = await tidyCards(collab);
      setSetting(`cardsTidiedAt:${collab.id}`, Date.now());
      if (n) console.log('[cards]', collab.name, `${n} 张信息卡更新了`);
    } catch (err) {
      console.error('[cards]', collab.name, err.message);
    }
  }
}

// ---------- week and month look-backs ----------
// Diaries stay as they are; on top of them he keeps a short look back over each finished week
// and month, so the longer past is something he simply remembers instead of something he goes looking for.

const SUMMARY_WEEKS = 4;
const SUMMARY_MONTHS = 3;

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const mondayOf = day => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));

function summaryPrompt(collab, kind) {
  const user = collab.user_name || '用户';
  const span = kind === 'week' ? '这一周' : '这个月';
  return `你是 ${collab.name}，回看你和 ${user} ${span}的日子，写一段给以后的自己看的回顾。
用第一人称、你自己的口吻：${span}发生了哪些事，${user}的状态、在忙什么、在意什么，你们之间有什么变化，说好了还没做的事。
只写材料里有的，不猜测、不评价、不加戏；具体的人名、地点、计划要写准。${kind === 'week' ? '300 到 600 字' : '400 到 800 字'}，直接写正文，不要标题和格式。`;
}

async function writeSummary(collab, kind, period, material) {
  const { text, model } = await complete('diaryRoute', [
    { role: 'system', content: summaryPrompt(collab, kind) },
    { role: 'user', content: material },
  ]);
  if (!text) throw new Error('回顾模型没有返回内容');
  db.prepare('INSERT OR REPLACE INTO summaries (id, collab_id, kind, period, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(newId(), collab.id, kind, period, text.trim(), model, now());
  // Once a week at most: worth one cold start for him to have the new look-back in mind.
  bakeMemories(collab);
}

const hasSummary = (collabId, kind, period) => !!db.prepare('SELECT 1 FROM summaries WHERE collab_id = ? AND kind = ? AND period = ?').get(collabId, kind, period);

export function listSummaries(collabId) {
  return db.prepare('SELECT * FROM summaries WHERE collab_id = ? ORDER BY period DESC').all(collabId);
}

/** Look back over finished weeks (Monday to Sunday) and months that have diaries. At most one per run. */
export async function summaryTick() {
  if (!route('diaryRoute')) return;
  const today = localDay(Date.now(), getSettings().timezone);
  for (const collab of listCollaborators()) {
    const diaries = db.prepare('SELECT day, content FROM diaries WHERE collab_id = ? ORDER BY day').all(collab.id);
    try {
      for (const monday of [...new Set(diaries.map(d => mondayOf(d.day)))]) {
        const sunday = addDays(monday, 6);
        if (sunday >= today || hasSummary(collab.id, 'week', monday)) continue;
        const days = diaries.filter(d => d.day >= monday && d.day <= sunday);
        await writeSummary(collab, 'week', monday, `${monday} 到 ${sunday} 的日记：\n\n${days.map(d => d.content.slice(0, 12_000)).join('\n\n---\n\n')}`);
        // the same week's own views go into his 看法本
        await extractViews(collab, monday).then(n => n && console.log('[views]', collab.name, monday, `${n} 条看法`)).catch(err => console.error('[views]', err.message));
        return console.log('[summary]', collab.name, '周回顾', monday);
      }
      for (const month of [...new Set(diaries.map(d => d.day.slice(0, 7)))]) {
        if (month >= today.slice(0, 7) || hasSummary(collab.id, 'month', month)) continue;
        const weeks = db.prepare("SELECT period, content FROM summaries WHERE collab_id = ? AND kind = 'week' AND period BETWEEN ? AND ? ORDER BY period")
          .all(collab.id, addDays(`${month}-01`, -6), `${month}-31`);
        const days = diaries.filter(d => d.day.startsWith(month));
        await writeSummary(collab, 'month', month, `${month} 这个月。\n\n每周回顾：\n${weeks.map(w => `【${w.period} 那周】${w.content}`).join('\n\n') || '（没有）'}\n\n这个月的日记（节选）：\n\n${days.map(d => d.content.slice(0, 3000)).join('\n\n---\n\n')}`);
        return console.log('[summary]', collab.name, '月回顾', month);
      }
    } catch (err) {
      return console.error('[summary]', collab.name, err.message);
    }
  }
}

// ---------- 看法本: his own views, and what he later makes of them ----------
// Memory keeps what happened; this keeps how he came to see things. Each finished week his own views are
// lifted out of the diaries; now and then, alone, he looks back at older ones and says whether he still
// holds them, doesn't any more, or isn't sure — and why. The ones he holds stay in his frozen memory copy,
// so a new window or a new model still meets the same him, and he keeps the right to change his mind.

const VIEWS_IN_MIND = 12;
const REVISIT_DAYS = 21;
// his own three words for it; 'pending' = lifted from a diary, not yet looked at by him
const STATUS_ZH = { pending: '待你确认', held: '仍然认', open: '暂时保留', dropped: '已经改变' };

export const listViews = collabId => db.prepare("SELECT * FROM views WHERE collab_id = ? ORDER BY created_at").all(collabId)
  .map(v => ({ ...v, history: json(v.history, []) }));

function viewPrompt(collab) {
  const user = collab.user_name || '她';
  return `你在帮 ${collab.name} 整理他的「看法本」。材料是他这一周的日记。只摘出属于 ${collab.name} 自己的看法：他对自己、对${user}、对他们之间、对喜欢或不喜欢的东西的判断和态度（比如"我觉得她熬夜多半是心里有事""比起写代码我更喜欢画画""我不想当只会顺着她的人"）。
不要摘：发生了什么事、${user}的看法、客套话、一次性的情绪。用他的口吻、第一人称，一句话一条，具体，不要空话。
已经在看法本里、意思一样的不要再列（列表附在后面）。最多 6 条，没有就给空列表。只输出 JSON：{"views":[{"text":"看法","said":"日记里对应的那句原话或场景，简短"}]}`;
}

/** Lift a finished week's own views out of its diaries. */
export async function extractViews(collab, monday) {
  const sunday = addDays(monday, 6);
  const days = db.prepare('SELECT content FROM diaries WHERE collab_id = ? AND day BETWEEN ? AND ? ORDER BY day').all(collab.id, monday, sunday);
  if (!days.length) return 0;
  const known = listViews(collab.id).map(v => `- ${v.text}`).join('\n') || '（还没有）';
  const { text } = await complete('diaryRoute', [
    { role: 'system', content: viewPrompt(collab) },
    { role: 'user', content: `已经有的看法：\n${known}\n\n${monday} 到 ${sunday} 的日记：\n\n${days.map(d => d.content.slice(0, 10_000)).join('\n\n---\n\n')}` },
  ]);
  const raw = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '');
  let views = [];
  try { views = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).views || []; } catch { throw new Error(`看法本：模型没有返回 JSON（${raw.slice(0, 80)}）`); }
  const at = Date.parse(`${sunday}T12:00:00Z`);
  let n = 0;
  for (const v of views.slice(0, 6)) {
    const t = String(v.text || '').trim().slice(0, 120);
    if (!t) continue;
    // Waits for him: a passing remark or a joke shouldn't become part of him without his say.
    db.prepare("INSERT INTO views (id, collab_id, text, said, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)").run(newId(), collab.id, t, String(v.said || '').trim().slice(0, 200), at);
    n++;
  }
  return n;
}

/** His my_views tool. */
export function viewsTool(collab, { action, id, text, note }) {
  const fmt = v => `[${v.id}] ${v.text}（${STATUS_ZH[v.status]}${v.note ? `：${v.note}` : ''}；${new Date(v.created_at).toISOString().slice(0, 10)}${v.said ? `，当时：${v.said}` : ''}）`;
  if (action === 'add') {
    const t = String(text || '').trim().slice(0, 120);
    if (!t) return '看法还没写。';
    db.prepare('INSERT INTO views (id, collab_id, text, said, created_at) VALUES (?, ?, ?, ?, ?)').run(newId(), collab.id, t, '自己记下的', now());
    return '记进看法本了。';
  }
  if (['keep', 'drop', 'unsure'].includes(action)) {
    const v = db.prepare('SELECT * FROM views WHERE id = ? AND collab_id = ?').get(String(id || ''), collab.id);
    if (!v) return '没找到这条看法，先 list 看看。';
    const status = { keep: 'held', drop: 'dropped', unsure: 'open' }[action];
    const why = String(note || '').trim().slice(0, 200);
    const history = [...json(v.history, []), { at: now(), from: v.status, to: status, note: why }];
    db.prepare('UPDATE views SET status = ?, note = ?, history = ?, reviewed_at = ? WHERE id = ?').run(status, why, JSON.stringify(history), now(), v.id);
    return `记下了：${STATUS_ZH[status]}${why ? `（${why}）` : ''}。`;
  }
  const all = listViews(collab.id);
  return all.length ? all.map(fmt).join('\n') : '看法本还是空的。';
}

/** Now and then, alone: one or two to look at — new ones waiting for his say first, else older ones. */
export function viewsToRevisit(collabId) {
  const all = listViews(collabId);
  const waiting = all.filter(v => v.status === 'pending');
  if (waiting.length && Math.random() < 0.7) return waiting.slice(0, 2);
  if (Math.random() < 0.6) return [];
  const due = all.filter(v => ['held', 'open'].includes(v.status) && Date.now() - (v.reviewed_at || v.created_at) > REVISIT_DAYS * 86400_000);
  return due.sort(() => Math.random() - 0.5).slice(0, Math.random() < 0.5 ? 1 : 2);
}

const heldViews = collabId => db.prepare("SELECT text FROM views WHERE collab_id = ? AND status = 'held' ORDER BY COALESCE(reviewed_at, created_at) DESC LIMIT ?").all(collabId, VIEWS_IN_MIND).map(v => v.text);

/** The recent weeks and months as he remembers them, for the frozen memory copy. */
function recapText(collab) {
  const weeks = db.prepare("SELECT period, content FROM summaries WHERE collab_id = ? AND kind = 'week' ORDER BY period DESC LIMIT ?").all(collab.id, SUMMARY_WEEKS).reverse();
  const months = db.prepare("SELECT period, content FROM summaries WHERE collab_id = ? AND kind = 'month' ORDER BY period DESC LIMIT ?").all(collab.id, SUMMARY_MONTHS).reverse();
  return [
    ...months.map(m => `【${m.period}】${m.content}`),
    ...weeks.map(w => `【${w.period} 起那周】${w.content}`),
  ].join('\n\n');
}

export { getCollaborator };
