/* Hero 主标题「字号整体收 8%」的回归校验。
 *
 * 约定（2026-09-21）：`--fs-display` 在 96px 档基础上 ×.92 —— clamp(48px,7.2vw,96px) → ×.92；
 * 窄屏（≤560px）的 min(10.5vw,48px) 同步 ×.92。其余字体样式（字重/颜色/行高/字间距）
 * 都是相对单位（em / 无单位比例），必须继续「跟着字号走」才算自适应。
 *
 * 断言：
 *   ① 实测字号 == 0.92 × 基准公式（页面内注入探针实测，不硬编码视口值）；容差 0.5%；
 *   ② 行高比例、字间距比例（÷字号）与设定值一致 —— 证明它们是相对单位、会自适应；
 *   ③ 描边绝对厚度 ≈ 1.92px（= 收字号前 96px × .02em），即「重量补偿」没丢；
 *   ④ 层级仍清晰：主标题明显大于板块标题（h2）/ 卡片标题（h3）/ 副标题；
 *   ⑤ 两行文案与断行不变、无横向溢出、字号落在 [44.16, 88.32] 区间内。
 *
 * 用法：node tools/verify/hero-title-scale.mjs [宽] [高]   （默认 1440×900）
 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* 基准公式（改 CSS 基准时同步改这里）：收字号前的主标题字号 */
const BASE = { minPx: 48, vw: 7.2, maxPx: 96, narrowVw: 10.5, narrowCapPx: 48 };
const SCALE = 0.92;   /* 收 8% */

const ver = await (await fetch('http://127.0.0.1:9555/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errs = [];
const raw = (m, q = {}, S) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q, sessionId: S })); });
const send = (m, q = {}, S) => Promise.race([raw(m, q, S), sleep(15000).then(() => { throw new Error(`CDP 超时：${m}`); })]);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
for (const t of await (await fetch('http://127.0.0.1:9555/json/list')).json()) {
  if (t.type === 'page' && /127\.0\.0\.1:7789/.test(t.url || '')) await fetch(`http://127.0.0.1:9555/json/close/${t.id}`);
}
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Target.activateTarget', { targetId });
await send('Page.bringToFront', {}, S);   /* 必须真置前，否则标签页被判后台，渲染值不可信 */
await send('Runtime.enable', {}, S); await send('Page.enable', {}, S);
await send('Network.enable', {}, S); await send('Network.setCacheDisabled', { cacheDisabled: true }, S);
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900);
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500 }, S);
await send('Page.navigate', { url: 'http://127.0.0.1:7789/index.html?t=' + Date.now() }, S);
await sleep(4500);

