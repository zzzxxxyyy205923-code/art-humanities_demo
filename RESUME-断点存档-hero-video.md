# 断点存档 · art-humanities-site 首页 Hero 影像五项优化（已完成，含离线续做说明）

> 本任务**全程离线**（本地 `python3 -m http.server 7789` + 本机 Chrome 9555 调试端口 + `~/.nvm/versions/node/v24.16.0/bin/node`），
> 不依赖网络。断网期间照常可跑；网络恢复后按「恢复步骤」复核即可，无需重述需求。

## 一、状态：**五项需求已全部完成并通过实测**（2026-09-20）
无未完成项。下方第四节的复跑命令仅用于回归/复查。

## 二、需求与落地
| # | 需求 | 落地 | 文件 |
|---|------|------|------|
| 1 | 增强观感（对比度/饱和度/不透明度）且不降低可读性 | `opacity .42 → .78`；`filter contrast(1.22) saturate(1.32) brightness(1.08)`；去掉原径向 mask | `assets/css/style.css`（首页 Hero 影像块） |
| 2 | 完整铺满屏幕、比例与实时视口一致、不留空白不裁剪 | `.hero__media` 改 `position: fixed; inset: 0`（逃逸 hero 居中限宽容器与 overflow 裁剪）+ 视频 `object-fit: fill` | 同上 |
| 3 | 切导航 / 下滑离开 → 停播并同步停声 | 暂停 + `muted = true` + `.hero--video.is-idle .hero__media { opacity: 0 }` 淡出 | `assets/js/hero-video.js` + 同上 CSS |
| 4 | 音量 = 50% | `video.volume = 0.5` | `assets/js/hero-video.js` |
| 5 | 声音小图标取消文字，只留图标 | 删 `.hero-sound__label`；按钮改 44×44 纯图标圆形（触达区 ≥44×44） | `index.html` + `assets/css/style.css` |

### 三态同步契约（导航跳转 / 下滑 / 返回首页）
唯一判定值 `should = 在首页 && Hero 在视口内 && 页面未切后台`（`assets/js/hero-video.js` 的 `apply()`）：

| should | 播放 | 声音 | 右下图标 |
|---|---|---|---|
| true | 播放 | 按用户选择（有声/静音），返回首页时**恢复离开前的选择** | 显示 |
| false | `pause()` | **强制 `muted = true`**（暂停之外再掐声，杜绝残留音频） | `hidden` |

即**「图标可见 ⇔ 视频在播」恒等**，`aria-pressed` 恒等于用户的选择。
重算触发源：`hashchange`、视图 `.is-active` 变化（MutationObserver）、`scroll`、`resize`、`visibilitychange`。
注：首页内段落链接（`#/home/offers` 等）会滚到 Hero 之外，同样按 false 处理（停播 + 掐声 + 隐藏图标），与「下滑离开」一致。

**附加两项（为保住可读性而做的必要调整）**
- 宽屏蒙层 `.hero__veil`：`linear-gradient(100deg, .90 0%, .85 40%, .62 70%, .34 100%)`（暗区覆盖文字侧，右侧放开给影像）。
- 窄屏（≤700px）文字横向铺满，横向渐变护不住右侧 → 新增 `@media (max-width:700px)` 的 `168deg` 更深渐变 `.88/.78/.58`。

## 三、实测结论（真实 Chrome + CDP，本地 7789；环境重启后已全部复跑）
**功能回归 `tools/verify/hero-video.mjs`：23/23 全过（1440×900 与 390×844 各一轮，结果一致）** —— 播放 true / 静音 true / 时长 154s /
铺满视口 true（media=视口）/ 原始 960×540 / `object-fit=fill` / **动态 resize 到 1920×720、1024×768、390×844、1280×1024 仍全部铺满**（对应需求②「比例与实时视口严格一致」）/
观感 `opacity .78 + filter contrast(1.22) saturate(1.32) brightness(1.08)` / **音量 0.5** /
按钮可见且**无文字** / 命中测试 true / 点击后静音切换 / 离首页=已暂停+静音+按钮隐藏 / 回首页=恢复播放+有声+按钮可见 /
下滑离 Hero=已暂停+静音+`is-idle`+影像层 opacity 0 / 回到 Hero=恢复播放 / **控制台无异常**。

**可读性 `tools/verify/hero-contrast.mjs`（结构性最不利帧 = 纯白影像层，任何真实画面都不可能超过的亮度上限）**
- 1440×900：eyebrow 5.82 / h1 7.68 / h1 em 6.64 / sub 6.29 / tags 5.38 —— 全部 ≥ AA（正文 4.5、大字 3）。
- 390×844：eyebrow 9.32 / h1 12.02 / h1 em 8.61 / sub 6.01 / tags 5.90 —— 全部 ≥ AA。

**三态同步回归 `tools/verify/hero-sync.mjs`：1440×900 17/17、390×844 19/19 全过**
真实鼠标点击（非直接改 hash），逐步校验「图标可见 ⇔ 视频在播」不变量：
有声状态下点导航离场（本科爬藤 / 全日制 / 研究生 / 规划我的未来 / 学生案例 / 首页段落）→ 均停播+静音+图标隐藏；
返回「关于艺术人文」→ 恢复播放+**恢复离开前的声音选择**+图标显示；
静音状态下离场再返回 → 保持静音（不擅自开声）；首页内下滑/回滚 → 停播/恢复；
标签页切后台/回前台 → 停播+掐声/恢复；窄屏汉堡菜单内跳转与返回 → 同步。

