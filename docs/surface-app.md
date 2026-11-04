# DSH 主界面（应用外壳）DOM/CSS 结构与 opencode 化改造清单

> 任务：`task-2` · 产出文件：`.research-opencode-ui/surface-app.md`
> 目标风格：`.research-opencode-ui/opencode-tokens.md`
> 证据来源：asar 内 `dsh/node_modules/@deepseek-ai/dsh-client-ui-*/lib/client.js` 的**内联 CSS 字符串与 JSX**，
> 以及 `dsh-web-frontend/dist/index.html` + `assets/index-BNYAYEM7.css`。
> 提取日期：2026-11-04。本文档中所有类名后缀均来自真实读到的源码。

## 0. 阅读约定

| 标记 | 含义 |
|---|---|
| **【已核实】** | 直接来自源码字符串/JSX 的原文，附有类名后缀或选择器 |
| **【推测】** | 由已核实事实推导的设计判断，未经运行时验证 |
| **【冲突】** | 任务描述或既有假设与源码不符，已就地更正 |

**类名约定（已核实）**：CSS Modules 生成 `<hash>_<name>`，hash 是 6 位 base62。
每个 bundle 里都有一张 `var X_module_css_default = {"name": "<hash>_<name>"}` 映射表，
hash 每次构建都会变，**name 后缀稳定**。因此选择器一律用 `[class$="_name"]`，
但**必须加祖先限定**（原因见 §8.1，这是本次最大的技术风险）。

本次统计口径：`ui-layout`、`ui-sidebar`、`ui-chat`、`ui-conversation`、`ui-sidebar-right`、
`ui-workspace`、`ui-model-selection`、`ui-input-trigger` 共 **8 个 UI bundle**（外加 `ui-theme`）：
**34 个独立 hash 前缀（模块）**、**303 个类名后缀**，其中 **32 个后缀被 ≥2 个模块复用**。

**口径说明【已核实】**：`ui-tool` 的 CSS 不在上述 8 个 bundle 内，是单独提取后读的，
额外贡献 **3 个模块**（`UHhYua` ToolRow / `mehola` ToolCallTree / `KJhiDa` ExitCodeBadge）
及其后缀（见 §4.5）。因此全局碰撞统计实际为 **37 个模块**；
已单独核对过：`_ioCard`、`_callRow`、`_subCalls`、`_badge`、`_dot` 在 `ui-tool` 内唯一，
但 `_root`/`_leading`/`_title`/`_summary`/`_body` 等在 `ui-tool` 中也存在，
所以 §9.1 的结论只会更严重，不会更轻。

---

## 1. 应用外壳骨架

### 1.1 `#root` 之上的层级 **【已核实】**

`dsh-web-frontend/dist/index.html`：

```html
<body>
  <div id="root"></div>
</body>
```

`assets/index-BNyAYEM7.css` 末尾：

```css
html,body,#root{height:100%;margin:0}
body{font-family:var(--dsw-font-family, -apple-system, …);-webkit-font-smoothing:antialiased;color:var(--dsw-alias-label-primary,#0f1115);background:var(--dsw-alias-bg-base,#fff);text-autospace:normal}
html[data-platform=darwin],html[data-platform=darwin] body{background:transparent}
html[data-platform=darwin] body{isolation:isolate}
```

**注意**：macOS 下 `html`/`body` 背景是 `transparent`，真正的底色画在
`[class$="_frame"]`（`PIRFFq_frame`）和 `[class$="_sidebarCol"]` 上。
所以「改 app 背景」必须打到 frame / sidebarCol，改 `body` 在 macOS 上无效。

### 1.2 外壳容器 **【已核实】**

`ui-layout/lib/client.js` → `AppFrame`，注册进内置 `root` 槽位（web shell 只渲染 `root`）。

DOM 树（由 JSX 逐行读出，`children` 顺序即 DOM 顺序）：

```
div.PIRFFq_frame                       ← grid，三列 + 两行
├─ div.PIRFFq_sidebarCol               ← 侧栏列（grid-area 1/1）
│   └─ <sidebar slot>                  → SidebarRoot (kB3qhq_root)
├─ div.PIRFFq_centerCol                ← 中列（flex column）
│   └─ <main slot>                     → ConversationRoot (kiGsTW_root)
├─ div.PIRFFq_rightbarCol              ← 右列，data-rightbar-col
│   └─ <rightbar slot>                 → SidebarRight (Dv5QdW_panel)
├─ div.PIRFFq_bottomRow                ← data-shell-bottom，grid-column:1/-1
│   └─ <shell.bottom slot>
├─ div.PIRFFq_overlayLayer             ← data-shell-overlay，z-index:20
│   └─ <shell.overlay slot>
├─ div.PIRFFq_leadingSeat              ← data-shell-leading，仅 darwin 且侧栏折叠时挂载
│   └─ <shell.leading slot>            → HeaderLeadingControls (xoYuoq_controls)
├─ div.PIRFFq_handle[data-side=sidebar]   ← 侧栏拖拽把手（未折叠时）
└─ div.PIRFFq_handle[data-side=rightbar]  ← 右栏拖拽把手
```

`frame` 上的状态属性（可用于 CSS 分支） **【已核实】**：
`data-sidebar-collapsed`、`data-rightbar-collapsed`、`data-rightbar-fullscreen`、
`data-rightbar-instant`、`data-dragging`、`data-animating`。

### 1.3 布局方式与尺寸 **【已核实】**

`PIRFFq_frame` 原始规则：

```css
background:var(--dsw-alias-bg-base);
grid-template-rows:minmax(0,1fr) auto;
height:100%; display:grid; position:relative; overflow:hidden;
```

列宽由 JS 内联写入（`AppFrame.js`）：

```js
gridTemplateColumns: `${cols.sidebar}px minmax(${cols.rightbar===0?0:400}px, 1fr) minmax(0px, ${rightbarMax}px)`
```

求解逻辑（`computeColumns`，已核实常量）：

| 量 | 值 |
|---|---|
| 侧栏自动折叠断点 | `SIDEBAR_AUTO_COLLAPSE = 1024` px |
| 侧栏展开宽 | clamp(264, 420)，默认 280 |
| 侧栏折叠宽 | darwin / windows-titlebar → **0**；其他平台 → **56**（图标 rail） |
| 右栏宽 | clamp(300, viewport × 0.7)，首次打开默认 viewport × 0.45 |
| 中列最小宽 | 右栏无轨道时可为 0；有轨道时 `minmax(400px,1fr)` |

```css
.PIRFFq_sidebarCol{background:var(--dsw-specific-sidebar-fill);border-right:.5px solid var(--dsw-alias-border-l3);min-width:0;overflow:hidden}
.PIRFFq_centerCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}
.PIRFFq_rightbarCol{min-width:0;position:relative;overflow:visible}
.PIRFFq_bottomRow{background:var(--dsw-alias-bg-base);grid-column:1/-1;min-width:0;min-height:0;overflow:auto}
.PIRFFq_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}
.PIRFFq_overlayLayer>*{pointer-events:auto}
.PIRFFq_handle{cursor:col-resize;z-index:11;touch-action:none;width:8px;margin-left:-4px;position:absolute;top:0;bottom:0}
.PIRFFq_leadingSeat{z-index:15;-webkit-app-region:no-drag;align-items:center;display:flex;position:absolute;top:11px;left:88px}
```

darwin 专属（**这块是「彩色侧栏」的元凶**） **【已核实】**：

```css
[data-platform=darwin] .PIRFFq_frame{background:0 0}
[data-platform=darwin] .PIRFFq_sidebarCol{
  background:linear-gradient(to bottom,#7a9bf01a,#7a9bf000 35%,#8f89b800 68%,#8f89b817),
             color-mix(in srgb, color-mix(in srgb, var(--dsw-specific-sidebar-fill) 97%, #7a9bf0) 40%, transparent);
  border-right:none}
[data-platform=darwin] [data-ds-dark-theme] .PIRFFq_sidebarCol{
  background:linear-gradient(to bottom,#7a9bf014,#7a9bf000 35%,#8f89b800 68%,#8f89b812),
             color-mix(in srgb, var(--dsw-specific-sidebar-fill) 50%, transparent)}
[data-platform=darwin] .PIRFFq_centerCol{background:var(--dsw-alias-bg-base);border-left:.5px solid var(--dsw-alias-border-l3)}
[data-platform=darwin] [data-sidebar-collapsed] .PIRFFq_centerCol{border-left:none}
@media (prefers-reduced-transparency:reduce){ …90% 不透明回退… }
```

> 本机是 macOS，`html[data-platform=darwin]` 生效，侧栏是**半透明紫蓝渐变**，
> 与 opencode 的纯色 `#fafafa`/`#161616` 平面直接冲突。这是必须显式覆盖的第一条规则。

### 1.4 主题切换机制 **【已核实】**

`ThemePresenter`（`ui-layout`）写入：

- `document.documentElement.style.colorScheme`
- `document.documentElement[data-ds-theme-source]`（`system` 或解析后的 scheme）
- `body[data-ds-dark-theme]`（**空字符串属性**，暗色时存在，浅色时移除）
- `body.style` 上逐个 token 变量（`--dsw-*`），来自 `ctx.theme` 快照
- `body.style --dsh-content-font-size / --dsh-code-font-size / --dsh-terminal-font-size`
- `body.style --dsh-font-family-text / -code / -terminal`

**结论**：暗色分支一律写 `body[data-ds-dark-theme] …`，
**不要**用 `@media (prefers-color-scheme: dark)`——用户可以把主题固定成 light/dark，
此时 media query 与实际调色板不一致。

---

## 2. 侧栏

包：`ui-sidebar`，根组件 `SidebarRoot`，hash `kB3qhq`。

### 2.1 结构 **【已核实】**

```
div.kB3qhq_root[+ collapsed][+ railIn][+ fading][+ quietBars]
├─ div.kB3qhq_topStrip                 ← 高度 52px，右对齐
├─ div.kB3qhq_logoRow                  ← 品牌行 ★插件当前隐藏
│   └─ button.kB3qhq_brand[+ wide]
│       └─ span.kB3qhq_brandIdentity
│           ├─ span.kB3qhq_brandMark   ← <sidebar.brand.mark> 槽位，fallback FishLogo
│           └─ span.kB3qhq_brandName[+ wide]  ← <sidebar.brand.name> 槽位
│               └─ (fallback) span.kB3qhq_fallbackBrandName
│               └─ (local build) span.kB3qhq_localBuildBrand > span.kB3qhq_localBuildTitle / span.kB3qhq_buildVersion
├─ button.kB3qhq_newSession            ← ★插件当前隐藏（确认是 <button>）
│   └─ span.kB3qhq_newSessionLabelMask
│       └─ span.kB3qhq_newSessionContent
│           ├─ IconNewChatOutlineMedium/Regular
│           └─ span.kB3qhq_newSessionLabel[+ wide]
│   └─ span.kB3qhq_newSessionShortcut  ← ShortcutKeys，hover 才 opacity:1
├─ nav.kB3qhq_panelList                ← <sidebar.panellist> 槽位
│   └─ (More 时) div.kB3qhq_moreAnchor > button.kB3qhq_panelRow
│   └─ button.kB3qhq_panelRow[+ panelActive]  > span.kB3qhq_panelGlyph / span.kB3qhq_panelTitle
├─ div.kB3qhq_regionArea               ← <sidebar.workspaces> 槽位 ★会话列表在这里
│   └─ (ui-workspace) Rows → JoiKIa_* 见 §2.4
└─ div.kB3qhq_footArea
    ├─ div.kB3qhq_footerActions        ← <sidebar.footer.action> 槽位
    └─ div.kB3qhq_settingsArea         ← <sidebar.settings> 槽位
```

