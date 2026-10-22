/* 导师详情 v2 实测：尺寸 / 顶部边界线 / 头像文字对齐 / 区块顺序 / 作品图 / 底部方框钮 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fs = await import('node:fs');
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
await send('Page.navigate', { url: 'http://127.0.0.1:8624/index.html' }, S);
await sleep(3000);
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description; return r.result.value; };
console.log(await ev(`(() => {
  document.getElementById('instructors-root').scrollIntoView();
  [...document.querySelectorAll('#instructors-grid .person-card')].find(c => c.dataset.mid === 'inst-aca-039').click();
  const p = document.querySelector('.mentor-sheet__panel');
  const r = p.getBoundingClientRect();
  const idc = p.querySelector('.mentor-sheet__id');
  const av = p.querySelector('.mentor-sheet__avatar').getBoundingClientRect();
  const eb = p.querySelector('.mentor-sheet__eyebrow').getBoundingClientRect();
  const nm = p.querySelector('.mentor-sheet__name').getBoundingClientRect();
  const h4s = [...p.querySelectorAll('.mentor-sheet__h4')].map(h => h.textContent.trim());
  const wimgs = [...p.querySelectorAll('.mentor-sheet__workimgs img')];
  const back = p.querySelector('.mentor-sheet__back').getBoundingClientRect();
  return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height),
    centeredX: Math.abs((r.x + r.width / 2) - innerWidth / 2) < 2,
    topBrandLine: getComputedStyle(p).borderTopWidth + ' ' + getComputedStyle(p).borderTopColor,
    idTopAlignsAvatar: Math.abs(eb.y - av.y) < 2,
    idBottomAlignsAvatar: Math.abs((nm.y + nm.height) - (av.y + av.height)) < 3,
    sectionOrder: h4s, workImgs: wimgs.length,
    imgsLoaded: wimgs.filter(i => i.complete && i.naturalWidth > 0).length,
    backBtn: { centerX: Math.round(back.x + back.width / 2), distToPanelBottom: Math.round(r.bottom - back.bottom),
      size: Math.round(back.width) + 'x' + Math.round(back.height) },
    noClosePill: !p.querySelector('.mentor-sheet__close') });
})()`));
await sleep(600);
const shot = await send('Page.captureScreenshot', { format: 'png' }, S);
fs.writeFileSync('/tmp/mentor-sheet-v2-top.png', Buffer.from(shot.data, 'base64'));
await send('Runtime.evaluate', { expression: `document.querySelector('.mentor-sheet__scroll').scrollTop = 99999; 'ok'`, returnByValue: true }, S);
await sleep(500);
const shot2 = await send('Page.captureScreenshot', { format: 'png' }, S);
fs.writeFileSync('/tmp/mentor-sheet-v2-bottom.png', Buffer.from(shot2.data, 'base64'));
console.log('截图完成');
process.exit(0);
