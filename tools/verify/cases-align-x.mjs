/* 筛选区水平位置实测：国家紧挨维度组；第二行「专业方向」与上方标签左对齐 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8619/index.html#/cases' }, S);
await sleep(3000);
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
console.log(await ev(`(() => {
  const bars = document.querySelectorAll('#cases-filters .filter-bar');
  const g1 = bars[0].querySelectorAll('.filter-group');
  const dim = g1[0], nat = g1[1];
  const dimR = dim.getBoundingClientRect(), natR = nat.getBoundingClientRect();
  const b2g = bars[1].querySelectorAll('.filter-group');
  const branchLbl = b2g[0].querySelector('.filter-group__label');
  const dimLbl = dim.querySelector('.filter-group__label');
  const bl = branchLbl.getBoundingClientRect(), dl = dimLbl.getBoundingClientRect();
  return JSON.stringify({
    dimGroupRight: Math.round(dimR.right), natGroupLeft: Math.round(natR.left),
    gap: Math.round(natR.left - dimR.right),
    adjacent: Math.abs((natR.left - dimR.right) - 12) < 2,
    row2: { branchLabelX: Math.round(bl.x), dimLabelX: Math.round(dl.x),
      leftAligned: Math.abs(bl.x - dl.x) < 1 },
    row1GroupCount: g1.length,
    firstRowLabels: [...bars[0].querySelectorAll('.filter-group__label')].map(l => l.textContent),
    secondRowLabels: [...bars[1].querySelectorAll('.filter-group__label')].map(l => l.textContent)
  });
})()`));
process.exit(0);