`collapsed` 同时挂 `railIn`（进入动画）与 `fading`（淡出）**【已核实】**。
`toggle` 按钮（`button.kB3qhq_iconButton.kB3qhq_toggle`）只在
`!wide`（即折叠态）时渲染 `span.kB3qhq_railMark` / `span.kB3qhq_panelIcon`。

### 2.2 关键尺寸/颜色 **【已核实】**

```css
.kB3qhq_root{--dsh-sidebar-inline-padding:12px;height:100%;
  padding:6px var(--dsh-sidebar-inline-padding);box-sizing:border-box;
  background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary);
  flex-direction:column;font-size:14px;display:flex}
[data-platform=darwin] .kB3qhq_root{background:0 0}          /* 让 darwin 渐变透出 */
.kB3qhq_root.kB3qhq_collapsed{padding:18px 10px 6px}

.kB3qhq_topStrip{box-sizing:border-box;height:52px;margin:-6px -12px 0;flex:none;
  justify-content:flex-end;align-items:center;padding:0 12px 2px;display:flex}
.kB3qhq_topStrip+.kB3qhq_logoRow{margin-top:-12px}

.kB3qhq_logoRow{box-sizing:border-box;flex:none;justify-content:flex-end;align-items:center;
  gap:8px;height:60px;margin-bottom:4px;padding:8px 0 8px 4px;display:flex;overflow:hidden}
.kB3qhq_collapsed .kB3qhq_logoRow{justify-content:flex-start;height:36px;margin-bottom:12px;padding:0;overflow:visible}

.kB3qhq_brandName{letter-spacing:.04em;align-items:center;gap:6px;height:24px;
  font-size:18px;font-weight:600;line-height:24px;display:inline-flex}
.kB3qhq_fallbackBrandName{letter-spacing:0;white-space:nowrap;font-size:17px}
.kB3qhq_buildVersion{height:10px;font-size:6px;line-height:10px;border-radius:2px;padding:0 3px;
  background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-inverted);
  font-family:var(--ds-font-family-code)}

.kB3qhq_newSession{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);
  border-radius:var(--dsw-radius-md);background:var(--dsw-alias-button-elevated-fill);
  height:38px;color:var(--dsw-alias-label-primary);cursor:pointer;flex:none;
  justify-content:center;align-items:center;gap:0;margin:0 2px 12px;padding:8px 12px;
  font-size:14px;font-weight:500;line-height:22px;display:flex;position:relative;
  overflow:hidden;container-type:inline-size}
.kB3qhq_newSession:hover{background:var(--dsw-alias-button-floating-hover)}
[data-platform=darwin] .kB3qhq_newSession{background:#ffffff8c}
[data-platform=darwin] [data-ds-dark-theme] .kB3qhq_newSession{background:#ffffff26}
.kB3qhq_collapsed .kB3qhq_newSession{background:0 0;border-color:#0000;align-self:flex-start;
  gap:0;width:36px;height:36px;margin:0 0 12px;padding:0}

.kB3qhq_panelList{flex-direction:column;flex:none;gap:2px;margin-bottom:8px;display:flex}
.kB3qhq_panelRow{box-sizing:border-box;border-radius:var(--dsw-radius-md);min-height:36px;
  color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;
  background:0 0;border:none;align-items:center;gap:8px;margin:0 2px;padding:7px 8px;
  line-height:22px;display:flex}
.kB3qhq_panelRow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.kB3qhq_panelRow.kB3qhq_panelActive{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.kB3qhq_collapsed .kB3qhq_panelList{gap:12px;margin-bottom:12px}
.kB3qhq_collapsed .kB3qhq_panelRow{width:36px;height:36px;justify-content:center;margin:0;padding:0}

.kB3qhq_regionArea{min-height:0;margin-left:-4px;margin-right:calc(-1 * var(--dsh-sidebar-inline-padding));
  flex-direction:column;flex:1;padding-left:4px;display:flex;overflow:hidden}
.kB3qhq_footArea{flex-direction:column;flex:none;display:flex}
.kB3qhq_settingsArea,.kB3qhq_footerActions{flex:none;width:100%;min-width:0}
.kB3qhq_footerActions{display:flex}

.kB3qhq_iconButton{border-radius:var(--dsw-radius-sm);cursor:pointer;width:28px;height:28px;
  color:var(--dsw-alias-label-secondary);background:0 0;border:none;flex:none;
  justify-content:center;align-items:center;padding:0;display:inline-flex;position:relative}
.kB3qhq_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}
.kB3qhq_collapsed .kB3qhq_iconButton{border-radius:var(--dsw-radius-md);width:36px;height:36px;color:var(--dsw-alias-label-primary)}
```

滚动条变量：`--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2)`，
`quietBars` 时置为 `transparent` **【已核实】**。

### 2.3 折叠态 / 平台差异 **【已核实】**

- 折叠宽在 darwin 是 **0**，不是 56 → 折叠时侧栏整列消失，由
  `PIRFFq_leadingSeat`（top:11px; left:88px）承载 `HeaderLeadingControls`。
- `[data-windows-titlebar]` 下一大串特例（`logoRow` 高度 40px、`toggle` 改 `position:fixed`、
  `newSession` 在折叠态 `position:fixed; left:48px`）。**Windows 专属，本机 macOS 不生效**，
  但改造时若用 `!important` 覆盖 `.kB3qhq_newSession`，Windows 下会破坏 fixed 定位，需注意。
- 折叠态 `regionArea` / `panelList` / `footArea` 在 Windows titlebar 下 `display:none`。

### 2.4 会话列表项（`ui-workspace` → `Rows`，hash `JoiKIa`） **【已核实】**

```
div.JoiKIa_projectRow[+ selected][+ menuOpen][+ archived][+ dropBefore/After]   ← 工作区分组行，高 34px
  ├─ span.JoiKIa_slot > (chevron/folder/dot)
  ├─ div.JoiKIa_projectText > div.JoiKIa_title / div.JoiKIa_meta
  └─ span.JoiKIa_rowActions > button.JoiKIa_iconButton
button.JoiKIa_sessionRow[+ selected][+ menuOpen][+ archived][+ dropBefore/After] ← 会话行，高 32px
  ├─ span.JoiKIa_slot
  ├─ span.JoiKIa_title[data-scrolled][data-clipped]
  ├─ span.JoiKIa_time            ← 10px，hover 时隐藏
  ├─ span.JoiKIa_pinIndicator    ← hover 时隐藏
  └─ span.JoiKIa_rowActions      ← 默认 display:none，hover/menuOpen 才 inline-flex
button.JoiKIa_searchResultRow …  ← 搜索态另一套（heading/title/meta/workspace/snippet）
```

```css
.JoiKIa_projectRow,.JoiKIa_sessionRow{border-radius:var(--dsw-radius-md);padding:0 8px;
  cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary);align-items:center;gap:6px;
  padding-inline-start:calc(8px + var(--dsh-workspace-indent,0px));display:flex}
.JoiKIa_projectRow:hover,.JoiKIa_sessionRow:hover,.JoiKIa_sessionRow.JoiKIa_selected{background:var(--dsw-alias-interactive-bg-hover)}
.JoiKIa_projectRow{box-sizing:border-box;height:34px}
.JoiKIa_sessionRow{gap:0;height:32px}
.JoiKIa_sessionRow .JoiKIa_title{margin:0 6px 0 4px}
.JoiKIa_title{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:14px;line-height:20px;overflow:hidden}
.JoiKIa_sessionRow .JoiKIa_title{flex:1}
.JoiKIa_meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px}
.JoiKIa_time{color:var(--dsw-alias-label-tertiary);flex:none;font-size:10px;line-height:16px}
.JoiKIa_pinIndicator{width:16px;height:20px;color:var(--dsw-alias-label-caption);margin-left:6px}
.JoiKIa_rowActions{flex:none;align-items:center;gap:15px;display:none}
.JoiKIa_projectRow:hover .JoiKIa_rowActions,…{display:inline-flex}
.JoiKIa_folderActive{color:var(--dsw-alias-state-business-primary)}
.JoiKIa_iconButton{border-radius:var(--dsw-radius-xs);width:16px;height:16px;color:var(--dsw-alias-label-tertiary)}
```

**【冲突-轻微】** 任务描述里把「会话列表项」当作侧栏自己的类名；实际它在
`ui-workspace` 包、经 `sidebar.workspaces` 槽位渲染，前缀是 `JoiKIa` 而非 `kB3qhq`。
改造时侧栏皮肤必须同时覆盖 `JoiKIa_*`。

---

## 3. 顶栏 / 标题栏

**DSH 没有独立的全局顶栏。** 中列的「顶栏」= `ConversationRoot` 的 `kiGsTW_header`
（`ui-conversation/lib/client.js`） **【已核实】**。

### 3.1 结构 **【已核实】**

```
div.kiGsTW_root[data-phase=hero|active|settling]
├─ header.kiGsTW_header[+ headerBlank][+ headerSessionless]     ← 顶栏本体
│   ├─ div.kiGsTW_headerLeading      ← grid-area 1/1，<shell.leading> 类控件
│   ├─ div.kiGsTW_titleRow           ← grid-column 2
│   │   ├─ div.kiGsTW_titleCluster
│   │   │   └─ div.kiGsTW_crumbs
│   │   │       └─ span.kiGsTW_crumbSeg > button.kiGsTW_crumb[+ crumbCurrent] / span.kiGsTW_crumbSep
│   │   └─ div.kiGsTW_headerActions  ← 会话操作按钮
│   ├─ div.kiGsTW_headerUtilities    ← 次要工具（:empty 隐藏）
│   ├─ div.kiGsTW_headerCorner       ← margin-right:-16px（:empty 隐藏）
│   └─ div.kiGsTW_tabs               ← grid-column 1/-1
│       └─ div.kiGsTW_viewTabs > button.kiGsTW_tab[+ tabActive] > span.kiGsTW_tabLabel
│           + span.kiGsTW_viewsMoreAnchor > button.kiGsTW_viewsMore[+ viewsMoreActive]
└─ div.kiGsTW_body
    ├─ div.kiGsTW_viewArea           ← <conversation.session> 槽位
    └─ div.kiGsTW_composerSeat       ← 见 §5
```

### 3.2 尺寸/颜色 **【已核实】**

