/* 首页 Hero 影像：整屏铺满 + 静音自动播放 + 50% 音量 + 离场立即停播停声

   状态模型（把「用户的意愿」和「实际是否出声」分开，避免两者错位）：
     wantSound  用户是否要声音（仅由右下角图标点击切换）
     should    = 在首页 && Hero 在视口内 && 页面可见   → 视频该播
     soundOn   = should && wantSound                  → 实际是否出声

   ① 声音默认关闭：刷新页面、点左上角 logo（或任何方式回到 #/home）都会把
      wantSound 复位为 false —— 视频照常自动播放，但保持静默，不继承上一次的开声状态。
   ② 图标状态（aria-pressed）永远等于 soundOn（实际是否出声），
      所以「滚动离开主页 / 切到其它页面模块 / 标签页切后台」时，
      音频静默的同时图标同步显示为静默样式，不会出现「静音却显示有声」。
   ③ 图标只属于首页：离开首页即收起；仍在主页但滚出 Hero 时保留，
      让用户能看到状态，点击时先回到 Hero 再出声（否则点了没画面）。

   should 的触发源：路由 hashchange、视图 .is-active 变化（MutationObserver）、
   滚动、视口尺寸变化、标签页可见性变化。
   规则：
   ① 影像层用 position:fixed 铺满视口（CSS 侧），故可见性判定必须盯 Hero 区块本身，
      不能盯 <video>（fixed 元素永远与视口相交，判定会失真）
   ② 音量固定为满量程的 50%（v.volume = .5）
   ③ 离开首页 / 下滑离开 Hero / 标签页切到后台 → 立即 pause()，
      并额外置 muted = true 双保险，杜绝残留音频 */
(function () {
  var v = document.getElementById('hero-video');
  var btn = document.getElementById('hero-sound');
  if (!v) return;

  var home = document.getElementById('view-home');
  var section = v.closest('.hero--video') || v.closest('.hero') || home;
  var VOLUME = 0.5;

  v.volume = VOLUME;
  var wantSound = false;   // 用户是否要声音（刷新 / 回到主页都会复位为 false）
  var inView = true;
  var lastSoundOn = false; // 最近一次同步给图标的状态，供 volumechange 回查

  function play() {
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }

  function isHome() {
    return home ? home.classList.contains('is-active') : true;
  }

  function sync(soundOn) {
    lastSoundOn = !!soundOn;
    if (!btn) return;
    btn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    btn.setAttribute('aria-label', soundOn ? '关闭影像声音' : '开启影像声音');
  }

  function apply() {
    var onHome = isHome();
    var should = onHome && inView && !document.hidden;
    var soundOn = should && wantSound;    // 实际是否出声

    if (section) section.classList.toggle('is-idle', !should);

    if (should) {
      v.volume = VOLUME;
      v.muted = !soundOn;
      if (v.paused) play();
    } else {
      v.pause();
      v.muted = true;                     // 双保险：暂停之外再掐掉声音输出
    }

    /* 图标只属于首页 —— 离开首页（切到其它页面 / 模块）就收起；
       仍在主页但滚出 Hero 时保留，用于显示并恢复声音状态 */
    if (btn) btn.hidden = !onHome;
    sync(soundOn);
  }

  /* 回到主页：视频自动播放，但声音一律复位为静默（不继承上次的开声状态） */
  function resetToHome() {
    wantSound = false;
    apply();
  }

  if (btn) {
    btn.addEventListener('click', function () {
      wantSound = !wantSound;
      /* 已滚出 Hero 时先回到顶部，否则开了声却看不到画面 */
      if (wantSound && !inView && isHome()) {
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
      }
      apply();
    });
  }
  v.addEventListener('volumechange', function () { sync(lastSoundOn); });

  if ('IntersectionObserver' in window && section) {
    new IntersectionObserver(function (es) {
      inView = !!es[0].isIntersecting;
      apply();
    }, { threshold: 0 }).observe(section);
  }
  window.addEventListener('scroll', apply, { passive: true });
  window.addEventListener('resize', apply);
  window.addEventListener('hashchange', function () {
    /* 回主页 → 复位静默；去其它页面 → 按离场处理（暂停 + 静音 + 收起图标） */
    if (isHome()) resetToHome(); else apply();
  });
  document.addEventListener('visibilitychange', apply);

  // 视图切换靠 .view.is-active 类名变化，无 hashchange 也要重算
  if (home && 'MutationObserver' in window) {
    new MutationObserver(function () {
      if (isHome()) resetToHome(); else apply();
    }).observe(home, { attributes: true, attributeFilter: ['class'] });
  }

  /* 已在首页时点左上角 logo 不会触发 hashchange（hash 未变），单独兜底 */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var a = t && t.closest ? t.closest('a[href="#/home"], .navbar__logo') : null;
    if (!a) return;
    wantSound = false;
    setTimeout(apply, 0);              // 等路由切完视图 / 滚回顶部后再重算
  }, true);

  v.addEventListener('error', function () { if (btn) btn.hidden = true; });
  apply();
})();
