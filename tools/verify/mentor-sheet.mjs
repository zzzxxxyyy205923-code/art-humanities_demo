/* 导师详情叠加层实测：A.F 完整范式 + 其他导师占位 + 交互 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ver = await (await fetch('http://127.0.0.1:9555/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, q = {}, S) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q, sessionId: S })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, S);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, S);
await send('Page.navigate', { url: 'http://127.0.0.1:8621/index.html' }, S);
await sleep(3000);
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
const state = `(() => {
  const p = document.querySelector('.mentor-sheet__panel');
  const r = p.getBoundingClientRect();
  const vw = innerWidth, vh = innerHeight;
  return JSON.stringify({ open: !!document.querySelector('.mentor-sheet.is-open'),
    centered: Math.abs((r.x + r.width / 2) - vw / 2) < 2 && Math.abs((r.y + r.height / 2) - vh / 2) < 30,
    w: Math.round(r.width), bordered: getComputedStyle(p).borderTopWidth,
    title: (p.querySelector('.mentor-sheet__name') || {}).textContent || null,
    meta: (p.querySelector('.mentor-sheet__meta') || {}).textContent || null,
    h4s: [...p.querySelectorAll('.mentor-sheet__h4')].map(h => h.textContent.trim()),
    works: p.querySelectorAll('.mentor-sheet__works li').length,
    paras: p.querySelectorAll('.mentor-sheet__p').length,
    ph: (p.querySelector('.mentor-sheet__ph') || {}).textContent || null,
    imgLoaded: (() => { const i = p.querySelector('.mentor-sheet__avatar img'); return !!i && i.complete && i.naturalWidth > 0; })()
  });
})()`;
console.log('点击 A.F 卡片:', await ev(`(() => {
  document.getElementById('instructors-root').scrollIntoView();
  const card = [...document.querySelectorAll('#instructors-grid .person-card')].find(c => c.dataset.mid === 'inst-aca-039');
  card.click(); return 'clicked';
})()`));
await sleep(600);
console.log('详情面板:', await ev(state));
console.log('ESC 关闭:', await ev(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'})); 'esc'`));
await sleep(300);
console.log('关闭态:', await ev(`JSON.stringify({ open: !!document.querySelector('.mentor-sheet.is-open'), locked: document.body.classList.contains('is-locked') })`));
console.log('点击其他导师（占位态）:', await ev(`(() => {
  const card = [...document.querySelectorAll('#instructors-grid .person-card')].find(c => c.dataset.mid === 'inst-aca-001');
  card.click(); return 'clicked';
})()`));
await sleep(400);
console.log(await ev(state));
console.log('遮罩点击关闭:', await ev(`document.querySelector('.mentor-sheet__bg').click(); 'ok'`));
await sleep(300);
console.log('关闭态:', await ev(`JSON.stringify({ open: !!document.querySelector('.mentor-sheet.is-open') })`));
process.exit(0);