```css
.kiGsTW_header{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l3);
  flex:none;grid-template-columns:auto minmax(0,1fr);min-height:76px;
  padding:10px 28px 0 20px;display:grid}
.kiGsTW_header:where(:not(:has(.kiGsTW_tabs))){min-height:0;padding-bottom:10px}
.kiGsTW_titleRow{min-height:30px;grid-column:2;align-items:center;gap:0;
  padding-inline-start:max(0px, calc(var(--dsh-frame-leading-clearance,0px) - 20px));display:flex}
.kiGsTW_titleCluster{flex:1;align-items:center;gap:10px;min-width:0;display:flex}
.kiGsTW_crumbs{white-space:nowrap;align-items:center;gap:4px;min-width:0;display:flex;overflow:hidden}
.kiGsTW_crumb{border-radius:var(--dsw-radius-md);max-width:220px;color:var(--dsw-alias-label-tertiary);
  text-overflow:ellipsis;white-space:nowrap;cursor:pointer;background:0 0;border:none;
  padding:4px 8px;font-size:14px;line-height:20px;display:inline-block;overflow:hidden}
button.kiGsTW_crumb:hover{background:var(--dsw-alias-interactive-bg-hover)}
.kiGsTW_crumbCurrent{color:var(--dsw-alias-label-primary);cursor:default;font-weight:500}
.kiGsTW_crumbSep{color:var(--dsw-alias-label-caption);font-size:14px;line-height:20px}
.kiGsTW_crumbSubagent{font-size:12px;line-height:18px}
.kiGsTW_headerActions{flex:none;align-items:center;gap:8px;display:flex}
.kiGsTW_headerUtilities{flex:none;align-items:center;gap:8px;margin-left:20px;display:flex}
.kiGsTW_headerCorner{flex:none;align-items:center;margin-left:8px;margin-right:-16px;display:flex}

.kiGsTW_tabs{z-index:1;box-sizing:border-box;flex-wrap:wrap;grid-column:1/-1;align-items:flex-start;
  gap:16px 20px;width:100%;min-width:0;margin-top:10px;padding-left:8px;display:flex;position:relative}
.kiGsTW_viewTabs{flex-wrap:wrap;gap:32px;min-width:0;min-height:25px;display:flex}
.kiGsTW_tab{min-height:25px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;
  border:none;padding:0 0 9px;font-size:13px;font-weight:500;line-height:16px;position:relative}
.kiGsTW_tab:after{content:"";background:0 0;border-radius:2px;height:2px;
  position:absolute;bottom:-1px;left:0;right:0}
.kiGsTW_tabActive{color:var(--dsw-alias-state-business-primary)}
.kiGsTW_tabActive:after{background:var(--dsw-alias-state-business-primary)}
```

> **这一块是「设置页 tab」风格最接近 opencode 的地方**：DSH 已经是
> 「未激活灰 + 激活蓝 + 下划线」，只是颜色、下划线粗细/圆角和过渡曲线与 opencode 不同。

### 3.3 折叠态浮层控件 **【已核实】**

`ui-sidebar` 里的 `HeaderLeadingControls`（hash `xoYuoq`），darwin 且侧栏折叠时
挂在 `PIRFFq_leadingSeat`：

```css
.xoYuoq_controls{align-items:center;gap:8px;display:flex}
.xoYuoq_iconButton{border-radius:var(--dsw-radius-sm);width:28px;height:28px;
  color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;
  flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}
.xoYuoq_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}
```

**【冲突-重要】** 任务描述说「插件隐藏 `_logoRow` 后新会话按钮仍可从折叠态头部进入」——
源码证实机制成立：`leadingSeat` 只在 `darwin && sidebarCollapsed` 时挂载，
且 `HeaderLeadingControls` 提供 `startSession`（新建会话）+ `toggleSidebar`。
但**它复用 `xoYuoq_iconButton`，与侧栏 `kB3qhq_iconButton` 是两个不同前缀**，
改造时若只写 `[class$="_iconButton"]` 会同时命中两者（共 4 个模块），必须限定祖先。

---

## 4. 消息区

包：`ui-chat`。三条主链：`ChatView`(`tnXGgG`) → `ChatGroupSeat`(`r52wTW`) → `MessageItem`(`AkCqbG`) / `AssistantMarkdown`(`XNZzAa`)。

### 4.1 滚动与列宽 **【已核实】**

```
div.tnXGgG_frame
└─ div.tnXGgG_root[data-chat-following-tail]
    ├─ div.tnXGgG_scroll
    │   └─ div.tnXGgG_column
    │       └─ div.tnXGgG_flowItem[data-chat-flow-kind=user|steering|turn-process|…]
    │           └─ [data-slot="conversation.chat.node"]
    ├─ div.tnXGgG_running > div.tnXGgG_runningDivider / div.tnXGgG_runningContent > span.tnXGgG_runningIcon / span.tnXGgG_runningText
    └─ div.tnXGgG_toBottomSlot > button.tnXGgG_toBottom
```

```css
.tnXGgG_frame{flex-direction:column;flex:auto;min-height:0;display:flex;position:relative;container-type:inline-size}
.tnXGgG_scroll{min-height:0;padding:16px calc(var(--dsh-composer-side-clearance) + 16px);
  flex:auto;overflow-y:auto;container-type:inline-size}
.tnXGgG_column{max-width:var(--dsh-chat-content-width);flex-direction:column;width:100%;margin:0 auto;display:flex}
.tnXGgG_hint{color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px)}
.tnXGgG_running{--dsh-chat-flow-gap:12px;color:var(--dsw-alias-label-deep-diving);
  font-size:calc(var(--dsh-content-font-size,14px) - 2px);flex-direction:column;display:flex}
.tnXGgG_runningDivider{background:color-mix(in srgb,var(--dsw-alias-border-l1) 75%,var(--dsw-alias-border-l2));
  width:100%;height:.5px;margin:8px 0 10px;display:none}
.tnXGgG_toBottomSlot{z-index:8;height:0;pointer-events:none;justify-content:flex-end;
  display:flex;position:absolute;bottom:16px;left:0;right:0}
.tnXGgG_toBottom{--dsw-elevation-stroke-color:var(--dsw-alias-border-l3);corner-shape:round;
  width:34px;height:34px;background:var(--dsw-alias-button-floating-fill);
  box-shadow:var(--dsw-elevation-panel);border-radius:100px;margin-top:-34px;display:flex}
```

行间距变量 `--dsh-chat-flow-gap` 默认 6px，response 段后 12px，turn-process 后 16px **【已核实】**。

### 4.2 用户消息气泡 **【已核实】**

```css
.AkCqbG_userRow{flex-direction:column;align-items:flex-end;gap:6px;display:flex}
.AkCqbG_userStack{min-width:0;max-width:min(calc(var(--dsh-chat-content-width,748px) * .702), 82%);
  flex-direction:column;align-items:flex-end;gap:8px;display:flex}
.AkCqbG_bubble{background:var(--dsw-specific-bubble);border-radius:var(--dsw-radius-xl);
  max-width:100%;font-size:var(--dsh-content-font-size,14px);
  line-height:calc(22px + var(--dsh-content-font-delta,0px));
  color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;padding:10px 16px}
.AkCqbG_attachmentRow{flex-wrap:wrap;justify-content:flex-end;gap:8px;max-width:100%;display:flex}
.AkCqbG_fileCard{border:.5px solid var(--dsw-alias-border-l2,#0000001f);
  border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-input-major,transparent);
  flex:0 0 240px;align-items:center;gap:10px;width:240px;min-height:64px;padding:8px 12px;display:inline-flex}
.AkCqbG_fileName{font-size:14px;font-weight:500;line-height:22px}
.AkCqbG_fileMeta{font-size:12px;line-height:15px;color:var(--dsw-alias-label-tertiary,#00000073)}
.AkCqbG_referenceSummary,.AkCqbG_retryRow{font-size:var(--dsh-content-font-size-secondary,13px)}
.AkCqbG_compactionButton{width:100%;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary)}
.AkCqbG_turnErrorTitle{color:var(--dsw-alias-state-error-primary);font-weight:600}
```

`--dsw-specific-bubble`：浅色 = `--dsw-static-deepseek-50` = **`#edf3fe`**；
暗色 = `--dsw-static-neutral-bluish-850` = **`#2c2c2e`** **【已核实】**。
→ **浅色下用户气泡是淡蓝色，这是与 opencode「无彩色平面」冲突最刺眼的一处。**

### 4.3 助手消息 / Markdown **【已核实】**

```css
.XNZzAa_root{font-size:var(--dsh-content-font-size,14px);
  line-height:calc(24px + var(--dsh-content-font-delta,0px));
  color:var(--dsw-alias-label-primary);flex-direction:column;display:flex}
.XNZzAa_body{flex-direction:column;gap:16px;display:flex}
.XNZzAa_stopped{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-tertiary);align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}
.XNZzAa_actions{margin-top:16px;margin-left:-6px}
```

Markdown 排版由 **`dsh-web-frontend` 的 `_markdown_1ypvv_5`** 承载（hash 风格不同，
`_name_hash` 而非 `hash_name`，**不能用 `[class$=]` 命中**） **【已核实】**：

```css
._markdown_1ypvv_5{min-width:0;overflow-wrap:anywhere;font:var(--dsw-font-markdown-base);color:var(--dsw-alias-label-primary)}
._markdown_1ypvv_5 h1{font:var(--dsw-font-markdown-h1);margin:32px 0 16px}
._markdown_1ypvv_5 h2{font:var(--dsw-font-markdown-h2);margin:32px 0 16px}
._markdown_1ypvv_5 h3{font:var(--dsw-font-markdown-h3);margin:32px 0 16px}
._markdown_1ypvv_5 p{margin:16px 0}
._markdown_1ypvv_5 :where(ul,ol){margin:16px 0;padding-left:18px}
._markdown_1ypvv_5 hr{height:.5px;margin:32px 0;background:var(--dsw-alias-border-l2)}
._markdown_1ypvv_5 blockquote{border-left:2px solid var(--dsw-alias-label-caption);margin:16px 0 0;padding-left:14px}
._markdown_1ypvv_5 :not(pre)>code{font:var(--dsw-font-markdown-code);font-size:.875em!important;
  background-color:var(--dsw-alias-markdown-inline-code);border:.5px solid var(--dsw-alias-border-l1);
  border-radius:var(--dsw-radius-sm);padding:0 5px}
._tableScroll_1ypvv_192 th{font:var(--dsw-font-markdown-table-head);padding:10px 16px;border-bottom:.5px solid var(--dsw-alias-border-l3)}
._tableScroll_1ypvv_192 td{font:var(--dsw-font-markdown-table);padding:10px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
```

已核实的排版 token（定义在 `dsh-client-ui-theme` 的 `body{…}` 块）：

| token | 值 |
|---|---|
| `--dsw-font-markdown-base` | `<content-font-size:14px> / calc(24px + delta) var(--dsw-font-family)` |
| `--dsw-font-markdown-h1` | `700 calc(21px+delta) / calc(30px+delta)` |
| `--dsw-font-markdown-h2` | `700 calc(19px+delta) / calc(28px+delta)` |
| `--dsw-font-markdown-h3` | `700 calc(18px+delta) / calc(26px+delta)` |
| `--dsw-font-markdown-h4` | `600 <content-font-size> / calc(24px+delta)` |
| `--dsw-font-markdown-code` | `calc(12px+code-delta) / calc(19px+code-delta) var(--ds-font-family-code)` |
| `--dsw-font-markdown-code-block` | `<code-font-size:11px> / calc(19px+code-delta) var(--ds-font-family-code)` |
| `--dsw-font-markdown-table` | `<13px> / calc(22px+delta) var(--dsw-font-family)` |
| `--dsw-font-markdown-table-head` | `500 <13px> / calc(22px+delta) var(--dsw-font-family)` |
| `--dsh-content-font-size-secondary` | `min(content-1px, max(13px, content-2px))` |

### 4.4 代码块 **【已核实】**（`_block_7gxqk_4`，web-frontend）

```css
._block_7gxqk_4{--dsl-code-block-border-radius:var(--dsw-radius-lg);
  --dsl-code-block-background:var(--dsw-alias-markdown-code-block);
  --dsl-code-block-banner-background-color:var(--dsw-alias-markdown-code-block-banner);
  position:relative;margin:16px 0;background:var(--dsl-code-block-background);
  border-radius:var(--dsl-code-block-border-radius)}
._banner_7gxqk_24{background:var(--dsl-code-block-banner-background-color);padding:9px 14px;
  display:flex;justify-content:space-between;align-items:center;gap:12px;
  font:11px/18px var(--dsw-font-family)}
._infostring_7gxqk_45{font-family:var(--ds-font-family-code);font-size:11px;line-height:18px}
._block_7gxqk_4 :where(pre){font:var(--dsl-code-block-content-font);padding:16px;margin:0!important;overflow-x:auto}
```

