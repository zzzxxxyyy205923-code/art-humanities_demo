/* 抽样渲染实测：随机三位海外教授详情（M.C / I.T / T.G）+ 折叠态隐藏卡打开 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8635/index.html' }, S);
await sleep(3500);
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description; return r.result.value; };
const check = id => `(() => {
  MentorSheet.open('${id}');
  const p = document.querySelector('.mentor-sheet__panel');
  const h4s = [...p.querySelectorAll('.mentor-sheet__h4')].map(h => h.textContent.trim());
  const paras = [...p.querySelectorAll('.mentor-sheet__p')].map(x => x.textContent.slice(0, 24));
  const works = p.querySelectorAll('.mentor-sheet__workline').length;
  return JSON.stringify({ id: '${id}', title: p.querySelector('.mentor-sheet__name').textContent,
    meta: p.querySelector('.mentor-sheet__meta').textContent.slice(0, 26), h4s, works, paras });
})()`;
for (const id of ['inst-aca-040', 'inst-aca-044', 'inst-aca-079']) {
  console.log(await ev(check(id)));
  await ev(`MentorSheet.close()`);
}
process.exit(0);
