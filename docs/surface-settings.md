# DSH 设置页（surface: settings）DOM/CSS 结构 + opencode 化改造清单

> 产出：task-1 / 作者：teammate `surface-settings`
> 目标风格 token 来源：`.research-opencode-ui/opencode-tokens.md`
> 证据来源：`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar` 内真实 bundle（只读导出到 `/tmp/ocui`，未改动任何插件源码）
> 版本基线：DSH `0.2.1-rc.5`（该字符串由 `CurrentVersionRow` 内联，见下）

**约定**：本文所有「已核实」条目 = 我真实读到的 bundle 源码 / CSS 字符串原文；「推测」= 基于 opencode token 的设计判断，无 DSH 源码依据。凡选择器一律给**后缀匹配**写法，不写死 hash。

---

## 0. 结论摘要 + 对任务描述中 3 处假设的更正

| # | 任务描述里的假设 | 实际核实结果 | 影响 |
|---|---|---|---|
| 1 | `dsh-client-ui-settings/lib/client.js`（设置页宿主） | ❌ **该包不渲染任何 DOM**。它是纯 service 包，只 `inject = ["remote", "remote.settings"]`，提供 `SettingsSchemaService` / `SettingsDescribeMirror` / `ConfigForms`，**没有注册任何 slot、没有 CSS、没有组件**。真正的设置页宿主是 **`dsh-client-ui-settings-general`**（导出 `SettingsRoot` / `SettingsPanel`）。 | 皮肤插件若想改设置页骨架，必须打 `settings-general` 的类名，不是 `settings`。 |
| 2 | `dsh-client-ui-settings-shell/lib/client.js`（设置页宿主） | ❌ **同名不同物**。`dsh-client-ui-settings-shell` 是**「终端（Shell 执行器）」这一页的配置卡片**（命令超时 / 单流输出上限），注册进 `plugins.item` slot，`order: 40`。它跟设置页外壳无关。 | 别把它当外壳改，否则改错文件。 |
| 3 | 「设置页：左导航 + 内容区」+「顶栏 + 标签条」 | ⚠️ **半对**。左导航 ✅ 存在。但设置页**不是页面，是 body portal 的模态框**（`createPortal(..., document.body)`，`role="dialog"` `aria-modal="true"` `data-shortcut-modal="settings"`），**没有顶栏、没有设置级标签条**。标签条只存在于 **Plugins 页内部**（`syyOqq_tabs`）。 | 见 §4 与 §8 风险 R1，这是本次改造最大的结构鸿沟。 |
| 4 | primitives 包不在 asar 里，可能被打进 `dsh-web-frontend/dist/assets/index-BXV-oxvX.js` | ✅ **完全正确**。`dsh-client-ui-primitives` 在 asar 全库 18237 个条目里 **0 命中**；`SettingsForm` / `SettingsValueField` / `Switch` 等确实在 `index-BXV-oxvX.js`（941436 B）里，且其 CSS 在**同目录的 `index-BNyAYEM7.css`（77471 B）**里。 | 见 §2 命名约定差异，这决定了选择器怎么写。 |

**另一个必须知道的坑**：`navIcon()` 里有 `id === "archived-sessions"` 的分支，但我在**全部 76 个 `lib/client.js`（含非 `dsh-client-ui-*` 包）里都没找到 `archived-sessions` 这个 `settings.section` 注册**。所以该导航项在当前构建里**不会出现**（要么是未安装插件的预留，要么是死代码）。→ 归入「未核实」，不要为它写 CSS。

---

## 1. 证据与方法

| 项 | 内容 |
|---|---|
| asar 读取 | `.research-opencode-ui/asar.mjs`（`list` / `cat` / `extract`） |
| 设置外壳 | `dsh/node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js`（59958 B） |
| 服务层（无 DOM） | `.../dsh-client-ui-settings/lib/client.js`（57756 B） |
| Plugins 页 | `.../dsh-client-ui-settings-plugins/lib/client.js`（9757 B） |
| Plugins 页 · 清单 tab | `.../dsh-client-ui-settings-plugin-inventory/lib/client.js`（41732 B） |
| Models 页 | `.../dsh-client-ui-settings-models/lib/client.js`（211330 B） |
| Account 页 | `.../dsh-client-ui-settings-account/lib/client.js`（3417991 B） |
| 终端页（≠外壳） | `.../dsh-client-ui-settings-shell/lib/client.js`（7304 B） |
| **primitives** | `.../dsh-web-frontend/dist/assets/index-BXV-oxvX.js` |
| **primitives CSS** | `.../dsh-web-frontend/dist/assets/index-BNyAYEM7.css` |
| 主题变量 | `.../dsh-client-ui-theme/lib/client.js` |
| 侧栏外壳 | `.../dsh-client-ui-sidebar/lib/client.js` |

CSS 注入机制（已核实）：每个插件的 CSS 是一个 JS 字符串，运行时用
`document.createElement("style")` + `tag.dataset.pluginCss = "<pkg>/<File>.module.css"` 追加到 `<head>`。
→ **皮肤插件只要后加载，同特异度下天然胜出**；但设置外壳的规则多是**单类选择器**（特异度 0,1,0），皮肤用 `[class$="..."]`（0,1,0）+ 后置即可覆盖，无需 `!important`。**推荐给皮肤插件的所有规则加一层宿主前缀提高特异度**，例如 `[data-shortcut-modal="settings"] [class$="_navCell"]`（0,2,0），更稳。

---

## 2. ⚠️ 两套类名约定（写选择器前必须分清）

这是本次调研最重要的操作性结论：**DSH 里存在两套互不相同的 CSS Module 命名**。

### 2.1 插件 CSS：`<hash>_<名字>`，**名字在后**

例（`SettingsRoot.module.css`，已核实原文）：

```js
const css$7 = "._77Pn0W_nav{...}._77Pn0W_navCell{...}._77Pn0W_navList{...}";
var SettingsRoot_module_css_default = { "nav": "_77Pn0W_nav", "navCell": "_77Pn0W_navCell", ... };
```

* DOM 上的 class 字符串 = `_77Pn0W_navCell`（**带前导下划线**）
* ✅ **稳定后缀** = `navCell`
* ✅ 选择器：`[class$="_navCell"]`
* ⚠️ 注意：`nav` 是 `navCell` / `navIcon` / `navLabel` / `navList` / `navTitle` 的**前缀**，所以**不要**用 `[class*="_nav"]`（会误伤 5 个类）。**必须用 `$=`**。

### 2.2 前端 primitives：`_<名字>_<hash>_<序号>`，**名字在前、hash 在后、还带一个数字**

例（`index-BXV-oxvX.js`，已核实原文）：

```js
iM="_field_bjqpo_3", oM="_head_bjqpo_14", sM="_label_bjqpo_20", aM="_labelGroup_bjqpo_29",
lM="_helpButton_bjqpo_41", cM="_help_bjqpo_41", uM=..., dM="_reset_bjqpo_88",
fM="_input_bjqpo_107", hM="_invalid_bjqpo_133", pM="_hint_bjqpo_140",
_t={field:iM, head:oM, label:sM, labelGroup:aM, helpButton:lM, help:cM, badges:uM, reset:dM, input:fM, invalid:hM, hint:pM}
```

* DOM 上的 class = `_field_bjqpo_3`（**名字在最前**，`bjqpo` 是 hash，`3` 是模块内序号）
* ❌ `$=` 后缀匹配在这里**不可用**（后缀是易变数字）
* ✅ 可用 `[class^="_field_"]`（这些组件的 `className` 基本都是单类，未经 `clsx` 拼接）
* ✅ 更稳：**别用类名，用 ARIA / 结构 / `data-*`**（见 §6 每条给出的「推荐选择器」）

### 2.3 稳定锚点清单（与 hash 完全无关，优先使用）

| 锚点 | 值 | 出处（已核实） |
|---|---|---|
| 设置面板根 | `[data-shortcut-modal="settings"]` | `SettingsPanel`：`"data-shortcut-modal": "settings"` |
| 面板 role | `[role="dialog"][aria-modal="true"]` | 同上 |
| 当前导航项 | `[aria-current="true"]` | `navCell`：`"aria-current": row.id === active ? "true" : void 0` |
| 导航项激活 class | `.77Pn0W_active`（与 navCell 并列） | `clsx(navCell, active)` |
| General 区容器 | `[data-slot="settings.general.item"]` | `GeneralSection.module.css`：`.YSv5hq_section>[data-slot="settings.general.item"]>…` |
| 开关 | `button[role="switch"]` | `Switch`：`type:"button", role:"switch", "aria-checked":e, "aria-label":r` |
| 开关关/开 | `[aria-checked="false"]` / `[aria-checked="true"]` | `Switch` CSS 原文 |
| Plugins 标签 | `[role="tab"]` / `[role="tablist"]` | `PluginsSettingsSection` |
| Plugins 激活标签 | `[data-active="true"]` **且** `[aria-selected="true"]` | 两者都写了 |
| 数字输入 | `input[inputmode="numeric"]` | `SettingsValueField`：`numeric===!0?{inputMode:"numeric"}` |
| 无效输入 | `input[aria-invalid="true"]` | 同上 |
| 说明/错误段 | `[aria-describedby]` 指向的 `p` | `_t.invalid` / `_t.hint` 二选一 |

