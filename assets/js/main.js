/* ═══════════════════════════════════════════
   SFK 艺术人文科系 — 前端主控（单页 · 哈希路由）
   - 所有页面内容都在 index.html 内，靠 location.hash 切换显示
   - 导航链接一律形如 #/undergraduate、#/home/offers
     → 不触发文档跳转，因此不会在 VS Code / file:// 预览里
       被解析成 file+.vscode-resource.vscode-cdn.net/... 的绝对路径
   ═══════════════════════════════════════════ */

const DATA = { cache: {} };

/* ── 数据加载：内嵌优先，fetch 兜底 ── */
async function loadData(files = ['meta', 'majors', 'cases', 'planning', 'careers', 'directions', 'direction-details', 'course-products', 'offers', 'instructors', 'resources', 'undergrad-regions', 'timeline', 'frontier-lectures', 'masterclass-courses', 'summer-winter-courses', 'industry-courses', 'overseas-courses', 'anxin-courses', 'ug-timeline']) {
  if (window.SFK_DATA) { DATA.cache = window.SFK_DATA; return; }      // file:// 直开也能拿到数据
  if (location.protocol === 'file:') throw new Error('file 协议下无法 fetch，请改用 HTTP 预览');
  await Promise.all(files.map(async name => {
    const res = await fetch(`./data/${name}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`数据加载失败：data/${name}.json (${res.status})`);
    DATA.cache[name] = await res.json();
  }));
}

/* ═══════════ 首页主视觉视频 ═══════════
   进入首页 → 自动播放并开启声音；通过导航跳转离开首页，或在首页内
   向下滚动至其他板块内容（视频离开视口）→ 暂停播放并静音。
   目标状态 = 「在首页」且「视频在视口内」，任一条件不满足即停播静音，
   由路由切换（setActive）与视口观察（IntersectionObserver）共同驱动，
   两种来源最终都收敛到 sync()，不会出现残留播放或声音冲突。

   浏览器自动播放策略处理（Chrome / Safari / Firefox / iOS）：
   1. 本模块只负责「播放 / 暂停」的调度，不接管声音 —— 视频始终按当前
      muted 状态播放（刷新后为静音），绝不因任意点击而解除静音；
   2. 声音的唯一开关是右下角声音图标（#hero-sound），由 assets/js/hero-video.js
      独占管理（点击图标 → wantSound 翻转 → 同步 muted）；此处不再监听
      pointerdown / keydown / touchstart 等全局手势，避免「点击视口任意位置
      即自动播放声音」；
   3. iOS Safari 依赖 HTML 上的 playsinline 属性（已存在）保证内联自动播放。 */
const HeroVideo = {
  el: null,
  onHome: false,
  inView: true,
  _inited: false,

  get video() {
    if (!this.el) this.el = document.getElementById('hero-video');
    return this.el;
  },

  /* 统一收敛：仅在「首页 + 视频可见」时播放，否则停播静音。
     声音状态（muted）不在此处改动 —— 由右下角声音图标（hero-video.js）独占控制，
     离开首页时置静音只为杜绝残留声音输出 */
  sync() {
    const v = this.video;
    if (!v) return;
    if (this.onHome && this.inView) {
      this._play();
    } else {
      v.pause();
      v.muted = true;
    }
  },

  /* 仅调度播放，不改动 muted：刷新后保持静音播放，
     点击视口任意位置都不会触发声音同步 */
  _play() {
    const v = this.video;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});   // 策略拦截时保持静音画面，不再武装全局手势解锁
  },

  /* 路由切换入口：进入/离开首页 */
  setActive(onHome) {
    this.onHome = !!onHome;
    this.sync();
  },

  init() {
    const v = this.video;
    if (!v || this._inited) return;
    this._inited = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        entries.forEach(e => { this.inView = e.isIntersecting; this.sync(); });
      }, { threshold: 0.15 }).observe(v);
    }
  }
};

/* ═══════════ 路由 ═══════════ */
const Router = {
  VIEWS: ['home', 'undergraduate', 'employment', 'cases', 'fulltime', 'graduate'],

  parse() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const [view, section] = raw.split('/').filter(Boolean);
    return { view: this.VIEWS.includes(view) ? view : 'home', section: section || '' };
  },

  /* path 形如 'undergraduate' / 'home/offers' */
  go(path) {
    const target = '#/' + String(path).replace(/^#?\/?/, '');
    if (location.hash === target) { this.apply(); return; }   // 同址点击也要刷新/滚动
    location.hash = target;                                   // 触发 hashchange → apply()
  },

  apply() {
    const { view, section } = this.parse();

    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('is-active', v.id === `view-${view}`);
    });

    if (!this.built[view]) { PAGES[view] && PAGES[view](); this.built[view] = true; }
    Header.markActive(view, section);
    HeroVideo.setActive(view === 'home');   // 进入首页 → 有声播放；离开 → 停播静音

    // 滚动：有 section 就锚点滚动（scroll-margin-top 已在 CSS 里留了导航条高度），否则回顶
    const el = section && document.getElementById(section);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  },

  built: {}
};

/* ═══════════ 单行横向滚动图卷 ═══════════
   把已收集的 125 张作品排成「单行」，只在「关于艺术人文」全屏界面出现：
   - 每张图高度 = 视口高（上下边缘完整撑满，无空白），宽度按原图比例自适应
   - 125 张图循环取用（允许重复使用），半幅总宽 ≥ 视口宽（循环不露底）
   - 整幅复制一份首尾相接 → 向左无缝循环滚动
   - 行宽随视口重算，保证任何视口下都不露底 */
const Mosaic = {
  /* [文件名, 宽, 高] —— 取自「案例滚动播放」素材库（按修改时间正序编号 1–125） */
  IMAGES: [
    ['1.png', 846, 1166], ['2.png', 1510, 1010], ['3.png', 1632, 1014],
    ['4.png', 1388, 1060], ['5.png', 1602, 1066], ['6.png', 1602, 1068],
    ['7.png', 1608, 1068], ['8.png', 1518, 1140], ['9.png', 1932, 1346],
    ['10.png', 1966, 1258], ['11.png', 1908, 1366], ['12.jpeg', 3568, 2537],
    ['13.jpeg', 3000, 1687], ['14.jpeg', 4096, 2304], ['15.jpeg', 4096, 2461],
    ['16.jpeg', 4096, 2126], ['17.jpeg', 4096, 2305], ['18.png', 2245, 1587],
    ['19.png', 2000, 1124], ['20.png', 1732, 1148], ['21.png', 1506, 1046],
    ['22.png', 1280, 905], ['23.png', 1280, 916], ['24.jpeg', 1754, 1240],
    ['25.png', 2245, 1587], ['26.jpeg', 1754, 1240], ['27.png', 1881, 1280],
    ['28.png', 2870, 1614], ['29.png', 2550, 1603], ['30.jpeg', 1800, 1620],
    ['31.png', 2401, 1601], ['32.png', 4096, 2797], ['33.png', 4096, 2078],
    ['34.png', 1570, 1189], ['35.png', 2048, 963], ['36.png', 3840, 1605],
    ['37.png', 2528, 1279], ['38.png', 2246, 1028], ['39.jpg', 1584, 1245],
    ['40.jpg', 2340, 1620], ['41.png', 3238, 1823], ['42.png', 4591, 2041],
    ['43.png', 4336, 2041], ['44.jpg', 4000, 2250], ['45.jpg', 6035, 4265],
    ['46.jpg', 2834, 1417], ['47.png', 3000, 1688], ['48.png', 3000, 1688],
    ['49.png', 3000, 1688], ['50.png', 3000, 1688], ['51.png', 3000, 1688],
    ['52.png', 1754, 1170], ['53.png', 1754, 1170], ['54.png', 1754, 1170],
    ['55.png', 1754, 1170], ['56.png', 1754, 1170], ['57.png', 1754, 1170],
    ['58.png', 1754, 1170], ['59.png', 4430, 1772], ['60.png', 3125, 1563],
    ['61.png', 3125, 1563], ['62.png', 3125, 1563], ['63.png', 1446, 681],
    ['64.png', 1446, 681], ['65.png', 1446, 681], ['66.png', 1446, 681],
    ['67.png', 1446, 681], ['68.png', 1531, 681], ['69.png', 1531, 681],
    ['70.png', 1531, 681], ['71.png', 1531, 681], ['72.png', 1531, 681],
    ['73.png', 1531, 681], ['74.png', 1531, 681], ['75.png', 1531, 681],
    ['76.png', 2687, 1900], ['77.png', 2500, 1670], ['78.png', 2846, 1600],
    ['79.png', 2846, 1600], ['80.png', 2846, 1600], ['81.png', 2846, 1600],
    ['82.png', 2846, 1600], ['83.png', 2846, 1600], ['84.png', 867, 1275],
    ['85.png', 877, 1342], ['86.png', 1160, 1275], ['87.png', 1708, 1275],
    ['88.png', 1650, 1298], ['89.png', 1475, 1275], ['90.png', 891, 1275],
    ['91.png', 1650, 1275], ['92.png', 927, 1275], ['93.png', 1650, 1275],
    ['94.png', 899, 1275], ['95.png', 1650, 1113], ['96.png', 881, 1275],
    ['97.png', 2953, 1241], ['98.png', 2953, 1241], ['99.png', 2989, 1276],
    ['100.png', 2989, 1276], ['101.png', 2365, 1688], ['102.png', 2633, 1535],
    ['103.png', 1032, 1688], ['104.png', 2582, 1688], ['105.png', 3000, 1688],
    ['106.png', 2496, 1686], ['107.png', 4000, 2250], ['108.png', 4000, 2250],
    ['109.png', 4000, 2250], ['110.png', 4000, 2250], ['111.png', 4000, 2250],
    ['112.png', 3000, 1688], ['113.png', 2953, 1181], ['114.png', 2953, 1181],
    ['115.png', 2953, 1181], ['116.png', 2953, 1181], ['117.png', 2953, 1181],
    ['118.png', 2953, 1181], ['119.png', 1240, 1755], ['120.png', 1240, 1755],
    ['121.png', 1240, 1755], ['122.png', 7754, 3877], ['123.png', 7754, 3877],
    ['124.png', 7752, 3875], ['125.png', 1240, 1755]
  ],
  SPEED: 34,                 // px/s
  built: false,

  /* 生成单行排布：图高 = 视口高 vh，图宽 = vh × 原图宽高比；累计宽 ≥ 视口宽即止 */
  layout(vw, vh) {
    const tiles = [];
    let total = 0, i = 0;
    while (total < vw) {
      const [src, iw, ih] = this.IMAGES[i++ % this.IMAGES.length];
      const w = Math.max(1, Math.round(vh * iw / ih));
      tiles.push({ src, w });
      total += w;
    }
    return { tiles };
  },

  /* 两份首尾相接：第二份紧随第一份 → translateX(-50%) 横向无缝循环 */
  markup({ tiles }) {
    const one = () => tiles.map(t =>
      `<figure style="width:${t.w}px">
         <img data-src="assets/img/reel/${t.src}" alt="" decoding="async" draggable="false">
       </figure>`).join('');
    return one() + one();
  },

  mount() {
    const track = document.getElementById('nav-overlay-track');
    if (!track) return;
    const vh = window.innerHeight;
    const tiles = this.layout(window.innerWidth, vh).tiles;
    track.style.height = `${vh}px`;                 // 图高 = 视口高，上下边缘撑满
    track.innerHTML = this.markup({ tiles });
    window.requestIdleCallback
      ? requestIdleCallback(() => this.hydrate(), { timeout: 600 })
      : setTimeout(() => this.hydrate(), 300);
    this.sync();
    this.built = true;
  },

  hydrate() {
    document.querySelectorAll('#nav-overlay-track img[data-src]').forEach(img => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
  },

  /* 按「半程总宽 / 速度」设定一次循环的时长，保证任何视口下线速度恒为 SPEED px/s */
  sync() {
    const track = document.getElementById('nav-overlay-track');
    if (!track) return;
    const half = track.scrollWidth / 2;
    if (!half) return;
    track.style.setProperty('--reel-dur', (half / this.SPEED).toFixed(1) + 's');
  }
};

/* ═══════════ 学生案例页 · 作品横向滚动带 ═══════════
   视觉与交互参照目录页（「关于艺术人文」浮层）的滚动马赛克（Mosaic）：
   同一套 125 张作品图源（Mosaic.IMAGES），内容复制两份首尾相接，
   translateX(0 → -50%) 无缝自右向左循环；时长 = 半幅宽 / 速度，任何视口下线速度恒定。

   与目录页「按行铺满」不同，这里按「列」打包成打乱拼接的马赛克：
   ① 每列 1–3 张，张数由该列首图自身的宽高比决定（越宽扁叠得越多）；
   ② 列内纵向跨度按各图自身比例动态分配（越竖长占越高），合计恰好填满列高；
   ③ 列宽 = 图带高 × WIDTH_F 循环系数 → 宽窄交错，整幅无空档。
   间距走图块自身的右下外边距（格内留白），故半幅总宽恒为一半，-50% 处拼接无缝。 */
const CasesReel = {
  SPEED: 34,                 // px/s，与目录页马赛克一致
  UNIT_ROWS: 6,              // 列高按 6 个基础格分配（与目录页同一量级）
  WIDTH_F: [0.62, 0.44, 0.8, 0.5, 0.7],   // 列宽 = 图带高 × 系数，循环取用
  built: false,

  /* 图带高度随视口宽度伸缩：窄屏压低、宽屏封顶 */
  stripH() {
    return Math.round(Math.min(300, Math.max(200, window.innerWidth * 0.22)));
  },

  /* 该列能叠几张（1–3）：按「列宽 ÷ 图片自身比例」推算 —— 图越宽扁，在该列宽下的
     自然高度越小，同高列里就叠得越多；列越宽则相反。结果夹在 1–3 之间。 */
  stackSize(a, h, w) {
    // ×0.8 略微收紧：竖长图更容易独占一列（1 张），宽扁图仍叠满 3 张
    return Math.min(3, Math.max(1, Math.round(0.8 * h * a / w)));
  },

  /* 把 rows 个基础格按各图自身比例分下去：越竖长占越高，合计恰好 = rows */
  split(rows, aspects) {
    const wt = aspects.map(a => 1 / a);
    const sum = wt.reduce((s, x) => s + x, 0);
    const out = wt.map(x => Math.max(1, Math.round(rows * x / sum)));
    let d = rows - out.reduce((s, x) => s + x, 0), i = 0;
    while (d !== 0 && i < rows * out.length) {      // 多退少补，保证列满高
      const j = i++ % out.length;
      if (d > 0) { out[j]++; d--; } else if (out[j] > 1) { out[j]--; d++; }
    }
    return out;
  },

  /* 逐列打包：列宽循环取系数，列内张数与纵向跨度由图片自身尺寸决定 */
  layout(h, minWidth) {
    const imgs = Mosaic.IMAGES;
    const cols = [];                                // [{ w, tiles:[{src,r,h,last}] }]
    let i = 0, total = 0;
    while (total < minWidth) {                      // 半幅 ≥ 可视宽 → 循环不露底
      const w = Math.round(h * this.WIDTH_F[cols.length % this.WIDTH_F.length]);
      const a0 = imgs[i % imgs.length][1] / imgs[i % imgs.length][2];
      const srcs = [], aspects = [];
      for (let n = 0, k = this.stackSize(a0, h, w); n < k; n++) {
        const im = imgs[i++ % imgs.length];
        srcs.push(im[0]); aspects.push(im[1] / im[2]);
      }
      const spans = this.split(this.UNIT_ROWS, aspects);
      let r = 0;
      const tiles = srcs.map((src, n) => {
        const t = { src, r, h: spans[n], last: n === srcs.length - 1 };
        r += spans[n];
        return t;
      });
      cols.push({ w, tiles });
      total += w;
      i += cols.length % 3 === 1 ? 1 : 0;   // 打乱：隔列错开一张，避免所有列都从同一相位起图
    }
    return cols;
  },

  /* 两份首尾相接：第二份整体右移 cols.length 列 → 横向无缝循环 */
  markup(cols) {
    const one = off => cols.map((c, ci) => c.tiles.map(t =>
      `<figure style="grid-area:${t.r + 1}/${ci + 1 + off}/span ${t.h}/span 1${t.last ? ';margin-bottom:0' : ''}">
         <img src="assets/img/reel/${t.src}" alt="" decoding="async" draggable="false">
       </figure>`).join('')).join('');
    return one(0) + one(cols.length);
  },

  build() {
    const track = document.getElementById('cases-reel-track');
    if (!track) return;
    const clip = track.parentElement;
    /* 可视宽 = 裁切框宽（已与标题文字内容同宽），取不到时回落到内容宽 1104 */
    const minWidth = Math.max((clip && clip.clientWidth) || Math.min(1104, window.innerWidth - 96), 320);
    const unit = Math.round(this.stripH() / this.UNIT_ROWS) || 1;
    const h = unit * this.UNIT_ROWS;                // 整格高度，避免半像素留白
    const cols = this.layout(h, minWidth);
    const widths = cols.map(c => c.w + 'px');

    track.style.height = `${h}px`;
    track.style.gridTemplateColumns = widths.concat(widths).join(' ');
    track.style.gridTemplateRows = `repeat(${this.UNIT_ROWS}, ${unit}px)`;
    track.innerHTML = this.markup(cols);
    this.sync(track);
    this.built = true;
  },

  /* 时长 = 半幅总宽 / 速度 → 与目录页同一套「线速度恒定」策略 */
  sync(track) {
    track = track || document.getElementById('cases-reel-track');
    if (!track) return;
    const half = track.scrollWidth / 2;
    if (half) track.style.setProperty('--reel-dur', (half / this.SPEED).toFixed(1) + 's');
  }
};

/* 视口尺寸变化 → 重算图带高度 / 各图宽度 / 循环时长（防抖） */
let _casesReelRz;
window.addEventListener('resize', () => {
  if (!CasesReel.built) return;
  clearTimeout(_casesReelRz);
  _casesReelRz = setTimeout(() => CasesReel.build(), 200);
});

/* ═══════════ 「关于艺术人文」全屏浮层 ═══════════
   绿色方框触发：整屏覆盖 + 自上而下消隐（CSS clip-path 幕布 + 绿色消隐线）
   背景 = 20 张作品拼成的横向滚动马赛克（仅此界面出现，首次展开才建/加载）
   左侧正体文字面板叠在马赛克之上 */
const NavOverlay = {
  /* 目录页布局参考 IST_demo「两道横线」浮层：两栏层级
     （一级大号 / 中间 1px 竖分隔线 / 二级小号）+ 底部 CTA；
     视觉沿用艺术人文自身语言（青绿主色 / 正体字 / 幕布消隐线 / 横向马赛克背景），
     不做 IST_demo 底部的任何登录权限相关项。 */
  markup(overlay = {}) {
    const primary = overlay.primary || [];
    const secondary = overlay.secondary || [];
    /* 条目渲染：编号统一由序号生成（01/02/…），保证层级与编号格式一致。
       带 placeholder 的条目（如「05 全日制」）内容尚未上线：同样占位编号与字号，
       渲染为不可点击的占位行 + 小标签，不产生跳转；
       后续内容就位时，在 meta.json 去掉该项的 placeholder / placeholderNote 即成为同级正常链接 */
    const link = (it, i, tier) => {
      const idx = `<span class="idx">${String(i + 1).padStart(2, '0')}</span>`;
      if (it.placeholder) {
        return `<span class="nav-overlay__link nav-overlay__link--${tier} is-placeholder" style="--i:${i}" aria-disabled="true">` +
          `${idx}${it.label}<span class="nav-overlay__soon">${it.placeholderNote || '内容即将上线'}</span></span>`;
      }
      return `<a class="nav-overlay__link nav-overlay__link--${tier}" href="${it.href}" data-view="${it.id}" style="--i:${i}">` +
        `${idx}${it.label}</a>`;
    };
    const cta = overlay.cta
      ? `<a class="nav-overlay__cta" href="${overlay.cta.href}" data-view="employment" style="--i:${primary.length + secondary.length}">` +
          `${overlay.cta.label}${overlay.cta.labelEn ? `<span class="nav-overlay__cta-en u-en">/ ${overlay.cta.labelEn}</span>` : ''}</a>`
      : '';

    return `
      <div class="nav-overlay" id="nav-overlay" aria-hidden="true">
        <div class="nav-overlay__sweep"></div>
        <button class="nav-overlay__close" type="button" onclick="NavOverlay.close()" aria-label="关闭"><span class="u-en">×</span></button>
        <!-- 横向滚动马赛克：20 张作品无缝拼合，仅此界面出现（首次展开时才建） -->
        <div class="nav-overlay__reel" aria-hidden="true">
          <div class="nav-overlay__track" id="nav-overlay-track"></div>
        </div>
        <div class="nav-overlay__panel">
          <p class="nav-overlay__eyebrow">${overlay.eyebrow || '主要内容 · CONTENTS'}</p>
          <div class="nav-overlay__row">
            <nav class="nav-overlay__col nav-overlay__col--primary" aria-label="页面导航">${primary.map((it, i) => link(it, i, 'primary')).join('')}</nav>
            <span class="nav-overlay__div" aria-hidden="true"></span>
            <nav class="nav-overlay__col nav-overlay__col--secondary" aria-label="页内导航">${secondary.map((it, i) => link(it, i, 'secondary')).join('')}</nav>
          </div>${cta}
        </div>
      </div>
    `;
  },

  bind() {
    const el = document.getElementById('nav-overlay');
    if (!el) return;

    // 点马赛克 / 空白处 → 关闭；点击条目 → 关闭后交给 Router 跳转
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('.nav-overlay__reel')) this.close();
    });
    // 占位条目（is-placeholder）无链接内容 → 不参与「点击关闭并跳转」
    el.querySelectorAll('.nav-overlay__link:not(.is-placeholder)').forEach(a =>
      a.addEventListener('click', () => this.close()));

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && el.classList.contains('is-open')) this.close();
    });

    // 点击浮层与方框之外的地方 → 一并收起
    document.addEventListener('click', e => {
      const drop = document.getElementById('main-dropdown');
      if (!drop || drop.contains(e.target) || el.contains(e.target)) return;
      drop.classList.remove('is-open');
      if (el.classList.contains('is-open')) this.close();
    });

    // 视口变化会改变格边长/列数 → 重建马赛克（只在已建过时）
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t); t = setTimeout(() => { if (Mosaic.built) Mosaic.mount(); }, 220);
    });
  },

  open() {
    const el = document.getElementById('nav-overlay');
    if (!el) return;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.getElementById('main-dropdown').classList.add('is-open');
    document.documentElement.classList.add('is-overlay-open');
    Mosaic.built ? Mosaic.sync() : Mosaic.mount();   // 首次展开时才建/加载马赛克
  },

  close() {
    const el = document.getElementById('nav-overlay');
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    document.getElementById('main-dropdown').classList.remove('is-open');
    document.documentElement.classList.remove('is-overlay-open');
  },

  toggle() {
    const el = document.getElementById('nav-overlay');
    if (!el) return;
    el.classList.contains('is-open') ? this.close() : this.open();
  }
};

/* ═══════════ 页头 ═══════════ */
const Header = {
  build() {
    const meta = DATA.cache.meta;
    const main = meta.nav.main;
    const right = meta.nav.right;

    document.getElementById('app-header').innerHTML = `
      <nav class="navbar">
        <div class="navbar__left">
          <a class="navbar__logo" href="#/home">
            <img src="assets/img/brand/logo-illustration-fineart.png" alt="Art &amp; Humanities 艺术人文科系">
            <span class="navbar__logo-text">
              <span class="navbar__logo-en">Art &amp; Humanities</span>
              <span class="navbar__logo-zh">艺术人文科系</span>
            </span>
          </a>
        </div>
        <div class="navbar__right">
          ${main.items.map(it => `<a class="nav-link nav-link--main" href="${it.href}" data-view="${it.id}">${it.label}</a>`).join('')}
          <!-- “主要内容”触发器（绿色空心方框）：已从左上角移至右侧链接区末位（原“研究生”位置）；
               本科爬藤 / 全日制 / 研究生 三个入口已收进全屏目录页（左上角仅保留 Logo 与站名）。
               main.items 由 meta.json 驱动，恢复时把 archived 条目移回 items 即会在此重新渲染 -->
          <div class="nav-dropdown" id="main-dropdown">
            <button class="nav-btn nav-btn--square" onclick="NavOverlay.toggle()"
                    aria-label="${main.label}" title="${main.label}">
              <span class="nav-square"></span>
            </button>
          </div>
          ${right.map(it => `<a class="nav-link nav-link--section-mobile" href="${it.href}" data-view="${it.id}">${it.label}</a>`).join('')}
          <span class="navbar__divider"></span>
          <a class="nav-btn nav-btn--cta" href="#/employment">规划我的未来</a>
        </div>
        <button class="navbar__menu-toggle" onclick="Header.toggleMobile()" aria-label="菜单"><span></span><span></span></button>
      </nav>
      ${NavOverlay.markup(meta.nav.overlay)}
    `;
    NavOverlay.bind();
  },

  /* 当前视图高亮：主菜单按 view 匹配，右侧导航 home 段按 section 匹配 */
  markActive(view, section) {
    document.querySelectorAll('.nav-link[data-view], .nav-overlay__link[data-view]').forEach(a => {
      const id = a.dataset.view;
      const isHomeSection = ['intro', 'offers', 'instructors', 'resources', 'timeline', 'courses'].includes(id);
      let on = false;
      if (isHomeSection) on = view === 'home' && (section === id || (id === 'intro' && !section));
      else on = id === view || (id === 'intro' && view === 'home');
      a.classList.toggle('is-active', on);
    });
  },

  toggleDropdown() { NavOverlay.toggle(); },   // 兼容旧调用
  toggleMobile() { document.querySelector('.navbar').classList.toggle('is-mobile-open'); }
};

/* ═══════════ 页脚 ═══════════ */
const Footer = {
  build() {
    const meta = DATA.cache.meta;
    document.getElementById('app-footer').innerHTML = `
      <footer class="site-footer">
        <div class="site-footer__inner">
          <div>
            <div class="site-footer__brand">
              <img src="assets/img/brand/logo-illustration-fineart.png" alt="">
              <span>${meta.brand}</span>
            </div>
            <p class="site-footer__desc">${meta.subtitle}</p>
          </div>
          <div>
            <h3 class="site-footer__col-title">主要内容</h3>
            ${meta.nav.main.items.map(it => `<a href="${it.href}">${it.label}</a>`).join('')}
          </div>
          <div>
            <h3 class="site-footer__col-title">科系板块</h3>
            ${meta.nav.right.filter(it => it.id !== 'cases').map(it => `<a href="${it.href}">${it.label}</a>`).join('')}
          </div>
          <div>
            <h3 class="site-footer__col-title">规划咨询</h3>
            <a href="mailto:${meta.footer.contact.email}">${meta.footer.contact.email}</a>
            <a href="tel:${meta.footer.contact.tel}">${meta.footer.contact.tel}</a>
          </div>
        </div>
        <div class="site-footer__bottom">${meta.footer.copyright}</div>
      </footer>
    `;
  }
};

/* ═══════════ 各视图构建器（懒加载，进入视图时才渲染一次） ═══════════ */
const PAGES = {
  home() {
    /* 「两大专业方向」已改为静态手风琴（结构内联于 index.html，纯 CSS 交互），
       不再由 majors.json 渲染 #major-grid；其余首页板块照常构建 */
    CourseProducts.build();
    OffersSection.build();
    InstructorsSection.build();
    ResourcesSection.build();
    TimelineSection.build();
  },

  undergraduate() { PlanningModules.build(); UndergradPage.init(); UgTimeline.build(); },
  cases() { CasesPage.build(); CasesReel.build(); },
  employment() { EmploymentPage.build(); },
  fulltime() {},
  graduate() {}
};

/* 课程期次角标配色表（只登记需要改色的期次，色板统一取自
   「规划我的未来 · 八大就业方向一览」所使用的 8 色）：
     lecture 25      → #E5C07B（06 文旅体制与公共文化服务）
     Autumn 26       → #61AFEF（07 独立创业与职业艺术家）
     masterclass 26  → #C678DD（05 艺术教育与学术研究）
   rgb/veil/glow 用于把「八大口」色系完整落到角标上：同色文字 + 同色描边
   + 同色薄层叠在深色底之上（保证任何海报上都清晰）+ 同色柔和辉光。
   未登记的期次（如 lecture 26）不输出任何样式，沿用默认青绿，外观不变。 */
const CAT_TAG_COLORS = {
  'lecture 25': { color: '#E5C07B', border: 'rgba(229,192,123,.35)' },
  'Autumn 26': { color: '#61AFEF', border: 'rgba(97,175,239,.5)', rgb: '97,175,239', veil: .3, glow: .28 },
  'masterclass 26': { color: '#C678DD', border: 'rgba(198,120,221,.5)', rgb: '198,120,221', veil: .3, glow: .28 },
  'winter 27': { color: '#E06C75', border: 'rgba(224,108,117,.5)', rgb: '224,108,117', veil: .3, glow: .28 },
  'summer 26': { color: '#4ADBA0', border: 'rgba(74,219,160,.5)', rgb: '74,219,160', veil: .3, glow: .28 },
  '商业实践项目课程': { color: '#E06C9F', border: 'rgba(224,108,159,.5)', rgb: '224,108,159', veil: .3, glow: .28 },
  '岗位制实习（实地）': { color: '#63E6D4', border: 'rgba(99,230,212,.5)', rgb: '99,230,212', veil: .3, glow: .28 },
  '行业导师带训（线上）': { color: '#7FE0B8', border: 'rgba(127,224,184,.5)', rgb: '127,224,184', veil: .3, glow: .28 },
  '境外访校': { color: '#61AFEF', border: 'rgba(97,175,239,.5)', rgb: '97,175,239', veil: .3, glow: .28 },
  '境外夏校': { color: '#4ADBA0', border: 'rgba(74,219,160,.5)', rgb: '74,219,160', veil: .3, glow: .28 },
  '境外冬校': { color: '#E5C07B', border: 'rgba(229,192,123,.5)', rgb: '229,192,123', veil: .3, glow: .28 },
  '境外研学': { color: '#C678DD', border: 'rgba(198,120,221,.5)', rgb: '198,120,221', veil: .3, glow: .28 },
  '家长团': { color: '#E06C9F', border: 'rgba(224,108,159,.5)', rgb: '224,108,159', veil: .3, glow: .28 },
  '招募中': { color: '#4ADBA0', border: 'rgba(74,219,160,.5)', rgb: '74,219,160', veil: .3, glow: .28 },
  '往期': { color: '#98A2B3', border: 'rgba(152,162,179,.5)', rgb: '152,162,179', veil: .3, glow: .28 }
};

/* 课程模块数据源登记表：条目声明 curriculumSource 后，由其指向的原始数据
   经此表登记的归一化方法转换为统一卡片（新增数据源时在此加一行即可）：
     frontier-lectures   → 艺术前沿讯息讲座（点击弹海报大图）
     masterclass-courses → 海外大师课程（点击弹课程 PDF） */
const CURRICULUM_SOURCES = {
  'frontier-lectures': 'lectureCards',
  'masterclass-courses': 'masterclassCards',
  'summer-winter-courses': 'summerWinterCards',
  'industry-courses': 'industryCards',
  'overseas-courses': 'overseasCards',
  'anxin-courses': 'overseasCards'
};

/* ═══════════ 课程产品（主页 #courses 板块） ═══════════
   结构 / 布局 / 信息层级复用 dad_demo「课程产品」页：
     页头 → 长线旗舰产品（长线卡）→ 课程目录（目录卡）
   点任一卡片 → 全屏课程详情浮层 #course-overlay，内容体沿用 dad_demo
   的 cd-* 分区层级：hero → 核心数据 → 课程模块 → 为什么选择 SFK → 收尾语。
   数据源 data/course-products.json；「课程目录」的具体课程条目与配图目前
   为占位，文字与图片后续提供。 */
const CourseProducts = {
  esc(v) { return DirectionsSection.escape(v == null ? '' : String(v)); },

  /* 分区骨架：key 对应 course-products.json 的数据数组；
     elite 与 longform 同用长线式卡片/详情，catalog/overseas/frontier 同用目录式 */
  ZONES: [
    { key: 'elite',    grid: 'cp-elite-grid',    group: 'longform' },
    { key: 'longform', grid: 'cp-longform-grid', group: 'longform' },
    { key: 'catalog',  grid: 'cp-catalog-grid',  group: 'catalog' },
    { key: 'overseas', grid: 'cp-overseas-grid', group: 'catalog' },
    { key: 'frontier', grid: 'cp-frontier-grid', group: 'catalog' }
  ],

  /* 学历层次筛选状态：'' = 全部；'ug' = 本科；'pg' = 研究生 */
  _level: '',
  _levelBound: false,

  build() {
    const d = DATA.cache['course-products'];
    if (!d) return;

    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.textContent = v; };
    const hero = d.hero || {}, zones = d.zones || {};
    set('cp-eyebrow', hero.eyebrow);
    set('cp-title', hero.title);
    set('cp-sub', hero.sub);
    this.ZONES.forEach(z => {
      const zc = zones[z.key];
      if (zc) { set('cp-' + z.key + '-eyebrow', zc.eyebrow); set('cp-' + z.key + '-title', zc.title); }
    });

    this.renderLevelBar();
    this.renderGrids();
    this.bind();
  },

  /* 标题下方「本科 / 研究生」筛选：单击选中、再击取消（取消后展示全部课程） */
  renderLevelBar() {
    const bar = document.getElementById('cp-level-bar');
    if (!bar) return;
    const items = [{ id: 'ug', label: '本科' }, { id: 'pg', label: '研究生' }];
    bar.innerHTML = items.map(it =>
      `<button class="filter-btn${this._level === it.id ? ' is-active' : ''}" type="button" data-level="${it.id}">${it.label}</button>`).join('');
    if (!this._levelBound) {
      this._levelBound = true;
      bar.addEventListener('click', e => {
        const b = e.target.closest('.filter-btn');
        if (!b) return;
        const lv = b.getAttribute('data-level');
        this._level = this._level === lv ? '' : lv;
        this.renderLevelBar();
        this.renderGrids();
      });
    }
  },

  /* 按课程条目的 levels 过滤渲染五个分区；过滤后为空的分区整体隐藏，保持版面协调 */
  renderGrids() {
    const d = DATA.cache['course-products'];
    if (!d) return;
    this.ZONES.forEach(z => {
      const g = document.getElementById(z.grid);
      if (!g) return;
      const list = (d[z.key] || []).filter(p => !this._level || (p.levels || []).includes(this._level));
      g.innerHTML = list.map(p => this.card(p, z.group)).join('');
      const zone = g.closest('.cp-zone');
      if (zone) zone.style.display = list.length ? '' : 'none';
    });
  },

  card(p, group) {
    const esc = this.esc;
    const banner = 'cp-card__banner' + (p.tileVariant ? ' cp-card__banner--' + p.tileVariant : '');
    const img = p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : '';
    return `<div class="cp-card cp-card--${group}" role="button" tabindex="0" data-cp-id="${esc(p.id)}" aria-label="${esc(p.meta.titleCn)}">
      <div class="${banner}">${img}<span class="cp-card__badge cp-card__badge--${group}">${esc(p.badge)}</span></div>
      <div class="cp-card__body">
        <div class="cp-card__eyebrow">${esc(p.meta.eyebrow)}</div>
        <div class="cp-card__title">${esc(p.meta.titleCn)}</div>
        <div class="cp-card__subtitle"><span class="u-en">${esc(p.meta.titleEn)}</span></div>
        <p class="cp-card__desc">${esc(p.meta.desc)}</p>
        <div class="cp-card__chips">${(p.meta.chips || []).map(c => `<span class="cd-chip">${esc(c)}</span>`).join('')}</div>
      </div>
    </div>`;
  },

  /* 课程模块卡片：点击（或回车 / 空格）→ 海报大图弹窗。
     事件委托在 document 上，课程详情浮层内与本科爬藤页的同一组件共用一套绑定 */
  _bindCurriculumCards() {
    const pick = e => (e.target && e.target.closest ? e.target.closest('.cd-curriculum-card[data-poster]') : null);
    document.addEventListener('click', e => {
      const card = pick(e);
      if (card) PosterModal.open(card);
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = pick(e);
      if (!card) return;
      e.preventDefault();
      PosterModal.open(card);
    });
  },

  /* 封面缺失兜底（捕获阶段监听图片加载失败）：移除破图、露出卡片原有的装饰渐变底；
     若该卡片只能靠海报打开（没有 PDF），同时取消可点状态，避免点开空弹窗。
     把同名海报文件补进 assets/img/courses/ 后，卡片会自动恢复为图片与可点状态。 */
  _bindImageFallback() {
    document.addEventListener('error', e => {
      const img = e.target;
      if (!img || img.tagName !== 'IMG' || !img.closest) return;
      const box = img.closest('.cd-curriculum-card__img');
      if (!box) return;
      box.classList.remove('cd-curriculum-card__img--photo');
      const card = box.closest('.cd-curriculum-card');
      if (card && card.getAttribute('data-poster') && !card.getAttribute('data-pdf')) {
        card.removeAttribute('data-poster');
        card.removeAttribute('role');
        card.removeAttribute('tabindex');
        card.classList.remove('is-clickable');
      }
      img.remove();
    }, true);
  },

  /* 事件一次性绑定：关闭按钮 / 点背景 / ESC；课程卡片用事件委托，两个网格共用 */
  bind() {
    if (this._bound) return;
    this._bound = true;
    this._bindCurriculumCards();
    this._bindImageFallback();
    const ov = document.getElementById('course-overlay');
    if (!ov) return;
    this.overlay = ov;
    this.body = document.getElementById('course-overlay-body');
    this.panel = ov.querySelector('.course-overlay__panel');

    const bg = ov.querySelector('.course-overlay__backdrop');
    const btn = ov.querySelector('.course-overlay__close');
    if (bg) bg.addEventListener('click', () => this.close());
    if (btn) btn.addEventListener('click', () => this.close());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });

    ['cp-elite-grid', 'cp-longform-grid', 'cp-catalog-grid', 'cp-overseas-grid', 'cp-frontier-grid'].forEach(id => {
      const grid = document.getElementById(id);
      if (!grid) return;
      grid.addEventListener('click', e => {
        const card = e.target.closest('.cp-card');
        if (card) this.open(card.getAttribute('data-cp-id'), card.classList.contains('cp-card--catalog') ? 'catalog' : 'longform');
      });
      grid.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('.cp-card');
        if (!card) return;
        e.preventDefault();
        this.open(card.getAttribute('data-cp-id'), card.classList.contains('cp-card--catalog') ? 'catalog' : 'longform');
      });
    });
    this._bindCurriculumFilter();
  },

  /* 课程模块的标签筛选 + 搜索：委托在常驻的详情浮层正文容器上，
     每次打开新详情自动作用于新内容；输入事件只更新网格，输入框本身不被重建 */
  _bindCurriculumFilter() {
    const box = this.body;
    if (!box) return;
    box.addEventListener('click', e => {
      const main = e.target.closest('[data-cur-main]');
      if (main) { this.curFacet('main', main); return; }
      const sub = e.target.closest('[data-cur-sub]');
      if (sub) { this.curFacet('sub', sub); return; }
      if (e.target.closest('#cd-cur-clear')) this.curSearch('');
    });
    box.addEventListener('input', e => {
      if (e.target && e.target.id === 'cd-cur-search') this.curSearch(e.target.value, e.target);
    });
    /* 搜索框内有内容时，Esc 先清空搜索词（不冒泡去关闭课程详情浮层） */
    box.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !e.target || e.target.id !== 'cd-cur-search' || !e.target.value) return;
      e.stopPropagation();
      this.curSearch('', e.target);
    });
  },

  open(id, group) {
    const d = DATA.cache['course-products'];
    if (!d || !this.body) return;
    /* 详情数据在全部课程组中查找（长线旗舰 / 艺术精英 → 长线式详情；
       课程目录 / 境外项目 / 艺术前沿讯息讲座 → 目录式详情，由各条目自身字段决定层级） */
    const p = [d.longform, d.elite, d.catalog, d.overseas, d.frontier]
      .reduce((f, l) => f || ((l || []).filter(x => x.id === id)[0]), null);
    if (!p) return;
    this.body.innerHTML = this.detail(p);
    this.renderCurriculum();          // 课程模块若带筛选/搜索，按初始状态渲染一次
    this.body.classList.add('is-wide');
    this.overlay.classList.add('is-open');
    document.body.classList.add('is-locked');
    // 真正滚动的是面板：开新详情时把滚动位置归零，避免沿用上一次的位置
    if (this.panel) this.panel.scrollTop = 0;
    this.body.scrollTop = 0;
    const btn = this.overlay.querySelector('.course-overlay__close');
    if (btn) btn.focus();
  },

  close() {
    if (!this.overlay) return;
    this.overlay.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    if (this.body) this.body.innerHTML = '';
  },

  detail(p) {
    const esc = this.esc;
    const tile = 'cd-hero__tile' + (p.tileVariant ? ' cd-hero__tile--' + p.tileVariant : '');
    const sec = (label, inner) =>
      `<section class="cd-section"><div class="cd-section__label">${esc(label)}</div>${inner}</section>`;

    return `
      <div class="cd-hero">
        <div class="cd-hero__content">
          <div class="cd-hero__eyebrow">${esc(p.meta.eyebrow)}</div>
          <h2 class="cd-hero__title">${esc(p.meta.titleCn)}</h2>
          <div class="cd-hero__subtitle">${esc(p.meta.titleEn)}</div>
          <p class="cd-hero__desc">${esc(p.meta.desc)}</p>
          <div class="cd-chips">${(p.meta.chips || []).map(c => `<span class="cd-chip">${esc(c)}</span>`).join('')}</div>
        </div>
        <div class="${tile}" aria-hidden="true"></div>
      </div>
      ${p.placeholder ? '<p class="cd-note">本目录的具体课程、课时与配图待提供，以下为结构占位。</p>' : ''}
      ${(p.snapshot && p.snapshot.length) ? sec('核心数据 · SNAPSHOT', `<div class="cd-stat-grid">${p.snapshot.map(s =>
        `<div class="cd-stat"><div class="cd-stat__k">${esc(s.k)}</div><div class="cd-stat__v">${esc(s.v)}</div></div>`).join('')}</div>`) : ''}
      ${(this.curriculumOf(p).length) ? sec('课程模块 · CURRICULUM', this.curriculumBlock(p)) : ''}
      ${(p.whySFK && p.whySFK.length) ? sec('为什么选择 SFK · WHY SFK', `<div class="cd-why-grid">${p.whySFK.map(w =>
        `<div class="cd-why"><div class="cd-stat__k">${esc(w.t)}</div><div class="cd-stat__v">${esc(w.d)}</div></div>`).join('')}</div>`) : ''}
      <div class="cd-cta">
        <p class="cd-cta__statement">${esc(p.closing && p.closing.cn)}</p>
        <p class="cd-cta__statement-en">${esc(p.closing && p.closing.en)}</p>
      </div>`;
  },

  /* ── 课程模块：标签筛选 + 搜索（由条目自身的 curriculumFacets 驱动）──────────
     主标签按 program_type 过滤；选中带 children 的主标签时展开其子标签
     （按 category 进一步过滤）；搜索实时匹配 curriculumFacets.searchFields
     指定的字段（默认 company / role_or_course / suitable_for）。
     三者为 AND 联动：主标签 × 子标签 × 搜索词，任一变化即时更新结果。
     只重渲染网格 / 计数 / 空状态，不重建输入框，因此输入焦点与光标不被打断。 */
  curriculumBlock(p) {
    const cards = this.curriculumOf(p);
    this._cur = { cards, main: '', sub: '', q: '' };
    const f = p.curriculumFacets;
    if (!f || !(f.groups || []).length) {
      return `<div class="cd-curriculum-grid">${cards.map(c => this.curriculumCard(c)).join('')}</div>`;
    }
    const mains = f.groups.map(g =>
      `<button class="filter-btn" type="button" data-cur-main="${this.esc(g.value)}">${this.esc(g.label)}</button>`).join('');
    const subs = f.groups.filter(g => (g.children || []).length).map(g =>
      g.children.map(c => `<button class="filter-btn filter-btn--sub" type="button" data-cur-sub="${this.esc(c)}" data-cur-parent="${this.esc(g.value)}">${this.esc(c)}</button>`).join('')
    ).join('');
    return `
      <div class="filter-bar cd-cur-bar">
        <div class="cd-cur-left">
          <div class="filter-group">
            <span class="filter-group__label">分类</span>
            <span class="filter-group__sep">|</span>
            <span class="filter-group__btns" id="cd-cur-mains">${mains}</span>
          </div>
          <div class="filter-group filter-group__btns" id="cd-cur-subs" hidden>${subs}</div>
        </div>
        <div class="cd-cur-right">
          <input class="cd-cur-input" id="cd-cur-search" type="search" autocomplete="off"
            placeholder="${this.esc(f.searchPlaceholder || '搜索课程…')}" aria-label="搜索课程">
          <button class="cd-cur-clear" id="cd-cur-clear" type="button" hidden>清除</button>
          <span class="cd-cur-count" id="cd-cur-count"></span>
        </div>
      </div>
      <div class="cd-curriculum-grid" id="cd-cur-grid"></div>
      <p class="cd-cur-empty" id="cd-cur-empty" hidden>没有符合当前筛选条件的课程 · 请调整标签或搜索词</p>`;
  },

  /* 按当前筛选状态重渲染课程网格 + 计数 + 空状态（不动筛选栏本身） */
  renderCurriculum() {
    const st = this._cur;
    const grid = document.getElementById('cd-cur-grid');
    if (!st || !grid) return;
    const list = st.cards.filter(c => this.curMatch(c, st));
    grid.innerHTML = list.map(c => this.curriculumCard(c)).join('');
    const empty = document.getElementById('cd-cur-empty');
    if (empty) empty.hidden = list.length > 0;
    const count = document.getElementById('cd-cur-count');
    if (count) count.textContent = list.length === st.cards.length
      ? st.cards.length + ' 门课程'
      : list.length + ' / ' + st.cards.length + ' 门课程';
    const clear = document.getElementById('cd-cur-clear');
    if (clear) clear.hidden = !st.q;
  },

  curMatch(c, st) {
    const f = c.facets || {};
    if (st.main && f.program_type !== st.main) return false;
    if (st.sub && f.category !== st.sub) return false;
    if (st.q && !(c.searchText || '').includes(st.q)) return false;
    return true;
  },

  /* 主标签 / 子标签：单击选中、再击取消；切换主标签时清空并收起子标签 */
  curFacet(kind, btn) {
    const st = this._cur;
    if (!st) return;
    const attr = kind === 'main' ? 'data-cur-main' : 'data-cur-sub';
    const val = btn.getAttribute(attr);
    if (kind === 'main') {
      st.main = st.main === val ? '' : val;
      st.sub = '';
    } else {
      st.sub = st.sub === val ? '' : val;
    }
    document.querySelectorAll('#cd-cur-mains .filter-btn').forEach(b =>
      b.classList.toggle('is-active', b.getAttribute('data-cur-main') === st.main));
    let shown = 0;
    document.querySelectorAll('#cd-cur-subs .filter-btn').forEach(b => {
      b.hidden = !st.main || b.getAttribute('data-cur-parent') !== st.main;
      if (!b.hidden) shown++;
      b.classList.toggle('is-active', b.getAttribute('data-cur-sub') === st.sub);
    });
    const subs = document.getElementById('cd-cur-subs');
    if (subs) subs.hidden = shown === 0;      // 无可用子标签（或已取消主标签）时整行收起
    this.renderCurriculum();
  },

  /* 搜索：实时匹配（大小写不敏感）；输入框内容由输入框自身维护，不回写以免打断输入 */
  curSearch(value, inputEl) {
    const st = this._cur;
    if (!st) return;
    st.q = String(value == null ? '' : value).trim().toLowerCase();
    const input = inputEl || document.getElementById('cd-cur-search');
    if (input) input.value = value == null ? '' : value;
    this.renderCurriculum();
  },

  /* ── 课程模块 · CURRICULUM（各分区共用同一张卡片结构）────────────────
     文字层级对齐 dad_demo 的课程海报卡（port-card）：
       图片（含左上分类角标）→ 眉标 → 标题 → 院校 · 教授 → 标签组 → 说明
     无图卡片只渲染标题 + 说明，保持其它分区现状不变；
     有图卡片整卡可点，点击弹出海报大图（见 PosterModal）。
     艺术前沿讯息讲座、本科爬藤「课程产品」板块均复用本方法，保证全站一致。 */
  curriculumCard(c) {
    const esc = this.esc;
    const img = c.img ? `<img src="${esc(c.img)}" alt="${esc(c.alt || c.title || '')}" loading="lazy">` : '';
    const catTag = c.catTag ? `<span class="cd-curriculum-card__cat-tag">${esc(c.catTag)}</span>` : '';
    const cls = 'cd-curriculum-card__img' + (c.img ? ' cd-curriculum-card__img--photo' : '');
    /* 色系变量统一挂在卡片上，角标经 CSS 变量继承，无需各自写样式 */
    const colors = this.catColorVars(c.catTag);
    /* 可点性：有 PDF（大师课）优先走 PDF；否则有图（讲座）走海报大图 */
    const clickable = !!(c.pdf || c.img);
    const attr = clickable
      ? ` role="button" tabindex="0"` +
        (c.pdf ? ` data-pdf="${esc(c.pdf)}"` : '') +
        (c.img ? ` data-poster="${esc(c.img)}"` : '') +
        ` data-poster-title="${esc(c.title)}" aria-label="${esc(c.title)} 点击查看${c.pdf ? '课程 PDF' : '海报'}"`
      : '';
    const tags = (c.tags && c.tags.length)
      ? `<div class="cd-curriculum-card__tags">${c.tags.map(t => `<span class="cd-curriculum-card__tag">${esc(t)}</span>`).join('')}</div>`
      : '';
    return `<div class="cd-curriculum-card${clickable ? ' is-clickable' : ''}"${attr}${colors}>
      <div class="${cls}"${clickable ? '' : ' aria-hidden="true"'}>${img}${catTag}</div>
      <div class="cd-curriculum-card__body">
        ${c.eyebrow ? `<div class="cd-curriculum-card__eyebrow">${esc(c.eyebrow)}</div>` : ''}
        <h4 class="cd-curriculum-card__title">${esc(c.title)}</h4>
        ${c.program ? `<div class="cd-curriculum-card__program">${esc(c.program)}</div>` : ''}
        ${tags}
        ${c.desc ? `<p class="cd-curriculum-card__desc">${esc(c.desc)}</p>` : ''}
      </div>
    </div>`;
  },

  /* 期次色系变量：只对 CAT_TAG_COLORS 中登记过的期次输出内联变量，未登记的
     期次不输出任何样式（沿用样式表默认值，外观不变）。挂在卡片上后由角标继承：
       --cat-tag-*  角标：同色文字 / 同色描边 / 同色薄层 / 同色辉光
       --cat-*      卡片整体：同色边框 / 同色淡底 / 同色悬停描边与辉光 / 同色副信息文字
     仅登记了 rgb（完整色系）的期次才附带卡片整体色系，只有单色的期次（lecture 25）
     维持原有的「仅角标改色」效果不变。 */
  catColorVars(tab) {
    const c = CAT_TAG_COLORS[tab];
    if (!c) return '';
    const vars = [`--cat-tag-color:${c.color}`];
    if (c.border) vars.push(`--cat-tag-border:${c.border}`);
    if (c.rgb) {
      vars.push(`--cat-color:${c.color}`);
      vars.push(`--cat-line:rgba(${c.rgb},.35)`);
      vars.push(`--cat-wash:linear-gradient(rgba(${c.rgb},.07),rgba(${c.rgb},.07))`);
      vars.push(`--cat-glow-full:0 0 0 1px rgba(${c.rgb},.45), 0 0 28px rgba(${c.rgb},.22)`);
      vars.push(`--cat-tag-veil:linear-gradient(rgba(${c.rgb},${c.veil}),rgba(${c.rgb},${c.veil}))`);
      vars.push(`--cat-tag-glow:0 0 16px rgba(${c.rgb},${c.glow})`);
    }
    return ` style="${vars.join(';')}"`;
  },

  /* 取条目的课程模块：优先条目自身的 curriculum；若条目声明了
     curriculumSource（如艺术前沿讯息讲座 → data/frontier-lectures.json、
     海外大师课程 → data/masterclass-courses.json），则由该原始数据经
     CURRICULUM_SOURCES 登记的归一化方法转换而来 */
  curriculumOf(p) {
    const src = p.curriculumSource;
    if (!src) return p.curriculum || [];
    const fn = CURRICULUM_SOURCES[src];
    return fn ? this[fn](DATA.cache[src], p) : [];
  },

  /* 艺术前沿讯息讲座原始讲座条目 → 统一课程模块卡片（字段与层级的对应关系：
     poster→图片 · tab→分类角标 · program_type→眉标 · role_or_course→标题 ·
     university + professor→院校·教授 · location + level + suitable_for→标签组 ·
     outcomes→说明）。逐字取用原始字段，不新增或改写任何文案。 */
  lectureCards(rows) {
    return (rows || []).map(r => ({
      img: r.poster || '',
      catTag: r.tab || '',
      eyebrow: r.program_type || '',
      title: r.role_or_course || '',
      program: [r.university, r.professor].filter(Boolean).join('｜'),
      tags: [r.location, r.level, r.suitable_for].filter(Boolean),
      desc: r.outcomes || ''
    }));
  },

  /* 海外大师课程原始条目 → 统一课程模块卡片（字段与层级的对应关系：
     poster→图片 · tab→分类角标 · program_type→眉标 · role_or_course→标题 ·
     university + professor→院校·教授 · type + location + level + outcomes→标签组 ·
     suitable_for→说明）。该模块的 suitable_for 是整句适合对象，故放在说明层；
     其余短字段进标签组。逐字取用原始字段，不新增或改写任何文案。 */
  /* 海外大师课程中仅这三门 26F 秋季课提供真实课件 PDF：点击弹出对应名称的文档；
     其余课程不挂 PDF，卡片仅作圆角图片海报展示（点击查看海报大图）。
     后续补充课件后，把课程名（role_or_course）加入此清单即可生效。 */
  MASTERCLASS_PDF_COURSES: [
    '26F-插画设计本研大师课-LCC-Leigh',
    '26F-纯艺本科大师课-UPenn-Ivanco',
    '26F-纯艺研究生大师课-CSM-Linda'
  ],

  masterclassCards(rows, p) {
    const pdfDir = (p && p.pdfDir) || '';
    return (rows || []).map(r => ({
      img: r.poster || '',
      pdf: this.MASTERCLASS_PDF_COURSES.includes(r.role_or_course) ? this.pdfPath(pdfDir, r.poster) : '',
      catTag: (r.tab === 'Autumn 26') ? '招募中' : '往期',
      eyebrow: r.program_type || '',
      title: r.role_or_course || '',
      program: [r.university, r.professor].filter(Boolean).join('｜'),
      tags: [r.type, r.location, r.level, r.outcomes].filter(Boolean),
      desc: r.suitable_for || ''
    }));
  },

  /* 海外冬夏校原始条目 → 统一课程模块卡片（字段与层级的对应关系：
     poster→图片 · tab→分类角标 · program_type→眉标 · role_or_course→标题 ·
     university + professor→院校·教授 · type + location + level→标签组 ·
     outcomes（逗号分隔的产出清单，逐项拆成标签）→标签组 ·
     suitable_for→说明）。逐字取用原始字段，仅按原有逗号/顿号分隔，不新增或改写文案。 */
  summerWinterCards(rows, p) {
    const pdfDir = (p && p.pdfDir) || '';
    return (rows || []).map(r => {
      const outcomes = String(r.outcomes || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
      return {
        img: r.poster || '',
        pdf: this.pdfPath(pdfDir, r.poster),
        catTag: ((r.role_or_course || '').includes('27冬校')) ? '招募中' : '往期',
        eyebrow: r.program_type || '',
        title: r.role_or_course || '',
        program: [r.university, r.professor].filter(Boolean).join('｜'),
        tags: [r.type, r.location, r.level].filter(Boolean).concat(outcomes),
        desc: r.suitable_for || ''
      };
    });
  },

  /* 就业力原始条目（岗位制实习 / 行业导师带训 / 商业实践项目）→ 统一课程模块卡片：
     poster→图片 · program_type→分类角标 · category→眉标（如「头部大厂」，为空则不渲染）·
     role_or_course→标题 · company→机构 / 企业 · location + duration + schedule +
     名额 + 费用→标签组 · suitable_for + enrollment_status→说明。
     同一份数据供两个模块使用，归属由条目自身的 curriculumFilter.program_type 决定。
     （enrolled_count 全部为「—」，无实际信息，故不展示。） */
  industryCards(rows, p) {
    const filter = (p && p.curriculumFilter && p.curriculumFilter.program_type) || null;
    return (rows || [])
      .filter(r => !filter || filter.includes(r.program_type))
      .map(r => ({
        img: r.poster || '',
        catTag: r.program_type || '',
        eyebrow: r.category || '',
        title: r.role_or_course || '',
        program: r.company || '',
        facets: { program_type: r.program_type || '', category: r.category || '' },
        searchText: this.rowSearchText(r, p, ['company', 'role_or_course', 'suitable_for']),
        tags: [
          r.location,
          r.duration,
          r.schedule,
          r.capacity ? '名额 ' + r.capacity : '',
          r.price_rmb
        ].filter(Boolean),
        desc: [r.suitable_for, r.enrollment_status].filter(Boolean).join('｜')
      }));
  },

  /* 境外项目原始条目 → 统一课程模块卡片（字段与层级的对应关系：
     poster→图片 · program_type→分类角标（同时是筛选标签）· type→眉标 ·
     role_or_course→标题 · university（国家）→院校 · suitable_for + level +
     location（天数）+ outcomes（日期）→标签组 · professor（城市 / 院校）→说明）。
     逐字取用原始字段，不新增或改写任何文案。 */
  overseasCards(rows, p) {
    const pdfDir = (p && p.pdfDir) || '';
    return (rows || []).map(r => ({
      img: r.poster || '',
      pdf: this.pdfPath(pdfDir, r.poster),
      catTag: r.program_type || '',
      eyebrow: r.type || '',
      title: r.role_or_course || '',
      program: r.university || '',
      facets: { program_type: r.program_type || '', category: r.category || '' },
      searchText: this.rowSearchText(r, p, ['role_or_course', 'university', 'professor']),
      tags: [r.suitable_for, r.level, r.location, r.outcomes].filter(Boolean),
      desc: r.professor || ''
    }));
  },

  /* 由条目声明的 curriculumFacets.searchFields 预拼小写检索文本（未声明时用 fallback） */
  rowSearchText(r, p, fallback) {
    const fields = (p && p.curriculumFacets && p.curriculumFacets.searchFields) || fallback;
    return fields.map(k => r[k] || '').join(' ').toLowerCase();
  },

  /* 课程 PDF 路径：<pdfDir>/<海报文件名去掉 courses_ 前缀与扩展名>.pdf
     —— 与 assets/pdf/masterclass 下已有的同名 PDF 一一对应；
     后期把真实 PDF 以同名文件覆盖上传即可直接生效，无需改代码 */
  pdfPath(pdfDir, poster) {
    if (!pdfDir || !poster) return '';
    const name = poster.split('/').pop().replace(/^courses_/, '').replace(/\.[^.]+$/, '');
    return pdfDir.replace(/\/$/, '') + '/' + name + '.pdf';
  }
};

/* ═══════════ 课程 PDF 查看器（弹窗内的单页浏览 + 左侧缩略图） ═══════════
   用本地内置的 pdf.js（assets/vendor/pdfjs，v3.11.174 legacy UMD，Apache-2.0）
   自行渲染页面：每次只显示一页，左侧缩略图边栏可快速跳转与预览。
     · 懒加载：只在真正打开 PDF 时才拉取脚本，不影响首屏；
     · 容错：pdf.js 加载失败、PDF 解析失败、或页面以 file:// 直开（fetch 受限）
       时，一律自动回退到原生 iframe 查看器，保证 PDF 仍能打开；
     · 交互：点缩略图 / ‹ › 按钮 / ← → ·PageUp·PageDown·Home·End 翻页，Esc 关闭。 */
const PdfViewer = {
  LIB: 'assets/vendor/pdfjs/pdf.min.js',
  WORKER: 'assets/vendor/pdfjs/pdf.worker.min.js',
  THUMB_W: 132,
  MAX_CANVAS_AREA: 16e6,     // Safari / iOS 的 canvas 面积上限，避免超限后被自动降采样
  /* 弹窗可用区占视口的比例，逐断点与 style.css 中 .poster-modal.is-pdf 的
     max-width / max-height 保持一致（≤640px 用窄屏档，其余用宽屏档）。
     取值尽量放大显示区：页面四周只留极窄内边距，不留多余空白，
     同时给圆角、关闭按钮与遮罩留出安全边距。 */
  RATIOS: [
    { min: 0, w: 0.96, h: 0.92 },     // ≤640px（与 CSS 窄屏断点一致）
    { min: 641, w: 0.94, h: 0.90 }    // 平板 / 桌面
  ],
  STAGE_PAD: 10,             // 画布区单侧内边距（px），CSS 与 JS 计算共用同一数值
  _lib: null,
  _libPromise: null,
  _doc: null,
  _mount: null,
  _modal: null,
  _page: 1,
  _pages: 0,
  _renderTask: null,
  _alive: 0,
  _bound: false,

  /* 懒加载并缓存 pdf.js；失败时清掉缓存以便下次重试 */
  loadLib() {
    if (this._lib) return Promise.resolve(this._lib);
    if (this._libPromise) return this._libPromise;
    this._libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = this.LIB;
      s.onload = () => {
        const lib = window.pdfjsLib;
        if (!lib) { reject(new Error('pdf.js 未就绪')); return; }
        try { lib.GlobalWorkerOptions.workerSrc = this.WORKER; } catch (e) { /* 忽略：将走假 worker */ }
        this._lib = lib;
        resolve(lib);
      };
      s.onerror = () => reject(new Error('pdf.js 加载失败'));
      document.head.appendChild(s);
    }).catch(err => { this._libPromise = null; throw err; });
    return this._libPromise;
  },

  /* file:// 下 fetch 受限，pdf.js 无法读取本地 PDF → 直接用原生查看器 */
  canRender() {
    return location.protocol !== 'file:';
  },

  open(url, modalEl) {
    const box = modalEl.querySelector('.poster-modal__pdf');
    if (!box) return;
    this.close();
    this._modal = modalEl;
    this._mount = box;
    const token = ++this._alive;
    box.classList.remove('is-loading');
    this._bind(modalEl);
    if (!this.canRender()) { this.fallback(url, modalEl); return; }
    box.classList.add('is-loading');
    this.loadLib()
      .then(lib => lib.getDocument(url).promise)
      .then(doc => {
        if (token !== this._alive) { try { doc.destroy(); } catch (e) {} return; }
        this._doc = doc;
        this._pages = doc.numPages;
        const total = box.querySelector('.pdf-view__page');
        if (total) total.innerHTML = '<b>1</b> / ' + this._pages;
        box.classList.remove('is-loading');
        this.renderThumbs(token);
        return this.go(1, token);
      })
      .catch(() => { if (token === this._alive) this.fallback(url, modalEl); });
  },

  /* 回退：用原生 iframe 查看器（浏览器自带缩略图面板） */
  fallback(url, modalEl) {
    const box = modalEl.querySelector('.poster-modal__pdf');
    const frame = modalEl.querySelector('.poster-modal__pdf-frame');
    if (box) box.classList.remove('is-loading');
    modalEl.classList.add('is-fallback');
    if (frame) frame.src = url + '#page=1&view=FitH';
  },

  /* 左侧缩略图：顺序渲染，避免一次性占满 CPU */
  renderThumbs(token) {
    const wrap = this._mount && this._mount.querySelector('.pdf-view__thumbs');
    if (!wrap) return;
    wrap.innerHTML = '';
    let chain = Promise.resolve();
    for (let n = 1; n <= this._pages; n++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pdf-thumb';
      btn.setAttribute('data-pdf-page', String(n));
      btn.setAttribute('aria-label', '第 ' + n + ' 页');
      const canvas = document.createElement('canvas');
      const num = document.createElement('span');
      num.className = 'pdf-thumb__n';
      num.textContent = String(n);
      btn.appendChild(canvas);
      btn.appendChild(num);
      wrap.appendChild(btn);
      chain = chain.then(() => this.drawThumb(n, canvas).catch(() => {}));
    }
  },

  async drawThumb(n, canvas) {
    const page = await this._doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: this.THUMB_W / base.width });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);   // 宽高交给 CSS 按内在比例缩放，避免变形
    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
    }).promise;
  },

  /* 按「当前页的真实宽高比」计算缩放比例 —— 弹窗尺寸由这一页决定，
     而不是先固定一个高度再把页面塞进去，因此不会出现上下 / 左右的多余空白。
     可用区域 = 视口 × 占比 − 缩略图边栏宽 − 翻页栏高 − 内边距；
     取宽高两个方向的较小比例，保证整页完整可见（一屏一页）。 */
  fitScale(base) {
    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;
    const side = this._mount && this._mount.querySelector('.pdf-view__side');
    const bar = this._mount && this._mount.querySelector('.pdf-view__bar');
    /* 弹窗尚未完成布局时测量为 0，按断点默认值兜底（与 CSS 的边栏宽度一致） */
    const sideW = (side && side.offsetWidth) || (vw > 900 ? 156 : vw > 640 ? 116 : 84);
    const barH = bar && bar.offsetHeight ? bar.offsetHeight : 52;   // 兜底值：CSS 中翻页栏约 52px
    const r = this.ratioFor(vw);
    const pad = this.STAGE_PAD * 2;
    const availW = Math.max(120, vw * r.w - sideW - pad);
    const availH = Math.max(120, vh * r.h - barH - pad);
    return Math.min(availW / base.width, availH / base.height);
  },

  /* 按视口宽度取对应的占屏比例档位 */
  ratioFor(vw) {
    const list = this.RATIOS || [];
    let hit = list[0] || { w: 0.94, h: 0.9 };
    for (const r of list) if (vw >= r.min) hit = r;
    return hit;
  },

  /* 跳到第 n 页（自动裁到 1..总页数）并渲染到主画布 */
  async go(n, token) {
    if (!this._doc || !this._mount) return;
    if (token === undefined) token = this._alive;
    const target = Math.max(1, Math.min(this._pages || 1, n));
    this._page = target;
    if (this._renderTask) { try { this._renderTask.cancel(); } catch (e) {} this._renderTask = null; }
    const canvas = this._mount.querySelector('.pdf-view__canvas');
    const stage = this._mount.querySelector('.pdf-view__stage');
    if (!canvas || !stage) return;
    /* 为底部固定翻页栏预留恰好足够的空间（按实测高度）：既不被栏遮挡，也不多留空白；
       单页 PDF 没有翻页栏，收回预留。 */
    const barEl = this._mount.querySelector('.pdf-view__bar');
    stage.style.paddingBottom = this._pages > 1 && barEl
      ? ((barEl.offsetHeight || 52) + this.STAGE_PAD) + 'px'
      : this.STAGE_PAD + 'px';
    const page = await this._doc.getPage(target);
    if (token !== this._alive) return;
    const base = page.getViewport({ scale: 1 });
    const scale = this.fitScale(base);          // 按本页真实宽高比定尺寸：整页完整可见且不留空白
    const vp = page.getViewport({ scale });
    /* Safari / iOS 对 canvas 面积有上限，超限会自动降采样导致模糊，
       故在保持 CSS 尺寸不变的前提下按需降低渲染倍率 */
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const area = vp.width * vp.height * dpr * dpr;
    if (area > this.MAX_CANVAS_AREA) dpr = Math.max(1, Math.sqrt(this.MAX_CANVAS_AREA / (vp.width * vp.height)));
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = Math.round(vp.width) + 'px';
    canvas.style.height = Math.round(vp.height) + 'px';
    this._renderTask = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
    });
    try { await this._renderTask.promise; } catch (e) { /* 渲染被新一页取消 */ }
    this._renderTask = null;
    if (token !== this._alive) return;
    const numEl = this._mount.querySelector('.pdf-view__page b');
    if (numEl) numEl.textContent = String(target);
    this._mount.querySelectorAll('.pdf-thumb').forEach(b => {
      const on = Number(b.getAttribute('data-pdf-page')) === target;
      b.classList.toggle('is-active', on);
      if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
    });
    /* 翻页控件状态：单页 PDF 直接隐藏整条控件栏；否则首 / 末页禁用对应方向的按钮 */
    const single = this._pages <= 1;
    const view = this._mount.querySelector('.pdf-view');
    if (view) view.classList.toggle('is-single', single);
    this._mount.querySelectorAll('[data-pdf-nav]').forEach(btn => {
      const step = Number(btn.getAttribute('data-pdf-nav'));
      btn.disabled = single || (step < 0 ? target <= 1 : target >= this._pages);
    });
  },

  _bind(modalEl) {
    if (this._bound) return;
    this._bound = true;
    const box = modalEl.querySelector('.poster-modal__pdf');
    if (box) box.addEventListener('click', e => {
      const nav = e.target.closest('[data-pdf-nav]');
      if (nav) { this.go(this._page + Number(nav.getAttribute('data-pdf-nav'))); return; }
      const th = e.target.closest('[data-pdf-page]');
      if (th) this.go(Number(th.getAttribute('data-pdf-page')));
    });
    /* 翻页快捷键：仅在 PDF 查看器真正打开时拦截，避免影响其它页面交互 */
    document.addEventListener('keydown', e => {
      if (!this._doc || !PosterModal.isOpen()) return;
      const k = e.key;
      const step = (k === 'ArrowRight' || k === 'PageDown') ? 1
        : (k === 'ArrowLeft' || k === 'PageUp') ? -1 : 0;
      if (step) { e.stopImmediatePropagation(); e.preventDefault(); this.go(this._page + step); return; }
      if (k === 'Home' || k === 'End') {
        e.stopImmediatePropagation(); e.preventDefault();
        this.go(k === 'Home' ? 1 : this._pages);
      }
    }, true);
    /* 视口尺寸变化后按新尺寸重排当前页，始终保持“一屏一页” */
    let timer;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (this._doc) this.go(this._page); }, 160);
    });
  },

  close() {
    this._alive++;
    if (this._renderTask) { try { this._renderTask.cancel(); } catch (e) {} this._renderTask = null; }
    if (this._doc) { try { this._doc.destroy(); } catch (e) {} this._doc = null; }
    this._pages = 0;
    this._page = 1;
    const box = this._mount;
    if (box) {
      box.classList.remove('is-loading');
      const wrap = box.querySelector('.pdf-view__thumbs');
      if (wrap) wrap.innerHTML = '';
      const canvas = box.querySelector('.pdf-view__canvas');
      if (canvas) {
        if (canvas.getContext) { try { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); } catch (e) {} }
        canvas.style.width = '';          // 清掉上一份 PDF 的页尺寸，避免下次打开时闪现旧大小
        canvas.style.height = '';
      }
      const view = box.querySelector('.pdf-view');
      if (view) view.classList.remove('is-single');
      box.querySelectorAll('[data-pdf-nav]').forEach(btn => { btn.disabled = true; });
      const pageEl = box.querySelector('.pdf-view__page');
      if (pageEl) pageEl.innerHTML = '<b>1</b> / —';
      this._mount = null;
    }
    if (this._modal) { this._modal.classList.remove('is-fallback'); this._modal = null; }
  }
};

/* ═══════════ 课程内容弹窗（课程模块 · CURRICULUM 点击打开） ═══════════
   交互对齐 dad_demo 的海报弹窗（ImageModal）：
     点遮罩 / 点 ✕ / Esc 关闭；遮罩淡入 + 卡片 3D 翻开（rotateY + 回弹缓动）。
   两种内容模式，均只展示内容本身（沿用卡片的圆角处理），不附加文字信息：
     · 图片模式（艺术前沿讯息讲座）：展示原始海报图；
     · PDF 模式（海外大师课程）：展示该课程的 PDF 区域 —— iframe 指向
       assets/pdf/masterclass/<课程名>.pdf，后期把真实 PDF 以同名文件覆盖
       上传即可直接生效，无需改代码。
   Esc 在捕获阶段拦截并阻断，避免关闭弹窗时误关下层的课程详情浮层。 */
const PosterModal = {
  _el: null,
  _addedLock: false,
  _lastTrigger: null,

  build() {
    if (this._el) return this._el;
    const el = document.createElement('div');
    el.className = 'poster-modal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '课程海报');
    el.innerHTML = `
      <div class="poster-modal__backdrop"></div>
      <div class="poster-modal__flipper">
        <div class="poster-modal__inner">
          <button class="poster-modal__close" type="button" aria-label="关闭">✕</button>
          <img class="poster-modal__img" src="" alt="">
          <div class="poster-modal__pdf">
            <div class="pdf-view">
              <aside class="pdf-view__side" aria-label="页面缩略图">
                <div class="pdf-view__thumbs"></div>
              </aside>
              <div class="pdf-view__main">
                <div class="pdf-view__stage"><canvas class="pdf-view__canvas"></canvas></div>
                <div class="pdf-view__bar">
                  <button class="pdf-view__nav" type="button" data-pdf-nav="-1" aria-label="上一页" title="上一页（←）">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M15 4.5 7.5 12 15 19.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <span class="pdf-view__page"><b>1</b> / —</span>
                  <button class="pdf-view__nav" type="button" data-pdf-nav="1" aria-label="下一页" title="下一页（→）">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M9 4.5 16.5 12 9 19.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <span class="pdf-view__hint">← → 翻页 · Esc 关闭</span>
                </div>
              </div>
            </div>
            <div class="pdf-view__loading">正在加载 PDF…</div>
            <iframe class="poster-modal__pdf-frame" src="" title="课程 PDF"></iframe>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('.poster-modal__backdrop').addEventListener('click', () => this.close());
    el.querySelector('.poster-modal__close').addEventListener('click', () => this.close());
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !this.isOpen()) return;
      e.stopImmediatePropagation();     // 只关海报，不再冒泡去关课程详情浮层
      e.preventDefault();
      this.close();
    }, true);
    this._el = el;
    return el;
  },

  isOpen() { return !!this._el && this._el.classList.contains('is-visible'); },

  open(cardEl) {
    if (!cardEl) return;
    const poster = cardEl.getAttribute('data-poster') || '';
    const pdf = cardEl.getAttribute('data-pdf') || '';
    if (!poster && !pdf) return;
    const el = this.build();
    this._lastTrigger = cardEl;
    const title = cardEl.getAttribute('data-poster-title') || '';
    const imgEl = el.querySelector('.poster-modal__img');
    const frame = el.querySelector('.poster-modal__pdf-frame');
    if (pdf) {                              // PDF 模式：单页浏览 + 左侧缩略图边栏
      el.classList.add('is-pdf');
      el.classList.remove('is-fallback');
      imgEl.removeAttribute('src');
      imgEl.alt = '';
      frame.removeAttribute('src');
      PdfViewer.open(pdf, el);
    } else {                                // 图片模式：只展示原始海报
      el.classList.remove('is-pdf');
      el.classList.remove('is-fallback');
      PdfViewer.close();
      frame.removeAttribute('src');
      imgEl.src = poster;
      imgEl.alt = title;                    // 仅供读屏，不显示文字
    }
    el.setAttribute('aria-label', (title ? title + ' ' : '') + (pdf ? '课程 PDF' : '课程海报'));
    el.style.display = 'flex';
    el.offsetHeight;                        // 强制回流，确保入场过渡生效
    el.classList.add('is-visible');
    if (!document.body.classList.contains('is-locked')) {   // 详情浮层已锁滚动时不重复接管
      document.body.classList.add('is-locked');
      this._addedLock = true;
    }
    el.querySelector('.poster-modal__close').focus();
  },

  close() {
    if (!this._el) return;
    const el = this._el;
    el.classList.remove('is-visible');
    PdfViewer.close();                          // 立即释放 pdf.js 文档与渲染任务
    if (this._addedLock) { document.body.classList.remove('is-locked'); this._addedLock = false; }
    setTimeout(() => {
      if (this.isOpen()) return;
      el.style.display = 'none';
      const frame = el.querySelector('.poster-modal__pdf-frame');
      if (frame) frame.removeAttribute('src');   // 释放 iframe 查看器，避免下次复用时仍加载旧文件
      el.classList.remove('is-fallback');
    }, 340);
    const trigger = this._lastTrigger;      // 关闭后焦点回到来源卡片
    this._lastTrigger = null;
    if (trigger && trigger.isConnected) trigger.focus();
  }
};

