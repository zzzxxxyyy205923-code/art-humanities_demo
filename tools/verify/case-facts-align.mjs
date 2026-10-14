/* 对比 WRT（index 13）与其他案例详情页中事实行（.case-sheet__facts）的
   实际渲染位置 / 对齐 / 间距 —— CDP 连接 127.0.0.1:9555 调试实例 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ver = await (await fetch('http://127.0.0.1:9555/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, q = {}, S) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q, sessionId: S })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);

const nav = async url => {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url }, sessionId);
  await sleep(2500);
  return sessionId;
};
const evaljs = async (S, expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  return r.result.value;
};

const S = await nav('http://127.0.0.1:8612/index.html#/cases');
console.log(await evaljs(S, `(() => {
  const out = { cards: document.querySelectorAll('.case-card').length };
  return JSON.stringify(out);
})()`));

const measure = idx => `(() => {
  CaseSheet.close();
  CaseSheet.open(${idx});
  const q = s => document.querySelector(s);
  const r = el => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const facts = q('.case-sheet__facts');
  const side = q('.case-sheet__side');
  const bottom = q('.case-sheet__side-bottom');
  const info = q('.case-sheet__info');
  const grid = q('.case-sheet__info-grid');
  const who = q('.case-sheet__who');
  const idEl = q('.case-sheet__info .case-card__school');
  return JSON.stringify({
    title: q('.case-sheet__info .case-card__school').textContent.trim(),
    facts: facts ? r(facts) : null,
    factsText: facts ? facts.textContent : null,
    side: side ? r(side) : null,
    sideAlign: side ? getComputedStyle(side).alignItems : null,
    sideJustify: side ? getComputedStyle(side).justifyContent : null,
    bottom: bottom ? r(bottom) : null,
    info: r(info),
    grid: r(grid),
    who: who ? r(who) : null,
    name: idEl ? r(idEl) : null,
    factsAlign: facts ? getComputedStyle(facts).textAlign : 'null'
  });
})()`;

for (const idx of [13, 0, 1, 20]) {
  console.log('idx', idx, await evaljs(S, measure(idx)));
}
await send('Target.closeTarget', { targetId: (await send('Target.getTargets')).targetInfos[0].targetId });
process.exit(0);
