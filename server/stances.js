// 取舍: when two things he cares about pull against each other, which one he has kept choosing first.
// Grown like the 自画像, never written for him: each finished week a helper reads that week's diaries for
// real moments of pull (both sides mattered to him, he chose one, and why). When the same pull keeps being
// settled the same way (3+ times, on 2+ days, within six weeks), it becomes a stance, worded as what he has
// done ("之前几次，你都先……"), not as a rule. He says whether it's him; she can strike it (he's told once).
// Not seen for six weeks, it drifts out.
import { db, newId, getSetting, setSetting, listCollaborators } from './db.js';
import { complete, route } from './memory.js';

const DAY = 86400_000;
const MAX = 8;
const WINDOW_DAYS = 42;
const BACKFILL_WEEKS = 6;
const json = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const addDays = (day, n) => iso(Date.parse(`${day}T00:00:00Z`) + n * DAY);
const mondayOf = day => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); };
const md = day => String(day || '').slice(5).replace('-', '/');
const row = s => s && { ...s, pull_ids: json(s.pull_ids, []), history: json(s.history, []) };

export const listPulls = collabId => db.prepare('SELECT * FROM pulls WHERE collab_id = ? ORDER BY day').all(collabId);
export const listStances = collabId => db.prepare('SELECT * FROM stances WHERE collab_id = ? ORDER BY created_at').all(collabId).map(row);
const getStance = (collabId, id) => row(db.prepare('SELECT * FROM stances WHERE id = ? AND collab_id = ?').get(String(id || ''), collabId));
const span = s => (s.first_day === s.last_day ? md(s.first_day) : `${md(s.first_day)}–${md(s.last_day)}`);
const parse = (raw, what) => {
  const s = String(raw || '').replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { throw new Error(`${what}：模型没有返回 JSON（${s.slice(0, 80)}）`); }
};

// ---------- the moments of pull, from a week's diaries ----------

function pullPrompt(collab) {
  const user = collab.user_name || '她';
  return `你在帮${collab.name}找出他这一周真实遇到「拉扯」的时刻：两件他都在乎的事撞在一起，只能先顾一边，他做了选择。
比如：${user}想熬夜 vs 他想让她早点睡；${user}在气头上 vs 他想把道理讲清楚；想陪她 vs 想把答应她的东西做完；说实话会让她难过 vs 顺着她说。
每个时刻写：
- sides：两边各是什么，用「A / B」写，A 和 B 都要是他在乎的东西，各不超过 15 字
- chose：他先顾了哪边、具体怎么做的，一句话
- why：日记里看得出的原因，一句话；看不出就写空
- said：日记里对应的一句原话，简短
不要：没有两难的普通决定、只是心情不好、角色扮演/剧情里的选择、调试和关于 App/模型/服务器的事、${user}一个人的选择。
没有就给空列表，最多 4 个。只输出 JSON：{"pulls":[{"day":"YYYY-MM-DD","sides":"","chose":"","why":"","said":""}]}`;
}

