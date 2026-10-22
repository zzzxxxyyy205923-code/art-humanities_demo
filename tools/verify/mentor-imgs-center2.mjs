/* 图片区居中实测：上下间距相等 / 缩放比例 / 间距加大 / 不越线 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fs = await import('node:fs');
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
await send('Page.navigate', { url: 'http://127.0.0.1:8630/index.html' }, S);
await sleep(3000);
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description; return r.result.value; };
await ev(`(() => { document.getElementById('instructors-root').scrollIntoView();
  [...document.querySelectorAll('#instructors-grid .person-card')].find(c => c.dataset.mid === 'inst-aca-039').click();
  document.querySelector('.mentor-sheet__scroll').scrollTop = 99999; return 'ok'; })()`);
await sleep(1500);
console.log(await ev(`(() => {
  const blocks = [...document.querySelectorAll('.mentor-sheet__body > .mentor-sheet__block')];
  const imgsBlock = blocks.find(b => b.classList.contains('mentor-sheet__block--imgs'));
  const lineTop = imgsBlock.getBoundingClientRect().top;                       // 上横线
  const lineBottom = document.querySelector('.mentor-sheet__meta-grid').getBoundingClientRect().top;  // 下横线
  const g = imgsBlock.querySelector('.mentor-sheet__workimgs');
  const gr = g.getBoundingClientRect();
  const spaceAbove = Math.round(gr.y - lineTop), spaceBelow = Math.round(lineBottom - gr.bottom);
  const imgs = [...g.querySelectorAll('img')].map(i => { const r = i.getBoundingClientRect();
    return { w: Math.round(r.width), loaded: i.complete && i.naturalWidth > 0 }; });
  return JSON.stringify({ lineTop: Math.round(lineTop), lineBottom: Math.round(lineBottom),
    spaceAbove, spaceBelow, vCentered: Math.abs(spaceAbove - spaceBelow) < 2,
    gridW: Math.round(gr.width), gridH: Math.round(gr.height),
    scalePct: Math.round(gr.width / 974 * 100), gap: getComputedStyle(g).gap,
    withinLines: gr.y >= lineTop && gr.bottom <= lineBottom, imgs });
})()`));
const shot = await send('Page.captureScreenshot', { format: 'png' }, S);
fs.writeFileSync('/tmp/mentor-imgs-centered.png', Buffer.from(shot.data, 'base64'));
process.exit(0);
