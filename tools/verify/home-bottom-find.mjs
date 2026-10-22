/* 主页底部定位：找到包含 本科爬藤/就业力规划/学生案例 三个标签的元素及其容器 */
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
await send('Page.navigate', { url: 'http://127.0.0.1:8631/index.html' }, S);
await sleep(3500);
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description; return r.result.value; };
console.log(await ev(`(() => {
  const hits = [...document.querySelectorAll('a, button, span, div')].filter(el =>
    el.children.length === 0 && /^(本科爬藤|就业力规划|学生案例)$/.test(el.textContent.trim()));
  return JSON.stringify(hits.slice(0, 12).map(el => {
    const r = el.getBoundingClientRect();
    let p = el, chain = [];
    for (let i = 0; i < 4 && p; i++) { p = p.parentElement; chain.push(p.tagName + '.' + String(p.className).slice(0, 40)); }
    return { text: el.textContent.trim(), tag: el.tagName, href: el.getAttribute('href'),
      y: Math.round(r.y + scrollY), parentChain: chain };
  }));
})()`));
process.exit(0);
