/* 导航栏 Logo 校验：文案 = Art & Humanities；图形高度 == 右侧文字块总高；等比不拉伸；垂直居中；不溢出导航栏
   用法：node tools/verify/logo-align.mjs [宽] [高]        （默认 1440×900） */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ver = await (await fetch('http://127.0.0.1:9555/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errs = [];
const raw = (m, q = {}, S) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q, sessionId: S })); });
/* CDP 调用必须包超时：Chrome 一死 send() 永不 resolve → node 报 unsettled top-level await 挂死 */
const send = (m, q = {}, S) => Promise.race([raw(m, q, S), sleep(15000).then(() => { throw new Error(`CDP 超时：${m}`); })]);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
/* 先清掉历次遗留的 7789 标签页：堆到几十个时 Page.navigate / captureScreenshot 会挂死不返回 */
for (const t of await (await fetch('http://127.0.0.1:9555/json/list')).json()) {
  if (t.type === 'page' && /127\.0\.0\.1:7789/.test(t.url || '')) await fetch(`http://127.0.0.1:9555/json/close/${t.id}`);
}
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Target.activateTarget', { targetId });
await send('Runtime.enable', {}, S); await send('Page.enable', {}, S);
await send('Network.enable', {}, S); await send('Network.setCacheDisabled', { cacheDisabled: true }, S);
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900);
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500 }, S);
await send('Page.navigate', { url: 'http://127.0.0.1:7789/index.html?t=' + Date.now() }, S);
await sleep(4200);

const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, S); return r?.exceptionDetails ? 'ERR:' + r.exceptionDetails.text : r?.result?.value; };
/* 实测「可见图形」在画布里的高度占比（PNG 自带透明留白，框高 ≠ 图形高），
   用 canvas 扫 alpha 包围盒，不写死数值 —— 换 logo 文件也会自动跟着变 */
const artRatio = async () => await ev(`(async()=>{
  const img=document.querySelector('.navbar__logo img');
  try { await img.decode(); } catch (e) {}      /* 必须等解码完成，否则 naturalWidth=0 → 占比算成 NaN */
  const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
  const x=c.getContext('2d'); x.drawImage(img,0,0);
  const d=x.getImageData(0,0,c.width,c.height).data;
  let minY=1e9,maxY=-1;
  for(let y=0;y<c.height;y++){ for(let p=0;p<c.width;p++){ if(d[(y*c.width+p)*4+3]>12){ if(y<minY)minY=y; if(y>maxY)maxY=y; break; } } }
  return +(((maxY-minY+1)/c.height).toFixed(4));
})()`);
const probe = async () => JSON.parse(await ev(`(()=>{
  const a=document.querySelector('.navbar__logo'), img=a.querySelector('img'), txt=a.querySelector('.navbar__logo-text');
  const en=a.querySelector('.navbar__logo-en'), zh=a.querySelector('.navbar__logo-zh'), nav=document.querySelector('.navbar');
  const r=e=>{const b=e.getBoundingClientRect();return {w:+b.width.toFixed(2),h:+b.height.toFixed(2),top:+b.top.toFixed(2),bottom:+b.bottom.toFixed(2),cy:+((b.top+b.bottom)/2).toFixed(2)}};
  const vis=e=>getComputedStyle(e).display!=='none';
  return JSON.stringify({en:en.textContent.trim(), alt:img.getAttribute('alt'),
    img:r(img), txt:r(txt), enBox:r(en), zhBox:vis(zh)?r(zh):null, nav:r(nav),
    nat:{w:img.naturalWidth,h:img.naturalHeight}, txtVis:vis(txt), zhVis:vis(zh),
    fsEn:getComputedStyle(en).fontSize, fsZh:vis(zh)?getComputedStyle(zh).fontSize:null});
})()`));

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { c ? pass++ : fail++; console.log(`${c ? '通过' : '不达标'} ${label}${extra ? ' | ' + extra : ''}`); };

const s = await probe();
const art = await artRatio();
console.log(`视口 ${W}×${H}`);
console.log('  实测：', JSON.stringify(s), `| 图形占画布高 ${art}`);

ok(s.en === 'Art & Humanities', '文案 = Art & Humanities', `实际「${s.en}」`);
ok(/Art & Humanities/.test(s.alt), 'alt 同步为 Art & Humanities', `实际「${s.alt}」`);
const ratioR = s.img.w / s.img.h, ratioN = s.nat.w / s.nat.h;
ok(Math.abs(ratioR - ratioN) < 0.02, '等比未拉伸（渲染宽高比 ≈ 原始宽高比）', `${ratioR.toFixed(3)} vs ${ratioN.toFixed(3)}`);
if (s.txtVis) {
  const visibleH = +(s.img.h * art).toFixed(2);   // 可见图形高度（扣掉 PNG 透明留白）
  ok(Math.abs(visibleH - s.txt.h) <= 1, '可见图形高度 == 右侧文字块总高', `可见 ${visibleH} / 字 ${s.txt.h}（框高 ${s.img.h}）`);
  ok(Math.abs(s.img.cy - s.txt.cy) <= 1, '图形与文字垂直居中对齐', `图心 ${s.img.cy} / 字心 ${s.txt.cy}`);
} else console.log('跳过（该视口文字块隐藏）');
ok(s.img.top >= s.nav.top - 0.5 && s.img.bottom <= s.nav.bottom + 0.5, '图形未溢出导航栏', `图 ${s.img.top}~${s.img.bottom} / 栏 ${s.nav.top}~${s.nav.bottom}`);
ok(s.txt.bottom <= s.nav.bottom + 0.5 && s.txt.top >= s.nav.top - 0.5, '文字未溢出导航栏');
/* 放大后不能挤到右侧导航：左区右缘必须仍在右区左缘之前，且页面不横向溢出 */
const lay = JSON.parse(await ev(`(()=>{const r=e=>{const b=e.getBoundingClientRect();return {left:+b.left.toFixed(2),right:+b.right.toFixed(2)}};
  return JSON.stringify({left:r(document.querySelector('.navbar__left')), right:r(document.querySelector('.navbar__right')),
    scrollW:document.documentElement.scrollWidth, vw:innerWidth, navLinks:document.querySelectorAll('.navbar .nav-link, .navbar__menu-toggle').length})})()`));
/* 窄屏 .navbar__right 整组隐藏（导航改走汉堡菜单），rect 为 0，此时该断言不适用 */
if (lay.right.right - lay.right.left > 1) ok(lay.left.right <= lay.right.left + 0.5, 'Logo 未挤压右侧导航区', `左区右缘 ${lay.left.right} / 右区左缘 ${lay.right.left}`);
else console.log('跳过（该视口右侧导航区隐藏，走汉堡菜单）');
ok(lay.scrollW <= lay.vw + 1, '无横向溢出', `scrollWidth ${lay.scrollW} / 视口 ${lay.vw}`);

console.log(`\n结果：${pass} 通过 / ${fail} 不达标 | 控制台异常：${errs.length ? errs.join(' | ') : '无'}`);
await send('Target.closeTarget', { targetId }).catch(() => {});   /* 用完即关，别把标签页留给下一轮 */
ws.close();