/* ═══════════ 录取成果 / OFFER 展示（主页 #offers 板块） ═══════════
   结构 / 布局 / 信息层级复用 dad_demo 首页「offer 展示」板块：
     页头 → 地区筛选标签（美国 / 英国 / 港新 / 其他）→ rough-grid 院校卡片栅格
           → 查看更多 / 收起（按整行折叠，与 dad_demo 一致）
   标题沿用「offer展示」；具体院校、offer 数量与描述均为占位，数据来自
   data/offers.json，后期由你填入真实信息。视觉全部改挂艺术人文令牌，
   栅格折叠逻辑（_gridClamp）原样移植自 dad_demo 的 HomePage。 */
const OffersSection = {
  esc(v) { return DirectionsSection.escape(v == null ? '' : String(v)); },

  build() {
    const d = DATA.cache['offers'];
    const root = document.getElementById('offers-root');
    if (!d || !root) return;

    this.rows = d.rows || 4;
    this._expanded = {};
    this._active = (d.filters && d.filters[0] && d.filters[0].id) || 'US';
    this._seasons = d.seasonFilters || [];
    this._activeSeason = this._seasons[0] || '';
    this._q = '';   // 搜索词（trim + 小写；非空即进入搜索态：跨全部国家/申请季检索）
    this._openCard = '';   // 常规态下被点击展开的院校档案卡（zh 名）

    /* 两组筛选：「申请季」在前、「国家」在后，各带小标题并以“|”划分 */
    const groupHTML = (label, btns) =>
      `<div class="filter-group"><span class="filter-group__label">${this.esc(label)}</span><span class="filter-group__sep">|</span><span class="filter-group__btns">${btns}</span></div>`;
    const seasonBtns = this._seasons.map(s =>
      `<button class="filter-btn${s === this._activeSeason ? ' is-active' : ''}" type="button" data-season="${this.esc(s)}">${this.esc(s)}</button>`).join('');
    const countryBtns = (d.filters || []).map(f =>
      `<button class="filter-btn${f.id === this._active ? ' is-active' : ''}" type="button" data-group="${this.esc(f.id)}">${this.esc(f.label)}</button>`
    ).join('');

    root.innerHTML = `
      <div class="filter-bar" id="offers-filter-bar">
        ${this._seasons.length ? groupHTML('申请季', seasonBtns) : ''}
        ${groupHTML('国家', countryBtns)}
        <div class="filter-group filter-group--search">
          <span class="filter-group__label">搜索</span>
          <span class="filter-group__sep">|</span>
          <input class="offers-search" id="offers-search" type="search" placeholder="输入院校中 / 英文名" autocomplete="off">
        </div>
      </div>
      <div class="rough-grid" id="offers-grid">${this._rowsHTML(d)}</div>
      <div id="offers-more-wrap" style="text-align:center;margin-top:24px;"></div>`;

    this._bind(root);

    /* 搜索：实时（150ms 防抖）；清空后恢复默认筛选态 */
    const input = root.querySelector('#offers-search');
    if (input) {
      let t;
      input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => this.search(input.value), 150);
      });
    }

    this._applyClamp();

    if (!this._resizeBound) {
      this._resizeBound = true;
      let t;
      window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(() => { if (!this._expanded[this._active || '_search']) this._applyClamp(); }, 150);
      });
    }
  },

  _bind(root) {
    if (this._bound) return;
    this._bound = true;
    const bar = root.querySelector('#offers-filter-bar');
    if (bar) bar.addEventListener('click', e => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      if (btn.dataset.season) this.filterSeason(btn.dataset.season, btn);
      else this.filter(btn.getAttribute('data-group'), btn);
    });
    root.addEventListener('click', e => {
      const card = e.target.closest('.offer-card--clickable');
      if (card) { this.toggleCard(card.dataset.school); return; }
      if (e.target.closest('#offers-expand-btn')) this.toggle();
    });
  },

  /* 常规态卡片点击：原地展开/折叠为院校档案卡 —— 与搜索结果完全同构
     （同一 DOM 结构与样式类、同一份 SFK_DATA 缓存数据同步渲染、无页面跳转） */
  toggleCard(zh) {
    this._openCard = this._openCard === zh ? '' : zh;
    this._rerenderGrid();
  },

  /* ── 搜索（筛选行末端）：中/英文名实时检索，跨全部国家与申请季；
        结果卡片附「国家 + 各申请季」汇总；申请季/国家筛选仍可用以收窄结果，
        搜索态下点击已选中的筛选按钮可取消（回到全部）；清空输入恢复默认筛选态 */
  search(v) {
    const q = String(v == null ? '' : v).trim().toLowerCase();
    if (q === this._q) return;
    this._q = q;
    this._syncFilterState();
    this._rerenderGrid();
  },

  /* 进入/退出搜索态时同步筛选标签选中态：
     搜索态 → 两组标签全部取消选中（= 全部国家 × 全部申请季），由用户按需点选收窄；
     非搜索态 → 恢复默认选中（首个国家 + 首个申请季） */
  _syncFilterState() {
    const bar = document.getElementById('offers-filter-bar');
    if (!bar) return;
    if (this._q) {
      this._active = '';
      this._activeSeason = '';
    } else {
      const d = DATA.cache['offers'];
      this._active = (d && d.filters && d.filters[0] && d.filters[0].id) || 'US';
      this._activeSeason = this._seasons[0] || '';
    }
    bar.querySelectorAll('[data-group]').forEach(b => b.classList.toggle('is-active', b.getAttribute('data-group') === this._active));
    bar.querySelectorAll('[data-season]').forEach(b => b.classList.toggle('is-active', b.dataset.season === this._activeSeason));
  },

  /* 当前应渲染的行：[row, groupId] 二元组。
     常规态 = 当前国家组；搜索态 = 全部组内匹配（中/英文名子串、大小写不敏感），
     按offer总数降序，再叠加国家/申请季筛选 */
  _currentRows(d) {
    const groups = (d && d.groups) || {};
    let pool = [];
    if (this._q) {
      Object.keys(groups).forEach(g => groups[g].forEach(r => {
        const hay = ((r.zh || '') + ' ' + (r.en || '')).toLowerCase();
        if (hay.includes(this._q)) pool.push([r, g]);
      }));
      pool.sort((a, b) => (parseInt(b[0].count, 10) || 0) - (parseInt(a[0].count, 10) || 0));
      if (this._active) pool = pool.filter(([, g]) => g === this._active);
    } else {
      pool = (groups[this._active] || []).map(r => [r, null]);
    }
    if (this._activeSeason) {
      pool = pool.filter(([r]) => !(r.seasons || []).length || (r.seasons || []).includes(this._activeSeason));
    }
    return pool;
  },

  _rowsHTML(d) {
    /* 申请季 × 国家（× 搜索）过滤：条目未标注 seasons 时视为全季可见（兼容旧数据）。
       seasonCounts：选中年份时展示该季 offer 数（真实统计），旧数据或未标注时回退总数。
       院校档案卡（offer-card--dossier）：搜索态全部呈现；常规态点击卡片原地展开
       （_openCard）—— 同一 DOM/样式/数据：国家名下方按年份从近到远纵向列出
       「年份 ｜ offer数量」，右侧边框区域按本科/研究生分组列出录取专业（官方中英文名） */
    const inSearch = !!this._q;
    const filters = (d && d.filters) || [];
    return this._currentRows(d).map(([r, g]) => {
      const cnt = (this._activeSeason && r.seasonCounts && r.seasonCounts[this._activeSeason]) || r.count;
      const dossier = inSearch || this._openCard === r.zh;
      if (!dossier) {
        return `
      <div class="offer-card offer-card--clickable" data-school="${this.esc(r.zh)}" title="点击展开院校详情">
        <div class="offer-card__count${r.hl ? ' offer-card__count--hl' : ''}">${this.esc(cnt)}</div>
        <div class="offer-card__school-zh">${this.esc(r.zh)}</div>
        <div class="offer-card__school-en">${this.esc(r.en)}</div>
      </div>`;
      }
      const fl = filters.find(f => f.id === (g || this._active));
      const years = (r.seasons || []).slice().sort().reverse().map(s =>
        `<div class="offer-card__year">${this.esc(s)} ｜ ${this.esc(r.seasonCounts && r.seasonCounts[s] || '—')}</div>`).join('');
      const group = (list, label) => (list && list.length) ? `
        <div class="offer-card__major-group">
          <div class="offer-card__major-h">${label}</div>
          <ul>${list.map(m => `<li><span class="offer-card__major-en">${this.esc(m[0])}</span><span class="offer-card__major-cn">${this.esc(m[1])}</span></li>`).join('')}</ul>
        </div>` : '';
      const majors = r.majors ? `
        <aside class="offer-card__majors">
          ${group(r.majors.ug, '本科 · Undergraduate')}
          ${group(r.majors.pg, '研究生 · Postgraduate')}
        </aside>` : '';
      return `
      <div class="offer-card offer-card--dossier${inSearch ? '' : ' offer-card--clickable'}" data-school="${this.esc(r.zh)}"${inSearch ? '' : ' title="点击收起"'}>
        <div class="offer-card__info">
          <div class="offer-card__count${r.hl ? ' offer-card__count--hl' : ''}">${this.esc(cnt)}</div>
          <div class="offer-card__school-zh">${this.esc(r.zh)}</div>
          <div class="offer-card__school-en">${this.esc(r.en)}</div>
          <div class="offer-card__meta">${this.esc(fl ? fl.label : '—')}</div>
          <div class="offer-card__years">${years}</div>
        </div>${majors}
      </div>`;
    }).join('');
  },

  /* 原样移植自 dad_demo HomePage._gridClamp：读取栅格自身计算列数，按整行折叠，
     避免末尾出现稀疏半行；展开时显示全部；窗口缩放实时重算。 */
  _gridClamp(gridEl, rows, open) {
    if (!gridEl) return { limit: Infinity, total: 0 };
    const tpl = getComputedStyle(gridEl).gridTemplateColumns;
    const cols = (tpl && tpl !== 'none') ? tpl.split(' ').length : 1;
    const limit = cols * rows;
    const children = Array.from(gridEl.children);
    children.forEach((card, i) => { card.style.display = (open || i < limit) ? '' : 'none'; });
    return { limit, total: children.length };
  },

  _applyClamp() {
    const grid = document.getElementById('offers-grid');
    const wrap = document.getElementById('offers-more-wrap');
    if (!grid || !wrap) return;
    const key = this._active || '_search';
    const open = !!this._expanded[key];
    const { limit, total } = this._gridClamp(grid, this.rows, open);
    wrap.innerHTML = total <= limit ? '' : (open
      ? `<button class="section-cta" id="offers-expand-btn" type="button">收起</button>`
      : `<button class="section-cta" id="offers-expand-btn" type="button">查看更多 <span class="u-en">/ ${total - limit} more</span></button>`);
  },

  /* 国家筛选：搜索态下点击已选中按钮 = 取消（回到全部国家）；常规态行为不变 */
  filter(groupId, btn) {
    const deselect = this._q && btn && btn.classList.contains('is-active');
    document.querySelectorAll('#offers-filter-bar [data-group]').forEach(b => b.classList.remove('is-active'));
    if (deselect) { this._active = ''; }
    else { if (btn) btn.classList.add('is-active'); this._active = groupId; }
    this._rerenderGrid();
  },

  /* 申请季筛选：搜索态下点击已选中按钮 = 取消（回到全部申请季）；常规态行为不变 */
  filterSeason(season, btn) {
    const deselect = this._q && btn && btn.classList.contains('is-active');
    document.querySelectorAll('#offers-filter-bar [data-season]').forEach(b => b.classList.remove('is-active'));
    if (deselect) { this._activeSeason = ''; }
    else { if (btn) btn.classList.add('is-active'); this._activeSeason = season; }
    this._rerenderGrid();
  },

  _rerenderGrid() {
    const grid = document.getElementById('offers-grid');
    const d = DATA.cache['offers'];
    if (grid && d) {
      grid.innerHTML = this._rowsHTML(d);
      grid.classList.toggle('rough-grid--search', !!this._q);
    }
    this._applyClamp();
  },

  toggle(groupId) {
    const g = groupId || this._active || '_search';
    this._expanded[g] = !this._expanded[g];
    if (g === (this._active || '_search')) this._applyClamp();
  }
};