---

## 3. 设置页 DOM 骨架（逐层）

### 3.1 挂载点与入口（侧栏底部）

**已核实**：`settings-general` 把 `SettingsRoot` 注册进 slot **`sidebar.settings`**（`ctx.slots.register({ name: "sidebar.settings", locale: NS, store: shellStore, children: {...} }, SettingsRoot)`）。

侧栏宿主（`dsh-client-ui-sidebar`）在 `footArea` 里渲染它：

```
div.kB3qhq_footArea            (flex; flex-direction:column; flex:none)   ← 收起态额外 align-items:center
└── div.kB3qhq_footerActions   (flex:none; width:100%; min-width:0)        ← 收起态 justify-content:center; width:auto
    └── renderSlot("sidebar.settings", { wide })
        └── [SettingsRoot 输出的 triggerRow]
```

> 侧栏其它相关类（已核实）：`kB3qhq_regionArea`（`sidebar.workspaces` 宿主，`flex:1; min-height:0; overflow:hidden`）、`kB3qhq_topStrip`（`height:52px; padding:0 12px 2px; justify-content:flex-end`）、`kB3qhq_toggle`。
> `kB3qhq_settingsArea` 在 class map 里存在，但我没在 CSS 串里找到它的规则 → **未核实其样式**。

**`SettingsRoot` 返回的入口行（已核实结构）**：

```
div.77Pn0W_triggerRow           (+ .77Pn0W_railRow 当 !wide)
├── button.77Pn0W_trigger       (+ .77Pn0W_rail 当 !wide)   aria-haspopup="dialog" aria-expanded
│   └── slot "settings.trigger" → TriggerContent:
│       IconSettingsOutlineMedium(size = wide ? 16 : 18)
│       + span.LBtQRq_triggerLabel  (仅 wide)  ← 唯一 CSS: white-space:nowrap; overflow:hidden
├── ConnectionIndicator   (primitive；state ∈ connecting/disconnected/recovered)
└── DesktopUpdateIndicator  (css$6 / G-tjAW_*)
```

| 选择器（推荐写法） | 关键计算样式（**已核实**原文） |
|---|---|
| `[class$="_triggerRow"]` | `flex:none; align-items:center; gap:8px; width:calc(100% + 4px); margin:4px -2px; display:flex; position:relative` |
| `[class$="_triggerRow"][class$="_railRow"]` | `width:36px; margin:8px 0 10px` |
| `[class$="_trigger"]` | `border-radius:var(--dsw-radius-md); height:42px; padding:0 10px 0 8px; gap:8px; font-size:14px; line-height:22px; color:var(--dsw-alias-label-primary); background:0 0; border:none` |
| `[class$="_trigger"]:hover` | `background:var(--dsw-alias-interactive-bg-hover)` |
| `[class$="_trigger"][class$="_rail"]` | `width:36px; height:36px; justify-content:center; gap:0; padding:0` |
| `[class$="_triggerLabel"]` | `white-space:nowrap; overflow:hidden` |

### 3.2 面板：body portal 模态框（**已核实**）

```
document.body
└── div.77Pn0W_overlay                    role="presentation"   ← createPortal 目标
    │   已核实: z-index:1000; justify-content:center; align-items:center; display:flex; position:fixed; inset:0
    ├── div.77Pn0W_mask                   aria-hidden="true"  onClick=onClose
    │       已核实: inset:var(--dsh-frame-chrome-top,0px) 0 0; background:var(--dsw-alias-bg-mask-1); backdrop-filter:var(--dsw-mask-blur); position:absolute
    └── div.77Pn0W_panel                  ref; tabIndex=-1; role="dialog"; aria-modal="true"
        │      data-shortcut-modal="settings"; aria-labelledby=<navTitle 的 id>
        │      已核实: z-index:1; width:800px; height:min(800px, calc(100vh - 2*max(24px, var(--dsh-frame-overlay-top,24px))));
        │              border-radius:var(--dsw-radius-panel); background:var(--dsw-alias-bg-layer-2);
        │              max-width:calc(100vw - 48px); box-shadow:var(--dsw-elevation-prominent);
        │              display:flex; position:relative; overflow:hidden
        ├── nav.77Pn0W_nav          ← 左导航（§3.3）
        └── div.77Pn0W_content      ← 右内容（§3.4）
```

| 选择器 | 现有值（已核实） | 备注 |
|---|---|---|
| `[class$="_overlay"]` | `position:fixed; inset:0; z-index:1000; display:flex; center/center` | 全屏遮罩层 |
| `[class$="_mask"]` | `background:var(--dsw-alias-bg-mask-1); backdrop-filter:var(--dsw-mask-blur)` | |
| `[data-shortcut-modal="settings"]` / `[class$="_panel"]` | `width:800px; height:min(800px,…); border-radius:var(--dsw-radius-panel)`(=`28px`); `background:var(--dsw-alias-bg-layer-2)`; `box-shadow:var(--dsw-elevation-prominent); overflow:hidden` | **opencode 无此物**，见 R1 |

### 3.3 左导航（**已核实**）

```
nav.77Pn0W_nav
│   已核实: box-sizing:border-box; flex-direction:column; flex:none; gap:18px; width:188px; padding:22px 12px 0; display:flex
├── div.77Pn0W_navTitle      id={titleId} tabIndex=-1 [data-modal-autofocus]
│   │   已核实: color:var(--dsw-alias-label-primary); padding:0 12px; font-size:16px; font-weight:500; line-height:24px
│   └── slot "settings.header" → HeaderContent → 纯文本 t("title")   （无元素包裹）
└── div.77Pn0W_navList
    │   已核实: flex-direction:column; gap:4px; display:flex; overflow-y:auto
    └── button.77Pn0W_navCell [ + .77Pn0W_active ]   type="button"
        │   aria-current="true"（仅激活项）; data-modal-autofocus（仅激活项）
        │   已核实: border-radius:var(--dsw-radius-md); height:40px; text-align:left; background:0 0; border:none;
        │           align-items:center; gap:8px; padding:9px 16px 9px 12px;
        │           font-size:14px; font-weight:400; line-height:22px; display:flex
        ├── navIcon(id) → Icon*(size:16)  className=77Pn0W_navIcon
        │      已核实: flex:none
        │      icon 映射: account→IconUserOutlineMedium; models→IconDataOutlineMedium;
        │                 agent-presets→IconAgentPresetOutlineMedium; plugins→IconPersonalizationOutlineMedium;
        │                 archived-sessions→IconArchiveOutlineMedium; 其它(含 general)→IconSettingsOutlineMedium
        └── span.77Pn0W_navLabel   → row.label
               已核实: white-space:nowrap; text-overflow:ellipsis; flex:1; min-width:0; overflow:hidden
```

**导航项顺序（已核实 `order`）**：

| order | id | label 来源 | 注册包 | 条件 |
|---|---|---|---|---|
| `-10` | `account` | `t("nav")` @ `settings.account` | `settings-account` | **仅当 `view.status === "credential-stored"`**（动态 register/unregister） |
| `0` | `general` | `t("general.nav")` @ `settings.general` | `settings-general` | 恒在 |
| `10` | `models` | `t("nav")` @ `settings.models` | `settings-models` | 恒在 |
| `15` | `plugins` | `t("nav")` @ `settings.plugins` | `settings-plugins` | 恒在 |
| `20` | `agent-presets` | `t("nav")` @ `settings.agentPreset` | `agent-preset` | 恒在 |
| — | `archived-sessions` | — | **未找到注册者** | 见 §0 |

排序逻辑（已核实）：`.sort((a, b) => a.order - b.order)`。

**激活态标记**：`aria-current="true"` **和** class `77Pn0W_active` **同时存在**。
→ 选择器建议：`[class$="_navCell"][aria-current="true"]`（双保险，任一变了另一个还在）。

### 3.4 右内容区（**已核实**）

```
div.77Pn0W_content
│   已核实: flex-direction:column; flex:1; min-width:0; display:flex
├── div.77Pn0W_header
│   │   已核实: box-sizing:border-box; flex:none; justify-content:space-between; align-items:flex-start;
│   │           gap:8px; height:54px; padding:20px 14px 8px 10px; display:flex
│   ├── div.77Pn0W_actions        ← slot "settings.action"（list, root）
│   │       已核实: justify-content:flex-end; align-items:center; gap:8px; min-width:0; margin-left:auto; display:flex
│   │       已知注册者：settings-general / id="open-document" / order 0 → SettingsDocumentAction
│   │         → div._2zt9ba_action > [ span._2zt9ba_error(role=alert) ] + Button(variant="outline" size="sm")
│   │         ⚠️ 仅当 Host 元数据确认文档可用时才渲染（`state.status !== "ready"` 直接 return null）
│   └── button.77Pn0W_close      type="button"
│       │   已核实: border-radius:var(--dsw-radius-sm); width:28px; height:28px; display:inline-flex; center;
│       │           color:var(--dsw-alias-label-primary); background:0 0; border:none; padding:0
│       ├── IconCloseOutlineRegular(size:14)
│       └── span.77Pn0W_hiddenLabel  → slot "settings.close" 文本（视觉隐藏）
│              已核实: clip:rect(0 0 0 0); white-space:nowrap; width:1px; height:1px; position:absolute; overflow:hidden
└── div.77Pn0W_options           ← slot "settings.section"（list, root; only = 当前 activeId）
       已核实: flex:1; min-height:0; padding:0 24px 24px; overflow-y:auto
```

