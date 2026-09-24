/* Hero 主标题「加粗到比 Semibold 更粗」的回归校验。
 *
 * 背景：本机中文字面 PingFang SC 最重只有 Semibold —— 实测 font-weight 400/500/600/700/800/900
 * 全部落到 PingFangSC-Semibold，改 font-weight 在中文上零变化。所以 style.css 用
 * `-webkit-text-stroke: .02em currentColor` 按字号等比加粗笔画。本脚本保证四件事不被改坏：
 *   ① 文案与断行不变（上行「以人文深度」/ 下行「塑造未来艺术人才」，两段各自不拆行）；
 *   ② 描边是「按字号等比」的 em 值（跟字号缩放，不是写死 px）；
 *   ③ 加粗有实质效果：与「临时去掉描边」实测对比，墨量提升 ≥10%；
 *   ④ 加粗不引起重排，也不会让相邻两字粘连
 *      —— 按每字真实边界量「边界处的空白列宽」，逐对断言（不用整行投影，
 *         那样会把字形内部本来就有的窄缝算进来，误报粘连）。
 *
 * 用法：node tools/verify/hero-title-bolder.mjs [宽] [高]   （默认 1440×900）
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const DUMP = process.env.DUMP_DIR || '';   /* 设了就落盘放大图，便于目视 */
const ver = await (await fetch('http://127.0.0.1:9555/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errs = [];
const raw = (m, q = {}, S) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q, sessionId: S })); });
/* CDP 调用必须包超时：Chrome 一死 send() 永不 resolve → node 报 unsettled top-level await 挂死 */
const send = (m, q = {}, S) => Promise.race([raw(m, q, S), sleep(15000).then(() => { throw new Error(`CDP 超时：${m}`); })]);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
/* 先清掉历次遗留的 7789 标签页：堆多了 Page.navigate/captureScreenshot 会挂死；
   且被挤到后台的标签页 document.hidden=true，截到的帧不可信 */
for (const t of await (await fetch('http://127.0.0.1:9555/json/list')).json()) {
  if (t.type === 'page' && /127\.0\.0\.1:7789/.test(t.url || '')) await fetch(`http://127.0.0.1:9555/json/close/${t.id}`);
}
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Target.activateTarget', { targetId });
await send('Page.bringToFront', {}, S);   /* 必须真置前，否则 document.hidden=true */
await send('Runtime.enable', {}, S); await send('Page.enable', {}, S);
await send('Network.enable', {}, S); await send('Network.setCacheDisabled', { cacheDisabled: true }, S);
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900);
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: W < 500 }, S);
await send('Page.navigate', { url: 'http://127.0.0.1:7789/index.html?t=' + Date.now() }, S);
await sleep(4500);

const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, S); return r?.exceptionDetails ? 'ERR:' + r.exceptionDetails.text : r?.result?.value; };
/* 前置条件：窗口被遮挡时 Chrome 判标签页为后台 → 截到未渲染/陈旧帧，墨量会失真。等不回来就报环境不可用 */
for (let i = 0; i < 12 && await ev('document.hidden'); i++) { await send('Page.bringToFront', {}, S); await sleep(700); }
if (await ev('document.hidden')) {
  console.log('!! 环境不可用：标签页处于后台（document.hidden=true），截图不可信，本轮不作数。');
  console.log('   请把自动化窗口切到前台，或用 --disable-backgrounding-occluded-windows --disable-renderer-backgrounding 重启 Chrome 后重跑。');
  await send('Target.closeTarget', { targetId }).catch(() => {});
  ws.close(); process.exit(1);
}
let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { c ? pass++ : fail++; console.log(`${c ? '通过' : '不达标'} ${label}${extra ? ' | ' + extra : ''}`); };

/* ── ① 文案与断行：逐字取 top 归并成行，读出「每行到底是哪些字」 ── */
const lines = JSON.parse(await ev(`(()=>{
  const h=document.querySelector('.hero h1'), out=[];
  const walk=n=>{ if(n.nodeType===3){ for(let i=0;i<n.length;i++){ const r=document.createRange(); r.setStart(n,i); r.setEnd(n,i+1);
      const b=r.getBoundingClientRect(); out.push({ch:n.data[i], top:+b.top.toFixed(1)}); } }
    else n.childNodes.forEach(walk); };
  walk(h);
  const tops=[...new Set(out.map(r=>r.top))].sort((a,b)=>a-b);
  return JSON.stringify(tops.map(t=>out.filter(r=>r.top===t).map(r=>r.ch).join(''))); })()`));