/* ═══════════ 导师团队（主页 #instructors 板块） ═══════════
   结构 / 布局 / 信息层级复用 dad_demo 首页「导师团队」板块：
     页头 → 类别筛选标签（全部 / 海外教授 / 教研导师 / 学术导师 / 业界导师 / 顶尖学者）
           → rough-grid 导师卡片栅格 → 展开查看更多 / 收起（整行折叠）
   导师姓名、院校/机构、职称与头像均为占位，数据来自 data/instructors.json，
   后期由你填入真实信息。视觉与栅格折叠逻辑沿用站内 OFFER 展示同套实现。 */
const InstructorsSection = {
  esc(v) { return DirectionsSection.escape(v == null ? '' : String(v)); },

  build() {
    const d = DATA.cache['instructors'];
    const root = document.getElementById('instructors-root');
    if (!d || !root) return;

    this.rows = d.rows || 4;
    this._instructors = d.instructors || [];
    this._categories = d.categories || [];
    this._expanded = false;
    this._activeType = 'all';

    const cats = this._categories.map(c =>
      `<button class="filter-btn" type="button" data-itype="${this.esc(c)}">${this.esc(c)}</button>`).join('');

    root.innerHTML = `
      <div class="filter-bar" id="instructors-filter-bar">
        <button class="filter-btn is-active" type="button" data-itype="all">全部</button>
        ${cats}
      </div>
      <div class="rough-grid" id="instructors-grid">${this._cardsHTML('all')}</div>
      <div id="instructors-more-wrap" style="text-align:center;margin-top:24px;"></div>`;

    this._bind(root);
    this._applyClamp();

    if (!this._resizeBound) {
      this._resizeBound = true;
      let t;
      window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(() => { if (!this._expanded) this._applyClamp(); }, 150);
      });
    }
  },

  _bind(root) {
    if (this._bound) return;
    this._bound = true;
    const bar = root.querySelector('#instructors-filter-bar');
    if (bar) bar.addEventListener('click', e => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      this.filter(btn.getAttribute('data-itype'), btn);
    });
    root.addEventListener('click', e => {
      if (e.target.closest('#instructors-expand-btn')) this.toggle();
      const card = e.target.closest('.person-card');
      if (card && card.dataset.mid) MentorSheet.open(card.dataset.mid);
    });
  },

  _cardsHTML(typeId) {
    const list = typeId === 'all' ? this._instructors : this._instructors.filter(r => r.category === typeId);
    if (!list.length) {
      return `<div style="padding:32px 0;grid-column:1/-1;color:var(--text-dim);text-align:center;">该分类暂无导师数据 · 敬请期待</div>`;
    }
    return list.map(r => `
      <div class="person-card" data-mid="${this.esc(r.id || '')}">
        <div class="person-card__avatar">${r.img ? `<img src="${this.esc(r.img)}" alt="" loading="lazy">` : `<span class="person-card__avatar-ph">待提供</span>`}</div>
        <div class="person-card__name">${this.esc(r.name)}</div>
        ${r.background ? `<div class="person-card__background">${this.esc(r.background)}</div>` : ''}
        ${r.title ? `<div class="person-card__title">${this.esc(r.title)}</div>` : ''}
      </div>`).join('');
  },

  _gridClamp(gridEl, rows, open) {
    if (!gridEl) return { limit: Infinity, total: 0 };
    const tpl = getComputedStyle(gridEl).gridTemplateColumns;
    const cols = (tpl && tpl !== 'none') ? tpl.split(' ').length : 1;
    const limit = cols * rows;
    const children = Array.from(gridEl.children);
    children.forEach((card, i) => { card.style.display = (open || i < limit) ? '' : 'none'; });
    return { limit, total: children.length };
  },

  _applyClamp() {
    const grid = document.getElementById('instructors-grid');
    const wrap = document.getElementById('instructors-more-wrap');
    if (!grid || !wrap) return;
    const open = !!this._expanded;
    const { limit, total } = this._gridClamp(grid, this.rows, open);
    wrap.innerHTML = total <= limit ? '' : (open
      ? `<button class="section-cta" id="instructors-expand-btn" type="button">收起</button>`
      : `<button class="section-cta" id="instructors-expand-btn" type="button">展开查看更多 <span class="u-en">/ ${total - limit} more</span></button>`);
  },

  filter(typeId, btn) {
    document.querySelectorAll('#instructors-filter-bar .filter-btn').forEach(b => b.classList.remove('is-active'));
    if (btn) btn.classList.add('is-active');
    this._activeType = typeId;
    const grid = document.getElementById('instructors-grid');
    if (grid) grid.innerHTML = this._cardsHTML(typeId);
    this._applyClamp();
  },

  toggle() {
    this._expanded = !this._expanded;
    this._applyClamp();
  }
};

