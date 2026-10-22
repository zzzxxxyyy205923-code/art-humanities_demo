/* A.F 详情实测：无作品图、新增 03 官方链接；其他教授不受影响 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8636/index.html' }, S);
await sleep(3500);
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description; return r.result.value; };
const check = id => `(() => {
  MentorSheet.open('${id}');
  const p = document.querySelector('.mentor-sheet__panel');
  const h4s = [...p.querySelectorAll('.mentor-sheet__h4')].map(h => h.textContent.trim());
  const imgs = p.querySelectorAll('.mentor-sheet__workimgs img').length;
  const link = p.querySelector('.mentor-sheet__link');
  const linkRect = link ? link.getBoundingClientRect() : null;
  const prevBlock = link ? link.closest('.mentor-sheet__block').previousElementSibling : null;
  return JSON.stringify({ id: '${id}', h4s, imgs,
    link: link ? { text: link.textContent, href: link.getAttribute('href'), target: link.getAttribute('target') } : null,
    linkBelowWorks: prevBlock ? prevBlock.querySelector('.mentor-sheet__h4').textContent.includes('代表作') : false,
    dividerAbove: link ? getComputedStyle(link.closest('.mentor-sheet__block')).borderTopWidth : null });
})()`;
console.log('A.F:', await ev(check('inst-aca-039')));
await ev(`MentorSheet.close()`);
console.log('M.W（对照）:', await ev(check('inst-aca-040')));
await ev(`MentorSheet.close()`);
console.log('G.B（对照）:', await ev(check('inst-aca-068')));
process.exit(0);