console.log(`视口 ${W}×${H}  行 = ${JSON.stringify(lines)}`);
ok(lines.length === 2, '仍为两行', `行数 ${lines.length}`);
ok((lines[0] || '').trim() === '以人文深度', '上行 = 以人文深度', `实际「${lines[0]}」`);
ok((lines[1] || '') === '塑造未来艺术人才', '下行 = 塑造未来艺术人才', `实际「${lines[1]}」`);

/* ── ② 描边必须是 em 等比值 ── */
const st = JSON.parse(await ev(`(()=>{const c=getComputedStyle(document.querySelector('.hero h1'));
  return JSON.stringify({w:c.webkitTextStrokeWidth, fs:parseFloat(c.fontSize)})})()`));
const emRatio = parseFloat(st.w) / st.fs;
ok(/px$/.test(st.w) && emRatio > 0.005 && emRatio < 0.05,
  '描边按字号等比（0.5%~5% em）', `${st.w} / ${st.fs}px = ${(emRatio * 100).toFixed(2)}% em`);

/* ── ③④ 逐行取图：墨量 + 每对相邻字边界处的空白列宽 ── */
/* 先把 Hero 影像层藏掉：背景视频在两次截图之间会换帧，它的亮像素会被当成「墨」，
   让字间空隙量出负数（假粘连）。文字本身不受影响。 */
