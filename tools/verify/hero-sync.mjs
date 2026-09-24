/* Hero 影像「播放 / 声音 / 右下图标」三态同步回归
   覆盖真实用户路径，不靠 location.hash 直接赋值：
     · 顶部主导航（本科爬藤 / 全日制 / 研究生）、右上角 CTA（规划我的未来）
     · 「主要内容」全屏浮层里的条目（首页段落 / 学生案例 / 关于艺术人文）
     · 移动端汉堡菜单里的条目
     · 首页内下滑离开 Hero / 回滚
   每一步都校验同一条不变量：图标可见 ⇔ 视频在播；离场必须停播 + 静音 + 隐藏图标。
   用法：node tools/verify/hero-sync.mjs [宽] [高]        （默认 1440×900） */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ver = await (await fetch('http://127.0.0.1:9555/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const errs = [];
/* 每条 CDP 调用都加超时：Chrome 标签崩溃后 send 会永久挂起，不加会卡成「unsettled top-level await」 */
const raw = (m, q = {}, S) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q, sessionId: S })); });
const send = (m, q = {}, S) => Promise.race([
  raw(m, q, S),
  sleep(15000).then(() => { throw new Error(`CDP 超时：${m}`); })
]);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
ws.onclose = () => console.log('!! WebSocket 已关闭（Chrome 侧断连）');
ws.onerror = () => console.log('!! WebSocket 出错');
await new Promise(r => ws.onopen = r);
/* 先清掉历次遗留的 7789 标签页：堆到几十个时 Page.navigate / captureScreenshot 会挂死不返回，
   且被挤到后台的标签页 document.hidden=true → 视频一律停播，会让本回归整片误报 */
for (const t of await (await fetch('http://127.0.0.1:9555/json/list')).json()) {
  if (t.type === 'page' && /127\.0\.0\.1:7789/.test(t.url || '')) await fetch(`http://127.0.0.1:9555/json/close/${t.id}`);
}
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Target.activateTarget', { targetId });
await send('Page.bringToFront', {}, S);   /* 必须真置前：否则 document.hidden=true，播放类断言全灭 */
await send('Runtime.enable', {}, S); await send('Page.enable', {}, S);
await send('Network.enable', {}, S); await send('Network.setCacheDisabled', { cacheDisabled: true }, S);
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900);
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500 }, S);
await send('Page.navigate', { url: 'http://127.0.0.1:7789/index.html?t=' + Date.now() }, S);
await sleep(5000);

const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, S); return r?.exceptionDetails ? 'ERR:' + r.exceptionDetails.text : r?.result?.value; };
/* 前置条件：窗口被遮挡时 Chrome 会把标签页判为后台，Hero 视频必然停播 —— 整轮播放类断言会集体误报。
   兜一层：反复置前等它回到可见；等不回来就明确报「环境不可用」并退出，不输出一屏假失败。
   （根治办法：启动 Chrome 时带 --disable-backgrounding-occluded-windows --disable-renderer-backgrounding） */
for (let i = 0; i < 12 && await ev('document.hidden'); i++) { await send('Page.bringToFront', {}, S); await sleep(700); }
if (await ev('document.hidden')) {
  console.log('!! 环境不可用：标签页处于后台（document.hidden=true），Hero 视频必然停播，本轮不作数。');
  console.log('   请把自动化窗口切到前台，或用 --disable-backgrounding-occluded-windows --disable-renderer-backgrounding 重启 Chrome 后重跑。');
  await send('Target.closeTarget', { targetId }).catch(() => {});
  ws.close(); process.exit(1);
}
const state = async () => JSON.parse(await ev('(()=>{const v=document.getElementById("hero-video"),b=document.getElementById("hero-sound");return JSON.stringify({paused:v.paused,muted:v.muted,hidden:b.hidden,aria:b.getAttribute("aria-pressed"),vol:v.volume})})()'));

let pass = 0, fail = 0;
/* 失败时把判定依据打出来：是路由没切、Hero 不在视口、还是页面被隐藏 */
const diag = async () => ev(`(()=>{const h=document.getElementById('view-home'),s=document.querySelector('.hero--video')||document.querySelector('.hero');const r=s?s.getBoundingClientRect():null;return JSON.stringify({hash:location.hash,homeActive:h?h.classList.contains('is-active'):null,scrollY:Math.round(scrollY),heroTop:r?Math.round(r.top):null,heroBottom:r?Math.round(r.bottom):null,docHidden:document.hidden,idle:s?s.classList.contains('is-idle'):null})})()`);
/* 不变量：图标可见 ⇔ 视频在播；离场必须停播+静音+隐藏；在场按期望的声音状态 */
async function chk(label, exp) {
  const s = await state();
  const playing = !s.paused;
  const reasons = [];
  if (playing !== !s.hidden) reasons.push(`图标与播放不同步(playing=${playing},hidden=${s.hidden})`);
  if (exp.play && !playing) reasons.push('应在播但已暂停');
  if (!exp.play && playing) reasons.push('应停播但仍在播');
  if (!exp.play && (!s.muted || !s.hidden)) reasons.push(`离场未掐声/未隐藏图标(muted=${s.muted},hidden=${s.hidden})`);
  if (exp.play && exp.sound === true && s.muted) reasons.push('应保留有声但被静音');
  if (exp.play && exp.sound === false && !s.muted) reasons.push('应保持静音但有声');
  const ok = !reasons.length;
  ok ? pass++ : fail++;
  console.log(`${ok ? '通过' : '不达标'} ${label} | 播放=${playing} 静音=${s.muted} 图标可见=${!s.hidden} aria=${s.aria}${reasons.length ? ' ← ' + reasons.join('；') + ' | 诊断 ' + await diag() : ''}`);
}

