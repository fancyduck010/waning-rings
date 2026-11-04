// "原话召回": when what's being said now resembles something said long ago, surface that old
// exchange (the original words, not a summary) alongside this turn. Few and precise:
// small talk doesn't trigger it, at most two exchanges per turn, nothing the collaborator can
// already see in the current window, and nothing that surfaced in the last few hours.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, getSettings, UPLOAD_DIR } from './db.js';
import { embed, complete, route } from './memory.js';
import { stripStickers, cosine } from './stickers.js';
import * as moments from './moments.js';

const MIN_QUERY_CHARS = 6;
const MIN_INDEX_CHARS = 6;
const COOLDOWN_MS = 6 * 3600_000;
const BATCH = 10;
const META_TALK = /token|预设|世界书|提示词|prompt|mcp|codex|额度|中转|线路|部署|服务器|vps|前端|后端|bb机|aru|代码|模型|换窗|上下文/i;
const SMALL_TALK = /^(嗯+|哦+|啊+|好+|好的|行|ok|okay|哈+|嘿+|在吗|晚安|早安?|早上好|你好|么么|亲亲|抱抱|嗯嗯|知道了|收到)[!！。~～?？\s]*$/i;

const json = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };

// In-memory copy of the vectors, per collaborator: id -> { vec, created_at, conv_id }.
const cache = new Map();

function vectorsFor(collabId) {
  let c = cache.get(collabId);
  if (!c) {
    c = new Map();
    for (const r of db.prepare(`SELECT e.message_id, e.vec, m.created_at, m.conv_id FROM embeddings e JOIN messages m ON m.id = e.message_id WHERE e.collab_id = ?`).all(collabId)) {
      c.set(r.message_id, { vec: new Float32Array(r.vec.buffer, r.vec.byteOffset, r.vec.byteLength / 4), created_at: r.created_at, conv_id: r.conv_id });
    }
    cache.set(collabId, c);
  }
  return c;
}

// ---------- pictures ----------
// A picture is only seen in the turn it was sent; afterwards the chat just says "附图". So a vision
// model writes a line about each one, and that line travels wherever the message's words do
// (this index, chat_search, the history carried into a new window).

const CAPTION_PROMPT = who => `这是${who}在聊天里发的一张图片。用一两句中文（80 字以内）写清图里有什么：人、物、地方、在做什么，图里的文字或截图的要点。只写看得到的，不猜不评价，只写这几句。`;
const PICS_SQL = `(SELECT group_concat(a.caption, ' / ') FROM attachments a WHERE a.message_id = m.id AND a.kind = 'image' AND a.caption NOT IN ('', '-'))`;

/** "［图：…］" for each described picture of a message. */
export function picturesText(attachments = []) {
  return attachments.filter(a => a.kind === 'image' && a.caption && a.caption !== '-').map(a => `［图：${a.caption}］`).join('');
}

const picsOf = pics => (pics ? pics.split(' / ').map(c => `［图：${c}］`).join('') : '');

/** Describe a few undescribed chat pictures (needs a vision route), newest first. */
export async function captionTick() {
  if (!getSettings().visionRoute) return 0;
  const todo = db.prepare(`SELECT a.id, a.file, a.mime, a.message_id, m.role FROM attachments a JOIN messages m ON m.id = a.message_id
    WHERE a.kind = 'image' AND a.caption = '' ORDER BY a.created_at DESC LIMIT 6`).all();
  let done = 0;
  for (const a of todo) {
    let url;
    try {
      const ext = a.file.split('.').pop().toLowerCase();
      url = `data:${a.mime || `image/${ext === 'jpg' ? 'jpeg' : ext}`};base64,${readFileSync(join(UPLOAD_DIR, a.file)).toString('base64')}`;
    } catch {
      db.prepare("UPDATE attachments SET caption = '-' WHERE id = ?").run(a.id);
      continue;
    }
    let caption;
    try {
      const { text } = await complete('visionRoute', [{ role: 'user', content: [
        { type: 'text', text: CAPTION_PROMPT(a.role === 'user' ? '她' : '他') },
        { type: 'image_url', image_url: { url } },
      ] }], { max_tokens: 300 });
      caption = text.replace(/<[｜|][^>]*[｜|]>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160) || '-';
    } catch (err) {
      console.error('[recall] caption', a.file, err.message);
      // A picture the model refuses stays refused; anything else (network, quota) is tried again later.
      if (!/\b4\d\d\b/.test(err.message)) break;
      caption = '-';
    }
    db.prepare('UPDATE attachments SET caption = ? WHERE id = ?').run(caption, a.id);
    // Index the message again, now with what's in the picture.
    db.prepare('DELETE FROM embeddings WHERE message_id = ?').run(a.message_id);
    for (const c of cache.values()) c.delete(a.message_id);
    done += 1;
  }
  return done;
}

