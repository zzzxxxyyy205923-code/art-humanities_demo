/* 导出 #cases-filters 实际 DOM 结构与几何信息 */
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
  const wrap = document.getElementById('cases-filters');
  const bars = wrap.querySelectorAll(':scope > .filter-bar');
  const dump = bar => ({
    rect: (b => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }))(bar.getBoundingClientRect()),
    groups: [...bar.querySelectorAll(':scope > .filter-group')].map(g => ({
      label: (g.querySelector('.filter-group__label') || {}).textContent || null,
      y: Math.round(g.getBoundingClientRect().y),
      w: Math.round(g.getBoundingClientRect().width),
      wrapped: g.querySelectorAll('.filter-group').length
    }))
  });
  return JSON.stringify({
    barCount: bars.length,
    bar1: dump(bars[0]),
    bar2: bars[1] ? dump(bars[1]) : null,
    htmlHead: wrap.innerHTML.slice(0, 400)
  });
})()`));
process.exit(0);