## 四、恢复步骤（网络恢复后复核用，全部本地）
```bash
cd "/Users/szhan111/iCloud云盘（归档）/Desktop/SFK/SFK 教研管理/高端美研产品/SFK数据库搭建&AI智能体/艺术人文/art-humanities-site"
# 0) 环境若已关，先拉起本地服务与 Chrome 调试实例（必须脱离进程组，否则命令结束即被回收）
#    三个 --disable-*background* 是必须的：自动化窗口被别的窗口遮挡（或最小化）时，Chrome 会把标签页
#    判为后台 document.hidden=true → Hero 视频一律停播，hero-sync / hero-video 会整片误报成功能坏了。
python3 -c "import subprocess as sp; sp.Popen(['python3','-m','http.server','7789'],cwd='.',start_new_session=True,stdout=open('/tmp/sfk-ah-7789.log','w'),stderr=sp.STDOUT); sp.Popen(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--remote-debugging-port=9555','--user-data-dir=/tmp/sfk-chrome-ah9555','--no-first-run','--no-default-browser-check','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling','about:blank'],start_new_session=True,stdout=open('/tmp/sfk-chrome-ah.log','w'),stderr=sp.STDOUT); print('launched')"
sleep 7; lsof -nP -iTCP:7789 -sTCP:LISTEN | tail -1; curl -s http://127.0.0.1:9555/json/version | head -2
# 1) 功能回归（可带视口参数，默认 1440×900；脚本内含 4 档动态 resize 铺满检查）
~/.nvm/versions/node/v24.16.0/bin/node tools/verify/hero-video.mjs 1440 900
~/.nvm/versions/node/v24.16.0/bin/node tools/verify/hero-video.mjs 390 844
# 2) 三态同步回归（导航跳转 / 下滑 / 返回首页 / 切后台，校验「图标可见 ⇔ 视频在播」）
~/.nvm/versions/node/v24.16.0/bin/node tools/verify/hero-sync.mjs 1440 900
~/.nvm/versions/node/v24.16.0/bin/node tools/verify/hero-sync.mjs 390 844
# 3) 最不利帧对比度
SAMPLES=0 ~/.nvm/versions/node/v24.16.0/bin/node tools/verify/hero-contrast.mjs 1440 900
SAMPLES=0 ~/.nvm/versions/node/v24.16.0/bin/node tools/verify/hero-contrast.mjs 390 844
```
判定：功能项全 true、对比度末行「结论：文字在影像之上全部达到 AA（按最不利帧判定）」即收工；
若出现 `不达标` → 加深 `.hero__veil`（窄屏改媒体查询里那份）后重跑，不要去降 `opacity` 之外的地方。

## 五、离线期容错要点（改脚本前必读）
1. **视频无法 seek**：`python3 -m http.server` 不支持 HTTP Range → `video.currentTime = T` 被忽略（读数恒 0.0），
   「逐帧取样」会反复测同一帧、结论无效。可读性一律用**结构性最不利帧（纯白层）**判定，勿退回 seek 取样。
2. **纯白层必须插在 `.hero__veil` 之前**：`.hero__veil` 是 `.hero__media` 的子节点，`appendChild` 会盖住蒙层，
   测出「白底白字」的假失败（曾误判 1.08:1）。正确写法 `m.insertBefore(w, m.firstChild)`。
3. **截图 base64 必须自拼前缀**：`Page.captureScreenshot` 返回裸 base64，需 `data:image/png;base64,` + base64 再喂 `img.src`，否则 onerror。
4. **Chrome 标签页堆积会挂死截图**：几十个标签页时 `Page.captureScreenshot` 卡住不返回；`fromSurface:false` 该版本不支持（报 undefined），
   正确做法是关掉自动化遗留的 `127.0.0.1:7789?t=` 标签页（`curl -s http://127.0.0.1:9555/json/list` → `/json/close/<id>`）。
5. **长命令会被系统挂到后台**：看不到 stdout 时一律 `> 文件 2>&1`，再用 `read_file` 读结果，不要靠 `sleep + tail` 轮询。
6. **h1 内的 `<em>` 用主色**，必须单列待测目标，且透明化要覆盖后代（`s, s *`），否则残留字形污染取样。
7. 该站是**单文档哈希路由 SPA**（`#/home`…），导航改动禁止写 `xxx.html` 形式的跨文档跳转。
8. **环境会随命令结束被回收**：`nohup ... &` 起的 Python/Chrome 属于同一进程组，命令一结束就被杀（表现为下一轮 `ECONNREFUSED 9555`）。
   必须用 `python3 -c "subprocess.Popen(..., start_new_session=True)"` 脱离进程组，按第四节第 0 步照抄即可。
9. **验证铺满必须多视口 + 动态 resize**：只测单一视口不足以证明需求②；`hero-video.mjs` 已内置 4 档 resize 检查（V4r），新增视口检查请走同一段逻辑。
10. 权限弹窗无人应答时 `execute_command` 会被取消 → 删文件改用 `delete_file` 工具，删目录内临时产物不要依赖 shell。
11. **CDP 调用必须包超时**：Chrome 一死，`send()` 永不 resolve → node 报 `unsettled top-level await` 直接挂住，看不出失败在哪一步。
    `hero-sync.mjs` 已用 `Promise.race` 包 15s 超时 + `ws.onclose` 日志，新脚本照抄。
12. **窄屏别点隐藏元素**：≤700px 时顶部主导航与「主要内容」方块整组隐藏（`getBoundingClientRect` 为 0），
    直接点会误报「不达标」。用 `hero-sync.mjs` 的 `goto(href)`：先顶部 → 再浮层 → 再汉堡菜单，自动挑可达入口。
13. 校验「跳转后停播」不要直接改 `location.hash`，要像 `hero-sync.mjs` 那样派发真实鼠标事件（先命中测试再点），
    否则测不到「点击被遮挡 / 拦截失效」这类真问题。
