/* 提取「实时预览」区域的结构层级与视觉信息，并截图 */
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
console.log(await ev(`(() => {
  const all = [...document.querySelectorAll('*')].filter(el => el.children.length === 0 && el.textContent.trim() === '实时预览');
  const marker = all[all.length - 1];
  if (!marker) return '未找到实时预览标记';
  let panel = marker;
  for (let i = 0; i < 8 && panel.parentElement; i++) {
    panel = panel.parentElement;
    if (panel.getBoundingClientRect().width > 400 && panel.getBoundingClientRect().height > 500) break;
  }
  const r = panel.getBoundingClientRect();
  const secs = [...panel.querySelectorAll('h1,h2,h3,h4,h5,.pv-title,[class*=title]')].map(h => h.textContent.trim()).filter(t => t && t.length < 40);
  return JSON.stringify({
    markerTag: marker.tagName, panelCls: panel.className.slice(0, 80),
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    isIframe: panel.tagName === 'IFRAME',
    headings: [...new Set(secs)].slice(0, 20),
    textSample: panel.innerText.replace(/\\n{2,}/g, '\\n').slice(0, 600)
  });
})()`));
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, S);
fs.writeFileSync('/tmp/ref-preview.png', Buffer.from(shot.data, 'base64'));
console.log('截图已保存 /tmp/ref-preview.png');
process.exit(0);
