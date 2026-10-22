/* 参考后台登录探测：进入登录页，输出表单结构 */
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
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, S);
await send('Page.navigate', { url: 'https://cb-env-qianxiaos-152-d3a1d39adbb.ixdf.com/admin.html#courses' }, S);
await sleep(6000);
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
console.log(await ev(`JSON.stringify({
  url: location.href, title: document.title,
  inputs: [...document.querySelectorAll('input')].map(i => ({ type: i.type, placeholder: i.placeholder, name: i.name, id: i.id })),
  buttons: [...document.querySelectorAll('button, .btn, [class*=login] button, [class*=btn]')].slice(0, 8).map(b => b.textContent.trim()).filter(Boolean),
  text: document.body.innerText.slice(0, 300)
})`));
process.exit(0);