> **重要**：`options` 里是 `renderSlot("settings.section", { close }, { only: active })` —— 即**只有当前分区被挂载**，切分区是**卸载/挂载**，不是显示/隐藏。所以不能靠 CSS 做「多页并存」的布局，也没法对非激活分区做过渡动画。

---

## 4. 顶栏 + 标签条（真实情况）

### 4.1 设置页顶栏 = `77Pn0W_header`（不是 opencode 那种 sticky 导航条）

DSH 的「顶栏」实际是**面板内容区右上角一行**（高 54px，含右对齐的 action 槽 + 关闭按钮），左边是空的。opencode 的顶栏是**整页宽**、含 logo + 竖分隔线 + 工作区名的 sticky 条（`padding:8px 0`，内层 `height:28px`）。

**已核实**：设置面板内**没有** logo、没有工作区名、没有面包屑。

### 4.2 标签条：只在 Plugins 页内部

**已核实**（`dsh-client-ui-settings-plugins/lib/client.js`）：

```
div.syyOqq_section
│   已核实: max-width:760px; flex-direction:column; gap:12px; display:flex
├── h2.syyOqq_heading          已核实: margin:0; font-size:18px; font-weight:600
├── p.syyOqq_intro             已核实: color:var(--dsw-alias-label-tertiary); margin:0; font-size:13px
├── rows.length === 0 → p.syyOqq_empty
├── rows.length === 1 → div.syyOqq_panel  （**直接渲染，无标签条**）
└── rows.length >= 2 →
    ├── div.syyOqq_tabs   role="tablist" aria-label
    │   已核实: border-bottom:.5px solid var(--dsw-alias-border-l2); align-items:flex-end; gap:22px; margin-top:2px; display:flex
    │   └── button.syyOqq_tab  role="tab" aria-selected aria-controls data-active
    │           已核实: color:var(--dsw-alias-label-tertiary); background:0 0; border:0; padding:7px 1px 9px;
    │                   font-size:13px; line-height:20px; position:relative
    │           :hover / [data-active=true] → color:var(--dsw-alias-label-primary)
    │           [data-active=true]::after / :focus-visible::after →
    │                   background:var(--dsw-alias-label-primary); content:""; border-radius:2px 2px 0 0;
    │                   height:2px; position:absolute; bottom:-1px; left:0; right:0
    └── div.syyOqq_panel  role="tabpanel" hidden={!selected}   （已访问过的 tab 保留挂载）
```

**关键事实（已核实）**：`settings.plugins.tab` 在整个 asar 里**只有 1 个注册者** —— `dsh-client-ui-settings-plugin-inventory`，`id:"all"`、`order:10`。
→ 因此在**默认安装**下 `rows.length === 1`，走 `single !== void 0` 分支：**标签条根本不渲染**，只有 `div.syyOqq_panel`。
→ 只有当别的插件再注册一个 `settings.plugins.tab` 时，`syyOqq_tabs` 才会出现。

> 注：`plugins.item` 是**另一个 slot**（由 `settings-web-search` / `settings-subagent` / `settings-shell` / `settings-agent-loop` / `plugin-manager` / `cordis-client-runner` 声明，由 `dsh-client-ui-plugin-manager` 渲染成卡片）。它**不在设置面板里**，是插件管理页的卡片列表。别和 `settings.plugins.tab` 混。

---

## 5. 卡片与行

### 5.1 General 分区（最典型，**已核实**）

```
div.YSv5hq_section                     ← settings.section id="general"
│   已核实: flex-direction:column; width:100%; display:flex
│   已核实附带规则: .YSv5hq_section > [data-slot="settings.general.item"] > :last-child { border-bottom:none }
└── renderSlot("settings.general.item")     ← list, root（多贡献者）
    ├── CurrentVersionRow  → div.dsjt_a_row
    │       已核实: color:var(--dsw-alias-label-primary); overflow-wrap:anywhere; padding:16px 0;
    │               font-size:14px; line-height:22px        （内容 = "0.2.1-rc.5"）
    └── DeveloperToolsRow  → div.xdKASq_row
        │   已核实: border-bottom:.5px solid var(--dsw-alias-border-l2); justify-content:space-between;
        │           align-items:center; gap:24px; padding:16px 0; display:flex
        ├── div
        │   ├── div.xdKASQ_title          已核实: font-size:14px; line-height:20px
        │   ├── div.xdKASq_description    已核实: color:var(--dsw-alias-label-secondary); margin-top:4px;
        │   │                                      font-size:12px; line-height:18px
        │   └── div[role="alert"]         （仅失败时）
        └── Switch(primitive)             ← 见 §6.4
```

**`settings.general.item` 的全部注册者（已核实）**：`conversation`、`settings-general`、`theme`、`settings-session-log`、`permission-presets`、`shortcuts`、`chat`。
→ 所以 General 页实际会有 **7 个贡献者**的行，**每行结构不保证都是 `xdKASq_row`**（那只是 DeveloperToolsRow 自己的 CSS）。
→ ⚠️ **不要写 `.YSv5hq_section > div` 这种宽泛选择器**，会误伤。见 R4。

### 5.2 卡片型分区（Plugins 清单 / Models）

**`uuMOda_*`（`settings-plugin-inventory`，已核实原文）**——这是 DSH 里最接近 opencode「卡片」的形态：

| 类名后缀 | 已核实关键值 |
|---|---|
| `uuMOda_section` | `width:100%; max-width:760px; flex-direction:column; gap:14px; container:uuMOda_plugin-inventory/inline-size` |
| `uuMOda_cards` | `grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; list-style:none; display:grid` |
| `uuMOda_card` | `border:.5px solid var(--dsw-alias-settings-card-stroke); border-radius:var(--dsw-radius-xl); background:var(--dsw-alias-settings-card-fill); flex-direction:column; overflow:hidden` |
| `uuMOda_cardContent` | `min-height:52px; flex-direction:column; gap:2px; padding:12px 14px; text-align:left; background:0 0; border:0; cursor:pointer` |
| `uuMOda_cardMainRow` | `justify-content:space-between; align-items:center; gap:12px; display:flex` |
| `uuMOda_cardTitle` | `flex:1; min-width:0; font-size:14px; font-weight:500; line-height:20px; ellipsis` |
| `uuMOda_cardDescription` | `color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:18px; -webkit-line-clamp:2` |
| `uuMOda_cardIdentity` | `font-family:var(--ds-font-family-code); font-size:12px; border-radius:var(--dsw-radius-xs); background:var(--dsw-alias-bg-module-platform); padding:1px 6px` |
| `uuMOda_cardDetails` | `border-top:.5px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-module-platform); padding:10px 14px 12px` |
| `uuMOda_group` | `flex-direction:column; gap:10px` |
| `uuMOda_group + .uuMOda_group` | `border-top:.5px solid var(--dsw-alias-border-l2); padding-top:14px` |
| `uuMOda_groupTitle` | `color:var(--dsw-alias-label-primary); font-size:14px; font-weight:400; line-height:22px` |
| `uuMOda_switcher` | `border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-module-platform); height:36px; padding:0 14px; font-size:14px; gap:12px; display:inline-flex` |
| `uuMOda_search input` | `border:.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-layer-1); height:36px; padding:0 34px 0 36px; font-size:13px` |
| `uuMOda_skeletonCard` | `border:.5px solid var(--dsw-alias-settings-card-stroke); border-radius:var(--dsw-radius-xl); padding:15px 14px` |

> `--dsw-alias-settings-card-fill: var(--dsw-alias-bg-layer-2)`、`--dsw-alias-settings-card-stroke: var(--dsw-alias-border-l4)`（**已核实**，定义在 theme 的 `body{}` 里）。
> ⚠️ 卡片**没有 `padding`**，`overflow:hidden` + `border-radius` 裁切；内边距全在 `cardContent`（`12px 14px`）上。

**`tUAPGa_*`（`settings-models`，已核实关键项）**：