### 4.5 工具调用卡片

`dsh-client-ui-tool`（`ToolRow` hash `UHhYua`，`ToolCallTree` hash `mehola`） **【已核实】**：

```
div.UHhYua_root[data-tool^=cordis_]
├─ span.UHhYua_leading
├─ button.UHhYua_row  → span.UHhYua_title / span.UHhYua_sep / span.UHhYua_summary / span.UHhYua_summarySuffix
│                       span.UHhYua_diffStat > span.UHhYua_diffAdded / span.UHhYua_diffRemoved
│                       span.UHhYua_errorSummary / span.UHhYua_stoppedSummary
│                       button.UHhYua_fileLink
└─ div.UHhYua_bodyWrap
    ├─ div.UHhYua_ioCard > div.UHhYua_ioSection > span.UHhYua_ioLabel / span.UHhYua_ioText
    │                      div.UHhYua_ioDivider
    ├─ div.UHhYua_bodyScroll > div.UHhYua_codeBody | _terminalBody | _diffBody | _readBody
    │                           | _imageBody | _searchBody | _webBody
    └─ button.UHhYua_inspectButton
```

```css
.UHhYua_root{flex-direction:column;display:flex}
.UHhYua_root[data-tool^=cordis_] .UHhYua_title{font-weight:500}
.UHhYua_title{font-weight:400}
.UHhYua_summary{font-size:var(--dsh-content-font-size-secondary,13px);
  line-height:calc(24px + var(--dsh-content-font-delta,0px));color:inherit}
.UHhYua_sep{background:var(--dsw-alias-label-caption);border-radius:1px;width:2px;height:2px;margin:0 8px}
.UHhYua_ioCard{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);
  background:var(--dsw-alias-markdown-code-block);font:var(--dsw-font-markdown-code-block-small);
  flex-direction:column;margin:4px 0 4px 4px;display:flex}
.UHhYua_ioSection{grid-template-columns:max-content 1fr;align-items:baseline;column-gap:14px;
  max-height:150px;padding:12px 16px;display:grid;overflow-y:auto}
.UHhYua_ioLabel{color:var(--dsw-alias-label-caption);align-self:start;position:sticky;top:0}
.UHhYua_ioText{white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary)}
.UHhYua_ioText[data-error]{color:var(--dsw-alias-state-error-primary)}
.UHhYua_bodyScroll{max-height:260px;overflow-y:auto}
.UHhYua_inspectButton{border:.5px solid var(--dsw-alias-border-l3);corner-shape:round;
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);opacity:0;
  border-radius:999px;align-self:flex-start;align-items:center;gap:4px;margin:4px 0 2px 4px;
  padding:2px 8px;font-size:11px;line-height:16px;display:inline-flex}
.UHhYua_root:hover .UHhYua_inspectButton{opacity:1}

.mehola_callRow{border-radius:var(--dsw-radius-sm)}
.mehola_subCalls{border-left:.5px solid var(--dsw-alias-border-l2);flex-direction:column;
  gap:4px;margin:4px 0 2px 22px;padding-left:8px;display:flex}
```

### 4.6 其他消息区子模块（备查） **【已核实】**

| hash | 模块 | 后缀 |
|---|---|---|
| `r52wTW` | `ChatGroupSeat`（思考/工具分组折叠） | root, title, leading, activityIcon, chevron, body, content, expandedBody, label, fadeTop, fadeBottom |
| `ijfCxa` | `ReasoningRow` | root, row, leading, title, separator, summary, summaryText, thinkBody |
| `gTO55a` | `TurnProcessNodeView` | root, chevron, label, durationNumber |
| `B9WI8q` | `GenericCommandCard` | root, leading, title, separator, summary, body |
| `KkN8mG` | `TurnUsagePanel` | root, trigger, label |
| `ZITbJG` | `MessageIconActions` | actions, action, timeStart, timeEnd, endInfo |
| `TQ0rwa` | `StatsPills` | anchor, pill, label, sep |
| `ft5itq` | `ContextInjectionRow` | root, body, chevron, sep, source, summary, toolChanges |

`StatsPills`（`TQ0rwa`）**是既有插件复制的样板**，原文 **【已核实】**：

```css
.TQ0rwa_anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);
  line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}
.TQ0rwa_pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;
  color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;
  line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;
  gap:6px;padding:1px 8px;display:inline-flex}
.TQ0rwa_pill svg{flex:none;width:14px;height:14px}
button.TQ0rwa_pill{cursor:pointer}
button.TQ0rwa_pill:hover,button.TQ0rwa_pill[aria-expanded=true]{
  background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.TQ0rwa_label{text-overflow:ellipsis;min-width:0;overflow:hidden}
.TQ0rwa_sep{color:var(--dsw-alias-separator-primary);margin:0 6px}
```

JSX 里每个 pill 包在 `span.TQ0rwa_anchor[data-composer-stat="<stat>"]` 中 **【已核实】**——
即**状态 pill 的稳定锚点是 `[data-composer-stat]` 属性，不是类名**。
既有插件已正确使用该属性（`data-composer-stat="git-branch"`），改造应保留。

---

## 5. composer（输入框）★ 重点

包：`ui-conversation`，`InputBar`，hash `JZLxKW`。

### 5.1 结构 **【已核实】**

```
div.JZLxKW_root[+ hero]                         ← 对齐居中容器
├─ div.JZLxKW_notice                            ← 提示条（可选）
└─ div.JZLxKW_card[+ cardWorkspaceTrigger]      ← 输入卡片 ★
    ├─ div.JZLxKW_accessory                     ← 附件/引用行（可选）
    ├─ div.JZLxKW_overlayAnchor                 ← 覆盖层锚点（h:0）
    ├─ div.JZLxKW_scroll                        ← 文本滚动区
    │   └─ div.JZLxKW_grow
    │       ├─ div.JZLxKW_input[contenteditable]  ← 真实输入域（ProseMirror）
    │       ├─ div.JZLxKW_placeholder
    │       └─ span.JZLxKW_pending              ← 运行中小圆点
    └─ div.JZLxKW_row[data-model-compact]
        ├─ div.JZLxKW_tools      ← 左侧工具（附件、模式等）★ 含 <conversation.input.*> 槽位
        ├─ div.JZLxKW_modes
        ├─ div.JZLxKW_standardControls
        └─ div.JZLxKW_trailing[+ trailingActive]
            ├─ div.JZLxKW_activity    ← <conversation.input.activity>
            └─ button.JZLxKW_primary  ← 发送/停止（34×34 胶囊）
└─ div.JZLxKW_dock[data-composer-dock]          ← ★★ 状态行 = conversation.composer.dock
    ├─ <conversation.composer.dock 槽位>        ← 既有插件 git-branch 挂在这里
    └─ <ContextMeter>                           ← X0HXfW_*
```

**槽位契约（已核实）**：`conversation.composer.dock` 是 `kind:"list"`、`scope:"session"`。
渲染条件：`variant === "composer" && input !== undefined && sessionId !== undefined`。
`activity` 存在时 **不渲染** `ContextMeter`（互斥）。

### 5.2 现有样式 **【已核实】**

```css
.JZLxKW_root{padding:0 var(--dsh-composer-side-clearance) 4px;flex-direction:column;align-items:center;display:flex}
.JZLxKW_hero{padding:0 var(--dsh-composer-side-clearance)}
.JZLxKW_notice{width:100%;max-width:var(--dsh-composer-card-max-width);
  border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-secondary);margin-bottom:6px;padding:4px 8px;font-size:12px;line-height:18px}

.JZLxKW_card{box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width);
  --dsw-elevation-stroke-color:var(--dsw-alias-border-l2);
  border-radius:var(--dsw-radius-panel);                 /* 28px ★ */
  background:var(--dsw-specific-input-major);
  box-shadow:var(--dsw-elevation-soft);                  /* ★ opencode 无阴影 */
  font-size:var(--dsh-content-font-size,14px);
  line-height:calc(24px + var(--dsh-content-font-delta,0px));
  border:0;flex-direction:column;gap:12px;padding-top:8px;display:flex;position:relative}
.JZLxKW_cardWorkspaceTrigger:after{content:"";box-sizing:border-box;border-radius:var(--dsw-radius-panel);
  color:var(--dsw-alias-border-l4);pointer-events:none;border:1px dashed;transition:color .1s;position:absolute;inset:0}
.JZLxKW_cardWorkspaceTrigger:hover:after{color:var(--dsw-alias-state-business-primary)}

.JZLxKW_accessory{align-items:center;gap:8px;padding:10px 12px 0;display:flex}
.JZLxKW_scroll{max-height:var(--dsh-composer-text-max-height);margin-right:4px;overflow-y:auto}
.JZLxKW_input{box-sizing:border-box;min-height:36px;font-family:var(--dsw-font-family);
  font-size:inherit;line-height:inherit;white-space:pre-wrap;word-break:break-word;
  color:var(--dsw-alias-label-primary);caret-color:var(--dsw-alias-state-business-primary);
  outline:none;padding:4px 8px 0 14px}
.JZLxKW_input p:last-child:after{content:var(--dsh-composer-hint);color:var(--dsw-alias-label-caption)}
.JZLxKW_placeholder{color:var(--dsw-alias-label-caption);white-space:nowrap;text-overflow:ellipsis;
  position:absolute;inset:4px 8px auto 14px;overflow:hidden}
.JZLxKW_hero .JZLxKW_input{min-height:52px}
.JZLxKW_pending{corner-shape:round;background:var(--dsw-alias-state-business-primary);
  border-radius:50%;width:8px;height:8px;animation:1s ease-in-out infinite alternate JZLxKW_input-pending}

.JZLxKW_row{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;
  min-width:0;padding:2px 8px 6px;display:flex;container-type:inline-size}
.JZLxKW_row[data-model-compact]{--dsh-composer-model-text-display:none;--dsh-composer-model-icon-display:block}
.JZLxKW_tools,.JZLxKW_modes{gap:12px}
.JZLxKW_trailing{flex:none;gap:12px;margin-left:auto}
@container (width<=560px){.JZLxKW_tools,.JZLxKW_modes,.JZLxKW_trailing{gap:8px}}

.JZLxKW_add{corner-shape:round;background:var(--dsw-specific-selector);width:28px;height:28px;
  color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:999px;
  flex:none;place-items:center;display:grid}
.JZLxKW_add:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}

.JZLxKW_select{border-radius:var(--dsw-radius-sm);max-width:220px;height:28px;
  color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:pointer;appearance:none;
  background-color:transparent; background-image:url("data:image/svg+xml,…%2381858C…");
  border:none;outline:none;padding:0 20px 0 8px;font-size:13px;font-weight:500;line-height:20px}
.JZLxKW_select:hover:not(:disabled){background-color:var(--dsw-alias-interactive-bg-hover)}

.JZLxKW_primary{corner-shape:round;background:var(--dsw-alias-button-info-fill);color:#fff;
  cursor:pointer;border:none;border-radius:999px;flex:none;place-items:center;
  width:34px;height:34px;transition:background-color .1s;display:grid;transform:translateY(-2px)}
.JZLxKW_primary:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}
.JZLxKW_primary:disabled{opacity:.4;cursor:default}

/* ★★ 状态行 —— 与 opencode 对齐的主战场 */
.JZLxKW_dock{justify-content:center;align-items:center;gap:12px;max-width:100%;
  padding-top:4px;display:flex}
.JZLxKW_hero .JZLxKW_dock:empty{display:none}
.JZLxKW_activity{flex:none;align-items:center;display:flex}
.JZLxKW_activity:empty{display:none}
.JZLxKW_activityExpanded{flex:1;min-width:0}
```

