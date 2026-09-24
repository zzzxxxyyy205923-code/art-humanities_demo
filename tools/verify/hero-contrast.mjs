/* Hero 影像之上的文字可读性实测（像素级，非理论色值推算）
 *
 * 两个坑（都已在此脚本里规避，改动时务必保留）：
 * ① 本地 python3 -m http.server 不支持 HTTP Range → 视频不可 seek，v.currentTime 赋值会被忽略，
 *    「逐帧取样」实际反复测同一帧。故可读性改用**结构性最不利帧**：把影像换成纯白层（复刻同样的
 *    opacity/filter），测到的就是任何画面都不可能超过的亮度上限 —— 它过 AA，则任意帧都过 AA。
 * ② 截图 base64 必须自行拼 data:image/png;base64, 前缀再送回页面画进 canvas 读像素（data URL 不污染 canvas）。
 *
 * 判定：大字号（h1）≥3:1，正文/标签 ≥4.5:1（WCAG AA）。
 * 用法：node hero-contrast.mjs [宽] [高]   （SAMPLES=0 可跳过真实播放帧取样，跑得更快）
 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ver = await (await fetch('http://127.0.0.1:9555/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, q = {}, S) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q, sessionId: S })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);

const W = Number(process.argv[2] || 1440), H = Number(process.argv[3] || 900);
const SAMPLES = Number(process.env.SAMPLES ?? 3);
const GAP = Number(process.env.GAP || 12) * 1000;

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Target.activateTarget', { targetId });
await send('Runtime.enable', {}, S); await send('Page.enable', {}, S);
await send('Network.enable', {}, S); await send('Network.setCacheDisabled', { cacheDisabled: true }, S);
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500 }, S);
await send('Page.navigate', { url: 'http://127.0.0.1:7789/index.html?t=' + Date.now() }, S);
await sleep(5000);
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, S); return r?.exceptionDetails ? 'ERR:' + r.exceptionDetails.text : r?.result?.value; };

// h1 内的 <em> 用自己的主色，必须单列，否则会被漏测
const SELES = ['.hero__eyebrow', '.hero h1', '.hero h1 em', '.hero__sub', '.hero__tags'];
const meta = JSON.parse(await ev(`JSON.stringify(${JSON.stringify(SELES)}.map(function(s){
  var el = document.querySelector(s); if (!el) return null;
  var r = el.getBoundingClientRect(), c = getComputedStyle(el);
  var px = parseFloat(c.fontSize), bold = (parseInt(c.fontWeight,10) || 400) >= 700;
  return { sel: s, color: c.color, px: px, large: px >= 24 || (bold && px >= 18.66),
           rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } };
}).filter(Boolean))`));

// 文字透明化（含后代）：保留排版与盒子，只去掉字形本身
await ev(`(function(){
  var css = ${JSON.stringify(SELES)}.map(function(s){ return s + ', ' + s + ' *'; }).join(', ') + ' { color: transparent !important; }';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})()`);

// 页面内取样：截图 → canvas → 逐元素最差对比度 + 右半屏平均亮度
const sample = async () => {
  const shot = await send('Page.captureScreenshot', { format: 'png' }, S);
  if (!shot || !shot.data) return null;
  return JSON.parse(await ev(`(async function(){
    var img = new Image();
    await new Promise(function(res, rej){ img.onload = res; img.onerror = function(){rej(new Error('img'))}; img.src = ${JSON.stringify('data:image/png;base64,' + shot.data)}; });
    var cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    var cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    function lum(r, g, b){ function f(c){ c/=255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); } return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); }
    function parse(c){ return c.match(/[\\d.]+/g).map(Number); }
    function ratio(a, b){ return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05); }
    var out = { items: {} };
    ${JSON.stringify(meta)}.forEach(function(o){
      var fg = lum(parse(o.color)[0], parse(o.color)[1], parse(o.color)[2]);
      var x0 = Math.max(0, o.rect.x), y0 = Math.max(0, o.rect.y);
      var w = Math.min(o.rect.w, img.width - x0), h = Math.min(o.rect.h, img.height - y0);
      if (w <= 0 || h <= 0) return;
      var d = cx.getImageData(x0, y0, w, h).data, min = Infinity, max = -1, sum = 0, n = 0;
      for (var y = 0; y < h; y += 2) for (var x = 0; x < w; x += 2) {
        var i = (y * w + x) * 4, L = lum(d[i], d[i+1], d[i+2]);
        if (L < min) min = L; if (L > max) max = L; sum += L; n++;
      }
      out.items[o.sel] = { worst: Math.min(ratio(fg, min), ratio(fg, max)), avg: ratio(fg, sum/n),
                           need: o.large ? 3 : 4.5, px: o.px };
    });
    var rx = Math.floor(img.width * 0.55), rw = img.width - rx, rh = img.height;
    var rd = cx.getImageData(rx, 0, rw, rh).data, rs = 0, rn = 0;
    for (var y2 = 0; y2 < rh; y2 += 4) for (var x2 = 0; x2 < rw; x2 += 4) {
      var j = (y2 * rw + x2) * 4; rs += lum(rd[j], rd[j+1], rd[j+2]); rn++;
    }
    out.mean = rs / rn;
    return JSON.stringify(out);
  })()`));
};

const out = [`视口 ${W}×${H}`];

// ── ① 结构性最不利帧：纯白影像层（复刻同样的 opacity/filter）= 任何画面都不可能超过的亮度上限
await ev(`(function(){
  var m = document.querySelector('.hero__media'), v = document.getElementById('hero-video');
  var s = getComputedStyle(v);
  var w = document.createElement('div'); w.id = '__worst';
  w.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:' + s.opacity + ';filter:' + s.filter;
  // 必须插在 .hero__veil 之前：veil 是 .hero__media 的子节点，追加到末尾会盖住蒙层，测出「白底白字」的假失败
  m.insertBefore(w, m.firstChild); v.style.visibility = 'hidden';
})()`);
await sleep(400);
const worstCase = await sample();
if (worstCase) {
  out.push('【最不利帧·纯白影像】右半屏平均亮度 ' + worstCase.mean.toFixed(4));
  for (const sel of SELES) {
    const o = worstCase.items[sel]; if (!o) continue;
    out.push(`${o.worst >= o.need ? '通过' : '不达标'} ${sel.padEnd(16)} ${o.px}px 最差对比度 ${o.worst.toFixed(2)}:1（均值 ${o.avg.toFixed(2)}:1，要求 ≥${o.need}:1）`);
  }
}
await ev(`(function(){var w=document.getElementById('__worst'); if(w) w.remove(); var v=document.getElementById('hero-video'); v.style.visibility='';})()`);

// ── ② 影像可见度：隐藏影像层做基线，与真实播放帧对比
const baseline = await (async () => {
  await ev(`document.querySelector('.hero__media').style.opacity = '0'`);
  await sleep(300);
  const s = await sample();
  await ev(`document.querySelector('.hero__media').style.opacity = ''`);
  return s;
})();

if (SAMPLES > 0) {
  const means = [];
  for (let i = 0; i < SAMPLES; i++) {
    await sleep(i === 0 ? 800 : GAP);
    const s = await sample();
    const ct = await ev('document.getElementById("hero-video").currentTime.toFixed(1)');
    if (s) { means.push(s.mean); out.push(`真实播放帧 @${ct}s 右半屏平均亮度 ${s.mean.toFixed(4)}${baseline ? '（无影像基线 ' + baseline.mean.toFixed(4) + '，提升 ' + (s.mean / Math.max(baseline.mean, 1e-6)).toFixed(2) + '×）' : ''}`); }
  }
  if (means.length && baseline) {
    const mx = Math.max(...means);
    out.push(`可见度小结 = 最亮帧 ${mx.toFixed(4)} / 基线 ${baseline.mean.toFixed(4)} → 提升 ${(mx / Math.max(baseline.mean, 1e-6)).toFixed(2)}×`);
  }
}

const pass = SELES.every(s => !worstCase?.items[s] || worstCase.items[s].worst >= worstCase.items[s].need);
out.push(pass ? '结论：文字在影像之上全部达到 AA（按最不利帧判定）' : '结论：存在未达标项，需加深蒙层或降低影像不透明度');
const fs = await import('node:fs');
fs.writeFileSync(new URL('./.last-contrast.txt', import.meta.url), out.join('\n') + '\n');
console.log(out.join('\n'));
await send('Target.closeTarget', { targetId });
ws.close();
