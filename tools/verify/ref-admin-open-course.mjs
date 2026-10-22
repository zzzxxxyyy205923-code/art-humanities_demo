/* 附加到 admin 页 → 全局定位 ARTPRO 行 → 点击其「编辑课程」→ 探测实时预览 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ver = await (await fetch('http://127.0.0.1:9555/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, q = {}, S) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q, sessionId: S })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const pages = (await send('Target.getTargets')).targetInfos.filter(t => t.type === 'page' && t.url.includes('admin.html'));
if (!pages.length) { console.log('未找到 admin 页，targets:', (await send('Target.getTargets')).targetInfos.map(t => t.url)); process.exit(1); }
const { sessionId: S } = await send('Target.attachToTarget', { targetId: pages[0].targetId, flatten: true });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
console.log('URL:', await ev(`location.href`));
console.log('ARTPRO 定位:', await ev(`(() => {
  const all = [...document.querySelectorAll('tr, li, [class*=row], [class*=card]')];
  const hit = all.find(el => el.textContent.includes('ARTPRO') && el.children.length < 30);
  if (!hit) return '未找到行';
  const btns = [...hit.querySelectorAll('button, a')].map(b => b.textContent.trim());
  return JSON.stringify({ tag: hit.tagName, cls: hit.className.slice(0, 60), text: hit.textContent.trim().slice(0, 100), btns });
})()`));
console.log('点击编辑课程:', await ev(`(() => {
  const all = [...document.querySelectorAll('tr, li, [class*=row], [class*=card]')];
  const hit = all.find(el => el.textContent.includes('ARTPRO') && el.children.length < 30);
  const btn = hit && [...hit.querySelectorAll('button, a')].find(b => b.textContent.includes('编辑'));
  if (!btn) return '无编辑按钮';
  btn.click();
  return '已点击: ' + btn.textContent.trim();
})()`));
await sleep(4000);
console.log('点击后:', await ev(`JSON.stringify({
  url: location.href,
  hasPreview: document.body.innerText.includes('实时预览'),
  headings: [...document.querySelectorAll('h1,h2,h3,h4')].map(h => h.textContent.trim()).filter(Boolean).slice(0, 12)
})`));
process.exit(0);