| 类名后缀 | 已核实关键值 |
|---|---|
| `tUAPGa_section` | `max-width:720px; flex-direction:column; gap:12px` |
| `tUAPGa_title` | `font-size:16px; font-weight:500; line-height:24px` |
| `tUAPGa_intro` | `color:var(--dsw-alias-label-tertiary); font-size:14px; line-height:22px` |
| `tUAPGa_rows` | `flex-direction:column; gap:8px; margin:12px 0 0; list-style:none` |
| `tUAPGa_rowCard` | `border:.5px solid var(--dsw-alias-settings-card-stroke); background:var(--dsw-alias-settings-card-fill); border-radius:var(--dsw-radius-xl); flex-direction:column; gap:12px; padding:12px 14px` |
| `tUAPGa_rowHead` | `align-items:center; gap:10px; display:flex` |
| `tUAPGa_rowName` | `font-size:14px; font-weight:500; line-height:22px` |
| `tUAPGa_editor` | `border-radius:var(--dsw-radius-lg); background:var(--dsw-alias-bg-module-platform); flex-direction:column; gap:14px; padding:14px 16px` |
| `tUAPGa_field` | `flex-direction:column; gap:6px` |
| `tUAPGa_fieldLabel` | `color:var(--dsw-alias-label-secondary); font-size:12px; font-weight:500; line-height:18px; display:inline-flex; gap:10px` |
| `tUAPGa_input` | `border:.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md); height:32px; background:var(--dsw-alias-bg-layer-1); padding:0 10px; font-size:14px; line-height:22px` |
| `tUAPGa_selectInput` | `appearance:none; background-image:<内联 SVG 箭头 %2381858C>; background-position:right 12px center; padding-right:32px` |
| `tUAPGa_switchThumb` | `transition:none` |
| `tUAPGa_setupCard` | `border-radius:var(--dsw-radius-lg); background:var(--dsw-alias-bg-module-platform); gap:14px; padding:14px 16px` |

> ⚠️ `tUAPGa_selectInput` 的下拉箭头是**硬编码的 `%2381858C` 灰色 SVG data-URI**。深色模式下不会变色。改造时需替换（见 C-31）。

---

## 6. 表单控件（全部来自 primitives，**已核实**）

### 6.1 `SettingsForm` — 表单框架

**JSX（已核实，`index-BXV-oxvX.js`）**：

```js
if(!t.available) return jsx("p",{className:Zi.unavailable,role:"status"}, r.unavailable);
return jsxs("div",{className:Zi.form,children:[
  t.writable?null:jsx("p",{className:Zi.readOnly,role:"status"}, r.readOnly),
  e.children,
  jsxs("div",{className:Zi.footer,children:[
    t.failed?jsx("p",{className:Zi.failed,role:"status"}, r.saveFailed):null,
    jsx("button",{type:"button",className:Zi.save,disabled:n,onClick:e.onSave},
        t.saving?r.saving:r.save)
  ]})
]})
```

| 类名（真实字符串） | 已核实 CSS |
|---|---|
| `_form_ft7vz_3` | `display:flex; flex-direction:column` |
| `_readOnly_ft7vz_8` / `_unavailable_ft7vz_9` | `margin:0 0 12px; font-size:12px; line-height:1.5; color:var(--dsw-alias-label-tertiary)` |
| `_footer_ft7vz_16` | `display:flex; align-items:center; gap:8px; padding-top:16px` |
| `_failed_ft7vz_23` | `flex:1; min-width:0; font-size:12px; color:var(--dsw-alias-label-error)` |
| `_save_ft7vz_32` | `border:1px solid transparent; border-radius:var(--dsw-radius-md); padding:5px 14px; font-size:13px; line-height:1.5; background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-3)` |
| `_save_ft7vz_32:disabled` | `opacity:.4; cursor:default` |

> 这是**唯一**被 `SettingsForm` 渲染的按钮。没有 secondary / ghost 形态。

### 6.2 `SettingsValueField` — 通用值输入行

**JSX（已核实）**：

```
div._field_bjqpo_3
├── div._head_bjqpo_14
│   ├── div._labelGroup_bjqpo_29
│   │   ├── label._label_bjqpo_20   htmlFor={id}
│   │   └── [可选] button._helpButton_bjqpo_41  aria-label aria-expanded aria-controls (Icon size 12)
│   └── [可选，仅 e.overridden] span._badges_bjqpo_82
│       ├── Tag(tone="neutral")            → _tag_brmue_4
│       └── button._reset_bjqpo_88
├── input#{id}._input_bjqpo_107   type="text"
│      numeric → inputMode="numeric"; invalid → aria-invalid; aria-describedby
├── [可选] p._invalid_bjqpo_133  ← 或 →  p._hint_bjqpo_140
└── [可选，help 展开时] div._help_bjqpo_41  role="region" aria-label
```

| 类名 | 已核实 CSS |
|---|---|
| `_field_bjqpo_3` | `display:flex; flex-direction:column; gap:6px; padding:12px 0` |
| `_field_bjqpo_3 + _field_bjqpo_3` | `border-top:.5px solid var(--dsw-alias-border-l2)` |
| `_head_bjqpo_14` | `display:flex; align-items:center; gap:8px` |
| `_label_bjqpo_20` | `flex:1; min-width:0; font-size:13px; font-weight:500; line-height:1.5; color:var(--dsw-alias-label-primary)` |
| `_labelGroup_bjqpo_29` | `display:flex; align-items:center; gap:4px; flex:1; min-width:0` |
| `_labelGroup_bjqpo_29 > _label_bjqpo_20` | `flex:0 1 auto` |
| `_helpButton_bjqpo_41` | `width:24px; height:24px; border-radius:var(--dsw-radius-sm); color:var(--dsw-alias-label-tertiary)` |
| `_help_bjqpo_41` | `padding:10px 0 0; font-size:12px; line-height:1.6; color:var(--dsw-alias-label-secondary)` |
| `_badges_bjqpo_82` | `display:inline-flex; align-items:center; gap:8px` |
| `_reset_bjqpo_88` | `border:none; background:none; font-size:12px; color:var(--dsw-alias-label-secondary)` |
| `_input_bjqpo_107` | `height:34px; padding:0 12px; border:.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-layer-3); font-size:13px; line-height:1.5` |
| `_input_bjqpo_107:focus-visible` | `outline:none; border-color:var(--dsw-alias-state-business-primary)` |
| `_input_bjqpo_107[aria-invalid=true]` | `border-color:var(--dsw-alias-state-error-primary)` |
| `_invalid_bjqpo_133` | `font-size:12px; line-height:1.5; color:var(--dsw-alias-state-error-primary)` |
| `_hint_bjqpo_140` | `font-size:12px; line-height:1.5; color:var(--dsw-alias-label-tertiary)` |

> 🔴 **结构冲突**：DSH 的值字段是**纵向**（标签在上、输入框在下、整行宽）。opencode 的设置行是**横向**（`display:flex; justify-content:space-between; gap:24px; padding:20px 0`，标签左、控件右）。这是 §8 的 R3，但**可以用纯 CSS 修**（见 C-14）。

### 6.3 `SettingsSecretField`（同族，`hR`，已核实）

```
div._field_bjqpo_3
├── div._head_bjqpo_14
│   ├── label._label_bjqpo_20
│   └── span._badges_bjqpo_82 > Tag(tone = configured ? "neutral" : "quiet")
├── input._input_bjqpo_107  type="{{PASSWORD_...}}"  autoComplete="new-{{PASSWORD_...}}"
└── p._hint_bjqpo_140
```

→ **共用同一批类名**，所以 §7 对 `_field_bjqpo_*` / `_input_bjqpo_107` 的规则**自动同时覆盖普通字段和密钥字段**。✅

### 6.4 `Switch`（开关）

**JSX（已核实）**：
```js
jsx("button",{type:"button",role:"switch","aria-checked":e,"aria-label":r,title:n,disabled:i,
  className:clsx(f8.switch,s),onClick:()=>t(!e),children:jsx("span",{className:f8.thumb})})
```

| 类名 | 已核实 CSS |
|---|---|
| `_switch_1ik0f_5` | `width:36px; height:20px; padding:2px; border:0; border-radius:999px; corner-shape:round; background:var(--dsw-alias-border-l3); cursor:pointer; flex:0 0 auto` |
| `_switch_1ik0f_5[aria-checked=true]` | `background:var(--dsw-alias-brand-primary)` |
| `_switch_1ik0f_5:disabled` | `cursor:default; opacity:.5` |
| `_thumb_1ik0f_33` | `width:16px; height:16px; border-radius:50%; background:var(--dsw-alias-label-primary-foreground); transition:transform .12s ease` |
| `[aria-checked=false] ._thumb_1ik0f_33` | `background:var(--dsw-alias-switch-thumb)` |
| `[aria-checked=true] ._thumb_1ik0f_33` | `transform:translate(16px)` |

### 6.5 `Button`

| 类名 | 已核实 CSS |
|---|---|
| `_button_1rv3m_2` | `inline-flex; center; gap:4px; border:none; border-radius:var(--dsw-radius-md); font-size:14px; line-height:22px; color:var(--dsw-alias-label-primary); background:transparent; padding:0 14px` |
| `_md_1rv3m_23` | `height:36px` |
| `_sm_1rv3m_28` | `height:28px; font-size:12px; line-height:18px; padding:0 10px; border-radius:var(--dsw-radius-sm)` |
| `_primary_1rv3m_36` | `background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-foreground)` |
| `_ghost_1rv3m_45:hover` | `background:var(--dsw-alias-interactive-bg-hover)` |
| `_outline_1rv3m_54` | `border:.5px solid var(--dsw-alias-border-l3); background:transparent` |
| `_toolbar_1rv3m_63` | `background:var(--dsw-alias-button-tool-bar-fill)` |
| `_icon_1rv3m_71` | `width:16px; height:16px; inline-flex; center` |

