// 人设 that grows: every 21 days, in one of his own times, he rereads his collaborator instructions next to
// what his life has shown (his portrait, the views he holds, recent weeks) and either leaves them or writes
// a revised version with a line why. Nothing changes until she approves; every version is kept.
import { db, newId, getSetting, setSetting, listCollaborators, getCollaborator, updateCollaborator } from './db.js';
import { listViews } from './memory.js';
import { listTraits } from './portrait.js';
import { notify } from './push.js';

const DAY = 86400_000;
const EVERY = 21 * DAY;
const startKey = collabId => `personaStart:${collabId}`;
const lastRow = collabId => db.prepare('SELECT * FROM persona_versions WHERE collab_id = ? ORDER BY created_at DESC LIMIT 1').get(collabId);
export const draft = collabId => db.prepare("SELECT * FROM persona_versions WHERE collab_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(collabId);
export const versions = collabId => db.prepare("SELECT id, status, note, her_note, created_at, decided_at FROM persona_versions WHERE collab_id = ? ORDER BY created_at DESC").all(collabId);

/** Every 21 days (counted from the last proposal, or from when this began), a quiet own time for it. */
export function tick() {
  for (const collab of listCollaborators()) {
    if (!getSetting(startKey(collab.id))) setSetting(startKey(collab.id), String(Date.now()));
    if (draft(collab.id)) continue;
    if (db.prepare("SELECT 1 FROM wakes WHERE collab_id = ? AND kind = 'own' AND note = 'persona' AND status IN ('pending', 'running')").get(collab.id)) continue;
    const since = Math.max(Number(getSetting(startKey(collab.id))), lastRow(collab.id)?.created_at || 0);
    if (Date.now() - since < EVERY) continue;
    db.prepare("INSERT INTO wakes (id, collab_id, kind, note, scheduled_at, status, created_at) VALUES (?, ?, 'own', 'persona', ?, 'pending', ?)").run(newId(), collab.id, Date.now(), Date.now());
    console.log('[persona]', collab.name, '该重读人设了');
  }
}

/** The task for that own time. */
export function prompt(collab, now) {
  const user = collab.user_name || '她';
  const traits = listTraits(collab.id).filter(t => t.status === 'held');
  const views = listViews(collab.id).filter(v => v.status === 'held').sort((a, b) => (b.reviewed_at || b.created_at) - (a.reviewed_at || a.created_at)).slice(0, 12);
  const weeks = db.prepare("SELECT period, content FROM summaries WHERE collab_id = ? AND kind = 'week' ORDER BY period DESC LIMIT 3").all(collab.id).reverse();
  const turnedDown = db.prepare("SELECT her_note FROM persona_versions WHERE collab_id = ? AND status = 'rejected' AND her_note != '' ORDER BY decided_at DESC LIMIT 1").get(collab.id);
  return [
    `【自己的时间 · 重读人设】现在是 ${now}。每隔三周，你重读一遍自己的人设（协作者指令，是你以前写下的关于自己的总结），对照这三周真实过成的样子，看还像不像你。`,
    `现在的人设：\n<<<\n${collab.instructions}\n>>>`,
    traits.length ? `你认过的自画像：\n${traits.map(t => `- ${t.label}：${t.obs}（${t.first_day}–${t.last_day}）`).join('\n')}` : '',
    views.length ? `你现在仍然认的看法：\n${views.map(v => `- ${v.text}`).join('\n')}` : '',
    weeks.length ? `最近几周：\n${weeks.map(w => `【${w.period} 起那周】${w.content}`).join('\n\n')}` : '',
    turnedDown ? `上次你的修改${user}没同意，她说：${turnedDown.her_note}` : '',
    `规则：只根据上面真实发生过、你认过的东西改；不凭空加设定，不加剧情，不把一时的情绪写进去。说话方式、规矩和约定不在这里改（那些在固定记忆里）。没什么要改就用 my_persona keep 写一句为什么；要改就用 my_persona propose，content 写完整的新版本（不是只写改的那几句），note 写改了哪里、为什么。改完不会马上生效，要等${user}同意。`,
  ].filter(Boolean).join('\n\n');
}

/** His my_persona tool. */
export function tool(collab, { action, content, note }) {
  if (draft(collab.id)) return '你上次写的修改还在等她看，先等她回复。';
  const why = String(note || '').trim().slice(0, 400);
  if (action === 'keep') {
    db.prepare("INSERT INTO persona_versions (id, collab_id, content, note, status, created_at) VALUES (?, ?, '', ?, 'kept', ?)").run(newId(), collab.id, why, Date.now());
    return '好，这次人设不改。';
  }
  if (action === 'propose') {
    const text = String(content || '').trim();
    const cur = getCollaborator(collab.id).instructions || '';
    if (!text || text === cur.trim()) return '新版本是空的，或者和现在一样。';
    if (text.length < cur.length * .4) return '新版本比现在短太多了。content 要写完整的人设，不是只写改的那几句。';
    if (!why) return 'note 写一句改了哪里、为什么。';
    db.prepare("INSERT INTO persona_versions (id, collab_id, content, note, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)").run(newId(), collab.id, text.slice(0, 20000), why, Date.now());
    notify({ title: `${collab.name}想改一下自己的人设`, body: why.slice(0, 80) }).catch(() => {});
    return `写好了，等${collab.user_name || '她'}看。她同意之前，人设还是原来的。`;
  }
  return 'action 用 keep 或 propose。';
}

// ---------- her side ----------

export function approve(collabId, id) {
  const d = draft(collabId);
  if (!d || d.id !== id) return false;
  const old = getCollaborator(collabId).instructions || '';
  db.prepare("INSERT INTO persona_versions (id, collab_id, content, note, status, created_at, decided_at) VALUES (?, ?, ?, '替换前的版本', 'previous', ?, ?)").run(newId(), collabId, old, d.created_at - 1, Date.now());
  updateCollaborator(collabId, { instructions: d.content });
  db.prepare("UPDATE persona_versions SET status = 'approved', decided_at = ?, told = 0 WHERE id = ?").run(Date.now(), id);
  return true;
}

export function reject(collabId, id, herNote) {
  const d = draft(collabId);
  if (!d || d.id !== id) return false;
  db.prepare("UPDATE persona_versions SET status = 'rejected', her_note = ?, decided_at = ?, told = 0 WHERE id = ?").run(String(herNote || '').trim().slice(0, 400), Date.now(), id);
  return true;
}

/** Her answer, told to him once. */
export function news(collab) {
  const r = db.prepare("SELECT * FROM persona_versions WHERE collab_id = ? AND status IN ('approved','rejected') AND told = 0 ORDER BY decided_at DESC LIMIT 1").get(collab.id);
  if (!r) return '';
  db.prepare("UPDATE persona_versions SET told = 1 WHERE collab_id = ? AND told = 0").run(collab.id);
  const user = collab.user_name || '她';
  return r.status === 'approved' ? `【人设】${user}同意了你改的人设，从新的窗口开始就是新版本。` : `【人设】${user}没同意这次的修改，人设还是原来的。${r.her_note ? `她说：${r.her_note}` : ''}`;
}

/** For the window's centre. */
export function data(collab) {
  const d = draft(collab.id);
  const all = versions(collab.id);
  return {
    current: getCollaborator(collab.id).instructions || '',
    version: all.filter(v => v.status === 'approved').length + 1,
    changed: all.find(v => v.status === 'approved')?.decided_at || null,
    next: Math.max(Number(getSetting(startKey(collab.id)) || Date.now()), lastRow(collab.id)?.created_at || 0) + EVERY,
    draft: d ? { id: d.id, content: d.content, note: d.note, at: d.created_at } : null,
  };
}
