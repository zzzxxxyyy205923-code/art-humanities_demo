/* 列出课程管理表格中的课程名称与分页 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ver = await (await fetch('http://127.0.0.1:9555/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, q = {}, S) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q, sessionId: S })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const list = (await send('Target.getTargets')).targetInfos.filter(t => t.type === 'page');
const { sessionId: S } = await send('Target.attachToTarget', { targetId: list[0].targetId, flatten: true });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
console.log(await ev(`JSON.stringify({
  url: location.href,
  names: [...document.querySelectorAll('tr')].map(t => t.querySelector('td') ? t.querySelector('td').textContent.trim() : null).filter(Boolean).slice(0, 30),
  hasArtproAnywhere: document.body.innerText.toUpperCase().includes('ARTPRO'),
  pagination: [...document.querySelectorAll('[class*=page], [class*=pager]')].map(p => p.textContent.trim().slice(0, 60)).slice(0, 5)
})`));
process.exit(0);