/* ═══════════ 导师详情页（点击导师卡片 → 居中叠加层）═══════════
   版式参照游戏动画后台「课程管理 · 实时预览」：眉标 → 元信息行 → 大标题 →
   品牌色副标题 → 编号内容区块（01 / 代表作，02 / 成就亮点……）。
   叠加层覆盖上一层级页面（暗化 + 模糊），面板居中、有明确边界（边框 + 圆角）。
   有 detail（教授海报提取内容）的导师展示完整范式；其余展示基础信息 + 占位。
   ESC / 点击遮罩 / 关闭按钮均可退出。 */
const MentorSheet = {
  esc(v) { return DirectionsSection.escape(v == null ? '' : String(v)); },

  ensure() {
    if (this.el) return this.el;
    const el = document.createElement('div');
    el.className = 'mentor-sheet';
    el.id = 'mentor-sheet';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="mentor-sheet__bg" onclick="MentorSheet.close()"></div>
      <div class="mentor-sheet__panel" role="dialog" aria-modal="true" aria-label="导师详情">
        <div class="mentor-sheet__scroll"></div>
        <button type="button" class="mentor-sheet__back" onclick="MentorSheet.close()" aria-label="关闭">×</button>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.panel = el.querySelector('.mentor-sheet__panel');
    this.scroll = el.querySelector('.mentor-sheet__scroll');
    if (!this.keybound) {
      this.keybound = true;
      document.addEventListener('keydown', e => {
        if (!this.isOpen()) return;
        if (e.key === 'Escape') this.close();
      });
    }
    return el;
  },

  isOpen() { return !!this.el && this.el.classList.contains('is-open'); },

  open(id) {
    const c = (InstructorsSection._instructors || []).find(x => x.id === id);
    if (!c) return;
    const el = this.ensure();
    this.scroll.innerHTML = this.markup(c);
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    this.scroll.scrollTop = 0;
  },

  close() {
    if (!this.isOpen()) return;
    this.el.classList.remove('is-open');
    this.el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
  },

  markup(c) {
    const d = c.detail;
    const row = (label, val) => val
      ? `<div class="mentor-sheet__kv"><dt>${label}</dt><dd>${this.esc(val)}</dd></div>` : '';
    return `
      <header class="mentor-sheet__head">
        <div class="mentor-sheet__avatar">${c.img ? `<img src="${this.esc(c.img)}" alt="${this.esc(c.name)}">` : `<span class="mentor-sheet__avatar-ph">待提供</span>`}</div>
        <div class="mentor-sheet__id">
          <span class="mentor-sheet__eyebrow u-en">MENTOR PROFILE · ${this.esc(c.category)}</span>
          <div class="mentor-sheet__meta">${this.esc(c.background)}${c.title ? `<span class="mentor-sheet__meta-sep">｜</span>${this.esc(c.title)}` : ''}</div>
          <div class="mentor-sheet__name">${this.esc(c.name)}</div>
        </div>
      </header>
      <div class="mentor-sheet__body">
        ${d ? `
        <section class="mentor-sheet__block">
          <h4 class="mentor-sheet__h4"><span class="u-en">01 /</span> 成就亮点</h4>
          ${(d.highlights || []).map(p => `<p class="mentor-sheet__p">${this.esc(p)}</p>`).join('')}
        </section>
        ${(d.repWorks || []).length ? `
        <section class="mentor-sheet__block">
          <h4 class="mentor-sheet__h4"><span class="u-en">02 /</span> 代表作</h4>
          <p class="mentor-sheet__workline">${(d.repWorks || []).map(w => this.esc(w)).join(' ｜ ')}</p>
        </section>` : ''}
        ${d.officialLink ? `
        <section class="mentor-sheet__block">
          <h4 class="mentor-sheet__h4"><span class="u-en">03 /</span> 官方链接</h4>
          <a class="mentor-sheet__link u-en" href="${this.esc(d.officialLink)}" target="_blank" rel="noopener">${this.esc(d.officialLink)}</a>
        </section>` : ''}`
        : `
        <section class="mentor-sheet__block">
          <h4 class="mentor-sheet__h4"><span class="u-en">01 /</span> 导师详情</h4>
          <p class="mentor-sheet__p mentor-sheet__ph">详情内容整理中 · 敬请期待</p>
        </section>`}
        <dl class="mentor-sheet__meta-grid">
          ${row('所属分类', c.category)}
          ${row('毕业院校', c.background)}
          ${row('专业方向', c.title)}
        </dl>
      </div>`;
  }
};