`ContextMeter`（`X0HXfW`，dock 里的另一个 pill） **【已核实】**：

```css
.X0HXfW_root{flex:none;display:inline-flex}
.X0HXfW_trigger{border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);
  font-size:var(--dsh-content-font-size-secondary,13px);font-variant-numeric:tabular-nums;
  line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));
  white-space:nowrap;cursor:pointer;background:0 0;border:none;flex:none;
  align-items:center;gap:6px;padding:1px 8px;display:inline-flex}
.X0HXfW_trigger:hover,.X0HXfW_trigger[aria-expanded=true]{
  background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.X0HXfW_bar{corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);
  border-radius:999px;gap:1px;height:4px;margin:10px 0 12px;display:flex;overflow:hidden}
```

### 5.3 相关 CSS 变量默认值 **【已核实】**

来自 `kiGsTW_body` / `kiGsTW_embeddedBody`：

```css
.kiGsTW_body{
  --dsh-chat-content-width:var(--dsh-chat-user-width, clamp(680px, calc(var(--dsh-conversation-column-width,0px) * .64), 920px));
  --dsh-composer-card-max-width:calc(var(--dsh-chat-content-width) + 32px);
  --dsh-composer-side-clearance:16px;
  --dsh-composer-dock-inset:8px}
.kiGsTW_embeddedBody{
  --dsh-chat-content-width:min(calc(100% - 32px), 920px);
  --dsh-composer-card-max-width:min(calc(100% - 16px), 952px);
  --dsh-composer-side-clearance:8px;
  --dsh-composer-dock-inset:8px}
.kiGsTW_composerSeat{--dsh-composer-text-max-height:336px;flex-direction:column;flex:none;display:flex}
.kiGsTW_composerStack{--dsh-composer-stack-gap:6px;gap:var(--dsh-composer-stack-gap);flex-direction:column;display:flex}
```

`active` 阶段 composer 吸底并带渐隐遮罩 **【已核实】**：

```css
.kiGsTW_root[data-phase=active] .kiGsTW_composerSeat{
  z-index:7;position:sticky;bottom:0;
  background:linear-gradient(180deg, color-mix(in srgb,var(--dsw-alias-bg-base) 0%,transparent) 0px, var(--dsw-alias-bg-base) 36px)}
```

### 5.4 既有插件与 dock 的关系 **【已核实】**

`dsh-git-branch/client.js` 注册 `{ name:'conversation.composer.dock', id:'git-branch', order:2 }`，
渲染 `span.dshgb-anchor[data-composer-stat="git-branch"] > span.dshgb-pill > svg + span.dshgb-label`，
样式逐字复刻 `TQ0rwa_*`。**这条链路完全正确，改造时保留结构、只调数值即可。**

---

## 6. 右侧栏 / 工作区面板

包：`ui-sidebar-right`，`SidebarRight`，hash `Dv5QdW` **【已核实】**。

```css
.Dv5QdW_session{display:contents}
.Dv5QdW_panel{--dsh-dockkit-dock-layer:10;--dsh-dockkit-float-layer:60;
  pointer-events:none;flex-direction:column;min-width:0;display:flex;
  position:absolute;top:0;bottom:0;right:0;overflow:clip}
.Dv5QdW_panel[data-sidebar-right-open] [data-dockkit-host=dock],
.Dv5QdW_panel[data-sidebar-right-open] [data-dockkit-empty],
.Dv5QdW_panel[data-sidebar-right-open] [data-dockkit-divider]{
  visibility:visible;transition:transform var(--ds-transition-duration-slow) var(--ds-ease-in-out);transform:none}
.Dv5QdW_panel[data-sidebar-right-panel=fullscreen]{--dsh-dockkit-dock-layer:40}
.Dv5QdW_panelBody{flex:auto;min-height:0;display:flex}
.Dv5QdW_tabBody{flex-direction:column;min-width:0;height:100%;min-height:0;display:flex;overflow:hidden}
.Dv5QdW_tabTitle{display:contents}
.Dv5QdW_iconButton{width:28px;height:28px;color:var(--dsw-alias-label-secondary);
  border-radius:var(--dsw-radius-sm);cursor:pointer;background:0 0;border:none;flex:none;
  justify-content:center;align-items:center;padding:6px;line-height:1;display:inline-flex}
.Dv5QdW_iconButton svg{width:15px;height:15px}
.Dv5QdW_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}
.Dv5QdW_collapseGlyph{transform:scaleX(-1)}
.Dv5QdW_unavailable{color:var(--dsw-alias-label-tertiary);
  font-size:var(--dsh-content-font-size-secondary,13px);margin:0;padding:12px}
```

面板内部是 **DockKit** 体系（`_pane_6nhg2_209`、`_tabStrip_6nhg2_237`、
`_tab_6nhg2_134`、`_float_6nhg2_156` 等，web-frontend 侧 `_name_hash` 命名）
**【已核实】**。`_tabStrip_6nhg2_237` 高 28px、`_tab_6nhg2_134` 高 28px 圆角 `--dsw-radius-sm`、
激活 tab `background:var(--dsw-alias-markdown-tag)`。

**【推测】** 右侧栏是 opencode console 里**没有对应物**的区域（opencode 无 dock/多面板）。
建议只做「去阴影 + 6px 圆角 + 13px 字号」的轻量统一，不做结构性改动。

`GuideBody`（`F6Huca`，右栏空态引导）后缀：`guide, hero, titleIcon, placeholderInk, entry, entryCell, entryIcon, entryText, entryTitle, entryDescription, moreAnchor, moreMenu` **【已核实】**。

---

## 7. 现状 token 对照（改造的数值依据）

### 7.1 DSH 现有 token 实测值 **【已核实】**

来源：`dsh-client-ui-theme/lib/client.js` 的 `body{…}` / `body[data-ds-dark-theme]{…}`。

| 语义 | DSH token | 浅色 | 暗色 |
|---|---|---|---|
| 页面底 | `--dsw-alias-bg-base` | `#fff` | `#151517` |
| 侧栏底 | `--dsw-specific-sidebar-fill` | `#f9fafb` | `#1b1b1c` |
| 输入卡片 | `--dsw-specific-input-major` | `#fff` | `#2c2c2e` |
| 用户气泡 | `--dsw-specific-bubble` | `#edf3fe` | `#2c2c2e` |
| 代码块 | `--dsw-alias-markdown-code-block` | `#f9fafb` | `#1b1b1c` |
| 主文字 | `--dsw-alias-label-primary` | `#0f1115` | `#f9fafb` |
| 次文字 | `--dsw-alias-label-secondary` | `#61666b` | `#cfd3d6` |
| 三级文字 | `--dsw-alias-label-tertiary` | `#81858c` | `#adb2b8` |
| caption | `--dsw-alias-label-caption` | `#adb2b8` | `#81858c` |
| 边框 1 | `--dsw-alias-border-l1` | `#0000000a` | `#ffffff0f` |
| 边框 2 | `--dsw-alias-border-l2` | `#0000001a` | `#ffffff1f` |
| 边框 3 | `--dsw-alias-border-l3` | `#0000001f` | `#ffffff29` |
| 边框 4 | `--dsw-alias-border-l4` | `#00000029` | `#fff3` |
| hover 底 | `--dsw-alias-interactive-bg-hover` | `#2631480f` | `#ffffff14` |
| hover 底(实) | `--dsw-alias-interactive-bg-hover-solid` | `#f1f3f5` | `#353638` |
| 品牌/激活 | `--dsw-alias-state-business-primary` | `#4176e6` | `#7aaaff` |
| 主按钮 | `--dsw-alias-button-info-fill` | `#4176e6` | `#7aaaff` |
| 选择器底 | `--dsw-specific-selector` | `#f9fafb` | `#353638` |
| 浮起按钮 | `--dsw-alias-button-elevated-fill` | `#fff` | `#43454a` |

形状/动效 **【已核实】**：

```
--dsw-radius-xs:4px  --dsw-radius-sm:8px  --dsw-radius-md:12px
--dsw-radius-lg:16px --dsw-radius-xl:20px --dsw-radius-panel:28px
--ds-transition-duration-fast:.1s  --ds-transition-duration:.2s  --ds-transition-duration-slow:.3s
--ds-ease-in-out:cubic-bezier(.4,0,.2,1)
--dsw-elevation-stroke:0 0 0 .5px var(--dsw-elevation-stroke-color)
--dsw-elevation-panel:var(--dsw-elevation-stroke), 0 3px 8px 0 #00000008, 0 0 16px 0 #00000005
--dsw-elevation-prominent:var(--dsw-elevation-stroke), 0 3px 8px 0 #0000000a, 0 0 20px 0 #0000000d
--dsw-elevation-soft:var(--dsw-elevation-stroke), 0 4px 16px 0 #00000008, 0 0 24px 0 #00000008
```

### 7.2 opencode 目标值（引自 `opencode-tokens.md`）

```
圆角 6px；卡片边框 0.5px solid rgba(0,0,0,.08)；卡片内边距 20px
正文字号 13px / weight 440 / line-height 20px / letter-spacing -0.04px
标题字重 530；无阴影（box-shadow:none）
底 #fafafa / 面 #fff / 层1 #fafafa / 层2 #f2f2f2
文字 #161616 / #5c5c5c / gray；强调 #3b5cf6（暗 #a2bcff）
边框 #0000001a / 弱 #00000014 / 强 #0003 / 反色 #242424
激活导航底 rgba(0,0,0,.08)；顶栏 hover #0000001a
过渡 background-color 85ms ease-out, color 85ms ease-out
tab 下划线 1px 高、#242424、transform 220ms cubic-bezier(.77,0,.175,1)
暗色 #080808 / #161616 / #242424 / #2e2e2e，文字 #fafafa / #aeaeae
```

### 7.3 映射总表 **【推测】**

| 维度 | DSH 现状 | opencode | 处理 |
|---|---|---|---|
| 圆角 | 4/8/12/16/20/28 | 6 统一 | 卡片、行、按钮、tab → 6px；胶囊(999px) → 6px |
| 阴影 | 3 档 elevation + 描边 | none | 全部 `box-shadow:none`，靠 0.5px 边框分层 |
| 正文 | 14px/400 | 13px/440/-0.04px | 用 `--dsh-content-font-size` 体系降级 |
| 强调色 | `#4176e6` (deepseek-500) | `#3b5cf6` | 覆写 `--dsw-alias-state-business-primary` / `-button-info-fill` |
| 边框 | 0.5px 但色值偏深 | `rgba(0,0,0,.08)` ≈ `#00000014` | 覆写 `--dsw-alias-border-l2` 到 `.08` 档 |
| 侧栏底 | `#f9fafb` + darwin 紫蓝渐变 | `#fafafa` 纯色 | 覆盖渐变 + 底色 |
| 用户气泡 | `#edf3fe` 淡蓝、20px 圆角 | 无对应 | 去色 + 6px 圆角 + 0.5px 边框 |
| tab 下划线 | 2px、`#4176e6`、圆角 2px | 1px、`#242424` | 改粗细与颜色 |
| 动效 | `.2s cubic-bezier(.4,0,.2,1)` | 85ms ease-out | 改时长曲线 |

---

## 8. 改造清单（可直接落地为 CSS）

> 全部选择器**已加祖先限定**。`[class$="_x"]` 一律写成 `祖先 [class$="_x"]` 或
> `祖先[class$="_y"] [class$="_x"]`，否则会误伤（见 §9.1）。
> `!important` 只在需要压过 `corner-shape` / 内联 style / 高优先级选择器时使用。

### A. 全局与外壳

