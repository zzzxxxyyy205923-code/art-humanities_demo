/* M.W 卡片位置实测：海外教授标签下顺序应为 A.F → M.W → M.C */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8617/index.html' }, S);
await sleep(3000);
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
console.log(await ev(`(() => {
  document.getElementById('instructors-root').scrollIntoView();
  const btn = [...document.querySelectorAll('#instructors-filter-bar .filter-btn')].find(b => b.textContent === '海外教授');
  btn.click();
  const names = [...document.querySelectorAll('#instructors-grid .person-card__name')].map(n => n.textContent);
  const i = names.indexOf('M.W');
  const imgs = [...document.querySelectorAll('#instructors-grid img')];
  return JSON.stringify({ seq: names.slice(i - 1, i + 2),
    orderOK: names[i - 1] === 'A.F' && names[i + 1] === 'M.C',
    total: names.length, imgs: imgs.length,
    broken: imgs.filter(m => m.complete && m.naturalWidth === 0).length });
})()`));
process.exit(0);