/* ═══════════ 校企资源（主页 #resources 板块） ═══════════
   结构 / 布局 / 信息层级复用 dad_demo 首页「资源网络」板块：
     页头 → 校企 logo 横向无限滚动 marquee（rAF 驱动、悬停暂停）
           → 悬停浮层展示合作内容（Intro + Collab 标签）
   公司/高校名称、logo 与简介均为占位，数据来自 data/resources.json，
   后期由你填入真实信息。marquee 逻辑精简自 dad_demo 的 Marquee（同名）：
   translate3d + 取模回绕，保证长时间运行不丢图层。 */
const ResourcesSection = {
  esc(v) { return DirectionsSection.escape(v == null ? '' : String(v)); },

  build() {
    const d = DATA.cache['resources'];
    const root = document.getElementById('resources-root');
    if (!d || !root) return;

    if (this._raf) cancelAnimationFrame(this._raf); // 避免重渲染后 rAF 堆积在已卸载节点

    const partners = d.partners || [];
    const cardHTML = p => `
      <div class="coop-card">
        <div class="coop-card__logo">${p.logo ? `<img src="${this.esc(p.logo)}" alt="" loading="lazy">` : `<span class="coop-card__logo-ph">LOGO</span>`}</div>
        <div class="coop-card__name-en">${this.esc(p.nameEn)}</div>
        <div class="coop-card__name-cn">${this.esc(p.nameCn)}</div>
      </div>`;
    const track = [...partners, ...partners].map(cardHTML).join('');

    root.innerHTML = `
      <div class="coop-marquee-section">
        <div class="coop-marquee-wrap"><div class="coop-marquee-track" id="coop-marquee-track">${track}</div></div>
      </div>`;

    const trackEl = document.getElementById('coop-marquee-track');
    this._startMarquee(trackEl, d.speedPxPerSec || 47);
    this._bindHover(trackEl, partners);
  },

  _startMarquee(trackEl, speed) {
    if (!trackEl) return;
    const wrap = trackEl.parentElement;
    let x = 0, last = null, paused = false;
    const tick = ts => {
      if (last === null) last = ts;
      const dt = Math.min((ts - last) / 1000, 0.25); last = ts;
      const w = trackEl.scrollWidth / 2;
      if (!paused && w > 0) {
        x -= speed * dt;
        x = x % w; if (x > 0) x -= w;
        trackEl.style.transform = `translate3d(${x}px,0,0)`;
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
    if (wrap) {
      wrap.addEventListener('mouseenter', () => { paused = true; });
      wrap.addEventListener('mouseleave', () => { paused = false; });
    }
  },

  _bindHover(trackEl, partners) {
    if (!trackEl) return;
    trackEl.addEventListener('mouseover', e => {
      const card = e.target.closest('.coop-card');
      if (!card || !trackEl.contains(card)) return;
      const idx = Array.from(trackEl.children).indexOf(card) % partners.length;
      this._showOverlay(card, partners[idx]);
    });
    trackEl.addEventListener('mouseout', e => {
      const card = e.target.closest('.coop-card');
      if (!card || (e.relatedTarget && card.contains(e.relatedTarget))) return;
      this._hideOverlay();
    });
    if (!this._scrollBound) {
      this._scrollBound = true;
      window.addEventListener('scroll', () => this._hideOverlay(), { passive: true });
    }
  },

  _overlayEl() {
    if (this._overlay) return this._overlay;
    const el = document.createElement('div');
    el.className = 'coop-hover-overlay';
    el.innerHTML = `<div class="coop-hover-overlay__intro"></div><div class="coop-hover-overlay__collab"></div>`;
    document.body.appendChild(el);
    this._overlay = el;
    return el;
  },

  _showOverlay(cardEl, p) {
    if (!p) return;
    const el = this._overlayEl();
    el.querySelector('.coop-hover-overlay__intro').textContent = p.intro || '';
    el.querySelector('.coop-hover-overlay__collab').innerHTML = (p.collab || [])
      .map(c => `<span class="coop-card__collab-tag">${this.esc(c)}</span>`).join('');
    const rect = cardEl.getBoundingClientRect();
    const width = 220;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    el.style.width = width + 'px';
    el.style.left = left + 'px';
    const navbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--navbar-h'), 10) || 64;
    el.classList.remove('coop-hover-overlay--below');
    el.style.top = (rect.top - 10) + 'px';
    const overlayH = el.offsetHeight;
    if (rect.top - overlayH - 10 < navbarH + 8) {
      el.classList.add('coop-hover-overlay--below');
      el.style.top = (rect.bottom + 10) + 'px';
    }
    el.classList.add('is-visible');
  },

  _hideOverlay() {
    if (this._overlay) this._overlay.classList.remove('is-visible');
  }
};

/* ═══════════ 成长时间轴（主页 #timeline 板块） ═══════════
   数据：data/timeline.json（《艺术人文科系-全链路成长发展手册》P49–56）
   结构：主标签（本科 / 研究生）→ 子层级标签 → 横向阶段时间轴。
   每个阶段卡片：时间节点（等宽字、主色，置于顶部轴线圆点上）+ 阶段名
   + 右侧阶段目标徽标 + 双泳道清单（升学线 / 就业线等，随子层级定义）。 */
const TimelineSection = {
  esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

  build() {
    const d = DATA.cache['timeline'];
    const root = document.getElementById('timeline-root');
    if (!d || !root || !d.tabs || !d.tabs.length) return;
    this.data = d;
    this.tab = d.tabs[0].id;
    this.sub = d.tabs[0].subs[0].id;
    this._bind(root);
    this.render();
  },

  _bind(root) {
    if (this._bound) return;
    this._bound = true;
    root.addEventListener('click', e => {
      const tab = e.target.closest('[data-tl-tab]');
      if (tab) {
        this.tab = tab.getAttribute('data-tl-tab');
        const t = this.data.tabs.find(x => x.id === this.tab);
        this.sub = t.subs[0].id;   // 切主标签回到该维度第一个子层级
        this.render();
        return;
      }
      const s = e.target.closest('[data-tl-sub]');
      if (s) { this.sub = s.getAttribute('data-tl-sub'); this.render(); }
    });
  },

  cur() {
    const tab = this.data.tabs.find(x => x.id === this.tab) || this.data.tabs[0];
    const sub = tab.subs.find(x => x.id === this.sub) || tab.subs[0];
    return { tab, sub };
  },

  render() {
    const root = document.getElementById('timeline-root');
    if (!root) return;
    const { tab, sub } = this.cur();

    /* 单排标签：维度标签（本科/研究生）与当前维度的子层级标签同规格、
       均匀间距排列；「研究生」与子层级组之间以 5 倍标准间距形成分组 */
    const mainTabs = this.data.tabs.map(t =>
      `<button class="tl-subtab${t.id === tab.id ? ' is-active' : ''}" type="button" data-tl-tab="${t.id}">${this.esc(t.label)}</button>`).join('');
    const subTabs = tab.subs.map((s, i) =>
      `<button class="tl-subtab${s.id === sub.id ? ' is-active' : ''}${i === 0 ? ' tl-subtab--lead' : ''}" type="button" data-tl-sub="${s.id}">${this.esc(s.label)}</button>`).join('');

    const stages = sub.stages.map((st, i) => `
      <div class="tl-col">
        <div class="tl-head">
          <span class="tl-time">${this.esc(st.time)}</span>
          <span class="tl-dot" aria-hidden="true"></span>
          <h4 class="tl-name">${this.esc(st.name)}</h4>
        </div>
        <article class="tl-stage">
          ${st.tag ? `<span class="tl-stage__tag">${this.esc(st.tag)}</span>` : ''}
          ${st.l1 ? `<div class="tl-stage__lane"><span class="tl-stage__lane-name">${this.esc(sub.laneNames[0] || '')}</span><ul>${(st.l1 || []).map(it => `<li>${this.esc(it)}</li>`).join('')}</ul></div>` : ''}
          ${st.l2 ? `<div class="tl-stage__lane"><span class="tl-stage__lane-name">${this.esc(sub.laneNames[1] || '')}</span><ul>${(st.l2 || []).map(it => `<li>${this.esc(it)}</li>`).join('')}</ul></div>` : ''}
        </article>
      </div>`).join('');

    const footers = (sub.footers || []).map(f =>
      `<div class="tl-foot"><span class="tl-foot__k">${this.esc(f.k)}</span><span class="tl-foot__v">${this.esc(f.v)}</span></div>`).join('');

    root.innerHTML = `
      <div class="tl-tabs" role="tablist">${mainTabs}${subTabs}</div>
      <p class="tl-tagline">${this.esc(sub.tagline)}</p>
      ${sub.note ? `<p class="tl-note">${this.esc(sub.note)}</p>` : ''}
      <div class="tl-rail">${stages}</div>
      ${footers ? `<div class="tl-feet">${footers}</div>` : ''}
      ${sub.quote ? `<p class="tl-quote">${this.esc(sub.quote)}</p>` : ''}
    `;
  }
};

/* ═══════════ 本科爬藤（专业 Tab） ═══════════ */
const UndergradPage = {
  init() {
    /* 地区标签：来自 data/undergrad-regions.json（美国TOP30 / 文理学院 / 英国G5 / 罗德岛RISD / 港新） */
    const tabs = (DATA.cache['undergrad-regions'] || {}).tabs || [];
    this.tabs = tabs;
    this.keys = tabs.map(t => t.id);
    this.content = document.getElementById('major-content');
    if (!this.content) return;

    /* 地区切换标签已移除：下方六板块固定按默认地区（美国TOP30）渲染；
       switch 保留供 hash 定位等场景复用，页面上不再有触发入口 */
    this.active = this.keys[0];

    this.switch = (key, opts) => {
      if (!this.keys.includes(key)) return;
      const changed = key !== this.active;
      this.active = key;
      // 只改 hash、不触发整页重渲染
      history.replaceState(null, '', `#/undergraduate/${key}`);
      Header.markActive('undergraduate', key);
      if (changed) this.render();
      if (!opts || opts.scroll !== false) this.scrollToDetail();
    };

    /* 默认全部收起：进入页面 / 切换专业都从空集合开始 */
    this.openIds = new Set();

    /* 折叠交互用事件委托：内容每次 render 都会整块重绘，不能绑在具体节点上 */
    this.content.addEventListener('click', e => {
      /* 课程产品卡：直接复用目录页「课程产品」的详情浮层（CourseProducts.open） */
      const cp = e.target.closest('.cp-card');
      if (cp) {
        CourseProducts.open(cp.getAttribute('data-cp-id'),
          cp.classList.contains('cp-card--catalog') ? 'catalog' : 'longform');
        return;
      }
      const head = e.target.closest('.plate__head');
      if (!head) return;
      const plate = head.closest('.plate');
      const id = plate.dataset.id;
      // 各板块互不干涉：只切换被点击的这一个（已展开 → 收起，已收起 → 展开）
      this.openIds.has(id) ? this.openIds.delete(id) : this.openIds.add(id);
      // 仅就地切换开合：applyOpen 只改 maxHeight / 类名，不重绘内容、不切换内容区；
      // 按要求不做任何滚动补偿——页面滚动位置、视图状态与布局保持原样
      this.applyOpen();
    });
    /* 视口变化会让正文换行、面板变高 → 重算已展开项的高度 */
    window.addEventListener('resize', () => this.applyOpen());

    this.renderPathwayCards();   // 五大院校方向模块卡（静态横向栅格）
    this.render();   // 首次渲染只填充内容，不滚动（进页定位交给 Router）
  },

  /* 展开态落位：按 openIds 逐块独立判定（点谁动谁，其余保持原状），
     面板高度按 scrollHeight 精确给出，避免写死上限把长内容截掉。 */
  applyOpen() {
    this.content.querySelectorAll('.plate').forEach(el => {
      const on = this.openIds.has(el.dataset.id);
      const panel = el.querySelector('.plate__panel');
      el.classList.toggle('is-open', on);
      el.querySelector('.plate__head').setAttribute('aria-expanded', on ? 'true' : 'false');
      // 视图处于 display:none 时 scrollHeight 为 0 → 先给 none，待可见时由 resize / 切换重算
      panel.style.maxHeight = on ? (panel.scrollHeight ? panel.scrollHeight + 'px' : 'none') : '0px';
    });
  },

  /* 平滑滚到「培养路径 · 五大院校方向」标题处，让它完整落在固定导航条
     下方，作为内容阅读的起始位置。
     用 window.scrollTo 而非 scrollIntoView：后者会叠加 html 上的 scroll-padding-top。 */
  scrollToDetail() {
    const el = document.getElementById('ug-pathways');
    if (!el) return;
    requestAnimationFrame(() => {
      const navH = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--navbar-h')) || 64;
      const offset = navH + 12;
      const top = Math.max(el.getBoundingClientRect().top + window.scrollY - offset, 0);
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
      el.classList.remove('is-switching');
      void el.offsetWidth;                 // 强制重排，使淡入动画可重复播放
      el.classList.add('is-switching');
    });
  },

  /* ── 六个下属板块的固定骨架：编号 / 标题 / 英文小标 ──
     内容按当前地区标签动态装配：专业解读与成长时间轴暂为占位文案；
     海外教授 / OFFER成果 / 学生案例 / 课程产品 从目录页对应模块按区域抓取：
       · 海外教授  ← instructors.json（category=海外教授 且 regions 含当前标签）
       · OFFER成果 ← offers.json（tags 含当前标签的录取院校）
       · 学生案例  ← cases.json（案例院校 / offer 院校命中 caseSchoolKeys 任一关键词）
       · 课程产品  ← course-products.json（regions 含当前标签，真实数据就位后生效） */
  PLATES: [
    { num: '01', id: 'interpret',  title: '专业解读',   titleEn: 'MAJOR INSIGHT' },
    { num: '02', id: 'professors', title: '海外教授',   titleEn: 'FACULTY' },
    { num: '03', id: 'offers',     title: 'OFFER成果',  titleEn: 'OFFER SHOWCASE' },
    { num: '04', id: 'cases',      title: '学生案例',   titleEn: 'STUDENT CASES' },
    { num: '05', id: 'courses',    title: '课程产品',   titleEn: 'COURSE PROGRAMS' },
    { num: '06', id: 'timeline',   title: '成长时间轴', titleEn: 'TIMELINE' }
  ],

  esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  /* ── 五大院校方向 · 培养路径模块卡（静态横向栅格，不滑动）──────────
     卡片形态沿用「八大就业方向一览」的 .direction-card（编号 + 箭头 → 院校体系
     小标 → 标题 → 院校类型副标），区别是这里为 5 张卡片静态排开的等分栅格，
     不参与 .directions__rail 的无缝滚动。标题为方向名（美国TOP30 / 文理学院 /
     英国G5 / 罗德岛RISD / 港新），副标题取源码 motto；完整培养路径文案
     （title/titleEm/intro 等）保留在数据中，供点击后的详情页使用。 */
  renderPathwayCards() {
    const box = document.getElementById('ug-pathway-cards');
    if (!box) return;
    const esc = this.esc;
    const arrow = `<svg class="direction-card__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>`;

    box.innerHTML = this.tabs.filter(t => t.pathway).map(t => {
      const w = t.pathway;
      return `<article class="direction-card ug-pathway-card" data-pathway-key="${esc(t.id)}"
          style="--direction-color: ${esc(t.color)}" role="button" tabindex="0"
          aria-label="查看${esc(t.title)}培养路径详情">
        <div class="direction-card__top">
          <span class="direction-card__num">${esc(w.num)}</span>${arrow}
        </div>
        <div class="ug-pathway-card__label u-en">${esc(w.label)}</div>
        <h3 class="direction-card__title">${esc(t.title)}</h3>
        <div class="ug-pathway-card__motto">${esc(w.motto)}</div>
      </article>`;
    }).join('');

    /* 卡片点击 / 回车 → 打开详情页（与「长线旗舰产品」模块详情同一套浮层与
       cd-* 层级）；事件委托一次，后续重渲染仍有效 */
    if (this._pathwayBound) return;
    this._pathwayBound = true;
    box.addEventListener('click', e => {
      const card = e.target.closest('.ug-pathway-card');
      if (card) this.openPathway(card.getAttribute('data-pathway-key'));
    });
    box.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.ug-pathway-card');
      if (!card) return;
      e.preventDefault();
      this.openPathway(card.getAttribute('data-pathway-key'));
    });
  },

  openPathway(key) {
    const tab = (this.tabs || []).filter(t => t.id === key)[0];
    if (!tab || !tab.pathway) return;
    /* 详情页复用课程详情浮层 #course-overlay：其关闭按钮 / 点背景 / ESC 均由
       CourseProducts.bind 绑定，而本页（PAGES.undergraduate）不跑 CourseProducts.build。
       直接以 #/undergraduate 进入时那套监听尚未建立 → 这里幂等补一次绑定，
       保证详情浮层在任何入口都能正常关闭（bind 内部有 _bound 幂等保护）。 */
    if (CourseProducts && !CourseProducts._bound) CourseProducts.bind();
    const ov = document.getElementById('course-overlay');
    const body = document.getElementById('course-overlay-body');
    if (!ov || !body) return;
    body.innerHTML = this.regionDetail(tab);
    body.classList.add('is-wide');
    ov.classList.add('is-open');
    document.body.classList.add('is-locked');
    const panel = ov.querySelector('.course-overlay__panel');
    if (panel) panel.scrollTop = 0;
    body.scrollTop = 0;
    const btn = ov.querySelector('.course-overlay__close');
    if (btn) btn.focus();
  },

  /* 详情页：结构 / 信息层级 / section 样式沿用 dad_demo「课程产品 · 长线旗舰产品」
     详情页（cd-hero → 若干 cd-section → cd-cta；分区标签沿用 dad_demo 的
     「中文 + <span class="u-en">英文</span>」写法），并把五个模块集成进来——
     内容与卡片组件全部复用站内既有实现，不另造一套：
       方向定位 POSITIONING ← 原「专业解读」改名；内容取源码「02 培养路径」
                              点击各方向后展示页左侧的标题与副标题
       海外教授 FACULTY     ← 导师团队「海外教授」person-card（按地区过滤）
       OFFER成果 OFFERS     ← OFFER 成果页 offer-card（该地区录取院校）
       学生案例 CASES       ← 学生案例页 case-card（该地区录取院校，点击开 CaseSheet）
       课程产品 COURSES     ← 课程产品「海外冬夏校课程」中该地区院校的课程卡 */
  regionDetail(tab) {
    const esc = this.esc, w = tab.pathway;
    /* 与 dad_demo 的 sec() 同构 */
    const sec = (cn, en, inner) =>
      `<section class="cd-section"><div class="cd-section__label">${esc(cn)} <span class="u-en">${esc(en)}</span></div>${inner}</section>`;
    const empty = `<p class="plate__empty">该分类内容筹备中 · 敬请期待</p>`;
    /* 海外教授 / OFFER成果 / 学生案例：直接复用六个板块里同名的卡片渲染 */
    const plate = id => this.plateBodyHTML(tab, { id }) || empty;

    /* 方向定位：源码面板左侧的标题（次行强调）与副标题（院校类型） */
    const positioning = `
      <div class="cd-pos">
        <p class="cd-pos__statement">${esc(w.title)}<em>${esc(w.titleEm)}</em></p>
        <p class="cd-pos__sub">${esc(w.motto)}</p>
      </div>`;

    return `
      <div class="cd-hero">
        <div class="cd-hero__content">
          <div class="cd-hero__eyebrow">${esc(w.label)}｜${esc(w.motto)}</div>
          <h2 class="cd-hero__title">${esc(tab.title)}</h2>
          <div class="cd-hero__subtitle">${esc(tab.titleEn)}</div>
          <p class="cd-hero__desc">${esc(w.intro)}</p>
          <div class="cd-chips">${[w.motto, tab.title].map(c => `<span class="cd-chip">${esc(c)}</span>`).join('')}</div>
        </div>
        <div class="cd-hero__tile" aria-hidden="true"></div>
      </div>
      ${sec('方向定位', 'Positioning', positioning)}
      ${sec('海外教授', 'Faculty', plate('professors'))}
      ${sec('OFFER成果', 'Offers', plate('offers'))}
      ${sec('学生案例', 'Cases', plate('cases'))}
      ${sec('课程产品', 'Courses', this.pathwayCoursesHTML(tab))}
      <div class="cd-cta">
        <p class="cd-cta__statement">${esc(w.title)}${esc(w.titleEm)}</p>
        <p class="cd-cta__statement-en">${esc(w.label)}</p>
      </div>`;
  },

  /* 课程产品模块：取「课程产品 → 海外冬夏校课程 · 顶尖院校在地学习」中
     院校归属于当前方向的课程（院校名 / 课程名命中该地区院校关键词），
     卡片复用课程模块统一的 cd-curriculum-card（点击看课程 PDF 或海报大图）。 */
  pathwayCoursesHTML(tab) {
    const empty = `<p class="plate__empty">该分类内容筹备中 · 敬请期待</p>`;
    const rows = DATA.cache['summer-winter-courses'] || [];
    const keys = tab.caseSchoolKeys || [];
    const list = rows.filter(r => {
      const hay = `${r.university || ''} ${r.role_or_course || ''}`;
      return keys.some(k => hay.includes(k));
    });
    if (!list.length) return empty;
    /* 归一化与详情页同一条路径：走 CourseProducts 的 summerWinterCards（含 PDF 映射） */
    const entry = ((DATA.cache['course-products'] || {}).catalog || [])
      .filter(x => x.id === 'summerwinter')[0] || {};
    const cards = CourseProducts.summerWinterCards(list, entry);
    return `<div class="cd-curriculum-grid">${cards.map(c => CourseProducts.curriculumCard(c)).join('')}</div>`;
  },

  /* 海外教授：按「院校归属」筛选——instructors.json 的 regions 字段暂为空，
     以 background（院校名，如「哈佛大学」）命中该地区院校关键词为准，
     与「学生案例」按录取院校归属的口径保持一致 */
  professorsOf(tab) {
    const keys = tab.caseSchoolKeys || [];
    if (!keys.length) return [];
    return ((DATA.cache.instructors || {}).instructors || [])
      .filter(r => r.category === '海外教授')
      .filter(r => keys.some(k => `${r.background || ''}`.includes(k)));
  },

  offersOf(tab) {
    const groups = (DATA.cache.offers || {}).groups || {};
    const out = [];
    Object.keys(groups).forEach(g => groups[g].forEach(e => {
      if ((e.tags || []).includes(tab.id)) out.push(e);
    }));
    return out;
  },

  /* 目录页学生案例全集：与 CasesPage.build 同序同构（插画 → 纯艺术 → 插画/纯艺术），
     保证案例卡点击 CaseSheet.open(全局下标) 在本页也能打开同一份详情档案 */
  allCases() {
    if (CasesPage.all && CasesPage.all.length) return CasesPage.all;
    const c = DATA.cache.cases || {};
    /* cases.json 的案例全集在 portfolio 数组（与 CasesPage.build 同源同序），
       索引一致才能保证 CaseSheet.open(全局下标) 打开同一份档案 */
    CasesPage.all = (c.portfolio || []).map(x => ({ ...x }));
    return CasesPage.all;
  },

  /* 学生案例：按「录取院校」归属地区——命中该地区院校关键词
     （admitted / admittedEn / 其它录取院校 / 国家地区）即归入 */
  casesOf(tab) {
    const keys = tab.caseSchoolKeys || [];
    if (!keys.length) return [];
    return this.allCases()
      .map((x, idx) => ({ ...x, __idx: idx }))
      .filter(x => {
        const others = Array.isArray(x.otherAdmitted)
          ? x.otherAdmitted
          : (x.otherAdmitted ? [String(x.otherAdmitted)] : []);
        const hay = [x.admitted, x.admittedEn, x.admittedCountry, x.region]
          .concat(others).join(' | ');
        return keys.some(k => hay.includes(k));
      });
  },

  /* 课程产品板块：取目录页「课程目录」课程（按标签 regions 过滤），
     展开后直接呈现课程详情浮层中的「课程模块 · CURRICULUM」内容 */
  coursesOf(tab) {
    const d = DATA.cache['course-products'] || {};
    return (d.catalog || []).filter(p => (p.regions || []).includes(tab.id));
  },

  /* 板块展开后的正文：直接复用目录页对应子标题的页面结构、层级与样式 ——
     海外教授 → 「导师团队」person-card 栅格（rough-grid）
     OFFER成果 → 「OFFER成果」offer-card 栅格（rough-grid）
     学生案例 → 「学生案例」case-card 栅格（case-grid，点击开 CaseSheet 详情）
     课程产品 → 「课程产品」cp-card 列表（cp-grid，点击开 CourseProducts 详情） */
  plateBodyHTML(tab, plate) {
    const empty = `<p class="plate__empty">该分类内容筹备中 · 敬请期待</p>`;
    if (plate.id === 'interpret' || plate.id === 'timeline') {
      const points = tab[plate.id] || [];
      return points.length
        ? `<div class="plate__body"><ul>${points.map(pt => `<li>${this.esc(pt)}</li>`).join('')}</ul></div>`
        : empty;
    }
    if (plate.id === 'professors') {
      const list = this.professorsOf(tab);
      if (!list.length) return empty;
      return `<div class="rough-grid">${list.map(r => `
        <div class="person-card">
          <div class="person-card__avatar">${r.img ? `<img src="${this.esc(r.img)}" alt="" loading="lazy">` : `<span class="person-card__avatar-ph">待提供</span>`}</div>
          <div class="person-card__name">${this.esc(r.name)}</div>
          ${r.background ? `<div class="person-card__background">${this.esc(r.background)}</div>` : ''}
          ${r.title ? `<div class="person-card__title">${this.esc(r.title)}</div>` : ''}
        </div>`).join('')}</div>`;
    }
    if (plate.id === 'offers') {
      const list = this.offersOf(tab);
      if (!list.length) return empty;
      return `<div class="rough-grid">${list.map(r => `
        <div class="offer-card">
          <div class="offer-card__count${r.hl ? ' offer-card__count--hl' : ''}">${this.esc(r.count)}</div>
          <div class="offer-card__school-zh">${this.esc(r.zh)}</div>
          <div class="offer-card__school-en">${this.esc(r.en)}</div>
        </div>`).join('')}</div>`;
    }
    if (plate.id === 'cases') {
      /* 与学生案例页（CasesPage）同款卡片：首图 + 科系 · 城市 → 录取院校（中 / 英）
         → 录取专业 → 标签；点击开 CaseSheet 档案（与首页共用同一份索引） */
      const list = this.casesOf(tab);
      if (!list.length) return empty;
      return `<div class="case-grid">${list.map(c => `
        <article class="case-card" role="button" tabindex="0"
                 onclick="CaseSheet.open(${c.__idx})"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();CaseSheet.open(${c.__idx})}">
          <div class="case-card__hero">${c.hero
            ? `<img src="${this.esc(c.hero)}" alt="${this.esc(c.admitted)} 首图">`
            : `<span class="case-card__hero-ph">首图 · 待置入</span>`}
            <div class="case-card__top">
              <span class="case-card__branch">${this.esc(c.schoolType)} · ${this.esc(c.branch)}</span>
              <span class="case-card__student"><span class="case-card__city">${this.esc(c.idCity)}</span></span>
            </div>
          </div>
          <div class="case-card__school">${this.esc(c.admitted)}</div>
          <div class="case-card__school-en u-en">${this.esc(c.admittedEn || '')}</div>
          <div class="case-card__program"><span class="u-en">${this.esc(c.admittedMajor)}</span></div>
          <div class="case-card__tags">${(c.tags || []).map(t => `<span class="case-card__tag">${this.esc(t)}</span>`).join('')}</div>
        </article>`).join('')}</div>`;
    }
    if (plate.id === 'courses') {
      /* 直接复用目录页点击课程卡后的详情浮层中「课程模块 · CURRICULUM」一节：
         cd-section + cd-curriculum-grid / cd-curriculum-card，结构与样式与
         CourseProducts.detail 完全一致；不展示「长线旗舰产品」「课程目录」分区 */
      const modules = this.coursesOf(tab).reduce((acc, p) => acc.concat(p.curriculum || []), []);
      if (!modules.length) return empty;
      return `<section class="cd-section"><div class="cd-section__label">课程模块 · CURRICULUM</div><div class="cd-curriculum-grid">${modules.map(c => CourseProducts.curriculumCard(c)).join('')}</div></section>`;
    }
    return empty;
  },

  render() {
    const tab = this.tabs.find(t => t.id === this.active) || this.tabs[0];

    /* 地区切换标签与大标题已移除：本 section 由「培养路径 · 五大院校方向」
       标题 + 五个方向模块卡承担导航，六板块固定按默认地区渲染 */

    this.content.innerHTML = this.PLATES.map(p => `
      <article class="plate" id="${p.id}" data-id="${p.id}">
        <button type="button" class="plate__head" aria-expanded="false" aria-controls="panel-${p.id}">
          <span class="plate__num">${p.num}</span>
          <span class="plate__headings">
            <span class="plate__title">${p.title}</span>
            <span class="plate__title-en u-en">${p.titleEn}</span>
          </span>
          <span class="plate__ind" aria-hidden="true">
            <span class="plate__square"></span>
            <span class="plate__caret"></span>
          </span>
        </button>
        <div class="plate__panel" id="panel-${p.id}">
          <span class="plate__sweep"></span>
          <div class="plate__panel-inner">${this.plateBodyHTML(tab, p)}</div>
        </div>
      </article>
    `).join('');

    /* 悬停 / 点击切换标签时保留各板块的开合状态：已展开的板块保持展开，
       便于跨标签对比同一板块的内容（起始态全部收起由 init 的空集合保证）。 */
    this.applyOpen();
  }
};