| # | 选择器 | 现有值 | 目标 opencode 值 | 理由 |
|---|---|---|---|---|
| A1 | `html, body, #root` | `font-family: var(--dsw-font-family, -apple-system…)` | `font-family: Inter, var(--dsw-font-family), sans-serif` | opencode 用 Inter；DSH 无 Inter，需 fallback 链【已核实】 |
| A2 | `body` | 继承，字号由组件各自定 | `font-size:13px;font-weight:440;line-height:16.25px;letter-spacing:-0.04px` | opencode body 基线【已核实目标值】 |
| A3 | `body[data-ds-dark-theme]` | 属性存在即暗色 | 分支统一用 `body[data-ds-dark-theme]`，**禁用 media query** | ThemePresenter 会固定主题【已核实】 |
| A4 | `[class$="_frame"]` | `background:var(--dsw-alias-bg-base);display:grid;height:100%` | `background:#fafafa` / 暗 `#080808` | opencode 最外层底【已核实目标值】 |
| A5 | `[data-platform=darwin] [class$="_frame"]` | `background:0 0`（透明） | `background:#fafafa` / 暗 `#080808`（显式给色） | macOS 透明让原生材质透出，opencode 是纯色平面 |
| A6 | `[class$="_sidebarCol"]` | `background:var(--dsw-specific-sidebar-fill);border-right:.5px solid var(--dsw-alias-border-l3)` | `background:#fafafa;border-right:.5px solid rgba(0,0,0,.08)` | 对齐 opencode 弱边框【已核实目标值】 |
| A7 | `[data-platform=darwin] [class$="_sidebarCol"]` | 紫蓝 `linear-gradient(#7a9bf0…)` + `color-mix` | `background:#fafafa`（暗 `#161616`），`background-image:none` | **必须显式覆盖**，否则侧栏仍是彩色渐变 |
| A8 | `[data-platform=darwin] [data-ds-dark-theme] [class$="_sidebarCol"]` | 暗色紫蓝渐变 | `background:#161616;background-image:none` | 同上，暗色分支 |
| A9 | `[class$="_centerCol"]` | `background:var(--dsw-alias-bg-base)` | `background:#fff` / 暗 `#161616` | opencode 基准面 |
| A10 | `[class$="_rightbarCol"]` | `background:var(--dsw-alias-bg-base)` | `background:#fff` / 暗 `#161616` | 同上 |
| A11 | `[class$="_bottomRow"]` | `background:var(--dsw-alias-bg-base);overflow:auto` | `background:#fafafa` / 暗 `#080808` | 与外壳底一致 |
| A12 | `[class$="_handle"]` | 8px 宽，无视觉 | 保持；`:after` 悬停指示线改 `1px`、`#0000001a` | opencode 用 0.5px 发丝线【推测】 |

### B. 侧栏

| # | 选择器 | 现有值 | 目标 opencode 值 | 理由 |
|---|---|---|---|---|
| B1 | `[class$="_root"]`（限定在 `[class$="_sidebarCol"]` 内） | `padding:6px 12px;background:var(--dsw-specific-sidebar-fill);font-size:14px` | `padding:0 8px 8px;background:transparent;font-size:13px` | opencode 外壳 `padding:0 8px 8px`，且底色由 frame 提供 |
| B2 | `[data-platform=darwin] [class$="_sidebarCol"] [class$="_root"]` | `background:0 0` | `background:transparent` | 让 A7 的纯色透出 |
| B3 | `[class$="_topStrip"]` | `height:52px;padding:0 12px 2px;justify-content:flex-end` | `height:auto;padding:8px 0;justify-content:flex-start` | opencode 顶栏是左对齐 logo + 右侧工作区名 |
| B4 | `[class$="_logoRow"]` | `height:60px;padding:8px 0 8px 4px;gap:8px;justify-content:flex-end` | `height:28px;padding:0;gap:4px;justify-content:flex-start` | 对齐 opencode 顶栏内层 `height:28px;gap:4px;padding:0 8px` |
| B5 | `[class$="_brandName"]` | `font-size:18px;font-weight:600;line-height:24px;letter-spacing:.04em` | `font-size:13px;font-weight:530;line-height:16.25px;letter-spacing:-0.04px` | opencode 无大字品牌名，用 13px/530 |
| B6 | `[class$="_buildVersion"]` | `background:var(--dsw-alias-label-primary);color:…-inverted;font-size:6px` | `background:rgba(0,0,0,.08);color:#5c5c5c;font-size:10px;line-height:16px;border-radius:6px` | opencode 无纯黑白反色徽标，改为弱底色标签 |
| B7 | `[class$="_newSession"]`（`button`） | `height:38px;border-radius:12px;border:.5px solid border-l3;background:button-elevated-fill;font-size:14px;font-weight:500;margin:0 2px 12px;padding:8px 12px` | `height:28px;border-radius:6px;border:.5px solid rgba(0,0,0,.08);background:transparent;font-size:13px;font-weight:440;margin:0 0 8px;padding:0 8px` | 对齐 opencode 左导航项 `height:28px;border-radius:6px;padding:0 6px;font-size:13px;font-weight:440` |
| B8 | `[class$="_newSession"]:hover` | `background:var(--dsw-alias-button-floating-hover)` | `background:rgba(0,0,0,.08);color:#161616` | opencode 激活/悬停底 |
| B9 | `[data-platform=darwin] [class$="_newSession"]` | `background:#ffffff8c`（半透明） | `background:transparent` | 覆盖 macOS 玻璃材质 |
| B10 | `[data-platform=darwin] [data-ds-dark-theme] [class$="_newSession"]` | `background:#ffffff26` | `background:transparent` | 同上暗色 |
| B11 | `[class$="_panelList"]` | `gap:2px;margin-bottom:8px` | `gap:4px;margin-bottom:32px` | opencode 列表 `gap:4px`、区块 `margin-bottom:32px` |
| B12 | `[class$="_panelRow"]` | `min-height:36px;border-radius:12px;gap:8px;margin:0 2px;padding:7px 8px;line-height:22px` | `min-height:28px;border-radius:6px;gap:8px;margin:0;padding:0 6px;line-height:20px;font-size:13px;font-weight:440` | 直接对齐 opencode 左导航项实测值 |
| B13 | `[class$="_panelRow"]:hover` | `background:var(--dsw-alias-interactive-bg-hover)` | `background:#0000001a` | opencode `--console-nav-hover` |
| B14 | `[class$="_panelRow"][class$="_panelActive"]` | `background:var(--dsw-alias-interactive-bg-hover);color:label-primary` | `background:rgba(0,0,0,.08);color:#161616` | opencode 激活导航项 |
| B15 | `[class$="_iconButton"]`（限 `[class$="_sidebarCol"]` 内） | `width:28px;height:28px;border-radius:8px` | `width:28px;height:28px;border-radius:6px` | 统一 6px 圆角 |
| B16 | `[class$="_iconButton"]:hover` | `background:var(--dsw-alias-interactive-bg-hover)` | `background:#0000001a` | opencode nav hover |
| B17 | `[class$="_regionArea"]` | `margin-left:-4px;margin-right:-12px;padding-left:4px` | 保持结构，仅调内层行样式 | 负边距是 DSH 滚动条贴边设计，动它会破布局 |
| B18 | `[class$="_footArea"]` | `flex-direction:column;flex:none` | 保持；上方加 `border-top:.5px solid rgba(0,0,0,.08)` | opencode 底部账号区有 0.5px 分隔 |
| B19 | `[class$="_buildVersion"]`, `[class$="_brandMark"]` 等杂项 | 各自 18px/6px | 统一 13px 体系 | 全局字号收敛 |

### C. 会话列表行（`ui-workspace`，`JoiKIa_*`）

| # | 选择器 | 现有值 | 目标 opencode 值 | 理由 |
|---|---|---|---|---|
| C1 | `[class$="_projectRow"], [class$="_sessionRow"]` | `border-radius:12px;padding:0 8px;gap:6px` | `border-radius:6px;padding:0 6px;gap:8px` | 对齐 opencode 导航项 |
| C2 | `[class$="_projectRow"]` | `height:34px` | `height:28px` | 同上 |
| C3 | `[class$="_sessionRow"]` | `height:32px;gap:0` | `height:28px` | 同上 |
| C4 | `[class$="_projectRow"]:hover, [class$="_sessionRow"]:hover, [class$="_sessionRow"][class$="_selected"]` | `background:var(--dsw-alias-interactive-bg-hover)` (`#2631480f`) | `background:rgba(0,0,0,.08)` | opencode 激活项底色，比 DSH 更实 |
| C5 | `[class$="_title"]`（限 `[class$="_projectRow"]/[class$="_sessionRow"]` 内） | `font-size:14px;line-height:20px` | `font-size:13px;line-height:20px;font-weight:440;letter-spacing:-0.04px` | opencode 行内正文 |
| C6 | `[class$="_meta"]` | `font-size:12px;line-height:20px;color:label-tertiary` | `font-size:13px;line-height:20px;color:#5c5c5c` | opencode 次文字 #5c5c5c |
| C7 | `[class$="_time"]` | `font-size:10px;line-height:16px;color:label-tertiary` | `font-size:12px;line-height:16px;color:#5c5c5c` | 10px 低于 opencode 最小字号 |
| C8 | `[class$="_rowActions"]` | `gap:15px;display:none`（hover 显示） | `gap:8px`，保留 hover 显示 | opencode 图标间距 8px |
| C9 | `[class$="_iconButton"]`（限 workspace 内） | `width:16px;height:16px;border-radius:4px` | `width:20px;height:20px;border-radius:6px` | 触达区偏小 |
| C10 | `[class$="_folderActive"]` | `color:var(--dsw-alias-state-business-primary)` | `color:#161616;font-weight:530` | opencode 层级靠字重不靠颜色 |

### D. 顶栏 / 标题栏