/** Embed messages that aren't indexed yet (a few batches per run). */
export async function indexTick() {
  if (!getSettings().embeddingRoute) return 0;
  const rows = db.prepare(`
    SELECT m.id, m.content, m.created_at, m.conv_id, c.collaborator_id, c.settings, ${PICS_SQL} AS pics FROM messages m
    JOIN conversations c ON c.id = m.conv_id
    LEFT JOIN embeddings e ON e.message_id = m.id
    WHERE e.message_id IS NULL AND m.role IN ('user', 'assistant') AND m.pending = 0
      AND (LENGTH(m.content) >= ${MIN_INDEX_CHARS} OR ${PICS_SQL} IS NOT NULL) AND c.settings NOT LIKE '%"memory":false%'
    ORDER BY m.created_at DESC LIMIT 600`).all()
    .map(r => ({ ...r, text: `${stripStickers(r.content)}${picsOf(r.pics)}` }))
    .filter(r => json(r.settings, {}).memory !== false && r.text.length >= MIN_INDEX_CHARS)
    .slice(0, BATCH * 20);
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vecs = await embed(batch.map(r => r.text.slice(0, 2000)));
    const insert = db.prepare('INSERT OR REPLACE INTO embeddings (message_id, collab_id, vec, created_at) VALUES (?, ?, ?, ?)');
    batch.forEach((r, j) => {
      const f32 = Float32Array.from(vecs[j]);
      insert.run(r.id, r.collaborator_id, Buffer.from(f32.buffer), Date.now());
      cache.get(r.collaborator_id)?.set(r.id, { vec: f32, created_at: r.created_at, conv_id: r.conv_id });
    });
    done += batch.length;
  }
  return done;
}

function fmtDay(ts, timezone) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(ts));
}

/** The old message plus its neighbour, so the memory reads as an exchange. */
function exchangeAround(msgId, collab, timezone) {
  const m = db.prepare('SELECT id, conv_id, seq, role, content, created_at FROM messages WHERE id = ?').get(msgId);
  if (!m) return null;
  const near = db.prepare(`SELECT m.role, m.content, ${PICS_SQL} AS pics FROM messages m WHERE m.conv_id = ? AND m.seq BETWEEN ? AND ? AND m.role IN ('user','assistant') ORDER BY m.seq`)
    .all(m.conv_id, m.seq - (m.role === 'assistant' ? 1 : 0), m.seq + (m.role === 'user' ? 1 : 0));
  const who = r => (r.role === 'user' ? (collab.user_name || '用户') : '你');
  return `[${fmtDay(m.created_at, timezone)}] ${near.map(r => `${who(r)}：${stripStickers(r.content).slice(0, 300)}${picsOf(r.pics)}`).join(' / ')}`;
}

/**
 * Old exchanges worth remembering for this turn. Returns { text, seen } where `seen` is the
 * updated cooldown map to store on the conversation. `vec` is the query's embedding if the caller already has it.
 */
