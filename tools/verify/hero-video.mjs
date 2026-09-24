const sleep = ms => new Promise(r => setTimeout(r, ms));
const ver = await (await fetch('http://127.0.0.1:9555/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errs = [];
const send = (m, q = {}, S) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q, sessionId: S })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Target.activateTarget', { targetId });
await send('Runtime.enable', {}, S); await send('Page.enable', {}, S);
await send('Network.enable', {}, S); await send('Network.setCacheDisabled', { cacheDisabled: true }, S);
// 视口必须显式设定并激活标签页，否则命中测试 elementFromPoint 会返回 null
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900);
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, S);
// URL 带时间戳：否则命中浏览器缓存的旧 CSS，改完样式仍读到旧布局
await send('Page.navigate', { url: 'http://127.0.0.1:7789/index.html?t=' + Date.now() }, S);
await sleep(5000);
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, S); return r?.exceptionDetails ? 'ERR:' + r.exceptionDetails.text : r?.result?.value; };
/* 前置条件：窗口被遮挡时 Chrome 判标签页为后台 → 视频必然停播，整轮会误报成「功能坏了」。
   兜一层反复置前；等不回来就明确报环境不可用并退出。
   （根治办法：启动 Chrome 时带 --disable-backgrounding-occluded-windows --disable-renderer-backgrounding） */
for (let i = 0; i < 12 && await ev('document.hidden'); i++) { await send('Page.bringToFront', {}, S); await sleep(700); }
if (await ev('document.hidden')) {
  console.log('!! 环境不可用：标签页处于后台（document.hidden=true），视频必然停播，本轮不作数。');
  console.log('   请把自动化窗口切到前台，或用 --disable-backgrounding-occluded-windows --disable-renderer-backgrounding 重启 Chrome 后重跑。');
  await send('Target.closeTarget', { targetId }).catch(() => {});
  ws.close(); process.exit(1);
}
console.log('V1 播放 =', await ev('!document.getElementById("hero-video").paused'));
console.log('V2 静音 =', await ev('document.getElementById("hero-video").muted'));
console.log('V3 时长 =', await ev('Math.round(document.getElementById("hero-video").duration)'));
console.log('V4 铺满视口 =', await ev('(()=>{const m=document.querySelector(".hero__media").getBoundingClientRect(),v=document.getElementById("hero-video").getBoundingClientRect();return Math.abs(m.width-innerWidth)<2&&Math.abs(m.height-innerHeight)<2&&Math.abs(v.width-innerWidth)<2&&Math.abs(v.height-innerHeight)<2})()'));
console.log('V5 原始尺寸 =', await ev('document.getElementById("hero-video").videoWidth+"x"+document.getElementById("hero-video").videoHeight'));
console.log('V6 填充方式 =', await ev('getComputedStyle(document.getElementById("hero-video")).objectFit'));
// V4r：实时改变视口（含超宽 / 竖屏 / 小窗），影像层与视频必须恒等于视口尺寸，不留空白、不裁剪
for (const [w, h] of [[1920, 720], [1024, 768], [390, 844], [1280, 1024]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 }, S);
  await sleep(700);
  console.log(`V4r ${w}x${h} 铺满 =`, await ev('(()=>{const m=document.querySelector(".hero__media").getBoundingClientRect(),v=document.getElementById("hero-video").getBoundingClientRect();return Math.abs(m.width-innerWidth)<2&&Math.abs(m.height-innerHeight)<2&&Math.abs(v.width-innerWidth)<2&&Math.abs(v.height-innerHeight)<2})()'));
}
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500 }, S);
await sleep(900);
console.log('V7 观感 =', await ev('(()=>{const s=getComputedStyle(document.getElementById("hero-video"));return "opacity "+s.opacity+" filter "+s.filter})()'));
console.log('V8 音量 =', await ev('document.getElementById("hero-video").volume'));
console.log('D1 视口/media =', await ev('(()=>{const m=document.querySelector(".hero__media").getBoundingClientRect();return "视口 "+innerWidth+"x"+innerHeight+" media "+Math.round(m.width)+"x"+Math.round(m.height)})()'));
console.log('S1 按钮可见 =', await ev('(()=>{const b=document.getElementById("hero-sound");const r=b.getBoundingClientRect();return !b.hidden&&r.width>=44&&r.height>=44})()'));
console.log('S4 按钮无文字 =', await ev('(()=>{const b=document.getElementById("hero-sound");return !b.querySelector(".hero-sound__label")&&b.textContent.replace(/\\s/g,"")===""})()'));
console.log('D2 遮挡 =', await ev('(()=>{const b=document.getElementById("hero-sound");const r=b.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e?(e.tagName+"."+e.className+" z"+getComputedStyle(e).zIndex):"null"})()'));
console.log('S2 命中 =', await ev('(()=>{const b=document.getElementById("hero-sound");const r=b.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return b.contains(e)||e===b})()'));
const box = await ev('(()=>{const r=document.getElementById("hero-sound").getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()');
for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x: box.x, y: box.y, button: 'left', clickCount: 1 }, S);
await sleep(600);
console.log('S3 点击后静音 =', await ev('document.getElementById("hero-video").muted'), '| aria =', await ev('document.getElementById("hero-sound").getAttribute("aria-pressed")'));
await ev('location.hash="#/undergraduate"'); await sleep(900);
console.log('P1 离首页 =', await ev('document.getElementById("hero-video").paused ? "已暂停" : "仍在播"'), '| 静音 =', await ev('document.getElementById("hero-video").muted'), '| 按钮隐藏 =', await ev('document.getElementById("hero-sound").hidden'));
await ev('location.hash="#/home"'); await sleep(1200);
console.log('P2 回首页恢复 =', await ev('document.getElementById("hero-video").paused ? "未恢复" : "已恢复播放"'), '| 声音 =', await ev('document.getElementById("hero-video").muted ? "静音" : "有声"'), '| 按钮可见 =', await ev('!document.getElementById("hero-sound").hidden'));
// 首页内下滑离开 Hero：应停播 + 掐声 + 影像层淡出
await ev('scrollTo({top: innerHeight * 1.8, behavior: "instant"})'); await sleep(1400);
console.log('P3 下滑离 Hero =', await ev('document.getElementById("hero-video").paused ? "已暂停" : "仍在播"'), '| 静音 =', await ev('document.getElementById("hero-video").muted'), '| idle 类 =', await ev('document.querySelector(".hero--video").classList.contains("is-idle")'), '| 影像层不透明度 =', await ev('getComputedStyle(document.querySelector(".hero__media")).opacity'));
await ev('scrollTo({top: 0, behavior: "instant"})'); await sleep(1400);
console.log('P4 回到 Hero =', await ev('document.getElementById("hero-video").paused ? "未恢复" : "已恢复播放"'), '| idle 类 =', await ev('document.querySelector(".hero--video").classList.contains("is-idle")'));
console.log('异常 =', errs.length ? errs : '无');
ws.close();