/* 元素是否真的可点（有尺寸 + 命中测试落在自己身上） */
async function visible(sel) {
  const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'none';const b=e.getBoundingClientRect();if(b.width<2||b.height<2)return 'off';const t=document.elementFromPoint(Math.round(b.left+b.width/2),Math.round(b.top+b.height/2));return !!(t&&(e.contains(t)||t===e))?'ok':'covered'})()`);
  return r;
}

/* 按视口自动挑选可达的导航入口：
   宽屏 → 顶部 .nav-link；顶部没有（如首页段落/学生案例）→ 开「主要内容」浮层点条目
   窄屏 → 顶部链接整组隐藏 → 开汉堡菜单点条目 */
async function goto(href) {
  const link = `a[href="${href}"]`;
  let st = await visible(link);
  if (st === 'ok') return await click(link);
  const inOverlay = `.nav-overlay__link[href="${href}"]`;
  if (await visible('.nav-btn--square') === 'ok') {
    await click('.nav-btn--square', 900);
    if (await visible(inOverlay) === 'ok') return await click(inOverlay, 1800);
    await click('.nav-overlay__close', 700);
    console.log(`  !! 浮层内无 ${href}`);
    return false;
  }
  if (await visible('.navbar__menu-toggle') === 'ok') {
    await click('.navbar__menu-toggle', 700);
    if (await visible(link) === 'ok') return await click(link, 1500);
    console.log(`  !! 菜单内无 ${href}`);
    return false;
  }
  console.log(`  !! ${href} 无可达入口（${st}）`);
  return false;
}

/* 真实鼠标点击：先命中测试，确认该点确实落在目标上 */
async function click(sel, wait = 1300) {
  try {
    const box = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();if(r.width<2||r.height<2)return 'off';return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})})()`);
    if (!box || box === 'off') { console.log(`  !! 无法点击 ${sel}（${box || '未找到'}）`); return false; }
    const p = JSON.parse(box);
    const hit = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const t=document.elementFromPoint(${p.x},${p.y});return !!(t&&(e.contains(t)||t===e))})()`);
    if (!hit) { console.log(`  !! ${sel} 被遮挡`); return false; }
    for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x: p.x, y: p.y, button: 'left', clickCount: 1 }, S);
    await sleep(wait);
    return true;
  } catch (e) { console.log(`  !! ${sel} 点击异常：${e.message}`); return false; }
}

console.log(`视口 ${W}×${H}`);
console.log('— A 初始进场 —');
await chk('A1 首页默认', { play: true, sound: false });

console.log('— B 打开声音后离场（最严：有声状态下离开，声音必须被掐掉）—');
await click('#hero-sound', 600);
await chk('B1 开声后仍在播', { play: true, sound: true });
for (const href of ['#/undergraduate', '#/fulltime', '#/graduate', '#/employment']) {
  if (await goto(href)) await chk(`B 导航 → ${href}`, { play: false });
}
await click('a.navbar__logo[href="#/home"]');
await chk('B6 返回首页（恢复有声）', { play: true, sound: true });

console.log('— C 首页段落 / 学生案例（入口随视口：浮层或菜单）—');
if (await goto('#/home/offers')) await chk('C1 段落 OFFER成果（Hero 不在视口）', { play: false });
if (await goto('#/cases')) await chk('C2 学生案例', { play: false });
if (await goto('#/home')) await chk('C3 回到关于艺术人文（图标恢复）', { play: true, sound: true });

console.log('— D 静音状态下离场，返回应保持静音 —');
await click('#hero-sound', 600);
await chk('D1 已关声', { play: true, sound: false });
if (await goto('#/undergraduate')) await chk('D2 离场', { play: false });
await click('a.navbar__logo[href="#/home"]');
await chk('D3 返回（保持静音）', { play: true, sound: false });

console.log('— E 首页内下滑 / 回滚 —');
await ev('scrollTo({top: innerHeight * 1.8, behavior: "instant"})'); await sleep(1400);
await chk('E1 下滑离开 Hero', { play: false });
await ev('scrollTo({top: 0, behavior: "instant"})'); await sleep(1400);
await chk('E2 滚回 Hero', { play: true, sound: false });

console.log('— G 标签页切后台 / 回前台 —');
await ev(`(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))})()`);
await sleep(700);
await chk('G1 切到后台', { play: false });
await ev(`(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))})()`);
await sleep(900);
await chk('G2 回到前台', { play: true, sound: false });

console.log('— F 移动端汉堡菜单 —');
if (W < 500) {
  await click('.navbar__menu-toggle', 700);
  await click('a[href="#/graduate"]', 1500);
  await chk('F1 菜单内跳转', { play: false });
  await click('.navbar__menu-toggle', 700);
  await click('a[href="#/home"]', 1500);
  await chk('F2 菜单内返回首页', { play: true, sound: false });
} else console.log('跳过（非窄屏）');

console.log(`\n结果：${pass} 通过 / ${fail} 不达标 | 控制台异常：${errs.length ? errs.join(' | ') : '无'}`);
await send('Target.closeTarget', { targetId }).catch(() => {});   /* 用完即关，别把标签页留给下一轮 */
ws.close();
