/* 标签改名后功能回归：国家筛选命中 / 取消 / 状态绑定 / 搜索不受影响 */
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
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
console.log('基线:', await ev(`document.getElementById('cases-result').textContent.trim().slice(0, 14)`));
console.log('点击英国:', await ev(`(() => {
  const b = [...document.querySelectorAll('#cases-filters .filter-btn')].find(b => b.textContent === '英国');
  b.click();
  return JSON.stringify({ result: document.getElementById('cases-result').textContent.trim().slice(0, 16),
    stateRegion: CasesPage.state.region, btnActive: b.classList.contains('is-active') });
})()`));
console.log('再点取消:', await ev(`(() => {
  const b = [...document.querySelectorAll('#cases-filters .filter-btn')].find(b => b.textContent === '英国');
  b.click();
  return JSON.stringify({ result: document.getElementById('cases-result').textContent.trim().slice(0, 14),
    stateRegion: CasesPage.state.region });
})()`));
console.log('叠加搜索:', await ev(`(() => {
  const b = [...document.querySelectorAll('#cases-filters .filter-btn')].find(b => b.textContent === '美国');
  b.click();
  const inp = document.getElementById('cases-search');
  inp.value = '康奈尔'; inp.dispatchEvent(new Event('input'));
  return '已触发';
})()`));
await sleep(400);
console.log('结果:', await ev(`JSON.stringify({ result: document.getElementById('cases-result').textContent.trim().slice(0, 16),
  labels: [...document.querySelectorAll('#cases-filters .filter-bar')[0].querySelectorAll('.filter-group__label')].map(l => l.textContent) })`));
process.exit(0);