export async function recallFor(collab, conv, queryText, seen = {}, vec = null) {
  const settings = getSettings();
  const query = stripStickers(queryText || '');
  if (!settings.embeddingRoute || query.length < MIN_QUERY_CHARS || SMALL_TALK.test(query)) return { text: '', seen };
  const vectors = vectorsFor(collab.id);
  if (!vectors.size) return { text: '', seen };

  let qv = vec;
  if (!qv) {
    try { qv = Float32Array.from((await embed([query.slice(-1500)]))[0]); } catch (err) { console.error('[recall]', err.message); return { text: '', seen }; }
  }
  const threshold = Number(settings.recallThreshold) || 0.55;
  const visibleSince = conv.runtime.threadStartedAt || 0;
  const now = Date.now();
  const fresh = Object.fromEntries(Object.entries(seen).filter(([, t]) => now - t < COOLDOWN_MS));
  // She's asking him to remember, or naming a time: look wider, the judge keeps it honest.
  const asking = ASKING.test(query);
  const window = timeWindow(query, settings.timezone);
  const judging = !!settings.judgeRoute;
  const floor = threshold - (asking || window ? 0.12 : judging ? 0.05 : 0);

  // Conversations switched out of memory don't surface, even if they were indexed before.
  const excluded = new Set(db.prepare(`SELECT id FROM conversations WHERE settings LIKE '%"memory":false%'`).all().map(r => r.id));
  const scored = [];
  for (const [id, v] of vectors) {
    if (excluded.has(v.conv_id)) continue;
    if (v.conv_id === conv.id && v.created_at >= visibleSince) continue; // already in front of them
    if (fresh[id]) continue;
    const s = cosine(qv, v.vec);
    if (s >= floor) scored.push({ id, s, day: window && dayOf(v.created_at, settings.timezone) });
  }
  scored.sort((a, b) => b.s - a.s);
  // Only that stretch of time when she named one — unless nothing from then comes close.
  const inWindow = window ? scored.filter(p => p.day >= window.from && p.day <= window.to) : [];
  const pool = inWindow.length ? inWindow : scored.filter(p => p.s >= threshold - (asking ? 0.12 : judging ? 0.05 : 0));
  // Old talk about the app itself (tokens, presets, servers…) pulls the conversation into
  // explaining machinery; remember their life together instead.
  const contentOf = db.prepare('SELECT content FROM messages WHERE id = ?');
  const lifeOnly = pool.slice(0, 12).filter(p => !META_TALK.test(contentOf.get(p.id)?.content || ''));
  // 经历 he no longer has in mind, brought back by what's being said
  const lived = moments.similar(collab.id, qv, floor, new Set(Object.keys(fresh)))
    .map(x => ({ mid: x.m.id, s: x.s, text: `[${x.m.day} 那天的事] ${moments.momentLine(x.m)}` }));
  if (!lifeOnly.length && !lived.length) return { text: '', seen: fresh };

  let picks;
  let unsure = false;
  if (judging) {
    const seenText = new Set();
    const candidates = lifeOnly.slice(0, 8).map(p => ({ ...p, text: exchangeAround(p.id, collab, settings.timezone) }))
      .filter(p => p.text && !seenText.has(p.text) && seenText.add(p.text)).slice(0, lived.length ? 5 : 6).concat(lived.slice(0, 2));
    const kept = await judge(collab, conv, query, candidates);
    if (kept) {
      picks = kept;
      // Asked "还记得吗" and nothing passed: hand over the closest one, marked as maybe.
      if (!picks.length && asking) { picks = candidates.slice(0, 1); unsure = true; }
    }
  }
  // No judge (or it failed): the old rule — the closest one, two if the second is clearly close too.
  if (!picks) {
    const sure = [...lifeOnly, ...lived].filter(p => p.s >= threshold || (inWindow.length && !p.mid)).sort((a, b) => b.s - a.s);
    picks = sure.slice(0, sure[1]?.s >= threshold + 0.12 ? 2 : 1);
  }
  if (!picks.length) return { text: '', seen: fresh };

  // Two neighbouring messages make the same exchange: say it once.
  const lines = [...new Set(picks.map(p => p.text || exchangeAround(p.id, collab, settings.timezone)).filter(Boolean))];
  for (const p of picks) fresh[p.mid || p.id] = now;
  for (const p of picks) if (p.mid) moments.touch(p.mid);
  return {
    text: `【你记得的旧事｜跟现在的话有关的从前，你本来就记得。用得上就像人那样顺口带一句（"你不是说过……"），别说"我想起来了""我翻了一下""根据记录"，别复述原话；用不上就当没看见】\n${lines.join('\n')}${unsure ? '\n（这条不一定就是她说的那件事，只是最接近的；对不上就老实说记不太清，问她一句）' : ''}`,
    seen: fresh,
  };
}

// ---------- the judge ----------
// Similar words aren't the same memory: a small model reads the candidates next to what she just
// said and keeps only the ones about the same person or thing. Unsure → leave it out.

export const ASKING = /还记得|记不记得|记得吗|记得不|记得那|忘了吗|你忘了|(上次|以前|之前|那次|那天).{0,12}(说|聊|讲|提)(过|的)/;
// She's waiting for his reply: a slow judge is skipped and the plain rule decides.
const JUDGE_TIMEOUT_MS = 4000;