| # | 选择器 | 现有值 | 目标 opencode 值 | 理由 |
|---|---|---|---|---|
| D1 | `[class$="_header"]`（限 `[class$="_root"]` 且排除 `[class$="_sidebarCol"]` 祖先） | `min-height:76px;padding:10px 28px 0 20px;border-bottom:.5px solid var(--dsw-alias-border-l3)` | `min-height:0;padding:8px 20px;border-bottom:.5px solid rgba(0,0,0,.08)` | opencode 顶栏 `padding:8px 0` + 0.5px 弱边框 |
| D2 | `[class$="_titleRow"]` | `min-height:30px;padding-inline-start:max(0px, calc(var(--dsh-frame-leading-clearance,0px) - 20px))` | `min-height:28px`，**保留 padding-inline-start** | macOS 折叠侧栏时避让红绿灯，删了会压住窗口按钮 |
| D3 | `[class$="_header"] [class$="_crumb"]` | `border-radius:12px;padding:4px 8px;font-size:14px;line-height:20px;color:label-tertiary;max-width:220px` | `border-radius:6px;padding:0 8px;font-size:13px;line-height:20px;letter-spacing:-0.04px` | opencode 面包屑=导航项规格。**必须加 `_header` 祖先**：`_crumb` 有 2 个模块（另一个是斜杠菜单 `z8WDjq_crumb`） |
| D4 | `[class$="_header"] [class$="_crumbCurrent"]` | `color:label-primary;font-weight:500` | `color:#161616;font-weight:530` | opencode 激活字重 530 |
| D5 | `[class$="_header"] [class$="_crumbSep"]` | `color:var(--dsw-alias-label-caption);font-size:14px` | `color:gray;font-size:13px` | opencode 未激活/分隔用 gray |
| D6 | `[class$="_headerActions"], [class$="_headerUtilities"]` | `gap:8px` | `gap:4px` | opencode 顶栏内层 `gap:4px` |
| D7 | `[class$="_tabs"]` | `gap:16px 20px;margin-top:10px;padding-left:8px` | `gap:2px;margin-top:0;padding:0 5px;height:48px;align-items:center` | opencode tab 条实测 `height:48px;gap:2px;padding:0 5px` |
| D8 | `[class$="_viewTabs"]` | `gap:32px;min-height:25px` | `gap:2px;min-height:28px` | 同上 |
| D9 | `[class$="_tab"]` | `font-size:13px;font-weight:500;line-height:16px;padding:0 0 9px;min-height:25px;color:label-tertiary` | `font-size:13px;font-weight:440;line-height:16.25px;padding:0 8px;min-height:28px;color:gray` | opencode 未激活 tab = `color:rgb(128,128,128)`、weight 440 |
| D10 | `[class$="_tab"]:after` | `height:2px;border-radius:2px;bottom:-1px;background:transparent` | `height:1px;border-radius:0;bottom:0;background:#242424` | opencode 下划线 1px、无圆角、反色 |
| D11 | `[class$="_tabActive"]` | `color:var(--dsw-alias-state-business-primary)` | `color:#161616;font-weight:530` | opencode 激活 tab 是**反色文字**，不是强调蓝 |
| D12 | `[class$="_tabActive"]:after` | `background:var(--dsw-alias-state-business-primary)` | `background:#242424`（暗 `#fafafa`） | opencode `--v2-border-border-inverse` |
| D13 | `[class$="_tab"]`（未激活）过渡 | 无 | `transition:color 85ms ease-out` | opencode 颜色过渡 85ms |
| D14 | `[class$="_tab"]:after` 过渡 | 无 | `transform 220ms cubic-bezier(.77,0,.175,1)` | opencode tab 下划线滑动曲线 |
| D15 | `[class$="_tabLabel"]` | `max-width:88px` | `max-width:none` | opencode tab 不截断（`Activity/Go/Models…` 全宽） |

### E. 消息区

| # | 选择器 | 现有值 | 目标 opencode 值 | 理由 |
|---|---|---|---|---|
| E1 | `[class$="_scroll"]`（限 `[class$="_frame"]` 内 chat 祖先） | `padding:16px calc(var(--dsh-composer-side-clearance) + 16px)` | `padding:20px calc(var(--dsh-composer-side-clearance) + 20px)` | opencode 卡片内边距 20px |
| E2 | `[class$="_bubble"]` | `background:var(--dsw-specific-bubble)`(`#edf3fe`);`border-radius:20px`;`padding:10px 16px`;`font-size:14px;line-height:22px` | `background:#fafafa`(暗 `#242424`);`border:.5px solid rgba(0,0,0,.08)`;`border-radius:6px`;`padding:12px 16px`;`font-size:13px;line-height:20px;letter-spacing:-0.04px` | **去掉淡蓝 + 大圆角**，改 opencode 一级层 + 发丝边框 |
| E3 | `[class$="_userStack"]` | `max-width:min(calc(var(--dsh-chat-content-width,748px) * .702), 82%)` | 保持（对齐是 DSH 结构，opencode 无对应） | 结构差异大，硬改会难看 |
| E4 | `[class$="_userRow"]` | `gap:6px` | `gap:8px` | 与 opencode 行距一致 |
| E5 | `[class$="_root"]`（AssistantMarkdown 祖先限定 `[class$="_flowItem"]`） | `font-size:14px;line-height:calc(24px + delta)` | `font-size:13px;line-height:20px;letter-spacing:-0.04px` | opencode 行内正文 |
| E6 | `[class$="_body"]`（限 markdown 祖先） | `gap:16px` | `gap:20px` | opencode 区块间距 20px |
| E7 | `[class$="_fileCard"]` | `border-radius:16px;border:.5px solid border-l2;flex:0 0 240px;min-height:64px;padding:8px 12px` | `border-radius:6px;border:.5px solid rgba(0,0,0,.08);min-height:56px;padding:8px 12px` | 统一 6px |
| E8 | `[class$="_fileName"]` | `font-size:14px;font-weight:500` | `font-size:13px;font-weight:530` | opencode 强调字重 530 |
| E9 | `[class$="_compactionButton"], [class$="_retrySummary"]` | `border-radius:8px;color:label-tertiary` | `border-radius:6px;color:#5c5c5c` | 统一 |
| E10 | `[class$="_ioCard"]` | `border:.5px solid border-l1;border-radius:16px;background:markdown-code-block;margin:4px 0 4px 4px` | `border-radius:6px;border-color:rgba(0,0,0,.08);margin:8px 0 8px 4px` | 统一 6px + opencode 0.5px `.08` 边框 |
| E11 | `[class$="_ioSection"]` | `column-gap:14px;padding:12px 16px;max-height:150px` | `column-gap:24px;padding:16px;max-height:180px` | opencode 卡片 `gap:24px;padding:20px`（按比例收敛） |
| E12 | `[class$="_ioLabel"]` | `color:label-caption` | `color:#5c5c5c;font-size:13px` | opencode 说明文字 |
| E13 | `[class$="_bodyScroll"]` | `max-height:260px` | `max-height:280px` | 视觉比例 |
| E14 | `[class$="_inspectButton"]` | `border-radius:999px;font-size:11px;padding:2px 8px;border:.5px solid border-l3` | `border-radius:6px;font-size:12px;padding:2px 8px;border-color:rgba(0,0,0,.08)` | **去胶囊**，opencode 绝不用大圆角 |
| E15 | `[class$="_subCalls"]` | `border-left:.5px solid border-l2;margin:4px 0 2px 22px;padding-left:8px;gap:4px` | `border-left:.5px solid rgba(0,0,0,.08);padding-left:12px;gap:6px` | 保持缩进线，对齐边框色 |
| E16 | `[class$="_title"]`（工具行） | `font-weight:400` | `font-weight:440` | opencode 正文 440 |
| E17 | `[class$="_summary"]`（工具行） | `font-size:13px;line-height:calc(24px + delta)` | `font-size:13px;line-height:20px` | 行高收敛 |
| E18 | `[class$="_toBottom"]` | `width:34px;height:34px;border-radius:100px;box-shadow:var(--dsw-elevation-panel)` | `width:32px;height:32px;border-radius:6px;box-shadow:none;border:.5px solid rgba(0,0,0,.08)` | **去阴影去胶囊** |
| E19 | `[class$="_runningDivider"]` | `height:.5px`，`color-mix` 边框色 | `height:.5px;background:rgba(0,0,0,.08)` | 简化色值 |
| E20 | `[class$="_stopped"]` | `border-radius:8px;background:interactive-bg-hover;font-size:11px` | `border-radius:6px;background:rgba(0,0,0,.08);font-size:12px` | 统一 |

### F. composer（重点）

| # | 选择器 | 现有值 | 目标 opencode 值 | 理由 |
|---|---|---|---|---|
| F1 | `[class$="_card"]`（限 composer 根内） | `border-radius:28px;box-shadow:var(--dsw-elevation-soft);background:var(--dsw-specific-input-major);font-size:14px;line-height:calc(24px+delta);gap:12px;padding-top:8px` | `border-radius:6px;box-shadow:none;border:.5px solid rgba(0,0,0,.08);background:#fff`(暗 `#161616`);`font-size:13px;line-height:20px;letter-spacing:-0.04px;gap:8px;padding-top:0` | **opencode 核心：6px 圆角 + 0.5px 发丝边框 + 零阴影** |
| F2 | `[class$="_cardWorkspaceTrigger"]:after` | `border:1px dashed;border-radius:28px;color:border-l4` | `border:1px dashed;border-radius:6px;color:rgba(0,0,0,.14)` | 保留虚线交互语义，只改形状/色 |
| F3 | `[class$="_cardWorkspaceTrigger"]:hover:after` | `color:var(--dsw-alias-state-business-primary)` | `color:#3b5cf6` | opencode 强调蓝 |
| F4 | `[class$="_input"]` | `min-height:36px;padding:4px 8px 0 14px;line-height:inherit;caret-color:var(--dsw-alias-state-business-primary)` | `min-height:32px;padding:8px 10px 0 12px;caret-color:#3b5cf6;font-size:13px;line-height:20px` | 对齐 opencode 13px/20px 与强调蓝光标 |
| F5 | `[class$="_hero"] [class$="_input"]` | `min-height:52px` | `min-height:48px` | 按比例收敛 |
| F6 | `[class$="_placeholder"]` | `inset:4px 8px auto 14px;color:label-caption` | `inset:8px 10px auto 12px;color:gray;font-size:13px` | opencode 占位/未激活 gray |
| F7 | `[class$="_row"]` | `gap:12px;padding:2px 8px 6px` | `gap:8px;padding:4px 8px 8px` | opencode 8px 节奏 |
| F8 | `[class$="_tools"], [class$="_modes"]` | `gap:12px` | `gap:8px` | 同上 |
| F9 | `[class$="_trailing"]` | `gap:12px;margin-left:auto` | `gap:8px` | 同上 |
| F10 | `[class$="_add"]` | `width:28px;height:28px;border-radius:999px;background:var(--dsw-specific-selector)` | `width:28px;height:28px;border-radius:6px;background:transparent;border:.5px solid rgba(0,0,0,.08)` | **去胶囊**，opencode 无圆形按钮 |
| F11 | `[class$="_add"]:hover` | `background:var(--dsw-alias-interactive-bg-hover-solid)` | `background:rgba(0,0,0,.08)` | opencode hover |
| F12 | `[class$="_select"]` | `height:28px;border-radius:8px;font-size:13px;font-weight:500;color:label-secondary;background-image:url(…%2381858C…)` | `height:28px;border-radius:6px;font-size:13px;font-weight:440;color:#5c5c5c` | 统一圆角与字重；箭头 SVG 色值可换成 `#5c5c5c` |
| F13 | `[class$="_primary"]` | `width:34px;height:34px;border-radius:999px;background:var(--dsw-alias-button-info-fill);color:#fff;transform:translateY(-2px);transition:background-color .1s` | `width:30px;height:30px;border-radius:6px;background:#3b5cf6;color:#fff;transform:none;transition:background-color 85ms ease-out` | **opencode 主按钮是 6px 圆角矩形 + `#3b5cf6`** |
| F14 | `[class$="_primary"]:hover` | `background:var(--dsw-alias-button-info-hover)` | `background:#3250df` | opencode `--v2-text-text-accent-hover` |
| F15 | `[class$="_primary"]:disabled` | `opacity:.4` | `opacity:.4`（保持） | 无需改 |
| F16 | **`[data-composer-dock]`** | `justify-content:center;align-items:center;gap:12px;padding-top:4px` | `justify-content:space-between;align-items:center;gap:8px;padding:8px 4px 0;border-top:.5px solid rgba(0,0,0,.08)` | ★ **状态行对齐 opencode 卡片行**：`justify-content:space-between;gap:24px;padding:20px 0`，加 0.5px 分隔 |
| F17 | `[data-composer-dock] > *` | 无 | `font-size:13px;line-height:20px;color:#5c5c5c` | 统一状态行字号 |
| F18 | `.dshgb-pill`（既有插件类） | `border-radius:8px;color:var(--dsw-alias-label-tertiary);gap:6px;padding:1px 8px;font-size:calc(13px - 1px)` | `border-radius:6px;color:#5c5c5c;gap:6px;padding:0;font-size:13px;line-height:20px` | 与 `ContextMeter`/`StatsPills` 同规格 |
| F19 | `.dshgb-pill svg` | `width:14px;height:14px` | `width:16px;height:16px` | opencode 导航图标 16px |
| F20 | `.dshgb-pill:hover` | 无 | `background:rgba(0,0,0,.08);color:#161616` | 与 `X0HXfW_trigger:hover` 行为一致 |
| F21 | `[data-composer-dock] [class$="_trigger"]` | `border-radius:8px;color:label-tertiary;gap:6px;padding:1px 8px;font-size:13px` | `border-radius:6px;color:#5c5c5c;gap:6px;padding:0;font-size:13px;line-height:20px` | 与 F18 对齐，避免两种 pill 不一致。**必须用 `[data-composer-dock]` 限定**：`_trigger` 有 3 个模块（ContextMeter / TurnUsagePanel / ModelSelect） |
| F22 | `[data-composer-dock] [class$="_trigger"]:hover`, `[data-composer-dock] [class$="_trigger"][aria-expanded=true]` | `background:var(--dsw-alias-interactive-bg-hover);color:label-secondary` | `background:#0000001a;color:#161616` | opencode hover |
| F23 | `[data-composer-dock] [class$="_bar"]`（ContextMeter 进度条） | `height:4px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover)` | `height:2px;border-radius:0;background:rgba(0,0,0,.08)` | opencode 无胶囊、发丝化 |
| F24 | `[class$="_notice"]` | `border-radius:12px;background:interactive-bg-hover;font-size:12px` | `border-radius:6px;background:#fafafa;border:.5px solid rgba(0,0,0,.08);font-size:12px;line-height:18px` | 统一 |
| F25 | `[class$="_composerSeat"]` | `position:sticky;background:linear-gradient(180deg, transparent 0px, var(--dsw-alias-bg-base) 36px)` | 保留渐变，色值换 `#fff`/`#161616` | 吸底遮罩必须保留，否则消息穿透 |