await ev(`(()=>{const m=document.querySelector('.hero__media'); if(m) m.style.visibility='hidden'; return 1})()`);
await sleep(200);
const LINES = [
  { name: '上行', node: `document.querySelector('.hero h1').firstChild` },
  { name: '下行', node: `document.querySelector('.hero h1 em').firstChild` },
];
for (const L of LINES) {
  /* 每字的外框（advance 盒）与整行裁剪框，全部用页面坐标 */
  const geo = JSON.parse(await ev(`(()=>{ const t=${L.node}; const out=[];
    for(let i=0;i<t.length;i++){ const r=document.createRange(); r.setStart(t,i); r.setEnd(t,i+1); const b=r.getBoundingClientRect();
      if(b.width||b.height) out.push({ch:t.data[i], l:b.left+scrollX, r:b.right+scrollX, t:b.top+scrollY, b:b.bottom+scrollY}); }
    return JSON.stringify(out); })()`));
  const chars = geo.filter(c => c.ch.trim());
  const clip = {
    x: Math.min(...chars.map(c => c.l)), y: Math.min(...chars.map(c => c.t)),
    width: Math.max(...chars.map(c => c.r)) - Math.min(...chars.map(c => c.l)),
    height: Math.max(...chars.map(c => c.b)) - Math.min(...chars.map(c => c.t)),
  };
  /* 每对相邻字之间的分割点（相对裁剪框左边的 CSS px） */
  const bounds = [];
  for (let i = 0; i < chars.length - 1; i++) bounds.push((chars[i].r + chars[i + 1].l) / 2 - clip.x);

  const shot = async () => (await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 }, captureBeyondViewport: true }, S)).data;
  const analyze = async (b64) => JSON.parse(await ev(`(async()=>{
    const img=new Image(); img.src='data:image/png;base64,${b64}'; await img.decode();
    const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
    const x=c.getContext('2d'); x.drawImage(img,0,0);
    const d=x.getImageData(0,0,c.width,c.height).data;
    const lumAt=(px,py)=>{ const i=(py*c.width+px)*4; return 0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; };
    let ink=0;
    for(let py=0;py<c.height;py++) for(let px=0;px<c.width;px++) if(lumAt(px,py)>90) ink++;
    /* 只看字形中间带 30%~70% 行（最接近侧边距，能真实反映两字有没有糊在一起） */
    const py0=Math.floor(c.height*.3), py1=Math.ceil(c.height*.7);
    const colHas=new Array(c.width).fill(false);
    for(let py=py0;py<py1;py++) for(let px=0;px<c.width;px++) if(lumAt(px,py)>90) colHas[px]=true;
    /* 每个相邻字边界：从分割点向左右扩到最近的有墨列，中间空白宽度即该处字间空隙。
       DEV = 图宽 / 裁剪框 CSS 宽（deviceScaleFactor × clip.scale，别写死 2） */
    const DEV = c.width / ${clip.width};
    const gaps=${JSON.stringify(bounds)}.map(b=>{ let px=Math.round(b*DEV);
      if(px<0||px>=c.width) return null;
      let l=px, r=px;
      while(l>0 && !colHas[l]) l--;
      while(r<c.width-1 && !colHas[r]) r++;
      /* colHas[l]/colHas[r] 为最近的有墨列，空隙 = 两列之间的空白 */
      return +(((r-l-1)/DEV).toFixed(2)); });
    return JSON.stringify({inkPct:+(ink/(c.width*c.height)*100).toFixed(3), gapsCss:gaps}); })()`));

  const withStroke = await analyze(await shot());
  /* 临时去掉描边量基线：注意用 webkitTextStrokeWidth，'none' 不是该简写的合法值（写了会被丢弃 → 基线是假的） */
  await ev(`document.querySelector('.hero h1').style.webkitTextStrokeWidth='0'`);
  await sleep(280);
  const noStroke = await analyze(await shot());
  await ev(`document.querySelector('.hero h1').style.webkitTextStrokeWidth=''`);
  await sleep(280);

  const gain = +(withStroke.inkPct / noStroke.inkPct - 1) * 100;
  ok(gain >= 10, `${L.name}加粗后墨量提升 ≥10%`, `${noStroke.inkPct}% → ${withStroke.inkPct}%（+${gain.toFixed(1)}%）`);

  const pairs = chars.length - 1;
  const zero = withStroke.gapsCss.filter(g => g !== null && g <= 0).length;
  const minGap = Math.min(...withStroke.gapsCss.filter(g => g !== null));
  ok(zero === 0, `${L.name}相邻字全部未粘连（${pairs} 对）`,
    `最窄字间空隙 ${minGap} CSS px；逐对空隙 ${withStroke.gapsCss.join(' / ')}（基线 ${noStroke.gapsCss.join(' / ')}）`);
  ok(minGap >= noStroke.gapsCss.filter(g => g !== null).reduce((a, b) => Math.min(a, b), Infinity) * 0.3,
    `${L.name}字间空隙未被笔画吃掉大半`, `基线最窄 ${Math.min(...noStroke.gapsCss.filter(g => g !== null))} → 加粗后 ${minGap} CSS px`);

  if (DUMP) {
    mkdirSync(DUMP, { recursive: true });
    const f = `${DUMP}/${L.name}-${W}.png`;
    writeFileSync(f, Buffer.from(await shot(), 'base64'));
    console.log(`   放大图已存 ${f}`);
  }
}

/* ── 加粗不得引起重排 / 不得横向溢出 ── */
const g = async () => JSON.parse(await ev(`(()=>{const h=document.querySelector('.hero h1'); const r=h.getBoundingClientRect();
  const e=h.querySelector('em').getBoundingClientRect();
  return JSON.stringify({h1:[+r.width.toFixed(1),+r.height.toFixed(1)], emTop:+e.top.toFixed(1), scrollW:document.documentElement.scrollWidth, vw:innerWidth})})()`));
const g1 = await g();
await ev(`document.querySelector('.hero h1').style.webkitTextStrokeWidth='0'`);
await sleep(250);
const g2 = await g();
await ev(`document.querySelector('.hero h1').style.webkitTextStrokeWidth=''`);
ok(JSON.stringify(g1) === JSON.stringify(g2), '加粗未引起重排（几何完全一致）', `${JSON.stringify(g1)} vs ${JSON.stringify(g2)}`);
ok(g1.scrollW <= g1.vw + 1, '无横向溢出', `scrollWidth ${g1.scrollW} / 视口 ${g1.vw}`);

console.log(`\n结果：${pass} 通过 / ${fail} 不达标 | 控制台异常：${errs.length ? errs.join(' | ') : '无'}`);
await send('Target.closeTarget', { targetId }).catch(() => {});   /* 用完即关，别把标签页留给下一轮 */
ws.close();
