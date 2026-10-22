/* 学生案例搜索区「地区」纯展示标签：渲染 / 样式一致 / 搜索功能回归实测 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8615/index.html#/cases' }, S);
await sleep(3000);
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
console.log(await ev(`(() => {
  const grp = document.querySelector('.filter-group--search');
  const labels = [...grp.querySelectorAll('.filter-group__label')];
  const cs0 = getComputedStyle(labels[0]), cs1 = getComputedStyle(labels[1]);
  const inp = grp.querySelector('#cases-search');
  const lr = labels[1].getBoundingClientRect(), ir = inp.getBoundingClientRect();
  return JSON.stringify({ labels: labels.map(l => l.textContent),
    sameFont: cs0.font === cs1.font, sameColor: cs0.color === cs1.color, sameSize: cs0.fontSize === cs1.fontSize,
    inputW: Math.round(ir.width),
    labelVertCenter: Math.abs((lr.top + lr.height / 2) - (ir.top + ir.height / 2)) < 1,
    result0: document.getElementById('cases-result').textContent.trim().slice(0, 12) });
})()`));
console.log('输入搜索词:', await ev(`(() => {
  const inp = document.getElementById('cases-search');
  inp.value = '康奈尔'; inp.dispatchEvent(new Event('input'));
  return '已触发';
})()`));
await sleep(400);
console.log(await ev(`(() => {
  const btns = [...document.querySelectorAll('#cases-filters .filter-btn')];
  const regionBtn = btns.find(b => b.textContent === '英国');
  regionBtn && regionBtn.click();
  return JSON.stringify({ resultAfterSearchAndFilter: document.getElementById('cases-result').textContent.trim().slice(0, 16),
    labelsAfterRerender: [...document.querySelectorAll('.filter-group--search .filter-group__label')].map(l => l.textContent),
    searchValueKept: document.getElementById('cases-search').value });
})()`));
console.log('清空搜索 + 重置:', await ev(`CasesPage.reset();
  JSON.stringify({ labelsAfterReset: [...document.querySelectorAll('.filter-group--search .filter-group__label')].map(l => l.textContent),
    result: document.getElementById('cases-result').textContent.trim().slice(0, 12) })`));
process.exit(0);