### 6.6 `SegmentedControl` / `SegmentedTabs`

| 类名 | 已核实 CSS |
|---|---|
| `_control_d62eq_11` | `display:inline-grid; grid-auto-flow:column; grid-auto-columns:1fr; gap:2px; padding:4px; border-radius:var(--dsw-radius-md); background:var(--dsw-alias-interactive-bg-hover)` |
| `_indicator_d62eq_22` | `position:absolute; top:4px; left:4px; width:calc((100% - 8px - 2px*(var(--dsh-segment-count) - 1))/var(--dsh-segment-count)); height:calc(100% - 8px); border-radius:var(--dsw-radius-sm); background:var(--dsw-alias-bg-layer-1); box-shadow:var(--dsw-elevation-soft); transform:translate(calc(var(--dsh-segment-index)*(100% + 2px))); transition:transform .16s ease` |
| `_tab_d62eq_37` | `height:28px; padding:0 16px; border:0; border-radius:var(--dsw-radius-sm); background:transparent; color:var(--dsw-alias-label-secondary); font-size:13px; line-height:20px; font-weight:500` |
| `_tabs_1p79o_1` | `position:relative; display:grid; padding:4px; border-radius:var(--dsw-radius-lg); background:var(--dsw-alias-bg-module-platform)` |
| `_indicator_1p79o_9` | `position:absolute; inset:4px auto 4px 4px; border:.5px solid var(--dsw-alias-border-l3); border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-layer-3); transition:transform .18s ease` |
| `_tab_1p79o_1` | `height:34px; padding:0 12px; border-radius:var(--dsw-radius-md); font-size:14px; line-height:20px; color:var(--dsw-alias-label-secondary)` |
| `_tab_1p79o_1[aria-selected=true]` | `color:var(--dsw-alias-label-primary); font-weight:600` |

### 6.7 其它会被设置页用到的 primitive

| 类名 | 已核实 CSS | 用在哪 |
|---|---|---|
| `_tag_brmue_4` | `inline-flex; border-radius:999px; corner-shape:round; padding:1px 8px; font-size:11px; line-height:17px; font-weight:500` | `SettingsValueField` 的「已覆盖」徽标、SecretField 状态 |
| `_tag_brmue_4[data-tone=neutral]` | `background:var(--dsw-alias-bg-module-platform); color:var(--dsw-alias-label-secondary)` | 同上 |
| `_tag_brmue_4[data-tone=quiet]` | `color:var(--dsw-alias-label-tertiary)` | SecretField 未配置 |
| `_root_o6lrb_6` | `position:fixed; inset:0; z-index:1000; display:flex; center; padding:max(24px,var(--dsh-frame-overlay-top,24px)) 24px` | 通用 Dialog（Models 的删除确认、fetch dialog 等） |
| `_dialog_o6lrb_33` | `width:min(380px,100%); flex-direction:column; gap:20px; padding:0 0 24px; border-radius:var(--dsw-radius-panel); background:var(--dsw-alias-bg-layer-2); box-shadow:var(--dsw-elevation-prominent)` | 同上 |
| `_header_o6lrb_71` | `padding:22px 14px 12px 24px; justify-content:space-between` | 同上 |
| `_title_o6lrb_79` | `font-size:16px; line-height:24px; font-weight:500` | 同上 |
| `_body_o6lrb_115` | `flex-direction:column; margin-top:20px; padding:0 24px` | 同上 |
| `_footer_o6lrb_123` | `justify-content:flex-end; gap:8px; padding:0 24px` | 同上 |
| `_close_o6lrb_87` | `width:28px; height:28px; border-radius:var(--dsw-radius-sm); color:var(--dsw-alias-label-secondary)` | 同上 |
| `_list_4ub78_7` | `position:absolute; top:calc(100% + 4px); left:0; z-index:100; min-width:144px; max-width:360px; padding:4px; flex-direction:column` | 下拉菜单（Menu primitive） |
| `_item_4ub78_90` | `min-height:34px; padding:6px 8px; border-radius:var(--dsw-radius-md); font-size:13px; line-height:20px` | 同上 |
| `_itemIcon_4ub78_148` | `width:14px; height:14px` | 同上 |
| `_footer_4ub78_62` | `border-top:.5px solid var(--dsw-alias-border-l2); margin-top:3px; padding-top:3px` | 同上 |
| `_backdrop_19zw2_2` / `_mask_19zw2_19` / `_image_19zw2_26` | 图片预览层 | 设置页一般用不到 |

---

## 7. 改造清单（可直接落地成 CSS）

**记法**：`选择器 → 现有值 → 目标值（opencode） → 理由`
opencode 目标值全部来自 `opencode-tokens.md`。凡标 **[推测]** 的，说明 opencode 侧无实测值，是按 token 语气推的。

### 7.A 全局 token 层（优先做，收益最大）

| # | 选择器 | 现有值 | 目标值 | 理由 |
|---|---|---|---|---|
| C-01 | `:root, body` 上覆盖 `--dsw-radius-md` | `12px` | `6px` | opencode 圆角统一 `6px`（rounded-md），**绝不出现 12/16/20/28** |
| C-02 | `--dsw-radius-sm` | `8px` | `6px`（小控件可 `4px`）**[推测]** | 同上；opencode 无 8px 档 |
| C-03 | `--dsw-radius-lg` | `16px` | `6px` | 同上 |
| C-04 | `--dsw-radius-xl` | `20px` | `6px` | 卡片圆角，opencode 实测 6px |
| C-05 | `--dsw-radius-panel` | `28px` | `6px` | 面板/对话框圆角 |
| C-06 | `--dsw-radius-xs` | `4px` | `4px`（保持） | 已接近 |
| C-07 | `--dsh-font-family-text` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", …` | `Inter, sans-serif`（并 `@font-face` 引入 Inter 可变字体） | opencode 实测 `Inter, sans-serif`，加载 100–900 可变字重 |
| C-08 | `body` 追加 `font-size` / `font-weight` / `letter-spacing` | 未设（继承 16px / 400 / normal）**[推测：全局未显式设]** | `font-size:13px; font-weight:440; line-height:20px; letter-spacing:-0.04px` | opencode body 实测值 |
| C-09 | `--dsw-alias-settings-card-fill` | `var(--dsw-alias-bg-layer-2)` | opencode `--v2-background-bg-layer-01` = `#fafafa` / 深色 `#242424` | opencode 卡片面是「一级层」，不是基准面 |
| C-10 | `--dsw-alias-settings-card-stroke` | `var(--dsw-alias-border-l4)` | `0.5px solid rgba(0,0,0,.08)` / 深色 `rgba(255,255,255,.08)` | opencode 卡片边框实测 `0.5px solid rgba(0,0,0,.08)` |
| C-11 | 所有 `box-shadow: var(--dsw-elevation-*)` 出现处 | 多层阴影 | `none` | opencode 实测 `box-shadow: none`，层级靠灰度+字重 |
| C-12 | 颜色过渡 | `--ds-transition-duration` / `--ds-ease-in-out` | `background-color 85ms ease-out, color 85ms ease-out` | opencode 实测 |
| C-13 | `@media (prefers-reduced-motion: reduce)` | 仅部分 primitive 处理 | 关闭所有自定义动效 | opencode 用 `motion-reduce:` 变体，全量关闭 |

### 7.B 面板与入口