/* ═══════════ 案例展示（三级筛选：专业方向 / 申请地区 / 就业导向）═══════════
   筛选项来自 data/cases.json 的 filters；其中「就业导向」声明 source:"careers"，
   子类直接取 data/careers.json 的十大核心岗位（单一数据源，不手抄一份）。
   展开 / 收起沿用「左上角绿色方框 → 全屏浮层」那套（触发器 + 面板 + 绿色消隐线）：
   点类目头 → 展开该类的子类面板；再点、或点类目之外、或按 ESC → 收起。
   同一时刻只展开一类，收起后已选条件仍生效，并在类目头上以徽标显示当前值。
   某条案例在某个维度上取不到值、或取值不在 options 里 → 「暂未匹配」，不强行归类。 */
const CasesPage = {
  UNMATCHED: '__unmatched__',

  /* 各类的当前选中值；缺省 'all' = 不限 */
  state: {},
  _q: '',               // 搜索词（命中国家 / 院校 / 专业的中英文名称，实时过滤）
  bound: false,

  build() {
    const data = DATA.cache.cases;
    const grid = document.getElementById('cases-grid');
    const filterWrap = document.getElementById('cases-filters');
    const result = document.getElementById('cases-result');
    if (!data || !grid || !filterWrap || !result) return;

    this.grid = grid;
    this.result = result;
    this.wrap = filterWrap;
    this.filters = (Array.isArray(data.filters) ? data.filters : [])
      .map(f => ({ ...f, options: this.resolveOptions(f) }));
    this.filters.forEach(f => { if (this.state[f.id] === undefined) this.state[f.id] = []; });

    /* 申请维度：选项与默认值均来自 JSON「申请维度」配置（申请学位字段动态生成） */
    this.dimensionCfg = data.dimension || null;
    const dimOpts = (this.dimensionCfg && this.dimensionCfg.options) || [];
    this.dimension = (dimOpts[0] && dimOpts[0].value) || '';

    /* 案例数据：Portfolio JSON（全量 45 条记录） */
    this.all = (data.portfolio || []).map(c => ({ ...c }));

    /* 默认维度自适应：当前维度下无案例时，自动切到有数据的维度 */
    if (this.all.length && !this.all.some(c => this.dimMatch(c, this.dimension))) {
      const alt = dimOpts.find(o => this.all.some(c => this.dimMatch(c, o.value)));
      if (alt) this.dimension = alt.value;
    }

    /* 折叠 / 展开：与「导师团队」板块同款 section-cta 折叠标签 + 网格行数钳制 */
    this._expanded = false;
    this.rows = data.rows || 4;
    let moreWrap = document.getElementById('cases-more-wrap');
    if (!moreWrap) {
      moreWrap = document.createElement('div');
      moreWrap.id = 'cases-more-wrap';
      moreWrap.style.cssText = 'text-align:center;margin-top:24px;';
      grid.after(moreWrap);
    }
    if (!this._moreBound) {
      this._moreBound = true;
      moreWrap.addEventListener('click', e => {
        if (e.target.closest('#cases-expand-btn')) this.toggle();
      });
    }

    this.renderFilters();
    this.renderGrid();
  },

  /* 子类来源：filters 里写了 source 就去对应数据里取，否则用内联 options */
  resolveOptions(f) {
    if (f.source === 'careers') {
      const careers = (DATA.cache.careers && DATA.cache.careers.careers) || [];
      return careers.map(c => ({ value: c.id, label: c.name, idx: c.num, en: c.nameEn }));
    }
    return f.options || [];
  },

  /* 记录在某筛选值上是否命中：
     - 数组字段（案例标签 tags）：任一元素命中即可；
     - 标量复合字段（申请国家等）：按「/」拆分为多国集合，字段中存在任一匹配项
       （如「美国/英国」在选中「英国」或「美国」时均命中）即判定符合；
     - 字段为空 / 所有值均不在选项内 → 仅命中「暂未匹配」 */
  hit(c, f, value) {
    const v = c[f.id];
    if (Array.isArray(v)) {
      if (value === this.UNMATCHED) return !v.length;
      return v.includes(value);
    }
    const parts = String(v || '').split('/').map(x => x.trim()).filter(Boolean);
    if (value === this.UNMATCHED) {
      return !parts.length || !parts.some(p => f.options.some(o => o.value === p));
    }
    return parts.includes(value);
  },

  /* 「申请国家」激活时的排序键（小者靠前）：
     层级 ×100：0 = 录取院校所在国家命中已选国家，1 = 其余；
     层级内按「申请国家」字段中已选国家的最早出现位次（字段顺序），无位次者最前 */
  regionSortKey(c, sel) {
    const selSet = new Set(sel);
    const parts = String(c.region || '').split('/').map(x => x.trim()).filter(Boolean);
    let rank = Infinity;
    parts.forEach((p, i) => { if (selSet.has(p) && i < rank) rank = i; });
    if (rank === Infinity) rank = -1;
    return (selSet.has(c.admittedCountry) ? 0 : 1) * 100 + rank;
  },

  /* 除 group 之外其它维度是否都通过（多选语义：空 = 不限，否则命中任一已选项） */
  passOthers(c, exceptId) {
    if (!this.dimOk(c)) return false;
    return this.filters.every(f => {
      if (f.id === exceptId) return true;
      const sel = this.state[f.id] || [];
      return !sel.length || sel.some(v => this.hit(c, f, v));
    });
  },

  /* 子类按钮上的条数：在其它维度已选条件下、选它能剩多少条 */
  countOf(f, value) {
    return this.all.filter(c => this.passOthers(c, f.id) &&
      (value === 'all' || this.hit(c, f, value))).length;
  },

  optionsOf(f) {
    const opts = [{ value: 'all', label: f.all || '全部' }, ...f.options];
    // 「暂未匹配」只在确实存在匹配不上的案例时才出现，避免出现永远为 0 的死按钮
    if (this.all.some(c => this.hit(c, f, this.UNMATCHED))) {
      opts.push({ value: this.UNMATCHED, label: '暂未匹配' });
    }
    return opts;
  },

  /* 类目头上的当前值文案 */
  labelOf(f, value) {
    if (value === 'all') return f.all || '全部';
    if (value === this.UNMATCHED) return '暂未匹配';
    const o = f.options.find(x => x.value === value);
    return o ? o.label : '暂未匹配';
  },

  /* 申请维度匹配：degree（申请学位）与选项值直接相等判断 */
  dimMatch(c, level) {
    return (c.degree || '') === level;
  },
  dimOk(c) { return this.dimMatch(c, this.dimension); },

  /* ── 筛选区（参照 OFFER成果 的 filter-bar 布局）──
     第一行：申请维度（左对齐下方案例边框左侧）；
     第二行：专业方向（多选）+ 行末搜索栏（命中国家/院校/专业中英文名，标签主色）。
     「申请国家」字段按需求不再读取，对应筛选组已移除 */
  renderFilters() {
    const wrap = this.wrap;
    if (!wrap) return;
    const cfg = this.dimensionCfg || { label: '申请维度', labelEn: 'DIMENSION', options: [] };

    const group = (label, btns) => this._group(label, btns);
    const btn = (attrs, label, active, util) => this._btn(attrs, label, active, util);

    /* 第一行：申请维度（单选）+ 国家（多选，紧挨维度组右侧） */
    const dimBtns = cfg.options.map(o => btn(
      `type="button" data-dimension="${o.value}" onclick="CasesPage.pickDimension('${o.value}')"`,
      o.label, this.dimension === o.value
    )).join('');
    const row1Filters = this.filters.filter(f => f.row === 1);
    const row1 = `
      <div class="filter-bar">
        ${group(cfg.label, dimBtns)}
        ${row1Filters.map(f => group(f.label, this.multiBtns(f))).join('')}
      </div>`;

    /* 第二行：专业方向（多选，与上方「申请维度」左对齐）+ 行末搜索栏 */
    const row2Filters = this.filters.filter(f => f.row === 2);
    const row2 = `
      <div class="filter-bar">
        ${row2Filters.map(f => group(f.label, this.multiBtns(f))).join('')}
        <div class="filter-group filter-group--search">
          <span class="filter-group__label">搜索</span>
          <span class="filter-group__sep">|</span>
          <input class="offers-search" id="cases-search" type="search" placeholder="国家 / 院校 / 专业（中英文）" autocomplete="off">
        </div>
      </div>`;

    wrap.innerHTML = row1 + row2;

    /* 重渲染后恢复搜索词与焦点（选项计数变化会触发整块重绘） */
    const input = wrap.querySelector('#cases-search');
    if (input) {
      input.value = this._q;
      if (this._searchFocused) input.focus();
      let t;
      input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => this.search(input.value), 150);
      });
      input.addEventListener('focus', () => { this._searchFocused = true; });
      input.addEventListener('blur', () => { this._searchFocused = false; });
    }
  },

  /* 组容器 / 按钮模板 */
  _group(label, btns) {
    return `<div class="filter-group"><span class="filter-group__label">${label}</span><span class="filter-group__sep">|</span><span class="filter-group__btns">${btns}</span></div>`;
  },
  _btn(attrs, label, active, util) {
    return `<button type="button" class="filter-btn${active ? ' is-active' : ''}${util ? ' filter-btn--util' : ''}" ${attrs} aria-pressed="${active}">${label}</button>`;
  },

  /* 多选组按钮：仅各选项（点击切换选中/取消；默认无选中 = 无筛选）。
     「全选 / 清空」按钮已移除 —— 清空由点选取消或结果行的「重置筛选」承担 */
  multiBtns(f) {
    const sel = this.state[f.id] || [];
    const opts = this.optionsOf(f).filter(o => o.value !== 'all');
    return opts.map(o => this._btn(
      `type="button" data-group="${f.id}" data-value="${o.value}" onclick="CasesPage.toggleOption('${f.id}', '${o.value}')"`,
      o.label, sel.includes(o.value)
    )).join('');
  },

  /* 搜索：命中国家 / 院校 / 专业的中英文名称（含各 offer 备选院校），与其它筛选叠加 */
  search(v) {
    this._q = String(v == null ? '' : v).trim().toLowerCase();
    this.renderGrid();
  },

  _qMatch(c) {
    if (!this._q) return true;
    const hay = [c.admitted, c.admittedMajor, c.schoolType, c.branch, c.id,
      (c.tags || []).join(' '), (c.otherAdmitted || []).join(' ')].join(' ').toLowerCase();
    return hay.includes(this._q);
  },

  /* 选择申请维度：切换第二行筛选组组合 */
  pickDimension(value) {
    this.dimension = value;
    this.renderFilters();
    this.renderGrid();
  },

  /* 多选：点选 / 取消某个选项（同一条件内「或」） */
  toggleOption(group, value) {
    const sel = this.state[group] || (this.state[group] = []);
    const i = sel.indexOf(value);
    i >= 0 ? sel.splice(i, 1) : sel.push(value);
    this.renderFilters();
    this.renderGrid();
  },

  reset() {
    this.filters.forEach(f => { this.state[f.id] = []; });
    this._q = '';
    this.renderFilters();
    this.renderGrid();
  },

  renderGrid() {
    /* 多值匹配：同一条件内命中任一已选项即通过（「或」）；
       已选为空 = 默认无筛选；多个条件之间按「与」组合 */
    const list = this.all.filter(c => this.dimOk(c) && this._qMatch(c) && this.filters.every(f => {
      const sel = this.state[f.id] || [];
      return !sel.length || sel.some(v => this.hit(c, f, v));
    }));

    /* 「申请国家」筛选激活时的排序：
       第一层级 = 录取院校所在国家与已选国家一致的结果优先；
       其后（含同层级内）按「申请国家」字段中已选国家出现的先后顺序排序 */
    const regionSel = this.state.region || [];
    if (regionSel.length) list.sort((a, b) => this.regionSortKey(a, regionSel) - this.regionSortKey(b, regionSel));

    const dirty = this.filters.some(f => (this.state[f.id] || []).length > 0) || !!this._q;
    /* 「重置筛选」按钮常驻 DOM（未激活时 visibility:hidden 占位隐藏）：
       出现/消失不改变结果行高度，避免下方案例网格与页面滚动位置跳动 */
    this.result.innerHTML = `共 <span class="u-en">${list.length}</span> 个案例 · 全部 <span class="u-en">${this.all.length}</span> 个`
      + `<button type="button" class="case-reset${dirty ? '' : ' is-off'}" onclick="CasesPage.reset()">重置筛选</button>`;

    this.grid.innerHTML = list.length
      ? list.map(c => {
        const idx = this.all.indexOf(c);
        /* 左上：院校类型 · 学术分支（绑定 branch 字段，与「专业方向」筛选同源）；
           右上：ID 倒数第一段 + 倒数第二段大写首字母 + 「同学」 */
        return `
        <article class="case-card" role="button" tabindex="0"
                 onclick="CaseSheet.open(${idx})"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();CaseSheet.open(${idx})}">
          <div class="case-card__hero">${c.hero
            ? `<img src="${c.hero}" alt="${c.admitted} 首图">`
            : `<span class="case-card__hero-ph">首图 · 待置入</span>`}
            <div class="case-card__top">
              <span class="case-card__branch">${c.schoolType} · ${c.branch}</span>
              <span class="case-card__student"><span class="case-card__city">${c.idCity}</span></span>
            </div>
          </div>
          <div class="case-card__school">${c.admitted}</div>
          <div class="case-card__school-en u-en">${c.admittedEn || ''}</div>
          <div class="case-card__program"><span class="u-en">${c.admittedMajor}</span></div>
          <div class="case-card__tags">${(c.tags || []).map(t => `<span class="case-card__tag">${t}</span>`).join('')}</div>
        </article>`;
      }).join('')
      : `<div class="case-empty">
           <p>当前筛选条件下暂无案例，请切换其它子类。</p>
           <button type="button" class="btn btn--ghost" onclick="CasesPage.reset()">重置筛选</button>
         </div>`;

    this._applyClamp();
  },

  /* ── 折叠 / 展开（严格参照「导师团队」板块：section-cta 折叠标签 + 网格行数钳制）──
     收起态只保留前 rows 行卡片，其余 display:none；标签置于网格之后，
     控制其位置之前的全部案例模块；筛选 / 搜索 / 维度切换重渲染后自动维持当前状态 */
  _gridClamp(gridEl, rows, open) {
    if (!gridEl) return { limit: Infinity, total: 0 };
    const tpl = getComputedStyle(gridEl).gridTemplateColumns;
    const cols = (tpl && tpl !== 'none') ? tpl.split(' ').length : 1;
    const limit = cols * rows;
    const children = Array.from(gridEl.children);
    children.forEach((card, i) => { card.style.display = (open || i < limit) ? '' : 'none'; });
    return { limit, total: children.length };
  },

  _applyClamp() {
    const grid = this.grid, wrap = document.getElementById('cases-more-wrap');
    if (!grid || !wrap) return;
    const open = !!this._expanded;
    const { limit, total } = this._gridClamp(grid, this.rows, open);
    wrap.innerHTML = total <= limit ? '' : (open
      ? `<button class="section-cta" id="cases-expand-btn" type="button">收起</button>`
      : `<button class="section-cta" id="cases-expand-btn" type="button">展开查看更多 <span class="u-en">/ ${total - limit} more</span></button>`);
  },

  toggle() {
    this._expanded = !this._expanded;
    this._applyClamp();
  }
};

