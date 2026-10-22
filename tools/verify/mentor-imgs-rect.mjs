/* 图片区矩形布局实测：三图填满 / 裁切率 / 无白缝 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8628/index.html' }, S);
await sleep(3000);
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description; return r.result.value; };
await ev(`(() => { document.getElementById('instructors-root').scrollIntoView();
  [...document.querySelectorAll('#instructors-grid .person-card')].find(c => c.dataset.mid === 'inst-aca-039').click();
  document.querySelector('.mentor-sheet__scroll').scrollTop = 99999; return 'ok'; })()`);
await sleep(1500);
console.log(await ev(`(() => {
  const g = document.querySelector('.mentor-sheet__workimgs');
  const gr = g.getBoundingClientRect();
  const imgs = [...g.querySelectorAll('img')].map(i => {
    const r = i.getBoundingClientRect();
    const nat = i.naturalWidth / i.naturalHeight, box = r.width / r.height;
    return { w: Math.round(r.width), h: Math.round(r.height),
      cropPct: Math.round(Math.abs(1 - Math.min(box / nat, nat / box)) * 1000) / 10,
      loaded: i.complete && i.naturalWidth > 0 };
  });
  return JSON.stringify({ rect: { w: Math.round(gr.width), h: Math.round(gr.height) },
    aspect: Math.round(gr.width / gr.height * 100) / 100, imgs });
})()`));
const shot = await send('Page.captureScreenshot', { format: 'png' }, S);
fs.writeFileSync('/tmp/mentor-sheet-imgs.png', Buffer.from(shot.data, 'base64'));
console.log('截图完成');
process.exit(0);