const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, S); return r?.exceptionDetails ? 'ERR:' + r.exceptionDetails.text : r?.result?.value; };
/* 前置条件：标签页被置于后台时拿到的是陈旧布局 */
for (let i = 0; i < 12 && await ev('document.hidden'); i++) { await send('Page.bringToFront', {}, S); await sleep(700); }
if (await ev('document.hidden')) {
  console.log('!! 环境不可用：标签页处于后台（document.hidden=true），本轮不作数。');
  console.log('   请用 --disable-backgrounding-occluded-windows --disable-renderer-backgrounding 重启 Chrome 后重跑。');
  await send('Target.closeTarget', { targetId }).catch(() => {});
  ws.close(); process.exit(1);
}
let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { c ? pass++ : fail++; console.log(`${c ? '通过' : '不达标'} ${label}${extra ? ' | ' + extra : ''}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ① 字号 = 0.92 × 基准（基准用页面内探针实测，避免硬编码各视口数值） */
const probe = await ev(`(()=>{
  const mk=(css)=>{ const d=document.createElement('div'); d.style.cssText='position:absolute;visibility:hidden;font-size:'+css;
    document.body.appendChild(d); const v=parseFloat(getComputedStyle(d).fontSize); d.remove(); return v; };
  return JSON.stringify({ base: mk('clamp(${BASE.minPx}px, ${BASE.vw}vw, ${BASE.maxPx}px)'),
                          narrow: mk('min(${BASE.narrowVw}vw, ${BASE.narrowCapPx}px)') }); })()`);
const P = JSON.parse(probe);
const style = JSON.parse(await ev(`(()=>{ const h=document.querySelector('.hero h1'), c=getComputedStyle(h);
  const em=h.querySelector('em');
  const root=getComputedStyle(document.documentElement);
  return JSON.stringify({ fs:parseFloat(c.fontSize), lh:c.lineHeight, ls:parseFloat(c.letterSpacing),
    stroke:parseFloat(c.webkitTextStrokeWidth), color1:c.color, color2:getComputedStyle(em).color,
    brand:root.getPropertyValue('--brand').trim(), weight:c.fontWeight, family:c.fontFamily.slice(0,42),
    scrollW:document.documentElement.scrollWidth, vw:innerWidth }); })()`));
const expectBase = await ev('innerWidth') > 560 ? P.base : P.narrow;   /* 窄屏走 min() 那条公式 */
const expect = expectBase * SCALE;
console.log(`视口 ${W}×${H}  实测字号 ${style.fs}px / 期望 ${expect.toFixed(2)}px（基准 ${expectBase}px × ${SCALE}）`);
ok(near(style.fs, expect, Math.max(0.2, expect * 0.005)), `字号 = 基准 × .92（收 8%）`,
  `${style.fs} vs ${expect.toFixed(2)}（偏差 ${((style.fs / expect - 1) * 100).toFixed(2)}%）`);
/* 下限随断点不同：>560px 由 --fs-display 的 48×.92 兜底；≤560px 走窄屏公式 10.5vw×.92 */
const iw = await ev('innerWidth');
const floorPx = iw <= 560 ? Math.min(iw * BASE.narrowVw / 100, BASE.narrowCapPx) * SCALE : BASE.minPx * SCALE;
ok(style.fs <= BASE.maxPx * SCALE + 0.3 && style.fs >= floorPx - 0.3,
  '字号未突破收窄后的上下限',
  `${style.fs}px（上限 ${(BASE.maxPx * SCALE).toFixed(2)} / 下限 ${floorPx.toFixed(2)}${iw <= 560 ? ' = 10.5vw×.92' : ' = 48px×.92'}）`);

/* ② 其余字体样式仍是相对单位（跟着字号缩放 = 自适应） */
const lhRatio = /px$/.test(style.lh) ? parseFloat(style.lh) / style.fs : parseFloat(style.lh);
ok(near(lhRatio, 1.06, 0.02), '行高仍为无单位比例 1.06（随字号等比缩放）', `${style.lh} → 比例 ${lhRatio.toFixed(3)}`);
const lsRatio = style.ls / style.fs;
/* 字距随断点不同：宽屏 −.035em；≤560px 放一档到 −.03em（小字号用更松的字距，同时保住字间余量） */
const expectLs = (await ev('innerWidth')) <= 560 ? -0.03 : -0.035;
ok(near(lsRatio, expectLs, 0.001), `字间距为 ${expectLs}em（随字号等比缩放，窄屏放一档）`,
  `${style.ls}px / ${style.fs}px = ${lsRatio.toFixed(4)}em`);

/* ③ 描边补偿：满档（88.32px）时必须等于收字号前的 1.92px；其余视口按 em 等比缩放 */
if (near(style.fs, BASE.maxPx * SCALE, 0.3)) {
  ok(near(style.stroke, 1.92, 0.06), '满档描边绝对厚度补回 1.92px（= 96px × .02em，视觉重量不因缩小而变轻）',
    `${style.stroke}px`);
} else console.log(`跳过（本视口字号 ${style.fs}px 非满档，描边按 em 等比缩放，故不等于 1.92px）`);
const strokeEm = style.stroke / style.fs;
ok(near(strokeEm, 0.0217, 0.0005), '描边仍按 em 等比（窄屏同步缩放）', `${strokeEm.toFixed(4)}em`);

/* ④ 颜色 / 字体 / 字重未被字号改动牵连（--brand 是 hex，computed 是 rgb()，用探针归一化后比） */
const brandRgb = await ev(`(()=>{ const d=document.createElement('div'); d.style.color='var(--brand)';
  document.body.appendChild(d); const v=getComputedStyle(d).color; d.remove(); return v; })()`);
ok(style.color2 === brandRgb, '第二行仍是主色（颜色未变）', `${style.color2} vs brand ${brandRgb}`);
ok(style.weight === '800', '字重令牌仍是 800（中文实际落到 Semibold 最重字面）', style.weight);

/* ⑤ 层级清晰 + 两行文案不变 + 无溢出 */
const hier = JSON.parse(await ev(`(()=>{ const g=s=>{const e=document.querySelector(s); return e?parseFloat(getComputedStyle(e).fontSize):null};
  return JSON.stringify({ h2:g('.section__title, h2'), h3:g('.major-card__title, h3'), sub:g('.hero__sub') }); })()`));
const ratios = Object.entries(hier).filter(([, v]) => v).map(([k, v]) => [k, style.fs / v]);
console.log('   层级：主标题', style.fs, 'px /', ratios.map(([k, r]) => `${k} ×${r.toFixed(2)}`).join(' / '), '| 字体', style.family);
ok(ratios.every(([, r]) => r >= 1.1), '层级不反转：主标题仍明显大于下方各级（≥1.1×）',
  ratios.map(([k, r]) => `${k}×${r.toFixed(2)}`).join(' '));
const lines = JSON.parse(await ev(`(()=>{ const h=document.querySelector('.hero h1'), out=[];
  const walk=n=>{ if(n.nodeType===3){ for(let i=0;i<n.length;i++){ const r=document.createRange(); r.setStart(n,i); r.setEnd(n,i+1);
      const b=r.getBoundingClientRect(); if(b.width||b.height) out.push({ch:n.data[i], top:+b.top.toFixed(1)}); } } else n.childNodes.forEach(walk); };
  walk(h); const tops=[...new Set(out.map(r=>r.top))].sort((a,b)=>a-b);
  return JSON.stringify(tops.map(t=>out.filter(r=>r.top===t).map(r=>r.ch).join(''))); })()`));
ok(lines.length === 2 && lines[0].trim() === '以人文深度' && lines[1] === '塑造未来艺术人才',
  '文案与两行断行不变', JSON.stringify(lines));
ok(style.scrollW <= style.vw + 1, '无横向溢出', `scrollWidth ${style.scrollW} / 视口 ${style.vw}`);

console.log(`\n结果：${pass} 通过 / ${fail} 不达标 | 控制台异常：${errs.length ? errs.join(' | ') : '无'}`);
await send('Target.closeTarget', { targetId }).catch(() => {});
ws.close();
