/* 首页 Hero 影像：整屏铺满 + 静音自动播放 + 50% 音量 + 离场立即停播停声
   三态同步（唯一判定值 should = 在首页 && Hero 在视口内 && 页面可见）：
     should=true  → 播放 + 按用户选择决定有声/静音 + 右下图标显示
     should=false → 暂停 + 强制静音 + 右下图标隐藏
   即「图标可见 ⇔ 视频在播」，两者永不错位；图标状态（aria-pressed）始终等于用户的选择。
   should 由这些触发源重算：路由 hashchange、视图 .is-active 变化（MutationObserver）、
   滚动、视口尺寸变化、标签页可见性变化。
   规则：
   ① 影像层用 position:fixed 铺满视口（CSS 侧），故可见性判定必须盯 Hero 区块本身，
      不能盯 <video>（fixed 元素永远与视口相交，判定会失真）
   ② 音量固定为满量程的 50%（v.volume = .5）
   ③ 离开首页 / 下滑离开 Hero / 标签页切到后台 → 立即 pause()，
      并额外置 muted = true 双保险，杜绝残留音频；回到首页再恢复用户原本的声音选择 */
(function () {
  var v = document.getElementById('hero-video');
  var btn = document.getElementById('hero-sound');
  if (!v) return;

  var home = document.getElementById('view-home');
  var section = v.closest('.hero--video') || v.closest('.hero') || home;
  var VOLUME = 0.5;

  v.volume = VOLUME;
  var wantSound = false;   // 用户是否要声音（与「离场时的临时静音」区分开）
  var inView = true;

  function play() {
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }

  function sync() {
    if (!btn) return;
    btn.setAttribute('aria-pressed', wantSound ? 'true' : 'false');
    btn.setAttribute('aria-label', wantSound ? '关闭影像声音' : '开启影像声音');
  }

  function apply() {
    var onHome = home ? home.classList.contains('is-active') : true;
    var should = onHome && inView && !document.hidden;

    if (section) section.classList.toggle('is-idle', !should);

    if (should) {
      v.volume = VOLUME;
      v.muted = !wantSound;          // 回到首页时恢复用户原本的声音选择
      if (v.paused) play();
    } else {
      v.pause();
      v.muted = true;                // 双保险：暂停之外再掐掉声音输出
    }

    if (btn) btn.hidden = !should;
    sync();
  }

  if (btn) {
    btn.addEventListener('click', function () {
      wantSound = !wantSound;
      apply();
    });
  }
  v.addEventListener('volumechange', sync);

  if ('IntersectionObserver' in window && section) {
    new IntersectionObserver(function (es) {
      inView = !!es[0].isIntersecting;
      apply();
    }, { threshold: 0 }).observe(section);
  }
  window.addEventListener('scroll', apply, { passive: true });
  window.addEventListener('resize', apply);
  window.addEventListener('hashchange', apply);
  document.addEventListener('visibilitychange', apply);
  // 视图切换靠 .view.is-active 类名变化，无 hashchange 也要重算
  if (home && 'MutationObserver' in window) {
    new MutationObserver(apply).observe(home, { attributes: true, attributeFilter: ['class'] });
  }
  v.addEventListener('error', function () { if (btn) btn.hidden = true; });
  apply();
})();
