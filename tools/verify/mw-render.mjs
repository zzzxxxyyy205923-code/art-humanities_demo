/* M.W 导师卡片渲染实测：海外教授标签 → 卡片存在、字段正确、照片加载 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8616/index.html' }, S);
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
  const cards = [...document.querySelectorAll('#instructors-grid .person-card')];
  const mw = cards.find(c => c.querySelector('.person-card__name').textContent === 'M.W');
  if (!mw) return JSON.stringify({ count: cards.length, mw: '未找到' });
  const img = mw.querySelector('img');
  return JSON.stringify({
    count: cards.length,
    bg: mw.querySelector('.person-card__background').textContent,
    title: mw.querySelector('.person-card__title').textContent.slice(0, 26) + '…',
    imgLoaded: !!img && img.complete && img.naturalWidth > 0,
    imgFile: img.src.split('/').pop()
  });
})()`));
process.exit(0);