/* ═══════════ 学生案例次级页面（点击案例卡 → 全屏档案浮层）═══════════
   与「左上角绿色方框 → 全屏浮层」同一套观感：幕布展开 + 绿色消隐线 + ESC / 背景点击关闭。
   左半区是作品图横向滑动（scroll-snap，支持箭头、滚轮、← → 方向键），
   右半区是申请档案：院校中英文、录取专业英文名、标签、院校背景、学术成绩、语言成绩、
   学生画像（参考站里的总结性文字）、作品与创作说明、其它录取院校。 */
const CaseSheet = {
  idx: -1,
  keybound: false,

  ensure() {
    if (this.el) return this.el;
    const el = document.createElement('div');
    el.className = 'case-sheet';
    el.id = 'case-sheet';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="case-sheet__bg" onclick="CaseSheet.close()"></div>
      <div class="case-sheet__panel" role="dialog" aria-modal="true" aria-label="学生案例档案">
        <span class="case-sheet__sweep" aria-hidden="true"></span>
        <button type="button" class="case-sheet__close" onclick="CaseSheet.close()">关闭 <span class="u-en">×</span></button>
        <div class="case-sheet__inner" id="case-sheet-inner"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.inner = el.querySelector('#case-sheet-inner');
    if (!this.keybound) {
      this.keybound = true;
      document.addEventListener('keydown', e => {
        if (!this.isOpen()) return;
        if (e.key === 'Escape') this.close();
        else if (e.key === 'ArrowLeft') this.step(-1);
        else if (e.key === 'ArrowRight') this.step(1);
      });
    }
    if (!this.hoverbound) {
      this.hoverbound = true;
      /* 鼠标移动 → 浮现左右翻页与底部返回按钮；静止 1.6s / 移出浮层 → 隐藏 */
      el.addEventListener('mousemove', () => this.wakeHover());
      el.addEventListener('mouseleave', () => this.sleepHover());
    }
    return el;
  },

  isOpen() { return !!this.el && this.el.classList.contains('is-open'); },

  open(idx) {
    const item = (CasesPage.all || [])[idx];
    if (!item) return;
    this.idx = idx;
    const el = this.ensure();
    this.inner.innerHTML = this.markup(item);
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    this.track = this.inner.querySelector('.case-sheet__track');
    if (this.track) this.track.addEventListener('scroll', () => this.updateCount(), { passive: true });
    this.updateCount();
    el.querySelector('.case-sheet__close').focus();
  },

  close() {
    if (!this.isOpen()) return;
    this.el.classList.remove('is-open');
    this.el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
    this.inner.innerHTML = '';
    this.sleepHover();
  },

  /* 翻页 / 返回控件的鼠标显隐：移动即浮现，静止 1.6s 自动隐藏 */
  wakeHover() {
    this.el.classList.add('is-hover');
    clearTimeout(this._hoverT);
    this._hoverT = setTimeout(() => { if (this.el) this.el.classList.remove('is-hover'); }, 1600);
  },
  sleepHover() {
    clearTimeout(this._hoverT);
    if (this.el) this.el.classList.remove('is-hover');
  },

  /* 左右切图：一张一屏，用 track 的可视宽度做步长 */
  step(dir) {
    if (!this.track) return;
    this.track.scrollBy({ left: dir * this.track.clientWidth, behavior: 'smooth' });
  },

  updateCount() {
    if (!this.track || !this.track.children.length) return;
    const i = Math.min(
      this.track.children.length - 1,
      Math.round(this.track.scrollLeft / Math.max(1, this.track.clientWidth))
    );
    this.track.querySelectorAll('.case-sheet__slide')
      .forEach((s, k) => s.classList.toggle('is-current', k === i));
    /* 切换到其它张时暂停不在当前屏的视频（视频默认不自动播放） */
    if (this._cur !== i) { this._cur = i; this.pauseVideos(); }
  },

  /* 视频：默认不自动播放，点击后播放 / 再点暂停；同屏只保留一个在播 */
  togglePlay(v) {
    if (!v) return;
    const box = v.closest('.case-sheet__media');
    if (v.paused) {
      this.pauseVideos(v);
      v.play();
      if (box) box.classList.add('is-playing');
    } else {
      v.pause();
      if (box) box.classList.remove('is-playing');
    }
  },
  pauseVideos(except) {
    if (!this.el) return;
    this.el.querySelectorAll('.case-sheet__media').forEach(m => {
      const v = m.querySelector('video');
      if (v && v !== except && !v.paused) { v.pause(); m.classList.remove('is-playing'); }
    });
  },

  markup(c) {
    const works = c.works || [];
    const isVideo = u => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u);
    return `
      <div class="case-sheet__gallery">
        <div class="case-sheet__track">
          ${works.length
            ? works.map((w, i) => `
              <figure class="case-sheet__slide${i === 0 ? ' is-current' : ''}">
                ${isVideo(w)
                  ? `<div class="case-sheet__media">
                       <video src="${w}" preload="metadata" playsinline onclick="CaseSheet.togglePlay(this)"></video>
                       <span class="case-sheet__playhint u-en">PLAY</span>
                     </div>`
                  : `<img src="${w}" alt="${c.admitted} 作品 ${i + 1}" loading="${i < 2 ? 'eager' : 'lazy'}">`}
                <figcaption class="u-en">${String(i + 1).padStart(2, '0')} / ${String(works.length).padStart(2, '0')}</figcaption>
              </figure>`).join('')
            : `<p class="case-sheet__noworks">作品图片待补充</p>`}
        </div>
        ${works.length > 1 ? `
        <button type="button" class="case-sheet__nav case-sheet__nav--prev" aria-label="上一张" onclick="CaseSheet.step(-1)"><span class="u-en">&lt;</span></button>
        <button type="button" class="case-sheet__nav case-sheet__nav--next" aria-label="下一张" onclick="CaseSheet.step(1)"><span class="u-en">&gt;</span></button>` : ''}
        <button type="button" class="case-sheet__back" aria-label="返回上一级" onclick="CaseSheet.close()"><span class="u-en">×</span></button>
      </div>

      <aside class="case-sheet__info">
        <div class="case-sheet__info-grid">
          <div class="case-sheet__who">
            <span class="case-card__branch">${c.schoolType} · ${c.branch}</span>
            <div class="case-card__school">${c.admitted}</div>
            <div class="case-card__school-en u-en">${c.admittedEn || ''}</div>
            <div class="case-card__program"><span class="u-en">${c.admittedMajor}</span></div>
            <div class="case-sheet__tags">${(c.tags || []).map(t => `<span class="case-card__tag">${t}</span>`).join('')}</div>
          </div>
          <div class="case-sheet__side">
            <div class="case-sheet__facts">${[c.origin, c.language, c.gpa].filter(v => v && v !== '无').join(' ｜ ')}</div>
            <div class="case-sheet__side-bottom">
              <div class="case-sheet__block">
                <h4 class="case-sheet__h4">学生画像</h4>
                <p class="case-sheet__ph">内容即将上线 · 敬请期待</p>
              </div>
              <div class="case-sheet__block">
                <h4 class="case-sheet__h4">作品与创作说明</h4>
                <p class="case-sheet__ph">内容即将上线 · 敬请期待</p>
              </div>
              ${(c.otherAdmitted || []).length ? `<div class="case-sheet__block">
                <h4 class="case-sheet__h4">录取院校</h4>
                <ul class="case-sheet__list">${c.otherAdmitted.map(x => `<li>${x}</li>`).join('')}</ul>
              </div>` : ''}
            </div>
          </div>
        </div>
      </aside>`;
  }
};

/* ═══════════ 01–05 五个规划模块（横向手风琴 + 联动详情） ═══════════
   2026-09-19：由「规划我的未来」(#/employment) 整体迁移到「本科爬藤」(#/undergraduate)，
   按原顺序放在「插画 ILLUSTRATION / 纯艺术 FINE ART」之前；
   展示布局改为与「十大核心岗位」同构的横向手风琴（.pacc / .pmod）：
   收起态 = 窄条 + 竖排模块名；悬停 / 聚焦 / 点击 → 横向展开露出正文，其余收窄，
   并联动刷新下方 .pacc__detail 详情面板；总宽 = 主栏内容宽（不做外扩）。 */
/* ═══════════ 本科爬藤 · 03 成长时间轴（独立 section）══════════
   结构 / 层级移植自本科爬藤源码 index.html 的「03 / G9—G12 ROADMAP 成长时间轴」：
     标题区（眉标 + 标题）→ 申请地区路线标签（美国 IVY / TOP 30 · 英国 G5）
     → 路径总览（总览句 + 目标 + 三个视角）→ 阶段里程碑轴（时间点 + 圆点连线 + 阶段名）
     → 7 张阶段卡（阶段成果徽标 + 阶段名 + 升学主线 / 创作／研究 / 资源与动作）
     → 本阶段可调用资源条。
   数据来自 data/ug-timeline.json（源码 timelineData 原样结构化，文案逐字保留）。
   路线标签复用站内 .filter-btn，保证与站内筛选交互的视觉一致。 */
const UgTimeline = {
  esc(v) { return DirectionsSection.escape(v == null ? '' : String(v)); },

  build() {
    const d = DATA.cache['ug-timeline'];
    const tabs = document.getElementById('ugt-tabs');
    if (!d || !tabs || !d.routes || !d.routes.length) return;
    this.routes = d.routes;
    this.active = d.routes[0].id;

    tabs.innerHTML = this.routes.map(r =>
      `<button class="filter-btn ugt__tab${r.id === this.active ? ' is-active' : ''}" type="button"
        role="tab" aria-selected="${r.id === this.active ? 'true' : 'false'}"
        data-route="${this.esc(r.id)}">${this.esc(r.label)}</button>`).join('');

    /* 事件只绑一次：切换路线只重渲染下方四块，不重建标签本身 */
    if (!this._bound) {
      this._bound = true;
      tabs.addEventListener('click', e => {
        const b = e.target.closest('.ugt__tab');
        if (b) this.select(b.getAttribute('data-route'));
      });
      tabs.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const b = e.target.closest('.ugt__tab');
        if (!b) return;
        e.preventDefault();
        this.select(b.getAttribute('data-route'));
      });
    }
    this.select(this.active);
  },

  select(id) {
    const r = (this.routes || []).filter(x => x.id === id)[0];
    if (!r) return;
    this.active = id;
    document.querySelectorAll('#ugt-tabs .ugt__tab').forEach(b => {
      const on = b.getAttribute('data-route') === id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    const esc = s => this.esc(s);
    const set = (elId, html) => { const el = document.getElementById(elId); if (el) el.innerHTML = html; };

    /* 路径总览：首个格子为「路径总览」（总览句 + 目标），后三格为三个视角 */
    set('ugt-summary',
      `<section class="ugt__summary-lead"><span class="ugt__label">路径总览</span>
         <h3>${esc(r.title)}</h3><p>${esc(r.goal)}</p></section>` +
      r.lenses.map(l => `<section><span class="ugt__label">${esc(l.k)}</span><p>${esc(l.v)}</p></section>`).join(''));

    /* 里程碑轴：时间点 + 轴线圆点 + 阶段名 */
    set('ugt-milestones', r.stages.map(s =>
      `<article class="ugt__milestone"><span class="ugt__term">${esc(s.term)}</span>
         <i class="ugt__point" aria-hidden="true"></i><b>${esc(s.title)}</b></article>`).join(''));

    /* 阶段卡：阶段成果徽标 + 阶段名 + 三行主线 */
    set('ugt-grid', r.stages.map(s => `
      <article class="ugt__card">
        <span class="ugt__label">阶段成果</span>
        <b class="ugt__out">${esc(s.output)}</b>
        <b class="ugt__stage">${esc(s.title)}</b>
        <div class="ugt__row"><span class="ugt__label">升学主线</span><p>${esc(s.main)}</p></div>
        <div class="ugt__row"><span class="ugt__label">创作／研究</span><p>${esc(s.art)}</p></div>
        <div class="ugt__row"><span class="ugt__label">资源与动作</span><p>${esc(s.resource)}</p></div>
      </article>`).join(''));

    /* 资源条：本阶段可调用资源 */
    set('ugt-season', `<b class="ugt__season-label">本阶段可调用资源</b>` +
      r.resources.map(x => `<article class="ugt__season-card"><span class="ugt__label">资源模块</span>
        <b>${esc(x.k)}</b><p>${esc(x.v)}</p></article>`).join(''));
  }
};

const PlanningModules = {
  build() {
    const p = DATA.cache.planning;
    const rail = document.getElementById('planning-sections');
    const detail = document.getElementById('planning-detail');
    if (!p || !rail || !detail) return;

    this.list = p.sections;
    this.detail = detail;

    rail.innerHTML = this.list.map(s => `
      <button class="pmod" type="button" data-id="${s.id}" aria-controls="planning-detail">
        <span class="pmod__stack">
          <span class="pmod__num">${s.num}</span>
          <span class="pmod__name">${s.title}</span>
        </span>
        <span class="pmod__reveal">
          <span class="pmod__en u-en">${s.titleEn}</span>
          <span class="pmod__body">${s.body}</span>
          <span class="pmod__meta"><b>${this.label(s)}</b>${this.summary(s)}</span>
        </span>
      </button>
    `).join('');

    this.cards = Array.from(rail.querySelectorAll('.pmod'));
    this.cards.forEach(card => {
      const id = card.dataset.id;
      card.addEventListener('mouseenter', () => this.select(id));
      card.addEventListener('focus', () => this.select(id));
      card.addEventListener('click', () => this.select(id));
    });

    // 默认展开 01
    this.select(this.list[0].id);
  },

  select(id) {
    if (!this.cards) return;
    this.cards.forEach(c => c.classList.toggle('is-active', c.dataset.id === id));
    const s = this.list.find(x => x.id === id);
    if (!s) return;
    this.detail.innerHTML = this.renderDetail(s);
  },

  /* 展开态里那行「要点」的小标签：按数据类型取名，文案全部来自数据 */
  label(s) {
    if (s.tags) return '关键词';
    if (s.schools) return '核心院校';
    if (s.roles) return '岗位方向';
    if (s.skills) return '核心技能';
    if (s.milestones) return '时间阶段';
    return '要点';
  },

  /* 展开态里的一行摘要：只做索引，完整内容交给下方详情面板 */
  summary(s) {
    if (s.tags) return s.tags.join(' · ');
    if (s.skills) return s.skills.join(' · ');
    if (s.schools) return s.schools.map(x => x.name).join(' / ');
    if (s.roles) return s.roles.map(x => x.role).join(' / ');
    if (s.milestones) return s.milestones.map(x => x.phase).join(' → ');
    return '';
  },

  renderDetail(s) {
    return `
      <div class="pacc__panel">
        <div class="pacc__panel-head">
          <span class="pacc__panel-num">${s.num}</span>
          <h3 class="pacc__panel-title">${s.title} <span class="u-en">${s.titleEn}</span></h3>
        </div>
        <p class="pacc__panel-desc">${s.body}</p>
        ${this.renderExtras(s)}
      </div>`;
  },

  renderExtras(s) {
    const tags = s.tags || s.skills;
    if (tags) return `<div class="plate__tags">${tags.map(t => `<span class="badge">${t}</span>`).join('')}</div>`;
    if (s.schools) return `<div class="pacc__list">${s.schools.map(x => `<div class="pacc__item"><strong>${x.name}</strong><span>${x.focus}</span></div>`).join('')}</div>`;
    if (s.roles) return `<div class="pacc__list">${s.roles.map(x => `<div class="pacc__item"><strong>${x.role}</strong><span>${x.context}</span></div>`).join('')}</div>`;
    if (s.milestones) return `<div class="pacc__list">${s.milestones.map(x => `<div class="pacc__item"><strong>${x.phase}</strong><span>${x.tasks.join(' · ')}</span></div>`).join('')}</div>`;
    return '';
  }
};

/* ═══════════ 八大就业方向：持续滑动卡片带 ═══════════
   位于「就业力」页十大核心岗位上方，数据来自 data/directions.json。
   轨道复制两份内容，CSS translateX(-50%) 无缝循环；JS 按单份宽度动态
   设定动画时长，保证不同屏幕下滚动速度大致恒定；鼠标悬停 / 减少动画
   偏好时暂停。 */
const DirectionsSection = {
  SPEED: 42, // px/s

  build() {
    const d = DATA.cache.directions;
    const rail = document.getElementById('directions-rail');
    if (!d || !rail) return;

    document.getElementById('directions-eyebrow').textContent = d.eyebrow;
    document.getElementById('directions-title').textContent = d.title;
    document.getElementById('directions-subtitle').textContent = d.subtitle;

    const arrow = `<svg class="direction-card__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>`;

    /* 卡片可点击：data-direction-index 指向真实方向序号（轨道是两份副本，渲染时取 %8）；
       role=button + tabindex 让它也能用键盘 Enter / 空格打开 */
    const cardHTML = (item, i) => `
      <article class="direction-card" data-direction-index="${i}"
              style="--direction-color: ${this.escape(item.color || '#63E6D4')}"
              role="button" tabindex="0" aria-label="查看方向海报：${this.escape(item.title)}">
        <div class="direction-card__top">
          <span class="direction-card__num">${item.num}</span>
          ${arrow}
        </div>
        <h3 class="direction-card__title">${item.title}</h3>
        <div class="direction-card__title-en u-en">${item.titleEn}</div>
        <p class="direction-card__desc">${item.desc}</p>
        <div>
          <div class="direction-card__roles-label">代表岗位</div>
          <div class="direction-card__roles">
            ${item.roles.map(r => `<span class="direction-card__role">${this.escape(r)}</span>`).join('')}
          </div>
        </div>
        <div class="direction-card__salary">
          <span>薪资参考</span>
          <strong>${this.escape(item.salary)}</strong>
        </div>
      </article>`;

    rail.innerHTML = [...d.directions, ...d.directions]
      .map((item, i) => cardHTML(item, i % d.directions.length)).join('');
    this.buildTags(d.directions);
    DirectionSheet.setList(d.directions);   // 全屏方向卡与卡片共用同一份数据
    this.bindCards();
    this.bindStickyTags();

    this.sync();
    if (!this._resizeBound) {
      this._resizeBound = true;
      let t;
      window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => this.sync(), 180); });
    }
  },

  /* ── 方向标签：与八大就业方向的 8 个滑动卡片一一对应 ──
     顺序、标题完全取自同一份 d.directions，改数据时标签与卡片始终同步。
     外观由 CSS（.planning-tag）统一控制，文字不换行、8 个一行等分排布。
     交互分两种状态：
     · 弹层未开 → 纯指示性，点击不跳转（开弹层由下方滑动卡片承担）；
     · 弹层打开 → 点击切换弹层内容到对应方向，当前方向标签自动发光（is-active）。
     悬停反馈 = 边框转方向色 + 方向色发光（与 .dir-sheet__secs 的发光规范同式）。 */
  buildTags(list) {
    const box = document.getElementById('directions-tags');
    if (!box) return;

    box.innerHTML = list.map((item, i) => `
      <span class="planning-tag" data-direction-index="${i}"
            style="--direction-color: ${this.escape(item.color || '#63E6D4')}"
            title="${this.escape(item.title)}">${this.escape(item.title)}</span>`).join('');

    if (!this._tagBound) {                       // 事件只绑一次，重建标签后依然有效
      this._tagBound = true;
      box.addEventListener('click', (e) => {
        const btn = e.target.closest('.planning-tag');
        if (!btn || !DirectionSheet.isOpen()) return;   // 弹层未开 → 不响应（无跳转）
        DirectionSheet.open(Number(btn.dataset.directionIndex));
      });
    }
  },

  /* 顶部标签的「当前方向」高亮：弹层打开时对应标签持续发光，关闭即清除 */
  setActiveTag(idx) {
    const tags = document.getElementById('directions-tags');
    if (!tags) return;
    [...tags.children].forEach((t, k) => t.classList.toggle('is-active', k === idx));
  },

  /* ── 静态标签吸顶 ──
     页头（产业全景 · 职业规划）整体滚出视口（底边越过导航栏下缘）后，
     8 个方向标签固定在导航栏下方，随时识别当前所在的就业方向；滚回页头即还原。
     方向弹层打开时强制吸顶（弹层底部标签已移除，见 DirectionSheet.markup）：
     即使页头还在视口内，这排标签也会固定到顶部并浮于弹层之上。 */
  bindStickyTags() {
    if (this._stickyBound) return;
    this._stickyBound = true;
    const update = () => this.syncTagsFixed();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  },

  setTagsForced(on) {
    this._tagsForced = on;
    this.syncTagsFixed();
  },

  syncTagsFixed() {
    const tags = document.getElementById('directions-tags');
    const hero = document.getElementById('employment-hero');
    if (!tags || !hero) return;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--navbar-h')) || 64;
    const r = hero.getBoundingClientRect();
    /* 页头完全滚出视口顶部才吸顶（height=0 为隐藏态，不误判）；
       弹层打开（_tagsForced）时无条件吸顶，is-forced 同时把标签排顶到屏幕最上沿
       （.dir-sheet.has-top-tags 让出等高顶部空间，避免遮挡卡头标题） */
    const out = r.height > 0 && r.bottom <= navH;
    tags.classList.toggle('is-fixed', out || !!this._tagsForced);
    tags.classList.toggle('is-forced', !!this._tagsForced);
  },

  /* 卡片 → 全屏方向卡：轨道是两份副本，data-direction-index 已是折算后的真实方向序号 */
  bindCards() {
    const rail = document.getElementById('directions-rail');
    if (!rail || this._cardBound) return;      // 事件只绑一次，重建卡片后依然有效
    this._cardBound = true;
    rail.addEventListener('click', (e) => {
      const card = e.target.closest('.direction-card');
      if (card) DirectionSheet.open(Number(card.dataset.directionIndex));
    });
    rail.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.direction-card');
      if (!card) return;
      e.preventDefault();
      DirectionSheet.open(Number(card.dataset.directionIndex));
    });
  },

  sync() {
    const rail = document.getElementById('directions-rail');
    if (!rail) return;
    const half = rail.scrollWidth / 2;
    if (!half) return;
    const dur = half / this.SPEED;
    rail.style.setProperty('--directions-dur', dur.toFixed(2) + 's');
  },

  escape(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};