| # | 选择器 | 现有值 | 目标值 | 理由 |
|---|---|---|---|---|
| C-14 | `[data-shortcut-modal="settings"]`（=`_panel`） | `width:800px; height:min(800px,…); border-radius:var(--dsw-radius-panel); background:var(--dsw-alias-bg-layer-2); box-shadow:var(--dsw-elevation-prominent)` | `border-radius:6px; box-shadow:none; background:#fff`（深色 `#161616`）；宽高见 R1 策略 | 去阴影、6px 圆角、基准面 |
| C-15 | `[class$="_mask"]` | `background:var(--dsw-alias-bg-mask-1); backdrop-filter:var(--dsw-mask-blur)` | 减弱：`background:rgba(0,0,0,.24); backdrop-filter:none` **[推测]** | opencode 无模态遮罩；保留模态语义但降低视觉重量 |
| C-16 | `[class$="_nav"]` | `gap:18px; width:188px; padding:22px 12px 0` | `gap:16px; width:180px; padding:20px 12px 0` | opencode 左导航实测 **180px** |
| C-17 | `[class$="_navTitle"]` | `font-size:16px; font-weight:500; line-height:24px; padding:0 12px` | `font-size:13px; font-weight:530; line-height:20px` | opencode 区块标题 `13px/530/20px`；面板标题不该比内容大 |
| C-18 | `[class$="_navList"]` | `flex-direction:column; gap:4px` | `gap:4px`（保持） | ✅ 已与 opencode 一致 |
| C-19 | `[class$="_navCell"]` | `height:40px; border-radius:var(--dsw-radius-md); padding:9px 16px 9px 12px; font-size:14px; font-weight:400; line-height:22px; gap:8px` | `height:28px; border-radius:6px; padding:0 6px; font-size:13px; font-weight:440; line-height:20px; gap:8px` | opencode 左导航项实测原文 |
| C-20 | `[class$="_navCell"]:hover` | `background:var(--dsw-specific-sidebar-nav-item-hover)` | `background:rgba(0,0,0,.08)`（深色 `#ffffff14`） | opencode 激活背景实测 `rgba(0,0,0,.08)`；hover 同系 |
| C-21 | `[class$="_navCell"][aria-current="true"]` | `background:var(--dsw-specific-sidebar-nav-item-active)` | `background:rgba(0,0,0,.08)`（深色 `#ffffff14`） | 同上；opencode 激活项**无**加粗、**无**左侧色条 |
| C-22 | `[class$="_navIcon"]` | `flex:none`（图标 size=16） | `flex:none; width:16px; height:16px`（保持 size 16） | ✅ opencode 图标 16px 线性描边 |
| C-23 | `[class$="_triggerRow"]` / `[class$="_trigger"]` | `height:42px; border-radius:var(--dsw-radius-md); font-size:14px` | `height:28px; border-radius:6px; font-size:13px; font-weight:440` | 与 navCell 对齐（opencode 侧栏底部控件与导航项同规格） |
| C-24 | `[class$="_header"]` | `height:54px; padding:20px 14px 8px 10px; align-items:flex-start` | `height:auto; padding:8px 0; align-items:center` **[推测]** | opencode 顶栏实测 `padding:8px 0` |
| C-25 | `[class$="_close"]` | `width:28px; height:28px; border-radius:var(--dsw-radius-sm)` | `width:28px; height:28px; border-radius:6px` | 统一 6px |
| C-26 | `[class$="_options"]` | `padding:0 24px 24px` | `padding:0 0 32px` | opencode 区块间距 `margin-bottom:32px`；内容区自身不额外加左右 padding（由卡片负责） |

### 7.C 卡片与行

| # | 选择器 | 现有值 | 目标值 | 理由 |
|---|---|---|---|---|
| C-27 | `[class$="_row"]`（`xdKASq_row`） | `padding:16px 0; gap:24px; border-bottom:.5px solid var(--dsw-alias-border-l2)` | `padding:20px 0; gap:24px; border-bottom:.5px solid rgba(0,0,0,.08)` | opencode 卡片行实测 `padding:20px 0`、gap 24、0.5px 分隔 |
| C-28 | `[class$="_row"]:first-child` / `:last-child` | 无 | `padding-top:0` / `padding-bottom:0` | opencode 首末行去内边距 |
| C-29 | `[class$="_title"]`（`xdKASq_title`） | `font-size:14px; line-height:20px` | `font-size:13px; font-weight:440; line-height:20px; letter-spacing:-0.04px` | opencode 正文实测 |
| C-30 | `[class$="_description"]`（`xdKASq_description`） | `font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); margin-top:4px` | `font-size:13px; line-height:20px; color:#5c5c5c; margin-top:4px` | opencode 说明文字 `13px/440` + `#5c5c5c` |
| C-31 | `[class$="_card"]`（`uuMOda_card` / `tUAPGa_rowCard`） | `border:.5px solid var(--dsw-alias-settings-card-stroke); border-radius:var(--dsw-radius-xl)`(=`20px`); `background:var(--dsw-alias-settings-card-fill)` | `border-radius:6px`；border/背景由 C-09/C-10 变量接管 | 6px 圆角 |
| C-32 | `[class$="_cardContent"]` / `[class$="_rowCard"]` 内边距 | `padding:12px 14px` | `padding:20px` | opencode 卡片内边距实测 **20px** |
| C-33 | `[class$="_cards"]`（`uuMOda_cards`） | `grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px` | `grid-template-columns:1fr; gap:0` **[推测]** | opencode 是**单列文档流** + 行分隔线，不是双列卡片网格；双列会破坏「文档式」语气 |
| C-34 | `[class$="_section"]`（`YSv5hq_section` / `syyOqq_section` / `tUAPGa_section` / `uuMOda_section`） | `gap:12px~14px; max-width:720~760px` | `gap:32px`（区块间距）；`max-width:640px` | opencode 区块间距 `margin-bottom:32px`；内容列宽实测 **640px** |
| C-35 | `[class$="_heading"]`（`syyOqq_heading`） | `font-size:18px; font-weight:600` | `font-size:13px; font-weight:530; line-height:20px` | opencode 区块标题实测 `13px/530/20px`；18px/600 太重 |
| C-36 | `[class$="_intro"]`（`syyOqq_intro` / `tUAPGa_intro`） | `font-size:13px~14px; color:var(--dsw-alias-label-tertiary)` | `font-size:13px; line-height:20px; color:#5c5c5c` | opencode 说明文字 |
| C-37 | `[class$="_group"] + [class$="_group"]` | `border-top:.5px solid var(--dsw-alias-border-l2); padding-top:14px` | 保持 0.5px，颜色 → `rgba(0,0,0,.08)` | 发丝分隔线 |

### 7.D 标签条（Plugins 页，仅 ≥2 tab 时出现）

| # | 选择器 | 现有值 | 目标值 | 理由 |
|---|---|---|---|---|
| C-38 | `[class$="_tabs"]`（`syyOqq_tabs`） | `gap:22px; border-bottom:.5px solid var(--dsw-alias-border-l2); align-items:flex-end` | `gap:2px; height:48px; align-items:center; border-bottom:.5px solid rgba(0,0,0,.08)` | opencode tab 条实测 `height:48px; gap:2px` |
| C-39 | `[class$="_tab"]`（`syyOqq_tab`） | `padding:7px 1px 9px; font-size:13px; line-height:20px; color:var(--dsw-alias-label-tertiary)` | `padding:0 12px; font-weight:440; color:gray`；激活 `font-weight:530; color:#161616` | opencode 未激活 tab 实测 `color: rgb(128,128,128)`，激活 `weight 530 / #161616` |
| C-40 | `[class$="_tab"][data-active="true"]::after` | `height:2px; border-radius:2px 2px 0 0; background:var(--dsw-alias-label-primary); bottom:-1px` | `height:1px; border-radius:0; background:#242424`（深色 `#fafafa`，即 `--v2-border-border-inverse`）；`transition:transform 220ms cubic-bezier(.77,0,.175,1)` | opencode 激活下划线实测 **1px**、色 `#242424`、滑动 `220ms cubic-bezier(.77,0,.175,1)` |
| C-41 | `[class$="_tab"]:focus-visible::after` | 同样画下划线 | 去掉（`content:none`） | opencode 聚焦不借用激活指示器；改用 `outline` **[推测]** |

### 7.E 表单控件

