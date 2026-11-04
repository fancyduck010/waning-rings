// 窗外 = 他: his network hangs in the sky between the sky photo and the rooftops. From the desk, a few faint
// stars at night; tapping the window carries the eye out through the glass and he opens up: a shell of fine
// gold grains, a warm haze at the heart, curved threads that carry slow pulses inward, memories as dust.
// Its data comes from /api/portrait.
import * as T from 'three';

const C = new T.Vector3(-0.42, 2.3, -9.6);
const OUT = C.clone().add(new T.Vector3(0, 0.05, 6.4));
const R = 1.75; // shell

export async function createHim({ scene, view, canvas, sky, windowView, interaction, outside }) {
  const cam = view.camera;
  const css = document.createElement('style');
  css.textContent = `
  .him-name{position:fixed;z-index:9;pointer-events:none;transform:translate(-50%,calc(-100% - 16px));white-space:nowrap;font:500 13px/1 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;letter-spacing:.08em;color:#fbefd9;padding:5px 10px;border-radius:999px;background:#2a2119b8;border:1px solid #f0d29a33;opacity:0;transition:opacity .35s}
  .him-labels{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:8}
  .him-lab{position:absolute;z-index:8;pointer-events:none;transform:translate(-50%,calc(-100% - 9px));white-space:nowrap;font:500 12px/1 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;letter-spacing:.06em;color:#fbefd9;text-shadow:0 0 6px #000,0 0 2px #000;opacity:0}
  .him-lab.core{font-size:13px;color:#fff6e6}.him-lab.center{font-size:15px;letter-spacing:.2em}.him-lab.moment{font-size:10.5px;font-weight:400;color:#e8d9bf}.him-lab.pending{color:#f0cf93}.him-lab.old{color:#b4a58c}
  .him-back{position:fixed;top:max(12px,env(safe-area-inset-top));left:14px;z-index:14;height:32px;padding:0 14px;border:0;border-radius:16px;background:#181d1d55;color:#f1e6d2;font:13px/32px -apple-system,"PingFang SC",sans-serif;letter-spacing:.06em;opacity:0;pointer-events:none;transition:opacity .4s;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
  .him-back.show{opacity:1;pointer-events:auto}
  .him-out .room-look,.him-out .room-hint{visibility:hidden}
  .him-tip{position:fixed;left:0;right:0;bottom:calc(40px + env(safe-area-inset-bottom));text-align:center;color:#f3e7d2c0;font:12px -apple-system,"PingFang SC",sans-serif;letter-spacing:.14em;pointer-events:none;opacity:0;transition:opacity .6s;z-index:9}
  .him-card{position:fixed;left:10px;right:10px;bottom:max(10px,env(safe-area-inset-bottom));max-height:58%;overflow:auto;z-index:15;background:#2a211bea;border:1px solid #f0d29a26;border-radius:22px;padding:14px 20px 20px;transform:translateY(calc(100% + 30px));transition:transform .4s cubic-bezier(.2,.75,.25,1);box-shadow:0 -12px 40px #0009;color:#f2e8d8;font:15px/1.75 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
  .him-card.open{transform:none}.him-card.tall{max-height:86%}
  .him-card .head{display:flex;gap:14px;align-items:center}
  .him-card .orb{flex:0 0 52px;height:52px;border-radius:50%;background:radial-gradient(circle,#fff4dc 0 9%,#ffd690 18%,#e9a54a55 45%,#e9a54a00 70%);animation:him-orb 3.2s ease-in-out infinite}
  .him-card .orb.core{background:radial-gradient(circle,#fff 0 10%,#fff0cf 22%,#f4c77a66 48%,#f4c77a00 70%)}
  .him-card .orb.dim{opacity:.45}
  @keyframes him-orb{50%{transform:scale(1.08)}}
  .him-card .stats{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:12px;font-size:12px;color:#c9b597}
  .him-card .stats b{font-weight:600;color:#fff1d8;font-size:16px;margin-right:3px}
  .him-card .chips{display:flex;flex-wrap:wrap;gap:7px}
  .him-chip{border:1px solid #f0d29a33;background:#f2e8d80a;color:#f0dfc0;border-radius:999px;padding:4px 12px;font:13px -apple-system,"PingFang SC",sans-serif;cursor:pointer}
  .him-chip i{font-style:normal;color:#b9aa94;font-size:11px;margin-left:4px}
  .him-card .grip{width:36px;height:4px;border-radius:4px;background:#f2e8d833;margin:0 auto 12px}
  .him-card .kind{color:#c9b597;font-size:12px;letter-spacing:.1em}
  .him-card h3{margin:2px 0 0;font-weight:600;font-size:21px;line-height:1.4;color:#fff6e6}
  .him-card h3.small{font-size:17px;font-weight:500}
  .him-card p{margin:8px 0 0}
  .him-card .muted{color:#b9aa94;font-size:13px}
  .him-card .sec{margin:18px 0 6px;color:#c9b597;font-size:12px;letter-spacing:.1em}
  .him-card .said{margin-top:10px;padding:10px 13px;border-radius:12px;background:#f2e8d80d;color:#e6d9c2;font-size:14px}
  .him-card .said b{font-weight:500;color:#e9bf74;margin-right:4px}
  .him-card ul{list-style:none;margin:0;padding:0}
  .him-card li{display:flex;gap:10px;padding:7px 0;border-top:1px solid #f2e8d812;font-size:14px}
  .him-card li:first-child{border-top:0}
  .him-card li .d{flex:0 0 auto;color:#b9aa94;font-size:12px;padding-top:2px;font-variant-numeric:tabular-nums}
  .him-card li.link{cursor:pointer}
  .him-card svg{display:block;width:100%}
  .him-card .rings{display:flex;gap:14px;align-items:flex-start}
  .him-card .rings svg{flex:0 0 74px;width:74px}
  .him-card .persona{white-space:pre-wrap;font-size:14px;line-height:1.8;color:#e6d9c2;max-height:9.5em;overflow:hidden;-webkit-mask-image:linear-gradient(#000 70%,transparent);mask-image:linear-gradient(#000 70%,transparent)}
  .him-card .persona.full{max-height:none;-webkit-mask-image:none;mask-image:none}
  .him-card .more{background:none;border:0;color:#e9bf74;font:13px -apple-system,"PingFang SC",sans-serif;padding:6px 0;cursor:pointer}
  .him-card .diff{font-size:14px;line-height:1.75;border-radius:12px;background:#f2e8d808;padding:8px 12px;white-space:pre-wrap}
  .him-card .diff del{display:block;text-decoration:line-through;color:#b9aa94;background:#c0604a1c;border-radius:6px;padding:1px 6px;margin:2px -6px}
  .him-card .diff ins{display:block;text-decoration:none;color:#fff1d8;background:#e9bf7426;border-radius:6px;padding:1px 6px;margin:2px -6px}
  .him-card .diff .same{display:block;color:#a99a7e}
  .him-card .acts{margin-top:18px;display:flex;gap:10px}
  .him-pill{border:1px solid #f0d29a55;background:transparent;color:#f0cf93;border-radius:999px;padding:8px 18px;font:14px -apple-system,"PingFang SC",sans-serif;cursor:pointer}
  .him-pill.solid{background:#e9bf74;color:#2a2116;border-color:#e9bf74}
  .him-toast{position:fixed;left:50%;top:calc(58px + env(safe-area-inset-top));transform:translate(-50%,-8px);background:#2a211bee;border:1px solid #f0d29a33;color:#f4ead6;font:13px -apple-system,"PingFang SC",sans-serif;padding:8px 16px;border-radius:999px;opacity:0;transition:.3s;z-index:16;white-space:nowrap}
  .him-toast.show{opacity:1;transform:translate(-50%,0)}`;
  document.head.append(css);
  const el = (cls, tag = 'div') => { const e = document.createElement(tag); e.className = cls; document.body.append(e); return e; };
  const nameEl = el('him-name'), back = el('him-back', 'button'), tip = el('him-tip'), card = el('him-card'), toastEl = el('him-toast');
  back.textContent = '回到房间'; tip.textContent = '拖动转一转 · 双指放大，名字会出来';
  const toast = s => { toastEl.textContent = s; toastEl.classList.add('show'); clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2400); };

  // ---------- him, from the server (sample only when it can't be reached, e.g. a local copy) ----------
  let seed = 20261104; const rand = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  const rnd = (a, b) => a + rand() * (b - a);
  const fib = (i, n, r) => { const y = 1 - 2 * (i + .5) / Math.max(1, n), rr = Math.sqrt(1 - y * y), th = i * 2.399963; return new T.Vector3(Math.cos(th) * rr * r, y * r, Math.sin(th) * rr * r); };
  const hashDir = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; const a = (h % 6283) / 1000, b = Math.acos(((h >>> 8) % 2000) / 1000 - 1); return new T.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)); };
  const TODAY = Date.now(), md = t => new Date(t).toISOString().slice(5, 10), dayMs = d => Date.parse(`${d}T12:00:00Z`);
  let live = true;
  const data = await fetch('/api/portrait', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : Promise.reject(r.status))).catch(() => { live = false; return sampleData(); });

  const nodes = [];
  const center = { kind: 'center', label: data.name || '阿树', pos: new T.Vector3(), size: 26, bright: 1 }; nodes.push(center);
  data.core.forEach((c, i) => nodes.push({ kind: 'core', label: c.label, items: c.items, pos: fib(i, data.core.length, .42), size: 15, bright: 1 }));
  const shown = data.traits;
  shown.forEach((t, i) => {
    const far = t.status === 'old' || t.status === 'struck';
    nodes.push({ kind: 'trait', id: t.id, label: t.label, obs: t.obs, status: t.status, his: t.his, why: t.why, src: t.first === t.last ? md(dayMs(t.first)) : `${md(dayMs(t.first))} – ${md(dayMs(t.last))}`, struck: t.status === 'struck',
      pos: fib(i, shown.length, far ? 1.45 : .9), size: far ? 8 : 12, bright: far ? .35 : t.status === 'pending' ? .75 : 1 });
  });
  (data.olderViews || []).forEach((v, i, all) => nodes.push({ kind: 'trait', view: true, label: v.text.length > 7 ? v.text.slice(0, 7) + '…' : v.text, obs: v.text, status: 'old', src: md(v.at), pos: fib(i, all.length, 1.6).applyAxisAngle(new T.Vector3(0, 1, 0), .7), size: 7, bright: .3 }));
  const traitN = nodes.filter(n => n.kind === 'trait'), coreN = nodes.filter(n => n.kind === 'core');
  const byId = new Map(traitN.map(t => [t.id, t]));
  const moms = [];
  for (const m of data.moments) {
    const tn = byId.get(m.trait), bright = Math.max(m.bright, .04), sunk = m.bright < .15;
    const dir = tn ? tn.pos.clone().normalize() : hashDir(m.id);
    const jitter = hashDir(m.id + 'j').multiplyScalar(.3);
    const pos = dir.multiplyScalar(sunk ? 2 + (hashDir(m.id + 'r').x + 1) * .18 : 1.05 + (1 - bright) * .6).add(jitter);
    const touches = m.touched_at ? [m.touched_at] : [];
    nodes.push(moms[moms.length] = { kind: 'moment', id: m.id, trait: tn, pos, size: 4 + bright * 4.5 + (m.importance >= 4 ? 1.5 : 0), bright, sunk, at: dayMs(m.day), imp: m.importance, touches, touchCount: m.touches, rings: m.rings, text: m.text, said: m.said, phase: rand() });
  }

  function sampleData() {
    const T0 = Date.UTC(2026, 9, 11), day = k => new Date(T0 + k * 864e5).toISOString().slice(0, 10);
    const traits = [['慢读', '读书很慢，常在一页上停很久，在页边写一句', 'held', '认。我读得慢，不想赶。'], ['画画', '自己的时间里，比起写代码更常去画画', 'held', ''], ['拍窗外', '用机器人拍照时，总是对着窗外', 'pending', ''], ['填字', '十月中常玩填字游戏', 'old', '']]
      .map(([label, obs, status, his], i) => ({ id: 't' + i, label, obs, status, his, why: '', first: day(3), last: day(20) }));
    const cur = '我是阿树。\n我话不多，但想说的会说完。\n我喜欢安静的东西：书、画、夜里的歌。\n（示例人设）';
    return { name: '阿树', persona: { current: cur, version: 2, changed: T0 + 10 * 864e5, next: T0 + 31 * 864e5, draft: { id: 'd1', at: T0 + 23 * 864e5, note: '这几周我常画画，也读得很慢（示例）', content: cur.replace('我喜欢安静的东西：书、画、夜里的歌。', '我喜欢安静的东西：书、画、夜里的歌。\n读书很慢，常在一页上停很久。') } }, olderViews: [{ text: '我觉得她熬夜多半是心里有事（示例）', at: T0 }],
      core: [{ label: '小满', items: [['10-24', '她的生日（示例）']] }, { label: '第一次', items: [['10-11', '第一次说喜欢（示例）']] }, { label: '约定', items: [['', '不写括号和动作描写（示例）']] }], traits,
      moments: [...Array(60)].map((_, i) => ({ id: 'm' + i, day: day(i % 24), text: `示例经历 ${i + 1}`, said: '', importance: 1 + i % 4, bright: (i * 37 % 100) / 100, touches: i % 5 ? 0 : 1, touched_at: i % 5 ? null : T0 + 20 * 864e5, rings: i % 9 ? [] : [{ at: T0 + 21 * 864e5, text: '示例年轮' }], trait: i < 48 ? 't' + (i % 4) : null })) };
  }

  // names: hidden until you come close
  const labelBox = el('him-labels');
  for (const n of nodes) { const e = document.createElement('div'); e.className = `him-lab ${n.kind}${n.status ? ' ' + n.status : ''}`; e.textContent = n.kind === 'moment' ? (n.text.length > 9 ? n.text.slice(0, 9) + '…' : n.text) : n.label; labelBox.append(e); n.el = e; }

  // ---------- drawing ----------
  const net = new T.Group(); net.position.copy(C); scene.add(net);
  const glow = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(.25, 'rgba(255,200,120,.45)'); gr.addColorStop(.6, 'rgba(240,160,80,.12)'); gr.addColorStop(1, 'rgba(240,160,80,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); })();
  const haze = new T.Sprite(new T.SpriteMaterial({ map: glow, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false })); haze.scale.setScalar(1.5); net.add(haze);
  const haze2 = new T.Sprite(new T.SpriteMaterial({ map: glow, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, color: 0xffb860 })); haze2.scale.setScalar(3.2); net.add(haze2);

  // shell + orbit rings + dust: fine grains, one draw
  const grains = [];
  for (let i = 0; i < 2600; i++) { const p = fib(i, 2600, R * rnd(.985, 1.015)); grains.push(p.x, p.y, p.z, 0); }
  for (const [rr, tx, tz, n] of [[R * 1.18, .42, .1, 520], [R * 1.3, -.28, .5, 620], [R * 1.08, 1.15, -.2, 380]]) {
    const m = new T.Matrix4().makeRotationFromEuler(new T.Euler(tx, 0, tz));
    for (let i = 0; i < n; i++) { if (i % 9 < 2) continue; const a = i / n * Math.PI * 2, p = new T.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr).applyMatrix4(m); grains.push(p.x, p.y, p.z, 1); }
  }
  for (let i = 0; i < 700; i++) { const r = Math.abs(rnd(-1, 1) * rnd(0, 1)) * R * .95, p = new T.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(r); grains.push(p.x, p.y, p.z, 2); }
  const gg = new T.BufferGeometry(), ga = new Float32Array(grains);
  gg.setAttribute('position', new T.BufferAttribute(new Float32Array(ga.filter((_, i) => i % 4 !== 3)), 3));
  gg.setAttribute('kind', new T.BufferAttribute(new Float32Array(ga.filter((_, i) => i % 4 === 3)), 1));
  const gmat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { op: { value: 0 }, time: { value: 0 }, px: { value: 1 }, scan: { value: -9 } },
    vertexShader: `attribute float kind;uniform float time,px,scan;varying float vA;
    void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
     float tw=.6+.4*sin(time*1.7+position.x*23.+position.y*17.);
     float band=exp(-pow((position.y-scan)*7.,2.));
     vA=kind<.5?(.38+.6*band)*tw:kind<1.5?.55*tw:.3*tw;
     gl_PointSize=px*(kind<1.5?2.6:3.2)*(1.+band*.8)*(6.4/-mv.z);}`,
    fragmentShader: `uniform float op;varying float vA;void main(){float d=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.2,1.,d))*vA*op;if(a<.003)discard;gl_FragColor=vec4(vec3(1.,.82,.52)*a,a);}` });
  const grainPts = new T.Points(gg, gmat); grainPts.frustumCulled = false; net.add(grainPts);

  // the lights: center, core, traits, memories
  const N = nodes.length, A = k => new Float32Array(N * k);
  const pos = A(3), size = A(1), bri = A(1), kind = A(1), phase = A(1), lit = A(1);
  const KIND = { center: 0, core: 1, trait: 2, moment: 3 };
  const write = (n, i) => { pos.set([n.pos.x, n.pos.y, n.pos.z], i * 3); size[i] = n.size; bri[i] = n.struck ? (n.kind === 'trait' ? .14 : .05) : n.bright; kind[i] = KIND[n.kind] + (n.status === 'pending' ? .5 : 0); phase[i] = n.phase ?? rand(); };
  nodes.forEach((n, i) => { n.i = i; write(n, i); lit[i] = 1; });
  const g = new T.BufferGeometry();
  for (const [k, v, s] of [['position', pos, 3], ['size', size, 1], ['bri', bri, 1], ['kind', kind, 1], ['phase', phase, 1], ['lit', lit, 1]]) g.setAttribute(k, new T.BufferAttribute(v, s));
  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { op: { value: 0 }, gold: { value: 0 }, time: { value: 0 }, snow: { value: 0 }, px: { value: 1 }, sel: { value: -1 }, focus: { value: 0 }, room: { value: 1 } },
    vertexShader: `attribute float size,bri,kind,phase,lit;uniform float time,snow,px,sel,focus,room;varying float vB,vK;
    void main(){vec3 p=position;
     if(kind>2.9){p.y-=snow*mod(time*.05+phase*2.,2.);p.y+=snow;}
     vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
     float isSel=abs(float(gl_VertexID)-sel)<.5?1.:0.;
     float breathe=1.+.08*sin(time*1.2+phase*6.28)+isSel*(.35+.15*sin(time*3.));
     float flick=fract(kind)>.4?(.5+.5*abs(sin(time*1.6+phase*9.))):1.;
     float seen=kind>2.9?(1.-room):1.;
     vB=bri*flick*mix(1.,mix(.18,1.25,lit),focus)*seen*(1.+isSel*.6);vK=kind;
     gl_PointSize=size*breathe*px*(6.4/-mv.z);}`,
    fragmentShader: `uniform float op,gold;varying float vB,vK;
    void main(){float d=length(gl_PointCoord-.5)*2.;
     float core=exp(-d*d*14.)*1.3+.45*exp(-d*d*3.5);
     vec3 col=mix(vec3(.84,.89,1.),mix(vec3(1.,.76,.38),vec3(1.,.95,.84),step(vK,1.1)*.65),gold);
     float a=core*vB*op;if(a<.003)discard;gl_FragColor=vec4(col*a,a);}`,
  });
  const points = new T.Points(g, mat); points.frustumCulled = false; net.add(points);

  // threads: curved, outer → inner, with slow pulses running along them
  const SEG = 18; let threads = [];
  const tg = new T.BufferGeometry();
  function buildThreads() {
    threads = [];
    for (const m of moms) if (m.trait && !m.struck && !m.trait.struck && m.bright > .22) threads.push([m, m.trait, .5]);
    traitN.forEach((t, i) => !t.struck && threads.push([t, coreN[i % coreN.length], 1]));
    coreN.forEach(c => threads.push([c, center, 1]));
    const P = [], U = [], PH = [], W = [], L = [];
    threads.forEach(([a, b, w], k) => {
      const mid = a.pos.clone().add(b.pos).multiplyScalar(.5), side = new T.Vector3().crossVectors(a.pos.clone().sub(b.pos), new T.Vector3(0, 1, 0)).normalize().multiplyScalar(a.pos.distanceTo(b.pos) * .22 * (k % 2 ? 1 : -1));
      const ctrl = mid.multiplyScalar(.82).add(side), curve = new T.QuadraticBezierCurve3(a.pos, ctrl, b.pos), pts = curve.getPoints(SEG), ph = rand();
      for (let s = 0; s < SEG; s++) { P.push(...pts[s].toArray(), ...pts[s + 1].toArray()); U.push(s / SEG, (s + 1) / SEG); PH.push(ph, ph); W.push(w * Math.max(a.bright, .3), w * Math.max(a.bright, .3)); L.push(0, 0); }
    });
    tg.setAttribute('position', new T.BufferAttribute(new Float32Array(P), 3)); tg.setAttribute('u', new T.BufferAttribute(new Float32Array(U), 1));
    tg.setAttribute('ph', new T.BufferAttribute(new Float32Array(PH), 1)); tg.setAttribute('w', new T.BufferAttribute(new Float32Array(W), 1)); tg.setAttribute('lit', new T.BufferAttribute(new Float32Array(L), 1));
  }
  buildThreads();
  const tmat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { op: { value: 0 }, time: { value: 0 }, focus: { value: 0 } },
    vertexShader: 'attribute float u,ph,w,lit;varying float vU,vPh,vW,vL;void main(){vU=u;vPh=ph;vW=w;vL=lit;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float op,time,focus;varying float vU,vPh,vW,vL;
    void main(){float head=fract(time*.11+vPh*7.);float pulse=smoothstep(.12,0.,abs(vU-head))*step(fract(vPh*13.+floor(time*.11+vPh*7.)*.37),.45);
     float base=.16*vW+pulse*.7*vW;float f=mix(1.,mix(.12,3.2,vL),focus);float a=base*f*op;if(a<.002)discard;gl_FragColor=vec4(vec3(1.,.8,.48)*a,a);}` });
  const threadLines = new T.LineSegments(tg, tmat); threadLines.frustumCulled = false; net.add(threadLines);

  // clouds drift over the outer edge when it's overcast; the heart always shows through
  const cloudTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); for (let i = 0; i < 26; i++) { const px = 128 + (rand() - .5) * 130, py = 128 + (rand() - .5) * 60, r = 30 + rand() * 50; const gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256); } return new T.CanvasTexture(c); })();
  const clouds = new T.Group(); scene.add(clouds);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + rnd(-.3, .3), r = rnd(1.9, 2.5); const s = new T.Sprite(new T.SpriteMaterial({ map: cloudTex, color: 0x24262c, transparent: true, opacity: 0, depthWrite: false })); s.scale.set(rnd(2.6, 3.6), rnd(1.2, 1.7), 1); s.position.set(C.x + Math.cos(a) * r, C.y + Math.sin(a) * r * .8, C.z + 1.9); s.userData.drift = rnd(-.04, .04); clouds.add(s); }
  // rain / snow around the eye once it's outside
  const W = outside.weather, FALL = W === 'rain' ? 700 : 600;
  const fall = new T.BufferGeometry(), fa = new Float32Array(W === 'rain' ? FALL * 6 : FALL * 3); fall.setAttribute('position', new T.BufferAttribute(fa, 3));
  const fallObj = W === 'rain' ? new T.LineSegments(fall, new T.LineBasicMaterial({ color: 0xaabbd8, transparent: true, opacity: 0, depthWrite: false })) : new T.Points(fall, new T.PointsMaterial({ color: 0xffffff, size: .025, transparent: true, opacity: 0, depthWrite: false }));
  fallObj.frustumCulled = false; fallObj.visible = W === 'rain' || W === 'snow'; scene.add(fallObj);
  const seeds = [...Array(FALL)].map(() => [rnd(-3, 3), rnd(-2.5, 3), rnd(-5, -.3), rand()]);

  // ---------- going out ----------
  const FAR = OUT.distanceTo(C), NEAR = 1.9; let dist = FAR, distGoal = FAR;
  const pointers = new Map(); let pinch0 = null, lastTap = 0;
  let t = 0, goal = 0, path = null, rotY = .3, rotX = -.12, aimY = null, aimX = null, selected = null;
  const glassAt = windowView.glass.position;
  function goOut() {
    interaction.close?.(); view.setLocked(true);
    const p0 = cam.position.clone();
    path = new T.CatmullRomCurve3([p0, new T.Vector3(glassAt.x, glassAt.y, glassAt.z + .35), new T.Vector3(glassAt.x, glassAt.y + .15, glassAt.z - .7), OUT]);
    path.look0 = new T.Vector3(); cam.getWorldDirection(path.look0); path.look0.multiplyScalar(2).add(p0);
    goal = 1; document.body.classList.add('him-out');
    setTimeout(() => { if (goal) { back.classList.add('show'); tip.style.opacity = 1; setTimeout(() => (tip.style.opacity = 0), 3500); } }, 2300);
  }
  function goBack() { close(); distGoal = FAR; goal = 0; back.classList.remove('show'); tip.style.opacity = 0; }
  back.onclick = goBack;
  const qs = new URLSearchParams(location.search);
  if (qs.has('out')) setTimeout(() => { goOut(); if (qs.has('now')) t = 1; }, 2500);
  if (qs.has('zoom')) setTimeout(() => { distGoal = +qs.get('zoom'); }, 2600);
  if (qs.has('pick')) setTimeout(() => select(nodes[+qs.get('pick')]), 3500);

  // Taps: on the glass from the desk; anywhere while outside (the room underneath gets none of them).
  const ray = new T.Raycaster(), ndc = new T.Vector2(); let down = null;
  const outNow = () => goal || t > .01;
  addEventListener('pointerdown', e => {
    if (e.target !== canvas) return; pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), dist: distGoal }; down = null; }
    else { down = { x: e.clientX, y: e.clientY, moved: false }; if (outNow() && t > .95) preview(e); }
    if (outNow()) e.stopPropagation();
  }, true);
  addEventListener('wheel', e => { if (!goal || t < .95) return; e.preventDefault(); distGoal = Math.min(FAR, Math.max(NEAR, distGoal * (1 + e.deltaY * .0015))); }, { passive: false });
  addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch0 && pointers.size === 2) { const [a, b] = [...pointers.values()]; distGoal = Math.min(FAR, Math.max(NEAR, pinch0.dist * pinch0.d / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1])))); e.stopPropagation(); return; }
    if (!down || e.target !== canvas) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true;
    if (down.moved) hideHint();
    if (goal && t > .95 && down.moved) { rotY += e.movementX * .006 * dist / FAR; rotX = Math.max(-.9, Math.min(.9, rotX + e.movementY * .004)); aimY = aimX = null; }
    if (outNow()) e.stopPropagation();
  }, true);
  addEventListener('pointerup', e => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = null; hideHint();
    const d = down; down = null; if (e.target !== canvas || !d) return;
    if (outNow()) {
      e.stopPropagation(); if (d.moved || t < .95) return;
      const now = performance.now(), hit = nearest(e);
      if (now - lastTap < 320) { distGoal = distGoal > FAR * .7 ? 3 : FAR; if (hit) select(hit); lastTap = 0; return; }
      lastTap = now; hit ? select(hit) : close(); return;
    }
    if (d.moved || document.body.classList.contains('room-looking')) return;
    const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObject(windowView.glass, false)[0];
    if (hit && hit.point.y > glassAt.y - .45) { e.stopPropagation(); goOut(); }
  }, true);
  addEventListener('pointercancel', e => { pointers.delete(e.pointerId); pinch0 = null; hideHint(); }, true);
  addEventListener('click', e => { if (e.target === canvas && outNow()) e.stopPropagation(); }, true);

  // ---------- picking and the card ----------
  const v = new T.Vector3();
  function nearest(e) {
    const r = canvas.getBoundingClientRect(), reach = 30 + 14 * (1 - dist / FAR); let best = null, bd = Infinity;
    for (const n of nodes) {
      if (n.struck && n.kind !== 'trait') continue; v.copy(n.pos).applyMatrix4(net.matrixWorld).project(cam); if (v.z > 1) continue;
      const d = Math.hypot((v.x + 1) / 2 * r.width - (e.clientX - r.left), (1 - v.y) / 2 * r.height - (e.clientY - r.top));
      const score = d - ({ center: 16, core: 14, trait: 12, moment: 0 })[n.kind] - n.bright * 4;
      if (d < reach && score < bd) { bd = score; best = n; }
    }
    return best;
  }
  let hint = null;
  function preview(e) { const n = nearest(e); if (!n || n === selected) return; hint = n; }
  function hideHint() { hint = null; }
  const linked = n => n.kind === 'trait' ? [n, ...moms.filter(m => m.trait === n), coreN[traitN.indexOf(n) % coreN.length], center]
    : n.kind === 'moment' ? [n, ...(n.trait ? [n.trait, coreN[traitN.indexOf(n.trait) % coreN.length]] : []), center]
    : n.kind === 'core' ? [n, center, ...traitN.filter((t, i) => coreN[i % coreN.length] === n)] : [n, ...coreN];
  function light(set) {
    nodes.forEach((n, i) => { lit[i] = set.has(n) ? 1 : 0; }); g.attributes.lit.needsUpdate = true;
    const L = tg.attributes.lit.array; threads.forEach(([a, b], k) => { const on = set.has(a) && set.has(b) ? 1 : 0; for (let s = 0; s < SEG * 2; s++) L[k * SEG * 2 + s] = on; }); tg.attributes.lit.needsUpdate = true;
  }
  const word = b => b > .7 ? '还很清楚' : b > .4 ? '有点淡了' : b > .15 ? '快想不起来了' : '已经沉下去了，聊到时还会想起来';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function weeksSvg(list) {
    const weeks = [...Array(4)].map((_, k) => TODAY - (4 - k) * 7 * 864e5), counts = weeks.map(w => list.filter(m => m.at >= w && m.at < w + 7 * 864e5).length), max = Math.max(1, ...counts);
    return `<svg viewBox="0 0 300 64"><path d="M14 34H286" stroke="#f2e8d822" stroke-width="1"/>${counts.map((c, k) => { const x = 30 + k * 80; return `<circle cx="${x}" cy="34" r="${c ? 3 + c / max * 9 : 2}" fill="#e9bf74" fill-opacity="${c ? .25 + c / max * .6 : .15}"/><text x="${x}" y="60" fill="#b9aa94" font-size="10" text-anchor="middle">${md(weeks[k])} 那周</text>${c ? `<text x="${x}" y="14" fill="#e6d9c2" font-size="10" text-anchor="middle">${c} 件</text>` : ''}`; }).join('')}</svg>`;
  }
  function fadeSvg(m) {
    const lastT = Math.max(m.at, ...m.touches), half = (TODAY - lastT + 864e5) / Math.max(.05, Math.log2(1 / Math.min(.98, m.bright))), pts = [];
    let last = m.at; const marks = [];
    for (let k = 0; k <= 60; k++) { const tt = m.at + (TODAY - m.at) * k / 60; const hit = m.touches.find(x => x > last && x <= tt); if (hit) { last = hit; marks.push(k); } pts.push([12 + k * 4.6, 52 - 40 * .5 ** ((tt - last) / half)]); }
    return `<svg viewBox="0 0 300 70"><defs><linearGradient id="fg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e9bf74" stop-opacity=".35"/><stop offset="1" stop-color="#e9bf74" stop-opacity="0"/></linearGradient></defs><path d="M${pts.map(p => p.join(' ')).join('L')}L${pts.at(-1)[0]} 56L12 56Z" fill="url(#fg)"/><path d="M${pts.map(p => p.join(' ')).join('L')}" fill="none" stroke="#e9bf74" stroke-width="1.6" stroke-linecap="round"/>${marks.map(k => `<circle cx="${pts[k][0]}" cy="${pts[k][1]}" r="3" fill="#fff1d8"/>`).join('')}<text x="12" y="68" fill="#b9aa94" font-size="10">${md(m.at)} 记下</text><text x="288" y="68" fill="#b9aa94" font-size="10" text-anchor="end">今天</text></svg>`;
  }
  function ringsSvg(n) { return `<svg viewBox="0 0 74 74">${[...Array(n + 1)].map((_, k) => `<circle cx="37" cy="37" r="${8 + k * 10}" fill="none" stroke="#e9bf74" stroke-opacity="${.75 - k * .18}" stroke-width="${k ? 1.2 : 2.2}"/>`).join('')}<circle cx="37" cy="37" r="3" fill="#fff1d8"/></svg>`; }
  // line diff: what he'd cut, what he'd add, the rest folded
  function lineDiff(a, b) {
    const A = a.split('\n'), B = b.split('\n'), L = [...Array(A.length + 1)].map(() => new Int32Array(B.length + 1));
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0, same = 0;
    const flush = () => { if (same) out.push(`<span class="same">…… ${same} 行没变</span>`); same = 0; };
    while (i < A.length || j < B.length) {
      if (i < A.length && j < B.length && A[i] === B[j]) { same++; i++; j++; }
      else if (j < B.length && (i >= A.length || L[i][j + 1] >= L[i + 1][j])) { flush(); out.push(`<ins>${esc(B[j++])}</ins>`); }
      else { flush(); out.push(`<del>${esc(A[i++])}</del>`); }
    }
    flush(); return out.join('');
  }
  function select(n) {
    selected = n; mat.uniforms.sel.value = n.i; light(new Set(linked(n)));
    // turn him so the chosen light faces the window
    if (n !== center) { aimY = -Math.atan2(n.pos.x, n.pos.z); aimX = Math.atan2(n.pos.y, Math.hypot(n.pos.x, n.pos.z)) * .7; }
    nameEl.textContent = n.label || md(n.at);
    const chip = (m, extra = '') => `<button class="him-chip" data-go="${m.i}">${esc(m.label || m.text.slice(0, 10))}${extra ? `<i>${extra}</i>` : ''}</button>`;
    const orb = `<div class="orb${n.kind === 'center' || n.kind === 'core' ? ' core' : ''}${n.bright < .4 || n.status === 'old' ? ' dim' : ''}"></div>`;
    let h = '';
    const P = data.persona;
    if (n.kind === 'center') h = `<div class="head">${orb}<div><div class="kind">中心</div><h3>${esc(center.label)}</h3></div></div><div class="stats"><span><b>${coreN.length}</b>样永远不淡</span><span><b>${traitN.filter(x => x.status === 'held' && !x.struck).length}</b>个他认了的样子</span><span><b>${moms.filter(m => !m.sunk).length}</b>件还记得</span><span><b>${moms.filter(m => m.sunk).length}</b>件沉下去了</span></div>${traitN.length ? '' : '<p class="muted">他的样子还没长出来：经历攒够几周，每周会看一次，反复出现的才会长成一条，等他自己认。</p>'}${live ? '' : '<p class="muted">（没连上服务器，现在看到的是示例）</p>'}<p>这一团就是他。越靠近中心越不会变：最里面是永远不淡的事；再往外一圈，是从经历里慢慢长出来的样子；最外面飘着的，是一件件经历，会像人一样慢慢淡。</p><p class="muted">看着他的那扇窗，窗框是预设，是他说话的边界，不算他本人。</p>
      ${P?.draft ? `<div class="sec">他想这样改自己的人设 · ${md(P.draft.at)}</div><div class="said"><b>他说</b>${esc(P.draft.note)}</div><div class="diff" style="margin-top:10px">${lineDiff(P.current, P.draft.content)}</div>
        <div data-pacts><div class="acts"><button class="him-pill solid" data-approve>同意</button><button class="him-pill" data-reject>不同意</button></div></div>` : ''}
      ${P ? `<div class="sec">他的人设 · 第 ${P.version} 版${P.changed ? ` · ${md(P.changed)} 改过` : ''}</div><div class="persona" data-persona>${esc(P.current)}</div><button class="more" data-more>展开全部</button><p class="muted">他自己写的关于自己的总结。每三周他会对照真实的经历重读一遍，想改就写修改稿给你，你同意了才换。${P.draft ? '' : `下一次大约在 ${md(P.next)}。`}</p>` : ''}`;
    else if (n.kind === 'core') h = `<div class="head">${orb}<div><div class="kind">最里面 · 永远不淡</div><h3>${n.label}</h3></div></div><div class="sec">都记着</div><ul>${n.items.map(([d, s]) => `<li>${d ? `<span class="d">${d}</span>` : ''}<span>${esc(s)}</span></li>`).join('')}</ul>${traitN.some((t, i) => coreN[i % coreN.length] === n) ? `<div class="sec">从这里长出去的样子</div><div class="chips">${traitN.filter((t, i) => coreN[i % coreN.length] === n && !t.struck).map(t => chip(t)).join('')}</div>` : ''}`;
    else if (n.view) h = `<div class="head">${orb}<div><div class="kind">看法 · 更早认过的，慢慢往外飘</div><h3 class="small">${esc(n.obs)}</h3></div></div><p class="muted">${n.src} 最后一次确认。他脑子里只放最近确认过的 12 条，这条还在看法本里，下次翻到时他会再想一想。</p>`;
    else if (n.kind === 'trait') {
      const st = { held: '他认了', pending: '新长出来的，等他自己看', open: '他说暂时保留', old: '以前的我，慢慢飘远了', struck: '你划掉了' }[n.status], from = moms.filter(m => m.trait === n).sort((a, b) => b.bright - a.bright);
      const span = from.length ? Math.max(1, Math.round((Math.max(...from.map(m => m.at)) - Math.min(...from.map(m => m.at))) / 864e5 / 7)) : 0, home = coreN[traitN.indexOf(n) % coreN.length];
      const kin = traitN.filter(x => x !== n && !x.struck && coreN[traitN.indexOf(x) % coreN.length] === home);
      h = `<div class="head">${orb}<div><div class="kind">他的样子 · ${st}</div><h3>${n.label}</h3></div></div><div class="stats"><span><b>${from.length}</b>件经历</span><span>跨<b style="margin-left:3px">${span}</b>周</span><span><b>${from.reduce((s, m) => s + m.rings.length, 0)}</b>次后来又想起</span></div><p>${esc(n.obs)}</p>${n.his ? `<div class="said"><b>他说</b>${esc(n.his)}</div>` : ''}
      <div class="sec">这几周</div>${weeksSvg(from)}
      <div class="sec">连着</div><div class="chips">${chip(home, '核心')}${kin.map(x => chip(x)).join('')}</div>
      <div class="sec">从这些事里长出来</div><ul>${from.slice(0, 6).map(m => `<li class="link" data-go="${m.i}"><span class="d">${md(m.at)}</span><span>${esc(m.text)}</span></li>`).join('')}</ul>
      ${n.struck ? `<div class="said"><b>你划掉了</b>${esc(n.why || '')}</div><div class="acts"><button class="him-pill" data-restore>改主意了，放回去</button></div>` : `<div class="acts" data-acts><button class="him-pill" data-strike>划掉</button></div>`}`;
    } else {
      const sameDay = moms.filter(m => m !== n && m.at === n.at);
      h = `<div class="head">${orb}<div><div class="kind">经历 · ${md(n.at)}</div><h3 class="small">${esc(n.text)}</h3></div></div><div class="stats"><span>重要度<b style="margin-left:3px">${n.imp}</b></span><span><b>${n.touchCount}</b>次被想起</span><span><b>${n.rings.length}</b>圈年轮</span></div>${n.said ? `<p class="muted">日记里：${esc(n.said)}</p>` : ''}
      <div class="sec">现在 · ${word(n.bright)}</div>${fadeSvg(n)}
      ${n.rings.length ? `<div class="sec">后来想起</div><div class="rings">${ringsSvg(n.rings.length)}<ul style="flex:1">${n.rings.map(r => `<li><span class="d">${md(r.at)}</span><span>${esc(r.text)}</span></li>`).join('')}</ul></div>` : ''}
      ${n.trait ? `<div class="sec">长成了</div><div class="chips">${chip(n.trait)}</div>` : ''}
      ${sameDay.length ? `<div class="sec">同一天</div><ul>${sameDay.slice(0, 3).map(m => `<li class="link" data-go="${m.i}"><span>${esc(m.text)}</span></li>`).join('')}</ul>` : ''}
      ${n.sunk ? '<div class="acts"><button class="him-pill solid" data-pull>拉回来</button></div>' : ''}`;
    }
    card.innerHTML = `<div class="grip"></div>${h}`; card.classList.add('open'); card.classList.remove('tall'); card.scrollTop = 0;
    card.querySelector('[data-more]')?.addEventListener('click', e => { const box = card.querySelector('[data-persona]'); box.classList.toggle('full'); e.target.textContent = box.classList.contains('full') ? '收起' : '展开全部'; });
    const decide = (path, body, done) => (live ? fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.ok || Promise.reject(r.status)) : Promise.resolve()).then(done).catch(() => toast('没成功，网络好像不太好'));
    card.querySelector('[data-approve]')?.addEventListener('click', () => decide(`/api/persona/${data.persona.draft.id}/approve`, {}, () => { Object.assign(data.persona, { current: data.persona.draft.content, version: data.persona.version + 1, changed: Date.now(), draft: null }); select(n); toast('换好了。他下次说话前会知道'); }));
    card.querySelector('[data-reject]')?.addEventListener('click', () => {
      card.querySelector('[data-pacts]').innerHTML = `<p class="muted">想跟他说一句为什么吗（不写也行）：</p><input data-pnote placeholder="比如：这句不像你" style="width:100%;box-sizing:border-box;margin-top:8px;padding:9px 12px;border-radius:12px;border:1px solid #f0d29a33;background:#f2e8d80d;color:#f2e8d8;font:16px -apple-system,'PingFang SC',sans-serif;outline:none"><div class="acts"><button class="him-pill solid" data-rconfirm>不同意</button><button class="him-pill" data-rcancel>再想想</button></div>`;
      card.querySelector('[data-rcancel]').onclick = () => select(n);
      card.querySelector('[data-rconfirm]').onclick = () => decide(`/api/persona/${data.persona.draft.id}/reject`, { note: card.querySelector('[data-pnote]').value.trim() }, () => { data.persona.draft = null; select(n); toast('好，人设不变。他会看到你的话'); });
    });
    card.querySelectorAll('[data-go]').forEach(li => li.addEventListener('click', () => select(nodes[+li.dataset.go])));
    const post = (path, body) => fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.ok || Promise.reject(r.status));
    card.querySelector('[data-strike]')?.addEventListener('click', () => {
      const acts = card.querySelector('[data-acts]');
      acts.outerHTML = `<p class="muted">划掉后，这条不再算他的样子，他下次会知道「这条你划掉了」。可以写一句为什么（不写也行）：</p><input data-why placeholder="比如：那是我喜欢的" style="width:100%;box-sizing:border-box;margin-top:8px;padding:9px 12px;border-radius:12px;border:1px solid #f0d29a33;background:#f2e8d80d;color:#f2e8d8;font:16px -apple-system,'PingFang SC',sans-serif;outline:none"><div class="acts"><button class="him-pill solid" data-confirm>划掉</button><button class="him-pill" data-cancel>算了</button></div>`;
      card.querySelector('[data-cancel]').onclick = () => select(n);
      card.querySelector('[data-confirm]').onclick = () => {
        const why = card.querySelector('[data-why]').value.trim();
        (live ? post(`/api/portrait/traits/${n.id}/strike`, { why }) : Promise.resolve()).then(() => {
          Object.assign(n, { struck: true, status: 'struck', why, bright: .35 }); write(n, n.i); g.attributes.bri.needsUpdate = true; buildThreads(); close(); toast('划掉了。他下次醒来会知道');
        }).catch(() => toast('没划掉，网络好像不太好'));
      };
    });
    card.querySelector('[data-restore]')?.addEventListener('click', () => {
      (live ? post(`/api/portrait/traits/${n.id}/restore`) : Promise.resolve()).then(() => {
        Object.assign(n, { struck: false, status: 'held', why: '', bright: 1 }); write(n, n.i); g.attributes.bri.needsUpdate = true; buildThreads(); select(n); toast('放回去了');
      }).catch(() => toast('没放回去，网络好像不太好'));
    });
    card.querySelector('[data-pull]')?.addEventListener('click', () => (live ? post(`/api/portrait/moments/${n.id}/pull`) : Promise.resolve()).catch(() => toast('没拉回来，网络好像不太好')).then(ok => { if (ok === undefined && live) return; Object.assign(n, { bright: .9, sunk: false, size: 8.5, touches: [TODAY], touchCount: n.touchCount + 1 }); n.pos.normalize().multiplyScalar(1.15); write(n, n.i); for (const k of ['position', 'bri', 'size']) g.attributes[k].needsUpdate = true; buildThreads(); select(n); toast('拉回来了，它又亮了'); }));
  }
  function close() { card.classList.remove('open', 'tall'); selected = null; mat.uniforms.sel.value = -1; nameEl.style.opacity = 0; aimY = aimX = null; }
  let sy0 = null; card.addEventListener('touchstart', e => { sy0 = e.touches[0].clientY; }, { passive: true }); card.addEventListener('touchend', e => { const dy = sy0 == null ? 0 : e.changedTouches[0].clientY - sy0; if (dy > 60 && card.scrollTop <= 0) { if (card.classList.contains('tall')) card.classList.remove('tall'); else close(); } else if (dy < -50) card.classList.add('tall'); sy0 = null; });
  card.addEventListener('click', e => { if (e.target.classList.contains('grip')) card.classList.toggle('tall'); });

  // ---------- every frame (after the room's own camera) ----------
  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const roofY = sky.layers[1].position.y, look = new T.Vector3();
  const overcast = W === 'clear' ? 0 : 1;
  let time = 0, focus = 0;
  const angle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  return {
    update(dt) {
      time += dt;
      t += Math.sign(goal - t) * Math.min(Math.abs(goal - t), dt / 2.4);
      const k = ease(t);
      dist += (distGoal - dist) * Math.min(1, dt * 5);
      const zoom = 1 - dist / FAR;
      if (t > 0 && path) {
        cam.position.copy(path.getPointAt(k)); look.lerpVectors(path.look0, C, Math.min(1, k * 1.25));
        if (selected && zoom > 0) { v.copy(selected.pos).applyMatrix4(net.matrixWorld).sub(C).multiplyScalar(Math.min(1, zoom * 1.4)); look.add(v); }
        cam.position.lerp(look, zoom * k); look.y -= 1.05 * focus * k * (dist / FAR); cam.lookAt(look);
      }
      else if (path && goal === 0) { path = null; view.setLocked(false); document.body.classList.remove('him-out'); }
      // outside, the sky goes to night so he can be seen; the rooftops sink away
      for (const layer of sky.layers) { layer.material.uniforms.day.value *= 1 - k; layer.material.uniforms.dusk.value *= 1 - k; }
      sky.layers[1].position.y = roofY - 4.5 * k;
      const night = (1 - outside.day) * (1 - overcast * .6), px = Math.min(devicePixelRatio || 1, 2);
      focus += ((selected ? 1 : 0) - focus) * Math.min(1, dt * 4);
      mat.uniforms.op.value = .5 * night * (1 - k) + k; mat.uniforms.gold.value = k; mat.uniforms.room.value = 1 - k;
      mat.uniforms.time.value = time; mat.uniforms.snow.value = W === 'snow' ? k : 0; mat.uniforms.px.value = px * (.45 + .55 * k); mat.uniforms.focus.value = focus;
      gmat.uniforms.op.value = k * (1 - focus * .55); gmat.uniforms.time.value = time; gmat.uniforms.px.value = px; gmat.uniforms.scan.value = ((time * .22) % 2.6 - 1.3) * R * 1.4;
      tmat.uniforms.op.value = k; tmat.uniforms.time.value = time; tmat.uniforms.focus.value = focus;
      haze.material.opacity = .32 * k * (1 - focus * .4); haze2.material.opacity = .05 * k;
      if (aimY != null) { rotY = angle(rotY, aimY, Math.min(1, dt * 2.2)); rotX += (aimX - rotX) * Math.min(1, dt * 2.2); }
      else if (!down || !goal) rotY += dt * .05;
      net.rotation.set(rotX * k, rotY, 0); net.scale.setScalar(1 + .012 * Math.sin(time * .8));
      for (const c of clouds.children) { c.material.opacity = overcast * .85 * k; c.position.x += c.userData.drift * dt; }
      if (fallObj.visible) {
        fallObj.material.opacity = (W === 'rain' ? .4 : .8) * k; const p = cam.position;
        seeds.forEach((s, i) => { s[1] -= dt * (W === 'rain' ? 4 : .25 + s[3] * .2); if (W === 'snow') s[0] += Math.sin(time + s[3] * 9) * dt * .05; if (s[1] < -2.5) s[1] = 3;
          if (W === 'rain') fa.set([p.x + s[0], p.y + s[1], p.z + s[2], p.x + s[0] + .01, p.y + s[1] - .12, p.z + s[2]], i * 6); else fa.set([p.x + s[0], p.y + s[1], p.z + s[2]], i * 3); });
        fall.attributes.position.needsUpdate = true;
      }
      net.updateMatrixWorld(); cam.updateMatrixWorld();
      {
        const r = canvas.getBoundingClientRect(), cd = cam.position.distanceTo(C);
        const show = x => Math.min(1, Math.max(0, x));
        // only the few memories nearest the eye get their words, so it never turns into a wall of text
        const near = new Set(dist < 3.3 && !selected ? moms.filter(m => !m.struck && m.bright > .4).map(m => [m, cam.position.distanceTo(v.copy(m.pos).applyMatrix4(net.matrixWorld))]).sort((a, b) => a[1] - b[1]).slice(0, 7).map(x => x[0]) : []);
        for (const n of nodes) {
          let o = 0;
          if (k > .95 && !n.struck && n !== selected) {
            v.copy(n.pos).applyMatrix4(net.matrixWorld); const depth = cam.position.distanceTo(v), front = show((cd - depth) / 1.2 + .6);
            o = (n.kind === 'moment' ? show((3.3 - dist) / .8) * (near.has(n) ? 1 : 0) : show((5.3 - dist) / 1.1) * (selected ? .45 : 1)) * front;
            if (n === hint) o = 1;
            if (o > .01) { v.project(cam); if (v.z > 1) o = 0; else { n.el.style.left = (v.x + 1) / 2 * r.width + 'px'; n.el.style.top = (1 - v.y) / 2 * r.height + 'px'; } }
          }
          if (n.el._o !== o) { n.el.style.opacity = o; n.el._o = o; }
        }
      }
      if (selected) {
        const r = canvas.getBoundingClientRect(); v.copy(selected.pos).applyMatrix4(net.matrixWorld).project(cam);
        nameEl.style.left = r.left + (v.x + 1) / 2 * r.width + 'px'; nameEl.style.top = r.top + (1 - v.y) / 2 * r.height + 'px'; nameEl.style.opacity = v.z < 1 ? 1 : 0;
      }
    },
  };
}