/* ═══════════ 八大就业方向 · 方向弹层 ═══════════
   点滑动卡片 / 点副标题下的方向标签 → 弹出带四周留白的覆盖式弹层（对齐 dad_demo
   「就业全景 × 职业规划」点击标签展开的表现）：保留上一层页面的可见边缘，背景模糊 + 压暗。
   · 浮层机制与「案例卡 → 全屏档案浮层」同源：幕布 clip-path 自上而下展开（同一 easing）、
     方向主色消隐线扫过、ESC / 点背景 / 右上角左向箭头退出、body 锁滚、关闭后焦点归还触发元素。
   · 卡内视觉层次对齐 dad_demo「就业全景 × 职业规划」的行业面板：
     eyebrow → 中/英标题 → 一句话解读 → 右上角标签 chips → 主体内容 → 底部总结。
   · 弹层内不再放底部方向标签：方向总览 / 切换由页面顶部吸顶的 8 个静态标签
     （DirectionsSection.buildTags 渲染、弹层打开时强制吸顶并点亮当前方向）承担；
     弹层左右两侧另有「<」「>」翻页箭头，与左右方向键同为 step(±1) 循环切换。 */
const DirectionSheet = {
  list: [], idx: 0, el: null, body: null, lastFocus: null,

  setList(list) { this.list = list || []; },

  /* 方向深度内容：data/direction-details.json 按方向标题匹配 */
  detailFor(title) {
    const all = DATA.cache['direction-details'] || {};
    return Object.values(all).find(d => d && d.title === title) || null;
  },

  ensure() {
    if (this.el) return this.el;
    const el = document.createElement('div');
    el.className = 'dir-sheet';
    el.id = 'dir-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '就业方向详情');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="dir-sheet__bg"></div>
      <button type="button" class="dir-sheet__arrow dir-sheet__arrow--prev" aria-label="上一个就业方向" title="上一个（←）"
              onclick="DirectionSheet.step(-1)">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button type="button" class="dir-sheet__arrow dir-sheet__arrow--next" aria-label="下一个就业方向" title="下一个（→）"
              onclick="DirectionSheet.step(1)">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="dir-sheet__panel">
        <div class="dir-sheet__sweep"></div>
        <button type="button" class="dir-sheet__close" aria-label="返回上一层" title="返回上一层">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M19.5 12H5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            <path d="M11.5 5.5 5 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="dir-sheet__body" id="dir-sheet-body"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.body = el.querySelector('#dir-sheet-body');
    el.querySelector('.dir-sheet__bg').addEventListener('click', () => this.close());
    el.querySelector('.dir-sheet__close').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowLeft') this.step(-1);
      else if (e.key === 'ArrowRight') this.step(1);
    });
    return el;
  },

  isOpen() { return !!this.el && this.el.classList.contains('is-open'); },

  open(i) {
    const n = this.list.length;
    if (!n) return;
    this.idx = ((i % n) + n) % n;
    const el = this.ensure();
    if (!this.isOpen()) this.lastFocus = document.activeElement;
    this.body.innerHTML = this.markup(this.list[this.idx], this.idx, n);

    const img = this.body.querySelector('.dir-sheet__poster');
    if (img) {                                   // 海报解码完成再淡入，避免白块闪烁
      const show = () => img.classList.add('is-ready');
      img.complete ? show() : img.addEventListener('load', show, { once: true });
    }
    const panel = el.querySelector('.dir-sheet__panel');
    if (panel && this.color) panel.style.setProperty('--dir-color', this.color);   // 扫线/边框沿用方向主色
    const scroller = this.body.querySelector('.dir-sheet__scroll');
    if (scroller) scroller.scrollTop = 0;
    this.bindParallax();

    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    DirectionsSection.setTagsForced(true);   // 弹层内底部标签已移除 → 顶部静态标签强制吸顶，承担方向切换
    el.classList.add('has-top-tags');        // 弹层顶部让出标签排高度，避免遮挡卡头标题
    el.style.setProperty('--dir-color', this.color);   // 左右翻页箭头沿用方向主色
    DirectionsSection.setActiveTag(this.idx);          // 当前方向标签自动发光
    el.querySelector('.dir-sheet__close').focus();
  },

  /* 头部高度压缩（所有带 hero 图的方向，与 08 一致）：先按自然高度测量，再固定为 5/6，由 overflow 从底部裁掉 1/6
     height 置为 auto 才能量到自然高度；值为 auto 时 CSS 的 var() 回退同样成立 */
  applyHeadCompact() {
    const head = this.body.querySelector('.dir-sheet__head--hero.is-compact');
    if (!head) return;
    head.classList.remove('is-compact');       // 摘掉压缩态才能量到原始高度（含 min-height）
    const h = head.getBoundingClientRect().height;
    head.classList.add('is-compact');
    if (!h) return;
    head.style.setProperty('--hero-compact', `${Math.round(h * 5 / 6)}px`);
  },

  /* 头部背景图视差：随内容下滚同步上移，极限为「最底层标签底部 + 一行字高度」处
     「一行字」高度基准 = 左上角 eyebrow（DIRECTION 08 · CAREER MAP）的实测文字高度 */
  bindParallax() {
    this.unbindParallax();
    const head = this.body.querySelector('.dir-sheet__head--hero');
    const bg = this.body.querySelector('.dir-sheet__head-bg');
    const scroller = this.body.querySelector('.dir-sheet__scroll');
    const chips = head && head.querySelector('.dir-sheet__chips');
    const eyebrow = head && head.querySelector('.dir-sheet__eyebrow');
    if (!head || !bg || !scroller || !chips || !eyebrow) return;

    const apply = () => {
      const y = Math.min(this.parallaxMax || 0, scroller.scrollTop);
      bg.style.transform = `translate3d(0, ${-y}px, 0)`;
    };
    const measure = () => {
      this.applyHeadCompact();                 // 先按自然高度重算压缩值（resize 时同样生效）
      const hb = head.getBoundingClientRect();
      const cb = chips.getBoundingClientRect();
      const lineH = eyebrow.getBoundingClientRect().height;
      this.parallaxMax = Math.max(0, hb.height - (cb.bottom - hb.top) - lineH);
      apply();
    };
    /* 与整体页面滚动同一套逻辑：滚动即位移、同帧刷新、无过渡缓动 */
    const onScroll = () => {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        apply();
      });
    };
    this.parallax = apply;
    this._raf = 0;
    measure();
    requestAnimationFrame(measure);          // 图片/字体就绪后复测一次
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    this._parallaxOff = () => {
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  },

  unbindParallax() {
    if (this._parallaxOff) { this._parallaxOff(); this._parallaxOff = null; }
    this.parallax = null;
  },

  close() {
    if (!this.isOpen()) return;
    this.unbindParallax();
    this.el.classList.remove('is-open');
    this.el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
    DirectionsSection.setTagsForced(false);  // 还原为「页头滚出才吸顶」的常规规则
    DirectionsSection.setActiveTag(-1);      // 清除顶部标签的当前方向发光
    this.el.classList.remove('has-top-tags');
    this.body.innerHTML = '';
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
    this.lastFocus = null;
  },

  step(d) { if (this.list.length) this.open(this.idx + d); },

  /* 分区渲染：kind = prose / cards / pills / steps / stages；[[…]] 为高亮标记 */
  escHl(v) {
    return DirectionsSection.escape(v || '').replace(/\[\[(.+?)\]\]/g,
      '<mark class="dir-sec__mark">$1</mark>');
  },

  /* 分区正文：kind = prose / cards / pills / gallery / groups / steps / stages */
  kindBody(s) {
    const esc = (v) => DirectionsSection.escape(v || '');
    const hl = (v) => this.escHl(v);
    if (s.kind === 'prose') {
      return (s.body || []).map(p => `<p class="dir-sec__p">${hl(p)}</p>`).join('') +
        (s.note ? `<p class="dir-sec__note">${hl(s.note)}</p>` : '');
    }
    if (s.kind === 'cards') {
      return `<div class="dir-sec__cards">${(s.items || []).map(c =>
        `<div class="dir-card${c.hl ? ' dir-card--hl' : ''}"><div class="dir-card__t">${esc(c.t)}</div><div class="dir-card__d">${esc(c.d)}</div></div>`).join('')}</div>`;
    }
    if (s.kind === 'pills') {
      return `<div class="dir-sec__pills">${(s.items || []).map(p => `<span class="dir-pill">${esc(p)}</span>`).join('')}</div>`;
    }
    if (s.kind === 'gallery') {
      return `<div class="dir-sec__gallery">${(s.items || []).map(g =>
        `<figure class="dir-fig"><img class="dir-fig__img" src="${esc(g.img)}" alt="${esc(g.t)}" loading="lazy">` +
        `<figcaption class="dir-fig__body"><div class="dir-fig__t">${esc(g.t)}</div><div class="dir-fig__d">${esc(g.d)}</div></figcaption></figure>`).join('')}</div>`;
    }
    if (s.kind === 'groups') {
      return (s.items || []).map(g =>
        `<div class="dir-group"><h4 class="dir-group__t">${esc(g.t)}</h4>${this.kindBody(g)}</div>`).join('');
    }
    return this.listHTML(s);
  },

  sectionHTML(s) {
    const esc = (v) => DirectionsSection.escape(v || '');
    const head = `<div class="dir-sec__head"><span class="dir-sec__no u-en">${esc(s.n)}</span><h3 class="dir-sec__title">${esc(s.t)}</h3></div>`;
    return `<section class="dir-sec">${head}${this.kindBody(s)}</section>`;
  },

  /* steps（求职路径）/ stages（发展阶段）共用一套编号列表 */
  listHTML(s) {
    const esc = (v) => DirectionsSection.escape(v || '');
    const k = s.kind === 'steps' ? 'dir-step' : 'dir-stage';
    const rows = (s.items || []).map(it => `
      <li class="${k}">
        <span class="${k}__no u-en">${esc(it.s)}</span>
        <div class="${k}__main">
          <div class="${k}__t">${esc(it.t)}${it.r ? `<span class="${k}__r">${esc(it.r)}</span>` : ''}</div>
          <div class="${k}__d">${esc(it.d)}</div>
        </div>
      </li>`).join('');
    return `<ol class="dir-sec__list dir-sec__list--${esc(s.kind)}">${rows}</ol>`;
  },

  markup(item, i, n) {
    const esc = (s) => DirectionsSection.escape(s);
    const color = esc(item.color || '#63E6D4');
    const det = this.detailFor(item.title);
    const secs = det ? (det.sections || []).map(s => this.sectionHTML(s)).join('') : '';
    const en = esc((det && det.titleEn) || item.titleEn);
    /* 右上角标签：详情开启 useTagChips（如方向 08 的 5 个领域标签）则只用 tags，否则用岗位 + 薪资 */
    const chips = (det && det.useTagChips && det.tags ? det.tags : (item.roles || []).concat())
      .map(r => `<span class="dir-sheet__chip">${esc(r)}</span>`).join('') +
      (det && det.useTagChips && det.tags ? '' : `<span class="dir-sheet__chip dir-sheet__chip--salary">薪资参考 ${esc(item.salary)}</span>`);
    const hero = det && det.hero ? ' dir-sheet__head--hero is-compact' : '';
    const no = String(i + 1).padStart(2, '0');
    this.color = color;
    return `
      <header class="dir-sheet__head${hero}" style="--dir-color:${color}">
        ${det && det.hero ? `<div class="dir-sheet__head-bg" style="background-image:url('${esc(det.hero)}')" aria-hidden="true"></div>` : ''}
        <div class="dir-sheet__head-main">
          <span class="dir-sheet__eyebrow u-en">DIRECTION ${no} · CAREER MAP</span>
          <h2 class="dir-sheet__title">${esc(item.title)} <span class="u-en">${en}</span></h2>
          <p class="dir-sheet__desc">${esc(item.desc)}</p>
        </div>
        <div class="dir-sheet__chips">
          ${chips}
        </div>
      </header>
      <div class="dir-sheet__scroll">
        ${secs ? `<div class="dir-sheet__secs" style="--dir-color:${color}">${secs}</div>` : ''}
        ${item.poster
          ? `<div class="dir-sheet__poster-wrap"><img class="dir-sheet__poster" src="${esc(item.poster)}" alt="${esc(item.title)} 就业方向海报"></div>`
          : (secs ? '' : `<p class="dir-sheet__noposter">该方向暂未收录详情</p>`)}
        ${det && det.summary ? `<aside class="dir-sheet__summary" style="--dir-color:${color}">
          <p class="dir-sheet__summary-text">${this.escHl(det.summary.text)}</p>
        </aside>` : ''}
      </div>`;
  }
};

/* ═══════════ 就业力 · 规划我的未来 ═══════════
   01–05 五个规划模块已于 2026-09-19 整体迁移到「本科爬藤」页（见 PlanningModules），
   本页保留页头文案、「八大就业方向」滑动卡片与「十大核心岗位」。 */
const EmploymentPage = {
  build() {
    const p = DATA.cache.planning;
    document.getElementById('planning-title').textContent = p.title;
    document.getElementById('planning-subtitle').textContent = p.subtitle;
    DirectionsSection.build();
    CareersPage.build();
  }
};

/* ═══════════ 十大核心岗位（横向手风琴 + 联动详情） ═══════════
   数据源 data/careers.json：10 条岗位，其中 4 条来自规划手册的完整逆向拆解
   （岗位描述 / 所属行业 / 典型企业 / 成功入职案例 / 硬门槛 / 软实力 / 倒推升学择校）
   交互：悬停或聚焦任一岗位 → 该条横向展开、其余收窄，并联动刷新下方详情面板 */
const CareersPage = {
  build() {
    const d = DATA.cache.careers;
    const rail = document.getElementById('careers-rail');
    const detail = document.getElementById('careers-detail');
    if (!d || !rail || !detail) return;

    document.getElementById('careers-eyebrow').textContent = d.eyebrow;
    document.getElementById('careers-title').textContent = d.title;
    document.getElementById('careers-subtitle').textContent = d.subtitle;
    document.getElementById('careers-hint').textContent = '';

    this.list = d.careers;
    this.rail = rail;
    this.detail = detail;

    rail.innerHTML = this.list.map(c => `
      <button class="career-card" type="button" data-id="${c.id}" aria-controls="careers-detail">
        <span class="career-card__stack">
          <span class="career-card__num">${c.num}</span>
          <span class="career-card__name">${c.name}</span>
          <span class="career-card__en u-en">${c.nameEn}</span>
          ${c.detail ? '<span class="career-card__dot"></span>' : ''}
        </span>
        <span class="career-card__reveal">
          <span class="career-card__desc">${c.desc}</span>
          ${c.ind ? `<span class="career-card__meta"><b>所属行业</b>${c.ind}</span>` : ''}
          ${c.com ? `<span class="career-card__meta"><b>典型企业</b>${c.com}</span>` : ''}
        </span>
      </button>
    `).join('');

    this.cards = Array.from(rail.querySelectorAll('.career-card'));
    this.cards.forEach(card => {
      const id = card.dataset.id;
      card.addEventListener('mouseenter', () => this.select(id));
      card.addEventListener('focus', () => this.select(id));
      card.addEventListener('click', () => this.select(id));
    });

    // 默认定位到第一个「深度拆解」岗位
    const first = (this.list.find(c => c.detail) || this.list[0]).id;
    this.select(first);
  },

  select(id) {
    if (!this.cards) return;
    this.cards.forEach(c => c.classList.toggle('is-active', c.dataset.id === id));
    const c = this.list.find(x => x.id === id);
    if (!c) return;
    this.detail.innerHTML = this.renderDetail(c);
  },

  renderDetail(c) {
    if (!c.detail) {
      return `
        <div class="careers__panel">
          <div class="careers__panel-head">
            <span class="careers__panel-num">${c.num}</span>
            <h3 class="careers__panel-title">${c.name} <span class="u-en">${c.nameEn}</span></h3>
          </div>
          <p class="careers__panel-desc">${c.desc}</p>
          <div class="placeholder-card" style="margin-top:0;">
            <h3>深度拆解筹备中</h3>
            <p>该岗位的硬门槛、软实力与倒推升学择校标准将在手册下一版补齐。</p>
          </div>
        </div>`;
    }

    return `
      <div class="careers__panel">
        <div class="careers__panel-head">
          <span class="careers__panel-num">${c.num}</span>
          <h3 class="careers__panel-title">${c.name} <span class="u-en">${c.nameEn}</span></h3>
          <span class="badge badge--brand">手册深度拆解</span>
        </div>
        ${c.alias ? `<p class="careers__panel-alias">${c.alias}</p>` : ''}

        <div class="careers__cols">
          <section class="careers__block">
            <h4 class="careers__block-title">成功入职案例 <span class="u-en">SUCCESS CASE</span></h4>
            <dl class="careers__case">
              <dt>背景</dt><dd>${c.case.bg}</dd>
              <dt>经历</dt><dd>${c.case.exp}</dd>
              <dt>结果</dt><dd class="is-strong">${c.case.rs}</dd>
            </dl>
          </section>

          <section class="careers__block">
            <h4 class="careers__block-title">硬门槛 <span class="u-en">HARD REQUIREMENTS</span></h4>
            <dl class="careers__hard">
              ${c.hard.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
            </dl>
          </section>

          <section class="careers__block">
            <h4 class="careers__block-title">软实力 <span class="u-en">SOFT SKILLS</span></h4>
            <div class="plate__tags">${c.soft.map(s => `<span class="badge">${s}</span>`).join('')}</div>
          </section>
        </div>

        <section class="careers__block careers__block--wide">
          <h4 class="careers__block-title">倒推升学择校标准 <span class="u-en">SCHOOL MATCHING</span></h4>
          <div class="careers__schools">
            ${c.schools.map(s => `
              <div class="school-card">
                <span class="school-card__region">${s[3]}</span>
                <span class="school-card__name">${s[0]}</span>
                <span class="school-card__major u-en">${s[1]}</span>
                <span class="school-card__core">${s[2]}</span>
              </div>`).join('')}
          </div>
        </section>
      </div>`;
  }
};

/* ═══════════ 初始化 ═══════════ */
(async () => {
  try {
    await loadData();
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="padding:14px 40px;background:#C0243B;color:#fff;font:14px/1.6 sans-serif">' +
      '数据加载失败：请通过 HTTP 服务访问（例如 <code>python3 -m http.server</code>），或确认 <code>data/site-data.js</code> 已随页面一同加载。</div>');
    return;
  }

  Header.build();
  Footer.build();
  HeroVideo.init();   // 首页主视觉视频：视口观察 + 自动播放策略兜底

  // 拦截站内跳转：#/xxx 只在当前文档内切视图，绝不发起文档导航
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a) return;
    e.preventDefault();
    document.querySelector('.navbar').classList.remove('is-mobile-open');
    Router.go(a.getAttribute('href'));
  });

  window.addEventListener('hashchange', () => Router.apply());
  Router.apply();
})();
