/* 移除首屏三标签后回归：无残留 / hero 布局 / 路由可达 / 其他功能 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8632/index.html' }, S);
await sleep(3500);
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description; return r.result.value; };
console.log('首屏检查:', await ev(`(() => {
  const actions = document.querySelector('.hero__actions');
  const hero = document.querySelector('.hero__inner').getBoundingClientRect();
  const tags = document.querySelector('.hero__tags').getBoundingClientRect();
  const errs = [];
  return JSON.stringify({ actionsRemoved: !actions,
    heroInnerH: Math.round(hero.height), heroH: Math.round(document.querySelector('.hero').getBoundingClientRect().height),
    tagsBottomGapToHeroBottom: Math.round(hero.bottom - tags.bottom),
    btnTextGone: !document.body.innerHTML.match(/href="#\/undergraduate"[^>]*>本科爬藤/),
    errs });
})()`));
console.log('学生案例导航可达:', await ev(`(() => {
  const nav = [...document.querySelectorAll('.navbar a')].find(a => a.textContent.trim() === '学生案例');
  nav.click();
  return JSON.stringify({ hash: location.hash, cards: document.querySelectorAll('#cases-grid .case-card').length });
})()`));
await sleep(1500);
console.log('案例页渲染:', await ev(`JSON.stringify({ cards: document.querySelectorAll('#cases-grid .person-card, #cases-grid .case-card').length,
  result: document.getElementById('cases-result').textContent.trim().slice(0, 14) })`));
console.log('返回主页:', await ev(`(() => { location.hash = '#/home'; return 'ok'; })()`));
await sleep(1500);
console.log('主页底部（footer）:', await ev(`(() => {
  const f = document.querySelector('.site-footer');
  const r = f.getBoundingClientRect();
  return JSON.stringify({ footerH: Math.round(r.height), hasThreeTabs: f.textContent.includes('本科爬藤') || f.textContent.includes('就业力规划'),
    cols: [...f.querySelectorAll('.site-footer__col-title')].map(t => t.textContent) });
})()`));
console.log('导航中三个入口仍存在（navbar/其他页面）:', await ev(`JSON.stringify({
  navbarCases: !!([...document.querySelectorAll('.navbar a')].find(a => a.textContent.trim() === '学生案例')),
  viewsIntact: !!document.getElementById('view-undergraduate') && !!document.getElementById('view-employment') && !!document.getElementById('view-cases') })`));
const fs = await import('node:fs');
const shot = await send('Page.captureScreenshot', { format: 'png' }, S);
fs.writeFileSync('/tmp/home-no-actions.png', Buffer.from(shot.data, 'base64'));
console.log('主页截图已保存');
process.exit(0);