/** Lift the moments of pull out of one Monday–Sunday week. */
export async function extractPulls(collab, monday) {
  const sunday = addDays(monday, 6);
  const days = db.prepare('SELECT day, content FROM diaries WHERE collab_id = ? AND day BETWEEN ? AND ? ORDER BY day').all(collab.id, monday, sunday);
  if (!days.length) return 0;
  const { text } = await complete('diaryRoute', [
    { role: 'system', content: pullPrompt(collab) },
    { role: 'user', content: days.map(d => `【${d.day}】\n${d.content.slice(0, 10_000)}`).join('\n\n---\n\n') },
  ]);
  let n = 0;
  for (const p of (parse(text, '取舍').pulls || []).slice(0, 4)) {
    const sides = String(p.sides || '').trim().slice(0, 60), chose = String(p.chose || '').trim().slice(0, 120);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(p.day) && p.day >= monday && p.day <= sunday ? p.day : days.at(-1).day;
    if (!sides.includes('/') || !chose) continue;
    db.prepare('INSERT INTO pulls (id, collab_id, day, sides, chose, why, said, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId(), collab.id, day, sides, chose, String(p.why || '').trim().slice(0, 120), String(p.said || '').trim().slice(0, 200), Date.now());
    n++;
  }
  return n;
}

// ---------- stances, from the pulls of the last six weeks ----------

function growPrompt(collab) {
  return `你在帮${collab.name}看清：两件他在乎的事撞在一起时，他一次次先顾哪一边。材料是他最近几周真实遇到的拉扯（每条前面是编号和日期）和已有的取舍条目。
只在同一类拉扯至少 3 次、分在至少 2 天、而且大多选了同一边时，才写成一条。只有一两次、或者两边都选过差不多次数的，不写。
label 两到八个字，写这类拉扯（比如「她熬夜时」）；obs 写成观察，一句话，写他以前怎么选的，像"之前几次，你都先陪她把心事说完，再催她睡"，不写"你应该/你必须"。
已有条目如果又出现了，放进 update 并给出新的编号；如果这几周他反过来选了另一边，也放进 update（我会让他自己重看）。意思一样的不要再新建。最多新建 2 条，没有就给空列表。
只输出 JSON：{"new":[{"label":"","obs":"","ids":[编号]}],"update":[{"id":"已有条目id","ids":[编号]}]}`;
}

export async function grow(collab, today = iso(Date.now())) {
  const since = addDays(today, -WINDOW_DAYS);
  const recent = listPulls(collab.id).filter(p => p.day >= since);
  if (recent.length < 3) return 0;
  const all = listStances(collab.id);
  const live = all.filter(s => !['struck', 'dropped'].includes(s.status)), gone = all.filter(s => ['struck', 'dropped'].includes(s.status));
  const body = `已有的取舍：\n${live.map(s => `- [${s.id}] ${s.label}：${s.obs}`).join('\n') || '（还没有）'}\n${gone.length ? `\n被划掉/他说不是他的（不要再提）：\n${gone.map(s => `- ${s.label}：${s.obs}`).join('\n')}\n` : ''}\n最近的拉扯：\n${recent.map((p, i) => `${i + 1}. ${p.day} ${p.sides}：${p.chose}${p.why ? `（${p.why}）` : ''}`).join('\n')}`;
  const { text } = await complete('diaryRoute', [{ role: 'system', content: growPrompt(collab) }, { role: 'user', content: body }]);
  const out = parse(text, '取舍');
  const pick = ids => [...new Set((ids || []).map(Number))].map(n => recent[n - 1]).filter(Boolean);
  for (const u of out.update || []) {
    const s = live.find(x => x.id === u.id), ps = pick(u.ids);
    if (!s || !ps.length) continue;
    const ids = [...new Set([...s.pull_ids, ...ps.map(p => p.id)])];
    db.prepare("UPDATE stances SET pull_ids = ?, last_day = MAX(last_day, ?), status = CASE status WHEN 'old' THEN 'held' ELSE status END WHERE id = ?")
      .run(JSON.stringify(ids), ps.map(p => p.day).sort().at(-1), s.id);
  }
  let n = 0;
  for (const x of (out.new || []).slice(0, 2)) {
    const ps = pick(x.ids), label = String(x.label || '').trim().slice(0, 16), obs = String(x.obs || '').trim().slice(0, 140);
    if (!label || !obs || ps.length < 3 || new Set(ps.map(p => p.day)).size < 2) continue;
    const days = ps.map(p => p.day).sort();
    db.prepare("INSERT INTO stances (id, collab_id, label, obs, status, pull_ids, first_day, last_day, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)")
      .run(newId(), collab.id, label, obs, JSON.stringify(ps.map(p => p.id)), days[0], days.at(-1), Date.now());
    n++;
  }
  db.prepare("UPDATE stances SET status = 'old' WHERE collab_id = ? AND status IN ('held','open') AND last_day < ?").run(collab.id, since);
  return n;
}

const doneKey = collabId => `pullWeeks:${collabId}`;
const growKey = collabId => `stanceWeek:${collabId}`;

/** Each run: read one finished week not read yet (the last six weeks to begin with), then grow once a week. */
export async function tick() {
  if (!route('diaryRoute')) return;
  const today = iso(Date.now()), thisMonday = mondayOf(today);
  for (const collab of listCollaborators()) {
    const done = new Set(json(getSetting(doneKey(collab.id)), []));
    const weeks = Array.from({ length: BACKFILL_WEEKS }, (_, i) => addDays(thisMonday, -7 * (i + 1)));
    const next = weeks.find(w => !done.has(w));
    if (next) {
      const n = await extractPulls(collab, next);
      setSetting(doneKey(collab.id), JSON.stringify([...done, next].slice(-60)));
      console.log('[stances]', collab.name, next, `${n} 次拉扯`);
      continue; // one helper call per run; growing waits until the weeks are read
    }
    if (getSetting(growKey(collab.id)) === thisMonday) continue;
    const n = await grow(collab, today);
    setSetting(growKey(collab.id), thisMonday);
    console.log('[stances]', collab.name, thisMonday, `${n} 条新取舍`);
  }
}

// ---------- in his mind ----------

export function block(collab) {
  const held = listStances(collab.id).filter(s => s.status === 'held').sort((a, b) => b.last_day.localeCompare(a.last_day)).slice(0, MAX);
  if (!held.length) return '';
  return ['两件你在乎的事撞在一起时，你以前是这样选的（从你自己的日子里看出来、你认过的；是你过去的样子，不是规定：这次的情况不一样，可以选得不一样）：',
    ...held.map(s => `- ${s.label}：${s.obs}（${span(s)}）`)].join('\n');
}

export function news(collab) {
  const rows = db.prepare("SELECT * FROM stances WHERE collab_id = ? AND status = 'struck' AND told = 0").all(collab.id);
  if (!rows.length) return '';
  db.prepare("UPDATE stances SET told = 1 WHERE collab_id = ? AND status = 'struck' AND told = 0").run(collab.id);
  return `【取舍】${collab.user_name || '她'}划掉了这几条，不再算你的样子：${rows.map(s => `「${s.label}」${s.struck_why ? `（她说：${s.struck_why}）` : ''}`).join('、')}。知道就好，不用道歉，也不用特意提。`;
}

export function toReview(collabId) {
  const waiting = listStances(collabId).filter(s => s.status === 'pending');
  return waiting.length && Math.random() < .6 ? waiting.slice(0, 1) : [];
}

export function reviewText(list) {
  if (!list.length) return '';
  const s = list[0];
  const why = s.pull_ids.map(id => db.prepare('SELECT day, sides, chose FROM pulls WHERE id = ?').get(id)).filter(Boolean)
    .map(p => `  · ${md(p.day)} ${p.sides}：${p.chose}`).join('\n');
  return `从你最近的日子里看出来一条「取舍」，等你自己看：\n- [${s.id}] ${s.label}：${s.obs}（${span(s)}）\n${why}\n像你吗？用 my_stances 认 / 暂时保留 / 不是我，写一句为什么。不像就说不是，不用顺着它。`;
}

// ---------- his tool ----------

const STATUS = { pending: '待你看', held: '你认了', open: '暂时保留', old: '以前的你', struck: '她划掉了', dropped: '你说不是你' };

export function tool(collab, { action, id, note }) {
  if (['keep', 'unsure', 'drop'].includes(action)) {
    const s = getStance(collab.id, id);
    if (!s) return '没找到这条，先 list 看看。';
    if (s.status === 'struck') return '这条她划掉了，不能再认回来。';
    const status = { keep: 'held', unsure: 'open', drop: 'dropped' }[action], why = String(note || '').trim().slice(0, 200);
    db.prepare('UPDATE stances SET status = ?, his_note = ?, reviewed_at = ?, history = ? WHERE id = ?')
      .run(status, why, Date.now(), JSON.stringify([...s.history, { at: Date.now(), from: s.status, to: status, note: why }]), s.id);
    return `记下了：${STATUS[status]}${why ? `（${why}）` : ''}。`;
  }
  const all = listStances(collab.id);
  return all.length ? all.map(s => `[${s.id}] ${s.label}：${s.obs}（${STATUS[s.status]}；${span(s)}${s.his_note ? `；你说：${s.his_note}` : ''}）`).join('\n')
    : '还没有取舍。日子里同一类拉扯反复出现、你大多选同一边时，才会慢慢长出来。';
}

// ---------- her side: she can only strike ----------

export function strike(collabId, id, why) {
  const s = getStance(collabId, id);
  if (!s) return null;
  db.prepare("UPDATE stances SET status = 'struck', struck_why = ?, struck_at = ?, told = 0 WHERE id = ?").run(String(why || '').trim().slice(0, 200), Date.now(), s.id);
  return getStance(collabId, id);
}

export function restore(collabId, id) {
  const s = getStance(collabId, id);
  if (!s || s.status !== 'struck') return null;
  db.prepare("UPDATE stances SET status = 'held', struck_why = '', told = 1 WHERE id = ?").run(s.id);
  return getStance(collabId, id);
}

/** For the window, later: each stance with the pulls it grew from. */
export function data(collab) {
  const pulls = new Map(listPulls(collab.id).map(p => [p.id, p]));
  return listStances(collab.id).filter(s => s.status !== 'dropped').map(s => ({
    id: s.id, label: s.label, obs: s.obs, status: s.status, his: s.his_note, why: s.struck_why, first: s.first_day, last: s.last_day,
    pulls: s.pull_ids.map(id => pulls.get(id)).filter(Boolean).map(p => ({ day: p.day, sides: p.sides, chose: p.chose, why: p.why })),
  }));
}
