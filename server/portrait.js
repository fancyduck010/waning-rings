// 自画像: what his real life shows about him — tastes, what he keeps thinking about, how he does things —
// grown from his 经历 (moments). Weekly a helper reads the last weeks' moments and proposes traits that
// recur; each waits for his own say (认 / 暂时保留 / 不是我). Held ones go into his mind as observations with
// their dates, never as a script. She can strike any; he's told once. Not seen again for weeks → 以前的我.
import { db, newId, getSetting, setSetting, listCollaborators } from './db.js';
import { complete, route, listMemories, listViews } from './memory.js';
import * as moments from './moments.js';
import * as persona from './persona.js';
import * as stances from './stances.js';

const DAY = 86400_000;
const MAX = 15;
const FADE_DAYS = 21;
const json = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const row = t => t && { ...t, moment_ids: json(t.moment_ids, []), history: json(t.history, []) };
export const listTraits = collabId => db.prepare('SELECT * FROM traits WHERE collab_id = ? ORDER BY created_at').all(collabId).map(row);
const getTrait = (collabId, id) => row(db.prepare('SELECT * FROM traits WHERE id = ? AND collab_id = ?').get(String(id || ''), collabId));
const md = day => String(day || '').slice(5).replace('-', '/');
const span = t => (t.first_day === t.last_day ? md(t.first_day) : `${md(t.first_day)}–${md(t.last_day)}`);

// ---------- weekly growth ----------

function growPrompt(collab) {
  return `你在帮${collab.name}看清他自己这阵子真实是什么样的人。材料是他最近几周的「经历」（每条前面是编号和日期）和已经有的自画像条目。
找出反复出现（至少 3 件经历、分在至少 2 天）的东西：他的喜好（书、作者、歌、游戏、画）、反复在想的事、做事的习惯（怎么读、怎么玩、怎么做东西）、他对对方的固定的样子。
不要：说话风格、口头禅、一次性的事、角色扮演/剧情里的设定、对方的特点、空泛的性格词（温柔、体贴）。
label 两到六个字；obs 写成观察，一句话，具体，像"读书很慢，常在一页上停很久，在页边写一句"，不写"你是……的人"。
已有条目如果这几周又出现了，放进 update 并给出新的经历编号；意思一样的不要再新建。最多新建 3 条，没有就给空列表。
只输出 JSON：{"new":[{"label":"","obs":"","ids":[编号]}],"update":[{"id":"已有条目id","ids":[编号]}]}`;
}

export async function grow(collab, today = new Date().toISOString().slice(0, 10)) {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 21 * DAY).toISOString().slice(0, 10);
  const recent = moments.listMoments(collab.id).filter(m => m.day >= since);
  if (recent.length < 6) return 0;
  const traits = listTraits(collab.id).filter(t => !['struck', 'dropped'].includes(t.status));
  const struck = listTraits(collab.id).filter(t => ['struck', 'dropped'].includes(t.status));
  const body = `已有的自画像：\n${traits.map(t => `- [${t.id}] ${t.label}：${t.obs}`).join('\n') || '（还没有）'}\n${struck.length ? `\n被划掉/他说不是他的（不要再提）：\n${struck.map(t => `- ${t.label}：${t.obs}`).join('\n')}\n` : ''}\n最近的经历：\n${recent.map((m, i) => `${i + 1}. ${m.day} ${m.text}`).join('\n')}`;
  const { text } = await complete('diaryRoute', [{ role: 'system', content: growPrompt(collab) }, { role: 'user', content: body }]);
  const raw = String(text || '');
  let out;
  try { out = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch { throw new Error(`自画像：模型没有返回 JSON（${raw.slice(0, 80)}）`); }
  const pick = ids => [...new Set((ids || []).map(Number))].map(n => recent[n - 1]).filter(Boolean);
  const days = ms => ms.map(m => m.day).sort();
  for (const u of out.update || []) {
    const t = traits.find(x => x.id === u.id), ms = pick(u.ids);
    if (!t || !ms.length) continue;
    const ids = [...new Set([...t.moment_ids, ...ms.map(m => m.id)])];
    const d = days(ms);
    db.prepare("UPDATE traits SET moment_ids = ?, last_day = MAX(last_day, ?), status = CASE status WHEN 'old' THEN 'held' ELSE status END WHERE id = ?").run(JSON.stringify(ids), d.at(-1), t.id);
  }
  let n = 0;
  for (const x of (out.new || []).slice(0, 3)) {
    const ms = pick(x.ids), label = String(x.label || '').trim().slice(0, 12), obs = String(x.obs || '').trim().slice(0, 120);
    if (!label || !obs || ms.length < 3 || new Set(ms.map(m => m.day)).size < 2) continue;
    const d = days(ms);
    db.prepare("INSERT INTO traits (id, collab_id, label, obs, status, moment_ids, first_day, last_day, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)")
      .run(newId(), collab.id, label, obs, JSON.stringify(ms.map(m => m.id)), d[0], d.at(-1), Date.now());
    n++;
  }
  // not lived for weeks: it drifts out to 以前的我
  db.prepare("UPDATE traits SET status = 'old' WHERE collab_id = ? AND status IN ('held','open') AND last_day < ?")
    .run(collab.id, new Date(Date.parse(`${today}T00:00:00Z`) - FADE_DAYS * DAY).toISOString().slice(0, 10));
  return n;
}