async function judge(collab, conv, query, candidates) {
  if (!candidates.length) return [];
  const user = collab.user_name || '她';
  const recent = db.prepare(`SELECT role, content FROM messages WHERE conv_id = ? AND role IN ('user','assistant') ORDER BY seq DESC LIMIT 5`).all(conv.id).reverse()
    .map(r => `${r.role === 'user' ? user : collab.name}：${stripStickers(r.content).slice(0, 200)}`).join('\n');
  const prompt = `你是${collab.name}的记忆秘书。${user}刚说了话，下面有几段从前的聊天，是按字面相似翻出来的。逐段判断：它是不是在说同一个人、同一件事，或者真的能让${collab.name}想起跟现在这句话有关的往事。只是用词像、话题泛泛相近（都在说吃饭、都在说累）的不算；拿不准就不要。宁可一段都不留。
只输出 JSON：{"keep":[编号]}，最多 2 个，按有用程度排。`;
  const body = `最近几句：\n${recent}\n\n${user}现在说的：${query.slice(-600)}\n\n从前的聊天：\n${candidates.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}`;
  const key = 'judgeRoute';
  // Qwen3 thinks first unless told not to — seconds she'd be waiting.
  const noThinking = /qwen3/i.test(route(key)?.model || '') ? { enable_thinking: false } : {};
  try {
    const { text } = await Promise.race([
      complete(key, [{ role: 'system', content: prompt }, { role: 'user', content: body }], { max_tokens: 60, temperature: 0, ...noThinking }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), JUDGE_TIMEOUT_MS)),
    ]);
    const keep = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).keep;
    return [...new Set(keep.map(Number))].filter(n => n >= 1 && n <= candidates.length).slice(0, 2).map(n => candidates[n - 1]);
  } catch (err) {
    console.error('[recall] judge', err.message);
    return null;
  }
}

// ---------- "上个月" ----------
// A time she names narrows recall to that stretch: { from, to } as local YYYY-MM-DD, or null.

const ymd = d => d.toISOString().slice(0, 10);
const dayOf = (ts, timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(ts));
const NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
const num = s => Number(s) || NUM[s] || 0;

export function timeWindow(text, timezone) {
  const [y, m, d] = dayOf(Date.now(), timezone).split('-').map(Number);
  const day = (yy, mm, dd) => new Date(Date.UTC(yy, mm - 1, dd));
  const today = day(y, m, d);
  const back = n => ymd(new Date(today.getTime() - n * 86400_000));
  const monthRange = (yy, mm) => ({ from: ymd(day(yy, mm, 1)), to: ymd(day(yy, mm + 1, 0)) });
  const weekday = (today.getUTCDay() + 6) % 7; // Monday = 0
  let r;
  if ((r = /(\d{1,2}|十[一二]?|[一二三四五六七八九])月(\d{1,2})[日号]/.exec(text))) {
    const mm = num(r[1]); const dd = Number(r[2]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const yy = day(y, mm, dd) > today ? y - 1 : y;
      return { from: ymd(day(yy, mm, dd)), to: ymd(day(yy, mm, dd)) };
    }
  }
  if (/大前天/.test(text)) return { from: back(3), to: back(3) };
  if (/前天/.test(text)) return { from: back(2), to: back(2) };
  if (/昨天|昨晚/.test(text)) return { from: back(1), to: back(1) };
  if (/上上周|上上个?(星期|礼拜)/.test(text)) return { from: back(weekday + 14), to: back(weekday + 8) };
  if (/上周|上个?(星期|礼拜)/.test(text)) return { from: back(weekday + 7), to: back(weekday + 1) };
  if (/这周|这个?(星期|礼拜)|本周/.test(text)) return { from: back(weekday), to: back(0) };
  if (/上个月|上月/.test(text)) return monthRange(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
  if (/这个月|本月/.test(text)) return monthRange(y, m);
  if (/去年/.test(text)) return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  // "5月" / "五月份" — a month, not "5个月" (a duration) and not a date (handled above).
  if ((r = /(?<![\d个])(\d{1,2}|十[一二]?|[一二三四五六七八九])月(?!\d|[日号个])/.exec(text))) {
    const mm = num(r[1]);
    if (mm >= 1 && mm <= 12) return monthRange(mm > m ? y - 1 : y, mm);
  }
  return null;
}
