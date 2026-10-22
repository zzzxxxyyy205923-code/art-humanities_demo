/* 「国家」展示标签位置实测 + 第二行标签对齐 + 搜索回归 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8618/index.html#/cases' }, S);
await sleep(3000);
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
console.log(await ev(`(() => {
  const bars = document.querySelectorAll('#cases-filters .filter-bar');
  const country = bars[0].querySelector('.filter-group--country .filter-group__label');
  const cr = country.getBoundingClientRect();
  const dimLabel = bars[0].querySelector('.filter-group__label');
  const regionGrp = bars[0].querySelectorAll('.filter-group')[1];
  const labels2 = [...bars[1].querySelectorAll('.filter-group__label')];
  const ys2 = labels2.map(l => Math.round(l.getBoundingClientRect().y));
  const csC = getComputedStyle(country), csDim = getComputedStyle(dimLabel);
  return JSON.stringify({
    country: { text: country.textContent,
      sameRowAsDim: Math.abs(cr.y - dimLabel.getBoundingClientRect().y) < 1,
      rightOfRegion: cr.left > regionGrp.getBoundingClientRect().right,
      rightEdge: Math.round(cr.right) },
    styleConsistent: csC.font === csDim.font && csC.color === csDim.color,
    row2: { labels: labels2.map(l => l.textContent), ys: ys2, aligned: new Set(ys2).size === 1 },
    searchFunc: !!document.getElementById('cases-search')
  });
})()`));
console.log('搜索回归:', await ev(`(() => {
  const inp = document.getElementById('cases-search');
  inp.value = '康奈尔'; inp.dispatchEvent(new Event('input'));
  return '已触发';
})()`));
await sleep(400);
console.log('搜索结果:', await ev(`document.getElementById('cases-result').textContent.trim().slice(0, 14)`));
process.exit(0);
