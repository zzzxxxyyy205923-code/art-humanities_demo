/* 导师详情 v3 实测：横线分割 / 代表作横排斜体 / 图片矩形排布 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8625/index.html' }, S);
await sleep(3000);
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description; return r.result.value; };
await ev(`(() => {
  document.getElementById('instructors-root').scrollIntoView();
  [...document.querySelectorAll('#instructors-grid .person-card')].find(c => c.dataset.mid === 'inst-aca-039').click();
  return 'ok';
})()`);
await sleep(600);
console.log(await ev(`(() => {
  const p = document.querySelector('.mentor-sheet__panel');
  const blocks = [...p.querySelectorAll('.mentor-sheet__body > .mentor-sheet__block')];
  const dividers = blocks.filter(b => getComputedStyle(b).borderTopWidth !== '0px').length;
  const wl = p.querySelector('.mentor-sheet__workline');
  const wlcs = wl ? getComputedStyle(wl) : null;
  const imgs = [...p.querySelectorAll('.mentor-sheet__workimgs img')];
  const heights = imgs.map(i => Math.round(i.getBoundingClientRect().height));
  return JSON.stringify({
    blocks: blocks.length, dividers,
    workline: wl ? { text: wl.textContent.slice(0, 60) + '…', italic: wlcs.fontStyle, weight: wlcs.fontWeight, noBookQuote: !wl.textContent.includes('《') } : null,
    workImgs: { n: imgs.length, heights, sameHeight: new Set(heights).size === 1, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length },
    backBtn: !!p.querySelector('.mentor-sheet__back')
  });
})()`));
console.log('滚动到图片区并截图:');
await ev(`document.querySelector('.mentor-sheet__scroll').scrollTop = 99999; 'ok'`);
await sleep(1200);
const shot = await send('Page.captureScreenshot', { format: 'png' }, S);
fs.writeFileSync('/tmp/mentor-sheet-v3.png', Buffer.from(shot.data, 'base64'));
process.exit(0);
