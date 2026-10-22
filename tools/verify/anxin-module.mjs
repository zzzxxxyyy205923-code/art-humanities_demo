/* 安心伴模块实测：境外项目分区卡片 → 详情页 → CURRICULUM 筛选（安心伴/毕无忧）→ 占位卡 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8634/index.html#/home' }, S);
await sleep(3500);
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description; return r.result.value; };
console.log('境外项目分区:', await ev(`(() => {
  document.getElementById('courses').scrollIntoView();
  const zone = document.getElementById('cp-overseas-grid');
  return JSON.stringify({ cards: [...zone.querySelectorAll('.cp-card__title')].map(t => t.textContent) });
})()`));
console.log('点击安心伴卡片:', await ev(`(() => {
  [...document.querySelectorAll('#cp-overseas-grid .cp-card')].find(c => c.dataset.cpId === 'anxin-ban').click();
  return 'clicked';
})()`));
await sleep(800);
console.log('详情页:', await ev(`(() => {
  const b = document.getElementById('course-overlay-body');
  const title = b.querySelector('.cd-hero__title').textContent;
  const tabs = [...b.querySelectorAll('#cd-cur-mains .filter-btn')].map(t => t.textContent);
  const note = (b.querySelector('.cd-note') || {}).textContent || null;
  const count = (document.getElementById('cd-cur-count') || {}).textContent || null;
  const cards = [...b.querySelectorAll('.cd-curriculum-card__title')].map(t => t.textContent);
  return JSON.stringify({ title, tabs, note, count, cards, overlayOpen: document.getElementById('course-overlay').classList.contains('is-open') });
})()`));
console.log('点击「毕无忧」筛选:', await ev(`(() => {
  const t = [...document.querySelectorAll('#cd-cur-mains .filter-btn')].find(t => t.textContent === '毕无忧');
  t.click();
  const cards = [...document.querySelectorAll('.cd-curriculum-card__title')].map(t => t.textContent);
  const active = t.classList.contains('is-active');
  return JSON.stringify({ active, cards, count: (document.getElementById('cd-cur-count') || {}).textContent });
})()`));
console.log('再点取消（全部）:', await ev(`(() => {
  const t = [...document.querySelectorAll('#cd-cur-mains .filter-btn')].find(t => t.textContent === '毕无忧');
  t.click();
  return JSON.stringify({ cards: [...document.querySelectorAll('.cd-curriculum-card__title')].map(t => t.textContent) });
})()`));
console.log('关闭详情:', await ev(`(() => {
  document.querySelector('.course-overlay__close').click();
  return JSON.stringify({ closed: !document.getElementById('course-overlay').classList.contains('is-open') });
})()`));
process.exit(0);