### G. 右侧栏

| # | 选择器 | 现有值 | 目标 opencode 值 | 理由 |
|---|---|---|---|---|
| G1 | `[class$="_panel"]` | `position:absolute;right:0;top:0;bottom:0` | 保持 | 结构差异大，不动 |
| G2 | `[class$="_panelBody"], [class$="_tabBody"]` | `display:flex` | 保持 | — |
| G3 | `[class$="_iconButton"]`（限 `[class$="_panel"]` 内） | `width:28px;height:28px;border-radius:8px;padding:6px` | `border-radius:6px` | 统一 6px |
| G4 | `[class$="_unavailable"]` | `color:label-tertiary;font-size:13px;padding:12px` | `color:#5c5c5c;font-size:13px;line-height:20px;padding:20px` | opencode 卡片内边距 20px |
| G5 | `[class$="_guide"], [class$="_entryCell"]` | 默认 | `border-radius:6px`，`[class$="_entry"]:hover{background:#0000001a}` | 统一 |
| G6 | DockKit tab（`_tabStrip_6nhg2_237`, `_tab_6nhg2_134`） | `height:28px;border-radius:var(--dsw-radius-sm);激活 background:var(--dsw-alias-markdown-tag)` | `border-radius:6px`，激活 `background:rgba(0,0,0,.08)` | **注意：这批是 `_name_hash` 命名，`[class$=]` 命中不了** |

### H. 通用收敛

| # | 选择器 | 现有值 | 目标 opencode 值 | 理由 |
|---|---|---|---|---|
| H1 | 全局 `border-radius` 相关（列出全部） | `4/8/12/16/20/28/999` | 统一 `6px` | opencode 只用 6px |
| H2 | 全局 `box-shadow` | `--dsw-elevation-soft/panel/prominent` | `none`（弹层可保留 `elevation-prominent`） | opencode `box-shadow:none`；但菜单/对话框若无阴影会失去层次，建议**仅弹层保留**【推测】 |
| H3 | 全局过渡 | `--ds-transition-duration:.2s` + `cubic-bezier(.4,0,.2,1)` | `background-color 85ms ease-out, color 85ms ease-out` | opencode 实测 |
| H4 | `@media (prefers-reduced-motion: reduce)` | DSH 已有部分覆盖 | 新增规则全部补上 `transition:none;animation:none` | opencode 用 `motion-reduce:` 变体 |
| H5 | 强调色 | `#4176e6` / `#7aaaff` | `#3b5cf6` / `#a2bcff` | opencode accent |
| H6 | `--dsw-alias-state-business-primary` | `deepseek-500` / `deepseek-400` | `#3b5cf6` / `#a2bcff` | 一处覆写可同时改掉 tab、folder、caret、pending dot |

**清单条数：A 12 + B 19 + C 10 + D 15 + E 20 + F 25 + G 6 + H 6 = 113 条。**

---

## 9. 风险

### 9.1 `[class$="_x"]` 后缀碰撞 —— 最高风险 **【已核实】**

实测：303 个后缀中 **32 个被多个模块复用**，最严重的：

| 后缀 | 命中模块数 | 裸写选择器的后果 |
|---|---|---|
| `_root` | **17** | `[class$="_root"]{font-size:13px}` 会改到侧栏根、会话根、ChatView、TodoPanel、Markdown、ToolRow…几乎整个应用 |
| `_chevron` | 8 | 折叠箭头全部同时变形 |
| `_title` | 8 | 侧栏、会话行、工具行、Markdown、面板标题一起变 |
| `_body` | 7 | 消息体、Markdown 体、工具体、TodoPanel 体 |
| `_iconButton` | 4 | 侧栏、右栏、workspace 行、HeaderLeadingControls 一起变 |
| `_label` / `_row` / `_header` | 4 each | — |
| `_content` / `_leading` / `_summary` / `_actions` / `_trigger` / `_panel` / `_visuallyHidden` | 3 each | — |
| `_crumb` | **2** | `kiGsTW_crumb`（会话面包屑）与 `z8WDjq_crumb`（斜杠菜单面包屑）——**本文档 D3/D4/D5 若裸写会同时命中**，已在下方 D 组修正 |

**缓解**：每条规则都必须限定祖先，例如
`[class$="_sidebarCol"] [class$="_root"]`、`[class$="_panel"] [class$="_iconButton"]`。
优先使用**属性锚点**（`[data-composer-dock]`、`[data-composer-stat]`、
`[data-shell-bottom]`、`[data-sidebar-col]`、`[data-chat-flow-kind]`）而不是类名——
这些是语义化、跨构建稳定的。

### 9.2 命名体系不一致 **【已核实】**

- `ui-*` 包用 **`hash_name`**（CSS Modules），可用 `[class$="_name"]`。
- `dsh-web-frontend` 用 **`_name_hash`**（Vite CSS Modules），**`[class$=]` 完全命中不了**，
  只能用 `[class*="_markdown_"]` 这类中缀匹配，或者靠标签/结构选择器。
  受影响：Markdown 排版、代码块、DockKit 面板、菜单、模态框、Tooltip。
- 内联样式（`AppFrame` 的 `gridTemplateColumns`）无法用 CSS 覆盖，只能改 JS 或不用。

### 9.3 opencode 是 console，不是聊天应用 —— 结构性风险 **【推测】**

`opencode.ai/console` 是**设置/控制台界面**：三段式布局、左导航 180px、内容 640px、
卡片行 + 0.5px 分隔线。它**没有**：对话气泡、消息流、工具调用卡片、composer 输入卡片、
右侧 dock 面板。

所以：

- **设置页**（`surface-settings` 那条线）是**真正可 1:1 移植**的。
- **主界面**（本文档）只能做**气质迁移**：平面化、6px 圆角、发丝边框、零阴影、
  13px/440/-0.04px、灰度层级、唯一强调蓝。**不能指望「和 opencode 长得一样」**，
  因为不存在对应的 opencode 聊天界面可对照。
- 具体会「硬套难看」的地方：
  1. **用户气泡**（`AkCqbG_bubble`）：opencode 无气泡概念。去掉淡蓝 + 20px 圆角后，
     若同时去掉内边距和背景，用户消息会失去「右对齐块」的视觉锚点。
     建议保留浅底（`#fafafa`/`#242424`）+ 0.5px 边框 + 6px 圆角，**不要**改成纯文本。
  2. **composer 卡片**：opencode 的输入区是「表格行」不是「浮起卡片」。
     去阴影后卡片会「贴」在页面上，需要靠 0.5px 边框 + 上下留白维持层次，
     否则会显得像没做完。
  3. **右侧 dock**：opencode 无对应物，任何改造都是自创。
  4. **工具调用卡片**（`ioCard` + `bodyScroll`）：opencode 无对应物。
  5. **侧栏 + 主区并置**：opencode 主界面没有常驻侧栏（顶栏 + tab 条横向导航）。
     把 DSH 侧栏「压扁」成 28px 行高后，会话列表的层级感会明显下降。

### 9.4 平台差异 **【已核实】**

- 本机 macOS：`html[data-platform=darwin]`，侧栏渐变 + 透明 body + `leadingSeat`。
  不做 A5/A7/A8 覆盖，改造会「只改了暗色没改亮色」或反之。
- Windows：`html[data-windows-titlebar]`，一大串 `position:fixed` 特例。
  用 `!important` 覆盖 `_newSession` / `_logoRow` 的 `height`/`margin` 会破坏
  Windows 标题栏对齐。建议规则**只针对 `html[data-platform=darwin]`**，
  Windows 单独出一组。
- 折叠态（darwin 宽度 0）：侧栏整列消失，所有侧栏规则失效，
  此时入口在 `PIRFFq_leadingSeat`（`top:11px;left:88px`）。改造需覆盖 `xoYuoq_iconButton`。

### 9.5 主题固定 **【已核实】**

ThemePresenter 把主题偏好（`light`/`dark`/`system`）解析后写 `body[data-ds-dark-theme]`。
**必须**用属性分支而不是 `prefers-color-scheme`，否则用户固定浅色而系统深色时配色错乱。

### 9.6 既有插件的两条隐藏规则 **【已核实 / 部分推测】**

`dsh-git-branch/client.js` 的
`[class$="_logoRow"]{display:none!important}` 与 `button[class$="_newSession"]{display:none!important}`：

- **已核实**：两者都精确命中（`logoRow` 是 `div`、`newSession` 是 `button`），
  且 `_logoRow` / `_newSession` 在 303 个后缀中**无同名碰撞**（碰撞列表里没有它们）。
- **推测**：但 `!important` + 裸后缀仍是脆的——一旦上游把 `newSession` 从 `button`
  换成 `div`/`a`，第二条立刻失效。opencode 风格改造里若要「保留新会话入口」，
  应改为**重绘**（B7/B8）而不是隐藏。

### 9.7 不可用的验证手段 **【已核实】**

本次**没有**运行时验证：未启动服务、未改 profile、未安装插件。
所有选择器都来自静态源码，**未在真实 DOM 上确认命中**。
特别是 9.1 的碰撞与 9.2 的命名体系，必须在实施后用 `getComputedStyle` 抽样复核。

---

## 10. 给实施者的最短路径

1. 先做 **§7.3 映射总表** 里的 6 个全局变量覆写（H5/H6 + 圆角 + 阴影 + 字体），
   一条规则能带动大半视觉变化。
2. 再做 **A5/A7/A8**（darwin 侧栏渐变与透明 body）——不做这三条，后面全白做。
3. 再做 **F1/F13/F16**（composer 卡片、主按钮、dock 状态行）——任务指定的重点。
4. 再做 **D7–D15**（tab 条）——与 opencode 结构最接近、收益最高。
5. 最后做消息区（E 组）与侧栏行（B/C 组）。
6. 每加一条规则，用 `[data-*]` 锚点或祖先限定的方式自查一次 9.1。
