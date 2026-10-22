/* 字号 85% 缩放实测 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8627/index.html' }, S);
await sleep(3000);
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
console.log(await ev(`(() => {
  document.getElementById('instructors-root').scrollIntoView();
  [...document.querySelectorAll('#instructors-grid .person-card')].find(c => c.dataset.mid === 'inst-aca-039').click();
  const p = document.querySelector('.mentor-sheet__panel');
  const fs = sel => { const el = p.querySelector(sel); return el ? getComputedStyle(el).fontSize : null; };
  return JSON.stringify({
    eyebrow: fs('.mentor-sheet__eyebrow'),
    meta: fs('.mentor-sheet__meta'),
    name: fs('.mentor-sheet__name'),
    h4: fs('.mentor-sheet__h4'),
    h4en: fs('.mentor-sheet__h4 .u-en'),
    workline: fs('.mentor-sheet__workline'),
    para: fs('.mentor-sheet__p'),
    kvDt: fs('.mentor-sheet__kv dt'),
    kvDd: fs('.mentor-sheet__kv dd')
  });
})()`));
process.exit(0);
