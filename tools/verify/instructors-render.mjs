/* 导师团队板块渲染实测：卡片数量 / 图片加载 / 分类筛选 / 展开收起 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8613/index.html' }, S);
await sleep(3000);
const evaljs = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) return 'ERR: ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
console.log(await evaljs(`(() => {
  document.getElementById('instructors-root').scrollIntoView();
  const grid = document.getElementById('instructors-grid');
  const cards = grid.querySelectorAll('.person-card');
  const tabs = [...document.querySelectorAll('#instructors-filter-bar .filter-btn')].map(b => b.textContent);
  const imgs = [...grid.querySelectorAll('img')];
  return JSON.stringify({
    tabs, visible: cards.length,
    sample: [...cards].slice(0, 2).map(c => c.querySelector('.person-card__name').textContent
      + ' / ' + c.querySelector('.person-card__background').textContent
      + ' / ' + (c.querySelector('.person-card__title') || {}).textContent),
    imgs: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
    broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length
  });
})()`));
console.log(await evaljs(`(() => {
  const btn = [...document.querySelectorAll('#instructors-filter-bar .filter-btn')].find(b => b.textContent === '学术导师');
  btn.click();
  const grid = document.getElementById('instructors-grid');
  const cards = [...grid.querySelectorAll('.person-card')];
  return JSON.stringify({
    tab: '学术导师', count: cards.length,
    titles: cards.slice(0, 4).map(c => c.querySelector('.person-card__title').textContent),
    hasXiaY: cards.some(c => c.textContent.includes('Xia.Y'))
  });
})()`));
console.log(await evaljs(`(() => {
  const btn = [...document.querySelectorAll('#instructors-filter-bar .filter-btn')].find(b => b.textContent === '教研导师');
  btn.click();
  const cards = [...document.querySelectorAll('#instructors-grid .person-card')];
  return JSON.stringify({ tab: '教研导师', count: cards.length,
    titles: cards.map(c => c.querySelector('.person-card__title').textContent) });
})()`));
process.exit(0);