| # | 选择器 | 现有值 | 目标值 | 理由 |
|---|---|---|---|---|
| C-42 | `[class^="_field_"]`（`SettingsValueField` 根） | `flex-direction:column; gap:6px; padding:12px 0` | `flex-direction:row; justify-content:space-between; align-items:center; gap:24px; padding:20px 0` | opencode 卡片行实测 `display:flex; justify-content:space-between; gap:24px; padding:20px 0`。**这是把 DSH 纵向表单变成 opencode 横向行的关键一条** |
| C-43 | `[class^="_field_"] + [class^="_field_"]` | `border-top:.5px solid var(--dsw-alias-border-l2)` | 保持 0.5px，颜色 → `rgba(0,0,0,.08)` | 行分隔线同卡片边框色 |
| C-44 | `[class^="_head_"]`（`_head_bjqpo_14`） | `display:flex; align-items:center; gap:8px` | `display:flex; flex-direction:column; gap:2px; flex:1; min-width:0` **[推测]** | 横向布局后，标题+说明需纵向堆叠在左 |
| C-45 | `[class^="_label_"]`（`_label_bjqpo_20`） | `font-size:13px; font-weight:500; line-height:1.5` | `font-size:13px; font-weight:440; line-height:20px; letter-spacing:-0.04px` | opencode 正文 `440`；`500` 偏重 |
| C-46 | `[class^="_input_"]`（`_input_bjqpo_107`） | `height:34px; border:.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md)`(=`12px`); `background:var(--dsw-alias-bg-layer-3); padding:0 12px` | `height:28px; border-radius:6px; background:#fff（深色 #161616）; padding:0 8px; border:.5px solid rgba(0,0,0,.08)` **[高度/内边距为推测]** | 6px 圆角 + 发丝边框；高度对齐 opencode 28px 控件节奏 |
| C-47 | `[class^="_input_"]:focus-visible` | `outline:none; border-color:var(--dsw-alias-state-business-primary)` | `border-color:#3b5cf6; box-shadow:none` | opencode 唯一彩色是强调蓝 `#3b5cf6`，且**无光晕** |
| C-48 | `[class^="_hint_"]` / `[class^="_invalid_"]` | `font-size:12px; line-height:1.5` | `font-size:13px; line-height:20px`；hint → `#5c5c5c`，invalid → `#b82d35` | opencode 说明 `13px` + 危险色 `#b82d35` |
| C-49 | `[class^="_form_"]` 的 footer / `[class^="_footer_"]` | `padding-top:16px; gap:8px` | `padding-top:20px; gap:8px` | 与行内边距节奏一致 |
| C-50 | `[class^="_save_"]`（Save 按钮） | `border-radius:var(--dsw-radius-md)`(=`12px`); `padding:5px 14px; background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-3)` | `border-radius:6px; padding:4px 12px; background:#3b5cf6; color:#fff` | opencode 主按钮用强调蓝；去 12px 圆角 |
| C-51 | `button[role="switch"]`（`_switch_1ik0f_5`） | `width:36px; height:20px; border-radius:999px; corner-shape:round; background:var(--dsw-alias-border-l3)` | `width:28px; height:16px; border-radius:6px; corner-shape:round`（去 `999px`）**[尺寸为推测]** | opencode「绝不用大圆角或胶囊」。**这是最需要设计确认的一条** |
| C-52 | `[role="switch"][aria-checked="true"]` | `background:var(--dsw-alias-brand-primary)` | `background:#3b5cf6`（深色 `#a2bcff`） | opencode 强调蓝 |
| C-53 | `[role="switch"] [class^="_thumb_"]` | `width:16px; height:16px; border-radius:50%` | `width:12px; height:12px; border-radius:4px`（跟随 C-51）**[推测]** | 与开关本体圆角一致 |
| C-54 | `[role="switch"][aria-checked="true"] [class^="_thumb_"]` | `transform:translate(16px)` | `transform:translate(12px)`（跟随 C-51）**[推测]** | 位移须与尺寸匹配 |
| C-55 | `[class$="_tag"]`（`_tag_brmue_4`） | `border-radius:999px; corner-shape:round; padding:1px 8px; font-size:11px; line-height:17px; font-weight:500` | `border-radius:6px`（去胶囊）；`padding:1px 6px; font-weight:440` **[推测]** | opencode 不用胶囊 |
| C-56 | `[class$="_tag"][data-tone="neutral"]` | `background:var(--dsw-alias-bg-module-platform); color:var(--dsw-alias-label-secondary)` | `background:rgba(0,0,0,.08); color:#5c5c5c` | 对齐 opencode 激活/hover 底色与次文字 |
| C-57 | `[class$="_button"]` / `[class$="_sm"]` | `border-radius:var(--dsw-radius-md)`(=`12px`) / `var(--dsw-radius-sm)`(=`8px`) | `6px` | 统一 6px |
| C-58 | `[class$="_primary"]` | `background:var(--dsw-alias-button-primary-fill)` | `background:#3b5cf6; color:#fff` | 强调蓝 |
| C-59 | `[class$="_outline"]` | `border:.5px solid var(--dsw-alias-border-l3)` | `border:.5px solid rgba(0,0,0,.08)` | 发丝边框色 |
| C-60 | `[class$="_control"]`（SegmentedControl） | `padding:4px; border-radius:var(--dsw-radius-md)`(=`12px`); `background:var(--dsw-alias-interactive-bg-hover)` | `padding:2px; border-radius:6px; background:rgba(0,0,0,.08)` | 6px + 灰度底 |
| C-61 | `[class$="_indicator"]`（SegmentedControl） | `border-radius:var(--dsw-radius-sm)`; `box-shadow:var(--dsw-elevation-soft)` | `border-radius:4px; box-shadow:none; background:#fff` | 去阴影 |
| C-62 | `[class$="_tabs"]` / `[class$="_indicator"]`（SegmentedTabs `1p79o`） | `border-radius:var(--dsw-radius-lg)`(=`16px`) / `var(--dsw-radius-md)`(=`12px`); indicator `border:.5px solid` | `6px` / `6px`；indicator 去边框改 `box-shadow:none` | 统一 6px |
| C-63 | `[class$="_dialog"]`（通用 Dialog `o6lrb`） | `border-radius:var(--dsw-radius-panel)`(=`28px`); `box-shadow:var(--dsw-elevation-prominent)`; `width:min(380px,100%)` | `border-radius:6px; box-shadow:none; width:min(400px,100%)` **[宽度为推测]** | 6px + 无阴影 |
| C-64 | `[class$="_dialog"]` 内 `_header_` / `_title_` / `_body_` / `_footer_` | `padding:22px 14px 12px 24px` / `font-size:16px;font-weight:500` / `padding:0 24px` | `padding:16px 20px 8px` / `font-size:13px; font-weight:530` / `padding:0 20px` **[推测]** | opencode 标题 13px/530、内边距 20px |
| C-65 | `[class$="_list"]` / `[class$="_item"]`（下拉菜单 `4ub78`） | `min-height:34px; padding:6px 8px; border-radius:var(--dsw-radius-md)`(=`12px`); `font-size:13px` | `min-height:28px; padding:0 6px; border-radius:6px; font-size:13px; font-weight:440` | 对齐 opencode 导航项规格 |
| C-66 | `[class$="_selectInput"]`（`tUAPGa_selectInput`） | 硬编码 `background-image` SVG 箭头色 `%2381858C` | 用 `currentColor` 的 SVG 或 CSS `mask` 重做；`border-radius:6px; height:28px` | 硬编码色在深色模式不跟随（**bug 级**） |

**合计 66 条**（`C-01` ~ `C-66`；其中 **10 条**标注 **[推测]**，其余 56 条的「现有值」与「目标值」均有实测/源码依据）。

---

## 8. 风险（如实说明）

### R1 🔴 最大风险：DSH 设置是「模态框」，opencode 是「整页 + 顶栏 tab 条」

| | DSH（已核实） | opencode（已核实） |
|---|---|---|
| 容器 | `position:fixed` overlay + 居中 panel | 整页 `flex-direction:column; height:100dvh` |
| 尺寸 | `800 × min(800px, …)`，`overflow:hidden` | 全屏，内容区 `180px 导航 + 640px 内容` |
| 导航位置 | 面板**内部**左侧 `188px` | 内容区左侧 `180px`，**上方还有 48px tab 条** |
| 顶栏 | 无（只有右上角 action + close） | `sticky; padding:8px 0`，含 logo/工作区名 |
| 遮罩 | 有 mask + blur | **无** |

**后果**：即使把颜色/圆角/字号全改对，**整体骨架仍然一眼看出是 DSH 而不是 opencode**。

**三个可选策略（需产品决策，我没有权限定）**：
1. **保守**（推荐）：只做 token 级 + 组件级改造（§7 全部），接受「opencode 配色的 DSH 模态框」。成本最低、风险最小。
2. **激进**：把 `[data-shortcut-modal="settings"]` 改成 `position:static; width:100%; height:100%; border-radius:0`，让 overlay 变成全屏页；再用 CSS 把 `nav` 用 `order` 挪到内容区内部。**但**：`overlay` 是 `position:fixed` + `inset:0`，`panel` 内部是 `nav + content` 两列 flex，改成「顶栏 + tab 条 + 三栏」需要**改 DOM 层级**，纯 CSS 做不到 tab 条（DSH 设置页根本没有 tab 条元素）。→ **必须写插件注入 DOM 或改 React 组件**，超出「CSS 皮肤」范围。
3. **折中**：保守策略 + 用 `::before` 伪元素在 `panel` 顶部**画**一条假的 tab 条/顶栏（纯装饰，不可交互）。视觉接近，但无功能，且可能误导用户。**不推荐**。

### R2 🟠 `nav` 与 `navCell` 等是**前缀包含关系**，选择器极易写错

`[class*="_nav"]` 会同时命中 `nav` / `navCell` / `navIcon` / `navLabel` / `navList` / `navTitle`（6 个）。
→ **必须**用 `[class$="_nav"]` 这种后缀匹配，或加 `[class$="_nav"]:not([class$="_navCell"])`。
同理：`_tab` 会命中 `_tab` / `_tabActive` / `_tabCell` / `_tabClose` / `_tabHost` / `_tabTitle` / `_tabStrip` / `_tabLayout`（`6nhg2` 组）。

### R3 🟠 `SettingsValueField` 的纵向 → 横向改造会牵动子元素

C-42 把 `_field_bjqpo_3` 改成 `flex-direction:row` 后，子元素 `_head_bjqpo_14`（含 label + help + badges）和 `input` 会并排。
但 `_head_bjqpo_14` 自己是 `display:flex; align-items:center`（横向），标签和「已覆盖」徽标会挤在一行。
→ C-44 必须同时把 `_head_bjqpo_14` 改成 `flex-direction:column`，否则会出现「label 徽标 输入框」三段横排，很难看。
→ 而 `_head_bjqpo_14` 是 `SettingsValueField` **和** `SettingsSecretField` **共用**的，两者都会被改，需一并验证。

### R4 🟠 通用类名后缀在不同插件间会**互相碰撞**

