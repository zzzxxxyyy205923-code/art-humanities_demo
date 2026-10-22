/* 登录参考后台 → 课程管理 → 定位 ARTPRO × ACCD 行 → 点击编辑课程 → 探测实时预览 */
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
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, S);
await send('Page.navigate', { url: 'https://cb-env-qianxiaos-152-d3a1d39adbb.ixdf.com/login.html' }, S);
await sleep(4000);
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.exception.description;
  return r.result.value;
};
console.log('登录:', await ev(`(() => {
  document.getElementById('username').value = 'zhangshaopeng1@xdf.cn';
  document.getElementById('password').value = '88888888';
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'));
  btn.click();
  return 'submitted';
})()`));
await sleep(5000);
console.log('登录后 URL:', await ev(`location.href`));
console.log('路由到课程管理:', await ev(`location.hash = '#courses'; 'ok'`));
await sleep(4000);
console.log(await ev(`JSON.stringify({
  url: location.href,
  rows: [...document.querySelectorAll('tr')].length,
  artpro: [...document.querySelectorAll('tr')].filter(t => t.textContent.includes('ARTPRO')).map(t => t.textContent.trim().slice(0, 80)),
  editBtns: [...document.querySelectorAll('button, a')].filter(b => b.textContent.includes('编辑')).length,
  bodyHint: document.body.innerText.slice(0, 200)
})`));
process.exit(0);