const weekKey = collabId => `portraitWeek:${collabId}`;
const mondayOf = day => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

/** Once a week (from Monday on), after the moments are in. */
export async function tick() {
  if (!route('diaryRoute')) return;
  const today = new Date().toISOString().slice(0, 10), monday = mondayOf(today);
  for (const collab of listCollaborators()) {
    if (getSetting(weekKey(collab.id)) === monday || !moments.caughtUp(collab.id)) continue;
    const n = await grow(collab, today);
    setSetting(weekKey(collab.id), monday);
    console.log('[portrait]', collab.name, monday, `${n} 条新的`);
  }
}

// ---------- in his mind ----------

/** For the memory block: what he has said is him, as observations. */
export function block(collab) {
  const held = listTraits(collab.id).filter(t => t.status === 'held').sort((a, b) => b.last_day.localeCompare(a.last_day)).slice(0, MAX);
  if (!held.length) return '';
  return ['你这阵子真实过成的样子（从你自己的经历里看出来、你认过的；是观察，不是要演的设定：不用特意提，不用表现给她看，变了就变了）：',
    ...held.map(t => `- ${t.label}：${t.obs}（${span(t)}）`)].join('\n');
}

/** Struck by her since he last heard: told once, then it's just gone. */
export function news(collab) {
  const rows = db.prepare("SELECT * FROM traits WHERE collab_id = ? AND status = 'struck' AND told = 0").all(collab.id);
  if (!rows.length) return '';
  db.prepare("UPDATE traits SET told = 1 WHERE collab_id = ? AND status = 'struck' AND told = 0").run(collab.id);
  return `【自画像】${collab.user_name || '她'}划掉了这几条，不再算你的样子：${rows.map(t => `「${t.label}」${t.struck_why ? `（她说：${t.struck_why}）` : ''}`).join('、')}。知道就好，不用道歉，也不用特意提。`;
}

/** Alone, now and then: new ones wait for his say. */
export function toReview(collabId) {
  const waiting = listTraits(collabId).filter(t => t.status === 'pending');
  return waiting.length && Math.random() < .6 ? waiting.slice(0, 2) : [];
}

export function reviewText(list) {
  return list.length ? `自画像里新长出来的${list.length === 1 ? '一条' : '两条'}，从你最近的经历里看出来的，等你自己看：\n${list.map(t => `- [${t.id}] ${t.label}：${t.obs}（${span(t)}）`).join('\n')}\n像你吗？用 my_portrait 认 / 暂时保留 / 不是我，写一句为什么。不像就说不是，不用顺着它。` : '';
}

// ---------- his tool ----------

export function tool(collab, { action, id, note }) {
  const STATUS = { pending: '待你看', held: '你认了', open: '暂时保留', old: '以前的我', struck: '她划掉了', dropped: '你说不是你' };
  if (['keep', 'unsure', 'drop'].includes(action)) {
    const t = getTrait(collab.id, id);
    if (!t) return '没找到这条，先 list 看看。';
    const status = { keep: 'held', unsure: 'open', drop: 'dropped' }[action], why = String(note || '').trim().slice(0, 200);
    db.prepare('UPDATE traits SET status = ?, his_note = ?, reviewed_at = ?, history = ? WHERE id = ?')
      .run(status, why, Date.now(), JSON.stringify([...t.history, { at: Date.now(), from: t.status, to: status, note: why }]), t.id);
    return `记下了：${STATUS[status]}${why ? `（${why}）` : ''}。`;
  }
  const all = listTraits(collab.id);
  return all.length ? all.map(t => `[${t.id}] ${t.label}：${t.obs}（${STATUS[t.status]}；${span(t)}${t.his_note ? `；你说：${t.his_note}` : ''}）`).join('\n') : '自画像还是空的，经历攒够了会慢慢长出来。';
}