`_row` / `_title` / `_description` / `_section` / `_input` / `_tabs` / `_tab` / `_card` 这些**短后缀在多个包里重复出现**，含义不同：
- `xdKASq_row`（DeveloperToolsRow 行）vs `dsjt_a_row`（CurrentVersionRow 行）vs `tUAPGa_rowCard` vs `uuMOda_cardMainRow`
- `syyOqq_tabs`（Plugins 标签条）vs `_tabs_1p79o_1`（SegmentedTabs primitive）vs `_tab_6nhg2`（dock 标签）
→ **`[class$="_row"]` 这种写法会跨包误伤**。必须用 `[class*="xdKASq_"]`（含 hash，跨版本不稳）或加宿主前缀限定作用域：
`[data-shortcut-modal="settings"] [class$="_row"]`。
→ **建议**：皮肤插件里对每个规则都加 `[data-shortcut-modal="settings"]`（设置面板）或 `[role="dialog"]` 前缀，既提特异度又限作用域。

### R5 🟠 primitives 的类名带**易变尾号**，无法后缀匹配

`_field_bjqpo_3` 的 `_3`、`_input_bjqpo_107` 的 `_107` 看起来是**模块内序号**（随 CSS 增删而变），`bjqpo` 是内容 hash（随构建而变）。
→ `[class$="_field_bjqpo_3"]` 在下一次 DSH 升级后**必然失效**。
→ 缓解：用 `[class^="_field_"]`（这些组件 className 基本都是单类，实测 `className:_t.field`，没有 `clsx` 拼接）；**或**优先用 ARIA/结构锚点（§2.3）。
→ 但 `[class^="_field_"]` 有个前提：元素上**只有这一个 class**。若将来 primitives 用 `clsx` 加类，就会失效。**这是本方案最脆的一环。**

### R6 🟡 部分分区结构完全不同，硬套会难看

| 分区 | 差异 |
|---|---|
| **Account**（`settings-account`，3.4 MB bundle） | 里面内嵌了整个平台页面（账单等），结构未知（我只读了 slot 注册）。**未核实**其 DOM，别写规则。 |
| **Models** | `rowCard` 是「一张卡 = 一个 provider」，卡内还有 `editor` / `modelList` / `modelReasoningRow` 等深层结构（`tUAPGa_*` 共 60+ 类）。opencode 的 Providers 页是简单列表。**改造会牵连很多。** |
| **Plugins 清单** | `uuMOda_cards` 是**双列 grid**；opencode 是单列文档流。C-33 改成单列后，`uuMOda_card:nth-child(odd)[data-open=true]+...` 这类**双列专属的对齐 hack 会失效**（该规则已核实存在），需一并处理。 |
| **Agent Preset** | `dsh-client-ui-agent-preset`（113 KB）有自己一整套 CSS，**本次未展开核实**。 |
| **General 页** | 7 个贡献者各写各的 CSS，**没有统一的「行」组件**。想让 General 页每行都长得像 opencode 的行，得逐个贡献者打补丁，或写一条足够通用的规则（有 R4 风险）。 |

### R7 🟡 无标签条 → 无法实现 opencode 的 tab 下划线滑动动效

`settings.plugins.tab` 默认只有 1 个注册者 → 标签条不渲染（§4.2）。opencode 的标志性动效（`transform 220ms cubic-bezier(.77,0,.175,1)` 的滑动下划线）在设置页**没有宿主元素**。
→ 只能在**主界面**的 tab 上做，或接受设置页没有这个动效。

### R8 🟡 深色模式

opencode 深色是 `#080808 / #161616 / #242424`（真深灰阶），DSH 用的是 `--dsw-static-neutral-bluish-*`（偏蓝灰）。
→ C-09/C-10 必须**同时给浅色和深色**两套值（opencode 用 `:root` / `:root[data-color-scheme="dark"]`，DSH 用自己的 scheme 开关，**映射关系我未核实**）。
→ 我只核实了 DSH 的变量名，**没有核实 DSH 的深色模式选择器是什么**（是 `[data-theme]` 还是 class，需另查 `dsh-client-ui-theme`）。

### R9 🟢 字体

opencode 用 Inter 可变字体（100–900）。DSH 自带 Montserrat（`--dsw-font-family-brand`）但正文用系统字体。
→ 皮肤插件需要**自己打包 Inter woff2**（不能假设用户装了 Inter），或退化到系统无衬线。`font-weight:440 / 530` 在非可变字体上会被浏览器吸附到 400/500，**字重层级会丢失**。这是「看起来像不像」的关键，建议优先解决。

---

## 9. 附录

### 9.1 设置相关 slot 全清单（已核实）

| slot | kind | scope | 声明者 | 注册者 |
|---|---|---|---|---|
| `sidebar.settings` | single | — | `dsh-client-ui-sidebar` | `settings-general`（= SettingsRoot） |
| `settings.launcher` | single | root | `settings-general` | `settings-general`（默认）、`settings-account`（AccountMenu） |
| `settings.trigger` | single | root | `settings-general` | `settings-general` |
| `settings.header` | single | root | `settings-general` | `settings-general` |
| `settings.action` | **list** | root | `settings-general` | `settings-general`（id `open-document`，order 0） |
| `settings.close` | single | root | `settings-general` | `settings-general` |
| `settings.section` | **list** | root | `settings-general` | `settings-general`(0) / `settings-account`(-10) / `settings-models`(10) / `settings-plugins`(15) / `agent-preset`(20) |
| `settings.onboarding` | list | root | `settings-general` | `settings-general`、`settings-models` |
| `settings.general.item` | list | root | `settings-general` | `conversation`、`settings-general`、`theme`、`settings-session-log`、`permission-presets`、`shortcuts`、`chat` |
| `settings.plugins.tab` | list | root | `settings-plugins` | `settings-plugin-inventory`（id `all`，order 10）**← 仅此一个** |
| `plugins.item` | list | — | `settings-web-search`、`settings-subagent`、`settings-shell`、`settings-agent-loop`、`plugin-manager`、`cordis-client-runner` | 同上若干 + 由 `plugin-manager` 渲染（**不在设置面板内**） |
| `shell.overlay` | list | — | — | `settings-general`（id `host-release-change`） |

### 9.2 已核实类名数量（脚本实测，非估计）

用正则 `([A-Za-z0-9_-]{5,8}_[a-zA-Z][A-Za-z0-9]*)` 对导出文件做 token 去重统计：

| 来源 | 去重 token 数 | 备注 |
|---|---|---|
| `settings-general`（外壳 + General 页） | 61 | 含 `77Pn0W_*`(21) `G-tjAW_*`(5) `e7tBdW_*`(8) `xdKASq_*`(3) `_2zt9ba_*`(2) 等 |
| `settings-models` | 116 | 主体 `tUAPGa_*`(60) |
| `settings-plugin-inventory` | 44 | 主体 `uuMOda_*`(34) |
| `settings-plugins` | 15 | 主体 `syyOqq_*`(11) |
| `settings-shell`（终端页，非外壳） | 3 | 无自有 CSS |
| **primitives（frontend.js）** | **251** | 匹配 `"_<name>_<hash>_<n>"` 的**唯一名字**数 |
| `settings-account` | 未统计 | 3.4 MB，仅核实 slot 注册 |

> ⚠️ 插件侧的 token 数含少量误报（如 `client_store`、`epseek_ai`、`chrome_module` 这类 JS 标识符），实测约 **10~15%** 噪声，去噪后 plugin 侧约 **200** 个真实类名。
> 本文**逐条引用并给出计算样式原文**的约 **90** 条，引用类名后缀约 **130** 个。

### 9.3 未核实项（诚实标注）

1. `archived-sessions` 分区 —— 有 `navIcon` 分支，**无注册者**，不会出现在导航里。
2. `kB3qhq_settingsArea` —— 在 class map 里，**未找到 CSS 规则**。
3. `settings-account` 的内部 DOM —— 3.4 MB bundle，只核实了 slot 注册（`order:-10`，条件渲染）。
4. `dsh-client-ui-agent-preset` 的内部 DOM/CSS —— 完全未展开。
5. DSH 深色模式的**选择器形态**（`[data-theme]`？class？media？）—— 未核实，影响 R8/C-09/C-10。
6. `settings.general.item` 其余 6 个贡献者的行结构 —— 未逐个展开（已知它们各写各的 CSS）。
7. `--dsh-font-family-text-default` 之外的字体回退链最终生效值 —— 未在运行时验证。
8. 全部结论来自**静态源码阅读**，**未在浏览器里 `getComputedStyle` 实测**（我未被授权操作浏览器/重启服务）。

### 9.4 建议的落地顺序

1. **先做 §7.A（C-01 ~ C-13）** —— 只改 token 变量，一行不动 DOM，收益覆盖全部界面（设置页 + 主界面）。
2. 再做 §7.B / §7.D —— 面板、导航、标签条骨架。
3. 再做 §7.C / §7.E —— 卡片、行、控件。
4. **每条规则加 `[data-shortcut-modal="settings"]` 前缀**，避免污染主界面（R4）。
5. 每改一批，用浏览器实测一次（`getComputedStyle`），因为本文的「现有值」来自源码 CSS 原文，**实际计算值可能被更高特异度的规则覆盖**（我未做级联验证）。
