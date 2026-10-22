/* 滚动实时预览面板，导出完整区块层级 + 截图 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fs = await import('node:fs');
const ver = await (await fetch('http://127.0.0.1:9555/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, q = {}, S) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q, sessionId: S })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const pages = (await send('Target.getTargets')).targetInfos.filter(t => t.type === 'page' && t.url.includes('admin.html'));
const { sessionId: S } = await send('Target.attachToTarget', { targetId: pages[0].targetId, flatten: true });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
const panelInfo = await ev(`(() => {
  const el = [...document.querySelectorAll('*')].find(el => el.textContent.trim().startsWith('实时预览') && el.textContent.length < 30);
  let p = el;
  for (let i = 0; i < 10 && p; i++) { p = p.parentElement; const r = p.getBoundingClientRect(); if (r.width > 420 && r.height > 600) return JSON.stringify({ cls: p.className.slice(0, 100), scrollable: p.scrollHeight > p.clientHeight }); }
  return 'not found';
})()`);
console.log('面板定位:', panelInfo);
console.log('滚动前区块:', await ev(`(() => {
  const el = [...document.querySelectorAll('*')].find(el => el.textContent.trim().startsWith('实时预览') && el.textContent.length < 30);
  let p = el; for (let i = 0; i < 10 && p; i++) { p = p.parentElement; const r = p.getBoundingClientRect(); if (r.width > 420 && r.height > 600) break; }
  const secs = [...p.querySelectorAll('[class*=sec] > [class*=title], h1,h2,h3,h4')].map(h => h.textContent.trim()).filter(t => t && t.length < 50);
  return JSON.stringify([...new Set(secs)].slice(0, 30));
})()`));
console.log('滚到底部:', await ev(`(() => {
  const el = [...document.querySelectorAll('*')].find(el => el.textContent.trim().startsWith('实时预览') && el.textContent.length < 30);
  let p = el; for (let i = 0; i < 10 && p; i++) { p = p.parentElement; const r = p.getBoundingClientRect(); if (r.width > 420 && r.height > 600) break; }
  p.scrollTop = p.scrollHeight; return 'ok';
})()`));
await sleep(1500);
const shot = await send('Page.captureScreenshot', { format: 'png' }, S);
fs.writeFileSync('/tmp/ref-preview-bottom.png', Buffer.from(shot.data, 'base64'));
console.log('底部截图已保存');
console.log('全量区块标题:', await ev(`(() => {
  const el = [...document.querySelectorAll('*')].find(el => el.textContent.trim().startsWith('实时预览') && el.textContent.length < 30);
  let p = el; for (let i = 0; i < 10 && p; i++) { p = p.parentElement; const r = p.getBoundingClientRect(); if (r.width > 420 && r.height > 600) break; }
  const secs = [...p.querySelectorAll('[class*=num],[class*=sec-title],h3,h4')].map(h => h.textContent.trim()).filter(t => /^\\d\\d \\//.test(t) || (t.length > 2 && t.length < 40));
  return JSON.stringify([...new Set(secs)].slice(0, 40));
})()`));
process.exit(0);