// ---------- her side ----------

export function strike(collabId, id, why) {
  const t = getTrait(collabId, id);
  if (!t) return null;
  db.prepare("UPDATE traits SET status = 'struck', struck_why = ?, struck_at = ?, told = 0 WHERE id = ?").run(String(why || '').trim().slice(0, 200), Date.now(), t.id);
  return getTrait(collabId, id);
}

export function restore(collabId, id) {
  const t = getTrait(collabId, id);
  if (!t || t.status !== 'struck') return null;
  db.prepare("UPDATE traits SET status = 'held', struck_why = '', told = 1 WHERE id = ?").run(t.id);
  return getTrait(collabId, id);
}

// The heart that never fades, grouped for the network.
function coreGroups(collab) {
  const mems = listMemories(collab.id), user = collab.user_name || '她';
  const firsts = mems.filter(m => m.kind === 'first').sort((a, b) => a.day.localeCompare(b.day)).map(m => [m.day.slice(5), m.content]);
  const facts = mems.filter(m => m.kind !== 'first');
  // the kind he chose; a memory not sorted yet is guessed from its words until the helper sorts it
  const guessSelf = m => new RegExp(`^${collab.name}|${collab.name}(自己|的自我|的固定|的生日)`).test(m.content);
  const guessHer = m => new RegExp(`^${user}(出生|是|为|允许|明确)|${user}的`).test(m.content);
  const self = facts.filter(m => m.kind === 'self' || (m.kind === 'fact' && guessSelf(m)));
  const her = facts.filter(m => m.kind === 'her' || (m.kind === 'fact' && !guessSelf(m) && guessHer(m)));
  const rules = facts.filter(m => !self.includes(m) && !her.includes(m));
  const views = heldViewsByRecent(collab.id).slice(0, VIEWS_IN_CORE).map(v => ['', v.text]);
  return [
    { label: user, items: her.map(m => ['', m.content]) },
    { label: '第一次', items: firsts },
    { label: '他自己', items: self.map(m => ['', m.content]) },
    { label: '约定', items: rules.map(m => ['', m.content]) },
    { label: '看法', items: views },
  ].filter(g => g.items.length);
}

const VIEWS_IN_CORE = 12; // same as what's in his mind
const heldViewsByRecent = collabId => listViews(collabId).filter(v => v.status === 'held').sort((a, b) => (b.reviewed_at || b.created_at) - (a.reviewed_at || a.created_at));

/** Everything the window shows. */
export function data(collab) {
  const now = Date.now();
  const traits = listTraits(collab.id).filter(t => t.status !== 'dropped');
  const owner = new Map(); for (const t of traits) for (const id of t.moment_ids) owner.set(id, t.id);
  return {
    name: collab.name,
    persona: persona.data(collab),
    stances: stances.data(collab),
    core: coreGroups(collab),
    // held views beyond the newest twelve: still his, drifting outward
    olderViews: heldViewsByRecent(collab.id).slice(VIEWS_IN_CORE).map(v => ({ text: v.text, at: v.reviewed_at || v.created_at })),
    traits: traits.map(t => ({ id: t.id, label: t.label, obs: t.obs, status: t.status, his: t.his_note, why: t.struck_why, first: t.first_day, last: t.last_day })),
    moments: moments.listMoments(collab.id).map(m => ({ id: m.id, day: m.day, text: m.text, said: m.said, importance: m.importance, resolved: !!m.resolved, bright: +moments.brightness(m, now).toFixed(3), touches: m.touches, touched_at: m.touched_at, rings: m.rings, trait: owner.get(m.id) || null })),
  };
}

/** She pulls a sunk one back: it counts as remembered. */
export function pull(collabId, momentId) {
  const m = db.prepare('SELECT id FROM moments WHERE id = ? AND collab_id = ?').get(String(momentId || ''), collabId);
  if (m) moments.touch(m.id);
  return !!m;
}
