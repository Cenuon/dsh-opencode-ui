# opencode console → DSH `--dsw-*` token 映射与覆盖层设计

> 产出物（task-3）。**只读研究**，未修改任何插件源码。
> 目标值来源：`.research-opencode-ui/opencode-tokens.md`（opencode console 实测提取，2026-11-04）。
> DSH 侧证据来源：asar 内 `@deepseek-ai/dsh-client-ui-theme`、`@deepseek-ai/dsh-client-ui-*`、`dsh-web-frontend/dist`。
> 标注约定：**【已核实】**= 直接读到的源码/字节；**【推测】**= 由已核实事实外推，需实测确认。

---

## 0. 结论摘要（先读这一节）

### 0.1 最重要的发现：不要用 CSS 选择器打架，用 `ctx.theme.overrideTokens()`

**【已核实】** 主题 token 有两条落地路径，其中一条是**内联样式**：

1. **静态样式表**：`theme-client.js` 里的 `installThemeStyles(ctx)` 把 8 张 CSS 表以
   `<style data-plugin="@deepseek-ai/dsh-client-ui-theme" data-plugin-css="...">` 追加进 `document.head`。
   调色板写死在 `body{...}` / `body[data-ds-dark-theme]{...}` 里。
2. **内联样式**：`ui-layout.js` 的 `ThemePresenter.apply(snapshot)` 对 `document.body` 执行
   `body.style.setProperty(name, value)`，写入 `snapshot.active.tokens`。

而 `ctx.theme.overrideTokens(source, tokens)`（`ThemeRuntime` 实例方法，`ctx.provide("theme", theme)`）
把 token 叠加层合进 `snapshot.active.tokens`，**最终经 `ThemePresenter` 写成 body 内联样式**。
内联样式优先级高于任何样式表规则（`!important` 除外），所以：

> **推荐覆盖写法：`ctx.theme.overrideTokens(PLUGIN_ID, { "--dsw-alias-…": { light, dark }, … })`**
> 不写一行 CSS，不参与优先级竞争，light/dark 成对强制校验，返回 disposer 可完整卸载。

**【已核实】** 该 API 的校验函数 `validateOverrides(source, tokens)` 只检查「值必须是
`{ light: string, dark: string }`」，**没有 token 名白名单**，所以任意 `--dsw-*`（含 `--dsw-static-*`、
`--dsw-radius-*`、甚至主题从未定义的悬空名）都能覆盖。传裸字符串会抛教学式 `TypeError`。

### 0.2 数字汇总

| 项 | 数量 | 说明 |
|---|---|---|
| `theme-client.js` 中出现的 `--dsw-*` 去重名 | **403** | 【已核实】`grep -o -- '--dsw-[a-z0-9-]*' theme-client.js \| sort -u` |
| 整个 asar 中被引用的 `--dsw-*` 去重名 | **422** | 【已核实】全 asar 逐字节扫描 + 偏移映射到文件 |
| 主题定义但全 asar 无人消费的 token | 见 §4.3 | 如 `--dsw-alias-settings-card-*` 之外仍有若干 |
| 被引用但主题**从未定义**的悬空 token | **13** | 见 §4.2，其中 4 个无 fallback（当前就是坏的） |
| 组件里硬编码的十六进制颜色 | 见 §4.1 | 数量很少，多数带 token fallback |
| 硬编码 `font-weight:` 声明 | **36** | 【已核实】opencode 的 440/530 无法靠 token 达成 |
| 硬编码 `font-size:` 声明 | **81** | 其中 13px 已占 17 处、12px 占 29 处 |
| 主题 CSS 中的 `!important` | **0** | 【已核实】`theme-client.js` 零命中 |
| DSH 自带的 Inter 字体文件 | **0** | 【已核实】只发 Montserrat 300/400/500 |

### 0.3 三个必须先知道的「坑」

1. **token 定义在 `body`，不是 `:root`。** 覆盖层若写 `:root{--dsw-alias-…}` 会被
   `body{…}` 的声明**遮蔽**（自定义属性按继承就近取胜）。CSS 兜底必须打到 `body` 或更高特异性。
2. **`--dsw-static-*` 色阶不分浅深。** `body{--dsw-static-*}` 与 `body[data-ds-dark-theme]{--dsw-static-*}`
   两份声明**几乎完全相同**（77 个里只有 `--dsw-static-neutral-bluish-60` 不同：浅 `#f5f6f7` / 深 `#f9fafb`）。
   所以**改 static 会同时改浅色和深色**；正确做法是在 **alias 层**做浅深分叉。
3. **字重和字距没有被 token 化。** `--dsw-font-*-font-weight` 这 30 个子 token **全 asar 无人消费**；
   组件要么用 `font: var(--dsw-font-xs-13)` 简写（字重烤进简写字符串），要么直接写 `font-weight:500`。
   opencode 的 `440 / 530` 只能靠覆盖 30 个**简写** token 或写 CSS 规则，改子 token 是空操作。

---

## 1. 主题如何落到 DOM（【已核实】）

### 1.1 选择器形态

`design-platform.css`（asar 内 `dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js`，
导出为 `theme-client.js`）解析后是 6 条顶层规则：

| # | 选择器 | 声明数 | 内容 |
|---|---|---|---|
| 0 | `body` | 77 | 静态色阶（浅） |
| 1 | `body[data-ds-dark-theme]` | 77 | 静态色阶（深） |
| 2 | `body` | 200 | **语义别名（浅）** |
| 3 | `body[data-ds-dark-theme]` | 200 | **语义别名（深）** |
| 4 | `html[data-platform=darwin] body` | 1 | `--dsw-specific-menu:#f8f9faf0` |
| 5 | `html[data-platform=darwin] body[data-ds-dark-theme]` | 1 | `--dsw-specific-menu:#303136f0` |

其余 7 张表的关键选择器：

| 表 | 选择器 | 关键声明 |
|---|---|---|
| `base.css` | `:root` | `--dsh-font-family-text-default`、`--dsh-font-family-code-default`、`--dsw-font-family`、`--dsw-font-family-brand`、`--ds-font-family-code`、`--dsw-radius-xs/sm/md/lg/xl/panel` |
| `base.css` | `body` | `--dsw-font-family: var(--dsh-font-family-text, …), …`、`--dsw-alias-settings-card-fill`、`--dsw-alias-settings-card-stroke` |
| `corner-shape.css` | `@supports (corner-shape:superellipse(1.5))` 内 `:root` + `*,:before,:after` | `--dsw-corner-shape:superellipse(1.5)` |
| `focus.css` | `:root` / `:focus-visible` | `--dsw-focus-ring-width:2px` |
| `scrollbar.css` | `body` | `--dsh-scrollbar-thumb` 等 5 个 |
| `gradient-shadow-text.css` | `body` / `body,body *` / `body[data-ds-dark-theme]` | 30 组字体简写（180 decl）、`--dsw-shadow-lv1..3`、`--dsw-elevation-*` |
| `shiki.css` | `:root` / `body[data-ds-dark-theme]` | `--shiki-token-*` 语法高亮色（**独立于 `--dsw-*`**） |
| `onboarding.css` | `body` / `body[data-ds-dark-theme]` | `--dsw-alias-onboarding-*`、`--dsw-gradient-onboarding-*` |

### 1.2 浅深开关

**【已核实】** `ui-layout.js` 的 `theme-presenter.js` 片段：

```js
/** Body attribute selecting the dark base palette in the token stylesheets. */
const DARK_ATTRIBUTE = "data-ds-dark-theme";
const THEME_SOURCE_ATTRIBUTE = "data-ds-theme-source";
// apply(snapshot):
const scheme = snapshot.active.colorScheme;
document.documentElement.style.colorScheme = scheme;
document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE,
  snapshot.preference === "system" ? "system" : scheme);
const body = document.body;
if (scheme === "dark") body.setAttribute(DARK_ATTRIBUTE, "");
else body.removeAttribute(DARK_ATTRIBUTE);
```

`lib/index.js` 的 `bootThemeBodyScript()` 首屏脚本也做同一件事（脚本早于插件运行）：

```js
document.documentElement.dataset.dsThemeSource = preference
document.body.toggleAttribute('data-ds-dark-theme', dark)
```

- 深色选择器 = **`body[data-ds-dark-theme]`**（属性在 `body`，值为空串）。
- 浅色 = **无该属性**，即裸 `body`。
- `html` 上还有 `data-ds-theme-source`；注意 boot 阶段写的是**偏好**（可能是 `"system"`），
  `ThemePresenter.apply()` 随后覆盖为**解析后的 scheme**（`"light"`/`"dark"`）。
  所以 `html[data-ds-theme-source="dark"]` 在插件挂载后可作为深色判据，但**首屏窗口期内不可靠**。

### 1.3 `!important` 与内联样式

**【已核实】**
- `theme-client.js` 中 `!important` 出现 **0 次**。
- 全部 `ui-*.js` 中只有 `ui-conversation.js` 有 1 处 `"!important"`，是 ProseMirror 的**字符串常量**
  `const Oo = "!important"`，不是 CSS 声明。
- 内联样式**确实存在**，但只有两类：
  1. `body.style.setProperty` 写入 `--dsh-content-font-size` / `--dsh-code-font-size` /
     `--dsh-terminal-font-size` / `--dsh-font-family-text|code|terminal`；
  2. `body.style.setProperty(name, value)` 写入 `snapshot.active.tokens`（即 `overrideTokens` 的产物）。

> 推论：只要不用 `overrideTokens` 去覆盖某 token，该 token 就**没有内联值**，
> 纯 CSS 覆盖层无需 `!important`。反之若 token 已被内联，CSS 想抢必须 `!important`。

---

## 2. `--dsw-*` 全量清单（403 个，按类）

统计口径：`theme-client.js` 去重名，共 **403**。

| 类 | 数量 | 前缀 |
|---|---|---|
| 语义别名 | 107 | `--dsw-alias-*` |
| 静态色阶 | 77 | `--dsw-static-*` |
| 字体/排版 | 182 | `--dsw-font-*` |
| 组件专用 | 11 | `--dsw-specific-*` |
| 圆角 | 6 | `--dsw-radius-*` |
| 高度/描边 | 5 | `--dsw-elevation-*` |
| 阴影 | 4 | `--dsw-shadow-*` |
| 渐变 | 3 | `--dsw-gradient-*` |
| 其它 | 8 | `menu`×2、`linear`×2、`focus`×2、`mask`×1、`corner`×1 |
| **合计** | **403** | |

### 2.1 `--dsw-alias-*`（107，完整）

```
bg-base, bg-document-preview, bg-document-selection, bg-layer-1, bg-layer-2, bg-layer-3,
bg-mask-1, bg-mask-2, bg-mask-3, bg-mask-drop, bg-mask-photo, bg-module-platform,
bg-multi-select, bg-overlay, bg-skeleton,
border-inverted, border-inverted2, border-l1, border-l2, border-l2-darkmode-thin,
border-l3, border-l4,
brand-primary, brand-primary-invert, brand-primary-new-colorprimary-new-color, brand-text,
button-contrast-fill, button-elevated-fill, button-floating-fill, button-floating-hover,
button-ghost-active-border, button-ghost-active-fill, button-ghost-active-hover,
button-info-fill, button-info-hover, button-primary-dimmed, button-primary-fill,
button-primary-hover, button-tool-bar-fill, button-tool-bar-fill-invisible,
button-tool-bar-hover,
code-diff-added, code-diff-deleted,
file-diff-added-bg, file-diff-added-gutter, file-diff-added-marker,
file-diff-deleted-bg, file-diff-deleted-gutter, file-diff-deleted-marker,
interactive-bg-active, interactive-bg-hover, interactive-bg-hover-accent,
interactive-bg-hover-danger, interactive-bg-hover-solid,
label-caption, label-deep-diving, label-deep-diving-shimmer, label-dimmed,
label-document-preview, label-primary, label-primary-bluish, label-primary-dimmed,
label-primary-foreground, label-primary-inverted, label-secondary, label-shimmer,
label-tertiary, link,
markdown-citation, markdown-code-block, markdown-code-block-banner,
markdown-code-segment-selected, markdown-code-segment-unselected,
markdown-inline-code, markdown-placeholder, markdown-tag,
menu-group-header-fill, menu-icon,
onboarding-accent, onboarding-card-fill, onboarding-secondary-fill,
onboarding-checkbox-border,
scrollbar-bg-l1, scrollbar-bg-l2, scrollbar-hover-l1, scrollbar-hover-l2,
settings-card-fill, settings-card-stroke,
state-business-primary, state-business-tertiary,
state-error-primary, state-error-secondary,
state-idle-primary,
state-success-primary, state-success-secondary, state-success-tertiary,
state-warn-label, state-warn-primary, state-warn-secondary, state-warn-tertiary,
switch-thumb, toast-bg, toast-label, tooltip-bg, tooltip-key-bg,
turn-trigger-bg, turn-trigger-bg-hover
```

> ⚠️ `--dsw-alias-onboarding-checkbox-border` 这个名字（**本文档中出现的即真实名**）
> 在部分工具输出里会被当作密钥打码成别的样子。我逐字符用 `charCodeAt` 核对过它的长度与码点
> （`LEN=15`，`99-104-101-99-107-98-111-120-45-98-111-114-100-101-114`），确认前缀是 8 个小写字母
> 加 `-border`。写覆盖层时**必须用真实字符串**，否则该 token 不会生效。

> `--dsw-alias-brand-primary-new-colorprimary-new-color` 是**上游真实存在的拼接 bug**
> （两个名字被 CSS Modules/bundler 粘在一起），但主题**定义了它**且 `ui-settings-general.js`
> 真的引用它（4 次），所以能正常工作。覆盖时照抄这个名字。

### 2.2 `--dsw-specific-*`（11，完整）

```
--dsw-specific-bubble            --dsw-specific-menu
--dsw-specific-bubble-highlight  --dsw-specific-selector
--dsw-specific-input-major       --dsw-specific-sidebar-fill
--dsw-specific-login-input       --dsw-specific-sidebar-nav-item-active
--dsw-specific-tip               --dsw-specific-sidebar-nav-item-active-accent
                                 --dsw-specific-sidebar-nav-item-hover
```

### 2.3 `--dsw-static-*`（77，完整）

```
amber: 100 400 500 600 900
blue: 50 50p 75 100 300 400 450 500 600 800 900 950
deepseek: 50 100 200 300 400 450 500 600 700-delete 800 900
green: 100 400 500 500-a08 500-a12 900
neutral: 00 50 100 150 200 250 300 400 500 550 600 700 800 850 900 1000
neutral-bluish: 00 50 60 75 100 150 200 300 400 500 600 700 750 800 850 875 900 950 1000
red: 50 100 400 400-a12 500 600 600-a08 900
```

### 2.4 `--dsw-font-*`（182，完整结构）

**182 = 2 + 30 × 6**。两个独立字体族 token：

```
--dsw-font-family          --dsw-font-family-brand
```

30 个排版族，每族展开为 6 个 token（1 简写 + 5 子属性）：

```
<族>                          （简写，如 13px/20px var(--dsw-font-family)）
<族>-font-family              （= var(--dsw-font-family)）
<族>-font-size
<族>-font-weight
<族>-line-height
<族>-font-style               （normal / italic）
```

30 个族名（完整）：

```
--dsw-font-base-16              --dsw-font-markdown-base
--dsw-font-base-strong-16       --dsw-font-markdown-base-italic
--dsw-font-l-20                 --dsw-font-markdown-base-strong
--dsw-font-m-18                 --dsw-font-markdown-base-strong-italic
--dsw-font-s-14                 --dsw-font-markdown-code
--dsw-font-s-strong-14          --dsw-font-markdown-code-block
--dsw-font-xl-24                --dsw-font-markdown-code-block-small
--dsw-font-xs-13                --dsw-font-markdown-h1
--dsw-font-xs-strong-13         --dsw-font-markdown-h2
--dsw-font-xxs-12               --dsw-font-markdown-h3
--dsw-font-xxs-strong-12        --dsw-font-markdown-h4
--dsw-font-xxxs-11              --dsw-font-markdown-small
--dsw-font-xxxs-strong-11       --dsw-font-markdown-small-italic
                                --dsw-font-markdown-small-strong
                                --dsw-font-markdown-small-strong-italic
                                --dsw-font-markdown-table
                                --dsw-font-markdown-table-head
```

UI 尺度族的实测值（【已核实】，来自 `gradient-shadow-text.css` 的 `body` 规则）：

| 族 | 简写值 | 字重 |
|---|---|---|
| `--dsw-font-xl-24` | `600 24px/32px` | 600 |
| `--dsw-font-l-20` | `500 20px/28px` | 500 |
| `--dsw-font-m-18` | `500 16px/28px` | 500（名字说 18，值实为 16px） |
| `--dsw-font-base-16` | `16px/24px` | 400 |
| `--dsw-font-base-strong-16` | `500 16px/24px` | 500 |
| `--dsw-font-s-14` | `14px/22px` | 400 |
| `--dsw-font-s-strong-14` | `500 14px/22px` | 500 |
| `--dsw-font-xs-13` | `13px/20px` | 400 |
| `--dsw-font-xs-strong-13` | `500 13px/20px` | 500 |
| `--dsw-font-xxs-12` | `12px/18px` | 400 |
| `--dsw-font-xxs-strong-12` | `500 12px/18px` | 500 |
| `--dsw-font-xxxs-11` | `11px/14px` | 400 |
| `--dsw-font-xxxs-strong-11` | `500 11px/14px` | 500 |

Markdown 族随用户字号缩放（`--dsh-content-font-delta` = `--dsh-content-font-size` − 14px）。

### 2.5 其余类（完整）

```
--dsw-radius-xs: 4px     --dsw-elevation-panel      --dsw-shadow-lv1
--dsw-radius-sm: 8px     --dsw-elevation-prominent  --dsw-shadow-lv1-blur
--dsw-radius-md: 12px    --dsw-elevation-soft       --dsw-shadow-lv2
--dsw-radius-lg: 16px    --dsw-elevation-stroke     --dsw-shadow-lv3
--dsw-radius-xl: 20px    --dsw-elevation-stroke-color
--dsw-radius-panel: 28px

--dsw-gradient-onboarding-blue-stops    --dsw-menu-backdrop-filter: blur(40px) saturate(150%)
--dsw-gradient-onboarding-cyan-stops    --dsw-menu-surface-fill
--dsw-gradient-onboarding-violet-stops  --dsw-linear-gradient-think
--dsw-focus-ring-color                  --dsw-linear-think-select
--dsw-focus-ring-width: 2px             --dsw-mask-blur: none
--dsw-corner-shape: superellipse(1.5)
```

---

## 3. 覆盖优先级与写法建议

### 3.1 首选：`ctx.theme.overrideTokens()`（【已核实】API 存在且契约明确）

```js
// 客户端插件内（theme 服务由 ui-theme 通过 ctx.provide("theme", theme) 提供；
// ui-layout 的 inject 列表即 ["slots","theme","locale","shortcuts"]）
ctx.effect(() => ctx.theme.overrideTokens(PLUGIN_ID, {
  "--dsw-alias-bg-base":          { light: "#fff",     dark: "#161616" },
  "--dsw-alias-label-primary":    { light: "#161616",  dark: "#fafafa" },
  // …其余见 §5 映射表
}), "opencode-skin: token layer");
```

为什么这是最优解：

| 维度 | `overrideTokens` | CSS 覆盖层 |
|---|---|---|
| 生效机制 | body 内联样式 → **赢所有样式表** | 与 `body{…}` 同特异性，**依赖 head 中样式表顺序** |
| light/dark | 一个对象成对给，运行时强制校验 | 要写两条规则 |
| 卸载 | 返回 disposer，`ctx.effect` 自动清理 | 需自行移除 `<style>` |
| 覆盖 static | 可以 | 可以 |
| 覆盖悬空 token | 可以（无白名单） | 可以 |

**已核实的行为细节**：`overrideTokens` 每次同 source 调用会**整层替换并重新压栈**（effect 重注册语义），
卸载只移除自己那一层；多层按 `seq` 顺序后者覆盖前者。

### 3.2 兜底：CSS 覆盖层

若确实需要写 CSS（例如要覆盖字重这种「子 token 无人消费」的场景）：

```css
/* 浅色 + 全局：注意必须是 body 或更高特异性，不能只写 :root */
html body {
  --dsw-alias-bg-base: #fff;
  --dsw-alias-label-primary: #161616;
}
/* 深色：必须比 body[data-ds-dark-theme] (0,0,2) 更高 */
html body[data-ds-dark-theme] {
  --dsw-alias-bg-base: #161616;
  --dsw-alias-label-primary: #fafafa;
}
```

要点：
- **`:root` 单独写没用** —— `body` 上的同名声明会遮蔽继承值。要写就写 `html body`。
- `html body`（0,0,2）> `body`（0,0,1），`html body[data-ds-dark-theme]`（0,1,2）>
  `body[data-ds-dark-theme]`（0,1,1），因此**不依赖 head 顺序**即可取胜。
- **不需要 `!important`**，因为主题侧零 `!important`。
- **唯一需要 `!important` 的场景**：覆盖已被 `ThemePresenter` 写成内联的 token
  （`--dsh-content-font-size`、`--dsh-code-font-size`、`--dsh-terminal-font-size`、
  `--dsh-font-family-text|code|terminal`），或与 `overrideTokens` 抢同一个 token。
- 别忘 `html[data-platform=darwin] body`（0,1,1 + 属性）会覆盖 `--dsw-specific-menu`，
  想改 macOS 菜单底色要写 `html[data-platform=darwin] html body` 级别的选择器，或直接用 `overrideTokens`。

### 3.3 组件级局部重绑（改不到的地方）

部分 token 会被组件在**自己的容器上重绑**，全局覆盖对该子树无效。已核实的两处：

- `--dsh-scrollbar-thumb` / `--dsh-scrollbar-thumb-hover`：菜单/弹层会重绑到 l2 组；
  ui-sidebar 在指针离开时重绑为 `transparent`。
- `--dsw-elevation-stroke-color`：`gradient-shadow-text.css` 里
  `body[data-ds-dark-theme] [data-menu-material]{--dsw-elevation-stroke-color:var(--dsw-alias-border-l3)}`，
  菜单会把描边色重绑到 `--dsw-alias-border-l1`。所以**改 `--dsw-alias-border-l3/l1` 比直接改
  `--dsw-elevation-stroke-color` 更有效**。
- 外壳 CSS 里 `._list_*` / `._submenu_*` 也把 `--dsw-elevation-stroke-color` 重绑到 `--dsw-alias-border-l1`。

---

## 4. token 覆盖管不到的地方（字面量与悬空引用）

### 4.1 组件里的字面量颜色（【已核实】）

方法：对全部 `ui-*.js` 与 `settings-shell.js` grep `#[0-9a-fA-F]{3,8}` 与 `rgb(`。
**`rgb(`/`rgba(` 命中 0 次**。十六进制共 55 处，去掉纯黑/透明遮罩用的 `#000`/`#0000`（mask-image 渐变的
技术性用色，与主题无关）后，**真正影响观感的只有 7 处**：

| 文件 | 字面量 | 上下文 | 是否 token 可控 |
|---|---|---|---|
| `ui-conversation.js` | `#a78bfa` | `.X0HXfW_colorTools{--meter-tint:#a78bfa}` | ❌ 需单独规则 |
| `ui-conversation.js` | `#fff` | `.JZLxKW_primary{background:var(--dsw-alias-button-info-fill);color:#fff}` | ❌ 需单独规则 |
| `ui-layout.js` | `#7a9bf01a/#7a9bf000/#8f89b800/#8f89b817/#7a9bf0` | `[data-platform=darwin] .PIRFFq_sidebarCol` 侧栏渐变（深色版 `#7a9bf014…`） | ❌ 需单独规则 |
| `ui-sidebar.js` | `#ffffff8c/#ffffff4d` | `[data-platform=darwin] .kB3qhq_newSession` | ❌ 需单独规则 |
| `ui-sidebar.js` | `#ffffff26/#fff3` | 深色同上 | ❌ 需单独规则 |
| `ui-sidebar-right.js` | `#A6B2C7` | 内联 SVG `stroke:"#A6B2C7"` | ❌ 需改组件（属性，非 CSS） |
| `ui-workspace.js` | `#fff` / `#cfd3d6` / `#adb2b8` | `.JoiKIa_hoverTitle` / `_hoverPath` / `_hoverTime` / `_hoverStatus` | ❌ 需单独规则 |

**外壳 CSS 里还有 2 处更隐蔽的**（【已核实】，`dsh-web-frontend/dist/assets/index-BNyAYEM7.css`）：

| 字面量 | 位置 | 影响 |
|---|---|---|
| `--dsw-hovercard-bg: #2C2C2E` | `._card_38jqx_9` 局部定义 | **硬编码深色**，浅色模式下 hovercard 也是深灰。token 覆盖无效（它在类上本地定义），必须写规则改这个类 |
| `--shiki-token-*` 全套 | `shiki.css` 的 `:root` / `body[data-ds-dark-theme]` | 语法高亮 12 色，**不走 `--dsw-*`**，想统一观感要单独覆盖 `--shiki-*` |

> 好消息：opencode 的「无阴影 + 0.5px 发丝边框」DSH 本来就接近。
> 外壳 CSS 里 `.5px` 边框已大量使用（`border:.5px solid var(--dsw-alias-border-l3|l4)`、
> `border-top:.5px solid var(--dsw-alias-border-l2)` 等），`--dsw-elevation-stroke` 本身就是
> `0 0 0 .5px var(--dsw-elevation-stroke-color)`。

### 4.2 被引用但主题从未定义的悬空 token（【已核实】，13 个）

方法：全 asar 逐字节扫描 `--dsw-[a-z0-9-]+` 并把命中偏移映射回所属文件，与 `theme-client.js` 求差。

| token | 引用方 | 有 fallback？ | 后果 |
|---|---|---|---|
| `--dsw-alias-label-quaternary` | `ui-agent-preset`、`ui-sidebar-browser` | **否** | `color:` 声明失效 → 继承父色，禁用态失去灰阶 |
| `--dsw-font-mono` | `ui-agent-preset`、`ui-jobs`、`ui-plugin-manager`、`ui-sidebar-documentpreview`（7 处） | 是 `ui-monospace, SFMono-Regular, Menlo, monospace` | 走 fallback，正常 |
| `--dsw-alias-fill-tsp-secondary` | `ui-agent-preset` | 待查 | 待查 |
| `--dsw-alias-fill-tertiary` | `ui-attachment` | 待查 | 待查 |
| `--dsw-alias-fill-l1` / `-l2` | `ui-jobs` | 待查 | 待查 |
| `--dsw-alias-bg-l1` / `-l2` | `ui-sidebar-terminal` | 待查 | 待查 |
| `--dsw-alias-separator-primary` | `ui-chat`（`StatsPills.module.css` 的 `.TQ0rwa_sep{color:…}`） | **否** | 分隔符继承父色 |
| `--dsw-alias-bg-layer-4` | `ui-settings-subagent`、外壳 CSS | **否** | hover 背景失效 |
| `--dsw-alias-label-error` | 外壳 CSS（`._failed_ft7vz_23{color:…}`） | **否** | 保存失败文案失去红色 |
| `--dsw-hovercard-bg` | 外壳 CSS（本地定义为 `#2C2C2E`） | 本地定义 | 见 §4.1 |
| `--dsw-desktop-window-tint` | `renderer/assets/window-material.css`、`welcome.css` | 否 | Electron 原生窗口着色（另一渲染进程） |

> **对皮肤插件的价值**：既然 `overrideTokens` 无 token 名白名单，可以**顺手把这 13 个补上**，
> 让这些插件也跟着 opencode 配色走。尤其是 `--dsw-alias-label-quaternary` 和
> `--dsw-alias-label-error`，补上就是修 bug。

### 4.3 定义但无人消费的 token（节选）

`--dsw-alias-settings-card-fill` / `--dsw-alias-settings-card-stroke` **在已导出的 `ui-*.js` 里查不到**，
但全 asar 扫描显示它们被 **4 个设置类插件**消费（各 1 处）：
`ui-agent-preset`、`ui-settings-account`、`ui-settings-models`、`ui-settings-plugin-inventory`（后者 2 处）。

> ⚠️ **任务描述修正**：任务里写「聊天区还用到 `--dsw-alias-settings-card-fill`/`-stroke`」——
> 实际消费方是**设置页的卡片插件**，不是聊天区。聊天区（`ui-chat`/`ui-conversation`）并不引用它们。
> 覆盖这两个 token 的价值在**设置页**，与任务目标一致，但归因要改。

这两个 token 的链路（【已核实】）：
`--dsw-alias-settings-card-fill: var(--dsw-alias-bg-layer-2)`、
`--dsw-alias-settings-card-stroke: var(--dsw-alias-border-l4)`（定义在 `base.css` 的 `body` 规则里）。
**所以改 `--dsw-alias-bg-layer-2` 和 `--dsw-alias-border-l4` 就能间接改设置卡片**，不必直接覆盖它们。

---

## 5. 颜色映射表

### 5.1 语义别名 → opencode（核心 30 条，建议直接落地）

DSH 现值列为【已核实】（从 `body` / `body[data-ds-dark-theme]` 规则 + 静态色阶解析得到）。
opencode 目标列取自 `opencode-tokens.md`。

| DSH token | DSH 现值 浅 | DSH 现值 深 | → opencode 浅 | → opencode 深 | 依据 |
|---|---|---|---|---|---|
| `--dsw-alias-bg-base` | `#fff` | `#151517` | `#fff` | `#161616` | 主内容面 = `bg-base` |
| `--dsw-specific-sidebar-fill` | `#f9fafb` | `#1b1b1c` | `#fafafa` | `#080808` | 侧栏是最外层 = `bg-deep` |
| `--dsw-alias-bg-layer-1` | `#fff` | `#232324` | `#fafafa` | `#242424` | `bg-layer-01` |
| `--dsw-alias-bg-layer-2` | `#fff` | `#2c2c2e` | `#fafafa` | `#242424` | `bg-layer-01`；同时是设置卡片底 |
| `--dsw-alias-bg-layer-3` | `#fff` | `#353638` | `#f2f2f2` | `#2e2e2e` | `bg-layer-02` |
| `--dsw-alias-bg-overlay` | `#e9ecf2` | `#61666b` | `#fff` | `#2e2e2e` | 弹出层；【推测】 |
| `--dsw-alias-label-primary` | `#0f1115` | `#f9fafb` | `#161616` | `#fafafa` | `text-base` |
| `--dsw-alias-label-secondary` | `#61666b` | `#cfd3d6` | `#5c5c5c` | `#aeaeae` | `text-muted` |
| `--dsw-alias-label-tertiary` | `#81858c` | `#adb2b8` | `gray`(=`#808080`) | `gray` | `text-faint`（opencode 浅深同值） |
| `--dsw-alias-label-caption` | `#adb2b8` | `#81858c` | `#a3a3a3`【推测】 | `#6b6b6b`【推测】 | opencode 无第 4 级，外推 |
| `--dsw-alias-label-dimmed` | `#e1e5ee` | `#43454a` | `#d4d4d4`【推测】 | `#3c3c3c`【推测】 | 同上 |
| `--dsw-alias-brand-primary` | `#0f1115` | `#f9fafb` | `#3b5cf6` | `#a2bcff` | `text-accent` |
| `--dsw-alias-button-primary-fill` | `=brand-primary` | `=brand-primary` | `#3b5cf6` | `#a2bcff` | 主按钮；【已核实】它引用 brand-primary，但见下方警告 |
| `--dsw-alias-button-primary-hover` | `#43454a` | `#ebeef2` | `#3250df` | `#c3d4fd` | `text-accent-hover` |
| `--dsw-alias-link` | `#4176e6` | `#7aaaff` | `#3b5cf6` | `#a2bcff` | `text-accent` |
| `--dsw-alias-state-business-primary` | `#4176e6` | `#7aaaff` | `#3b5cf6` | `#a2bcff` | 处理中/焦点色 |
| `--dsw-alias-state-error-primary` | `#ec1313` | `#f25a5a` | `#b82d35` | `#f17471` | `state-fg-danger` |
| `--dsw-alias-state-success-primary` | `#22c55e` | `#22c55e` | `#198b43` | `#6bd586` | `state-fg-success` |
| `--dsw-alias-state-warn-primary` | `#f59e0b` | `#f59e0b` | `#cb9f34` | `#f2cf76` | `state-fg-warning` |
| `--dsw-alias-state-warn-label` | `#dd8629` | `#dd8629` | `#cb9f34` | `#f2cf76` | 同上，文字版 |
| `--dsw-alias-state-idle-primary` | `#d4d4d4` | `#545557` | `#d4d4d4`【推测】 | `#3c3c3c`【推测】 | opencode 无 idle 语义 |
| `--dsw-alias-border-l1` | `#0000000a` | `#ffffff0f` | `#00000014` | `#ffffff14` | `border-muted` |
| `--dsw-alias-border-l2` | `#0000001a` | `#ffffff1f` | `#0000001a` | `#ffffff1a` | `border-base`（现值已基本吻合） |
| `--dsw-alias-border-l3` | `#0000001f` | `#ffffff29` | `#00000033` | `#ffffff33` | `border-strong`（`#0003`/`#fff3`） |
| `--dsw-alias-border-l4` | `#00000029` | `#fff3` | `#0000001a` | `#ffffff1a` | 设置卡片描边来源；opencode 卡片用 8% 半像素 |
| `--dsw-alias-interactive-bg-hover` | `#2631480f` | `#ffffff14` | `#0000000f` | `#ffffff14` | hover 底 |
| `--dsw-alias-interactive-bg-active` | `#2631481a` | `#ffffff24` | `#00000014` | `#ffffff14` | 激活导航项背景 `rgba(0,0,0,.08)` |
| `--dsw-alias-bg-module-platform` | `#f5f6f7` | `#353638` | `#f2f2f2` | `#2e2e2e` | 平台模块底 |
| `--dsw-specific-selector` | `#f5f6f7` | `#353638` | `#f2f2f2` | `#2e2e2e` | 选择器底 |
| `--dsw-alias-markdown-code-block` | `#f9fafb` | `#1b1b1c` | `#fafafa` | `#161616` | 代码块底 |
| `--dsw-alias-markdown-inline-code` | `#fafafa` | `#292929` | `#f2f2f2` | `#2e2e2e` | 行内代码 |
| `--dsw-alias-markdown-tag` | `#f1f3f5` | `#2c2c2e` | `#f2f2f2` | `#2e2e2e` | 标签底 |
| `--dsw-alias-turn-trigger-bg` | `=code-block` | `=interactive-bg-hover` | `#fafafa` | `#ffffff14` | 间接生效 |
| `--dsw-alias-button-elevated-fill` | `#fff` | `#43454a` | `#fff` | `#2e2e2e` | 【推测】 |
| `--dsw-alias-button-floating-fill` | `#fff` | `#2c2c2e` | `#fff` | `#242424` | 【推测】 |
| `--dsw-alias-button-floating-hover` | `#f1f3f5` | `#353638` | `#f2f2f2` | `#2e2e2e` | 【推测】 |
| `--dsw-specific-input-major` | `#fff` | `#2c2c2e` | `#fff` | `#242424` | 【推测】 |
| `--dsw-alias-scrollbar-bg-l1` | `#e5e5e5` | `#3c3c3d` | `#e5e5e5` | `#2e2e2e` | 【推测】 |
| `--dsw-alias-scrollbar-hover-l1` | `#d4d4d4` | `#545557` | `#d4d4d4` | `#3c3c3c` | 【推测】 |
| `--dsw-alias-scrollbar-bg-l2` | `#e5e5e5` | `#545557` | `#e5e5e5` | `#2e2e2e` | 【推测】 |
| `--dsw-alias-scrollbar-hover-l2` | `#d4d4d4` | `#65676b` | `#d4d4d4` | `#3c3c3c` | 【推测】 |
| `--dsw-alias-bg-skeleton` | `#0000000a` | `#ffffff14` | `#0000000f` | `#ffffff14` | 骨架屏 |
| `--dsw-alias-menu-group-header-fill` | `#f8f9faf0` | `#303136f0` | `#fafafaf0` | `#161616f0` | 【推测】保持 94% 不透明 |
| `--dsw-menu-surface-fill` | `#f8f9fa94` | `#43454a73` | `#fafafa94` | `#16161673` | 【推测】 |
| `--dsw-alias-toast-bg` | `#353638` | `#43454a` | `#242424` | `#2e2e2e` | 【推测】 |
| `--dsw-alias-tooltip-bg` | `#2c2c2e` | `#43454a` | `#242424` | `#2e2e2e` | 【推测】 |

#### ⚠️ 两个必须注意的连带关系

1. **`--dsw-alias-brand-primary` 被 `--dsw-alias-button-primary-fill` 引用**
   （`--dsw-alias-button-primary-fill: var(--dsw-alias-brand-primary)`）。
   把 brand-primary 改成 opencode 蓝，主按钮**自动**变蓝——这符合 opencode 预期。
   但 **`--dsw-alias-button-primary-hover` 不引用 brand-primary**，它是写死的
   `var(--dsw-static-neutral-bluish-750)`（浅 `#43454a`）/ `bluish-100`（深 `#ebeef2`）。
   所以**必须单独覆盖 hover，否则主按钮 hover 是深灰而不是深蓝**。
2. **`--dsw-alias-state-business-primary` 是 focus ring 的默认色**。
   `focus.css`：`outline-color: var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))`，
   组件里也大量 `box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))`。
   覆盖它 → 焦点环变 opencode 蓝（通常是想要的），但**要意识到这是全局副作用**。

### 5.2 静态色阶 → opencode 灰阶（【重要警告】）

**先读警告**：`--dsw-static-*` 的浅深两份声明几乎完全相同（77 个中仅 `neutral-bluish-60` 不同：
浅 `#f5f6f7` / 深 `#f9fafb`）。这意味着**覆盖 static 会同时改变浅色和深色两套配色**，
无法做出 opencode 那种「浅色 `#fafafa` / 深色 `#080808`」的分叉。

> **推荐：不要在 static 层做主题映射，只在 alias 层做。**
> 下表仅在「确实需要调整底层灰阶」（例如想让所有半透明边框的基色更中性）时参考。

`--dsw-static-neutral-bluish-*`（浅色实际值）→ opencode 灰：

| DSH 现值 | 建议目标 | 置信度 |
|---|---|---|
| `bluish-00` `#fff` | `#ffffff` | 已核实 |
| `bluish-50` `#f9fafb` | `#fafafa` | 已核实 |
| `bluish-60` `#f5f6f7` | `#f7f7f7` | 推测（opencode 无精确对应） |
| `bluish-75` `#f1f3f5` | `#f5f5f5` | 推测 |
| `bluish-100` `#ebeef2` | `#f2f2f2` | 已核实（= `bg-layer-02`） |
| `bluish-150` `#e9ecf2` | `#efefef` | 推测 |
| `bluish-200` `#e1e5ee` | `#e5e5e5` | 已核实 |
| `bluish-300` `#cfd3d6` | `#d4d4d4` | 推测 |
| `bluish-400` `#adb2b8` | `#a3a3a3` | 推测 |
| `bluish-500` `#979da6` | `#8f8f8f` | 推测 |
| `bluish-600` `#81858c` | `#808080`(=gray) | 已核实 |
| `bluish-700` `#61666b` | `#5c5c5c` | 已核实（= `text-muted`） |
| `bluish-750` `#43454a` | `#404040` | 推测 |
| `bluish-800` `#353638` | `#2e2e2e` | 已核实（= `bg-layer-02` 深） |
| `bluish-850` `#2c2c2e` | `#242424` | 已核实（= `bg-layer-01` 深） |
| `bluish-875` `#232324` | `#1c1c1c` | 推测 |
| `bluish-900` `#1b1b1c` | `#161616` | 已核实（= `bg-base` 深） |
| `bluish-950` `#151517` | `#101010` | 推测（opencode `bg-deep` 是 `#080808`） |
| `bluish-1000` `#0f1115` | `#0a0a0a` | 推测 |

`--dsw-static-neutral-*`（纯中性，用于滚动条/行内代码）现值：
`00 #fff`、`50 #fafafa`、`100 #f5f5f5`、`150 #ededed`、`200 #e5e5e5`、`250 #dcdcdc`、`300 #d4d4d4`、
`400 #a2a4a6`、`500 #7f8287`、`550 #65676b`、`600 #545557`、`700 #3c3c3d`、`800 #292929`、
`850 #212123`、`900 #0f0f0f`、`1000 #000`。
**这套已经非常接近 opencode 的纯灰**（`#e5e5e5`/`#d4d4d4`/`#2e2e2e` 等），**建议原样保留**。

### 5.3 opencode 有、DSH 无对应的语义

| opencode | 值（浅/深） | DSH 情况 |
|---|---|---|
| `border-inverse`（激活 tab 下划线） | `#242424` / `#fafafa` | `--dsw-alias-border-inverted` 浅色是**全透明 `#0000`**、深色 `#ffffff0f`，语义完全不同。若要做 tab 下划线，需**新增规则**而非映射 |
| `--console-nav-hover` | `#0000001a` | 无对应；最接近 `--dsw-alias-interactive-bg-active`（浅 `#2631481a`） |
| `--v2-alpha-light-8/10` | `#ffffff14` / `#ffffff1a` | 无 alpha 色阶 token，已内联在各 alias 值里 |
| `text-faint` = `gray` | 浅深同值 | `--dsw-alias-label-tertiary` 可承担 |

---

## 6. 字体映射

### 6.1 现状（【已核实】）

| 事实 | 证据 |
|---|---|
| `--dsw-font-family` 默认值 | `base.css` `:root`：`--dsh-font-family-text-default:-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif` |
| `--dsw-font-family` 在 body 上重声明 | `--dsw-font-family: var(--dsh-font-family-text, var(--dsh-font-family-text-default)), var(--dsh-font-family-text-default)`（用户设置**插在最前**，未设置则回退内置栈，重复一次无害） |
| `--dsw-font-family-brand` | `"Montserrat", <内置栈>` |
| **DSH 未发布 Inter** | asar 内字体文件仅：`Montserrat`（`montserrat-light/regular/medium.woff2`，300/400/500）+ 19 个 KaTeX。`brand-font.css` 也只声明 Montserrat |
| DSH 自己**已经想用 Inter** | `ui-conversation.js` 两处 `font-family:Inter, var(--dsw-font-family)`（`.6DJyyG_count`、`.6DJyyG_preview`），但没装 → 实际回退到 `--dsw-font-family` |

### 6.2 建议

```js
"--dsw-font-family": {
  light: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  dark:  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
},
```

- opencode 的 `Inter, sans-serif` 在 DSH 上**只能"尽力而为"**：装了 Inter 的用户得到 Inter，
  没装的回退系统 UI 字体。这是**代价最小、无二进制资产**的方案。
- **代价说明**：opencode 用的是 Inter 可变字体（100–900），字重 440/530 靠可变轴实现。
  系统回退字体（macOS 上是 SF Pro / Helvetica）**没有 440/530 字重**，浏览器会就近吸附到 400/500。
  所以即便设了字体名，**字重观感也不会与 opencode 一致**。
- **要真正一致**，插件必须自带 Inter woff2 并注入 `@font-face`：
  - 静态三档（400/500/600）约 `3 × 100KB ≈ 300KB`；
  - 可变字体单文件约 `300–350KB`，且只有可变字体才支持 440/530。
  - 字体文件需通过插件的可访问 URL 提供（`url()` 指向插件资源），打包/部署复杂度上升。
- **不要**改 `--dsw-font-family-brand`（Montserrat）除非明确要改品牌字，它只影响品牌文案。

### 6.3 字号（opencode 13px 基准）

| DSH 变量 | 默认 | 取值范围 | opencode 目标 |
|---|---|---|---|
| `--dsh-content-font-size` | 14px | 10–22，**整数** | **13px** |
| `--dsh-code-font-size` | 11px | 10–16 | 13px 基准下代码块保持 11–12px 更接近 opencode |
| `--dsh-terminal-font-size` | 13px | 10–20 | 13px（已一致） |

- 这三个由**用户设置**驱动（`ui-theme` 的 `fontSize` / `codeFontSize` / `terminalFontSize`），
  `ThemePresenter` 以 **body 内联样式**写入。
- 想强行锁定 13px 而不改 profile 配置：用 `overrideTokens` 覆盖 `--dsh-content-font-size`
  （`ThemePresenter` 先写字号、后写 tokens，**tokens 后写所以赢**，【已核实】执行顺序）。
- 【已核实】字号会联动整条 markdown 阶梯：`--dsh-content-font-delta = calc(var(--dsh-content-font-size,14px) - 14px)`，
  标题/正文/表格都按 delta 平移。

### 6.4 字重与字距（**token 覆盖做不到**）

opencode 要 `font-weight: 440`（正文）/ `530`（标题强调）、`letter-spacing: -0.04px`。

【已核实】：
- DSH 主题里**没有 letter-spacing token**（`grep 'letter-spacing:' theme-client.js` 零命中）。
- DSH 主题里的字重只有 `400`(16 处)/`500`(8)/`600`(6)/`700`(3)，且**烤进简写字符串**。
- `--dsw-font-*-font-weight` 这 30 个子 token **全 asar 无人消费**（对 `ui-*.js` 与外壳 CSS 均零命中）。
- 组件里另有 **36 处硬编码 `font-weight:`**（`ui-conversation.js` 最多，500×11、400×4）。

**可行路径**（按代价排序）：

1. **接受 400/500**（推荐先做）：把 opencode 的 440 视为 400、530 视为 500。
   opencode 的视觉层级主要靠**灰度**拉开，字重差异很小，这一步的观感损失有限。
2. **覆盖 30 个简写 token**（中等代价）：例如
   `"--dsw-font-xs-strong-13": { light: "530 13px/20px var(--dsw-font-family)", dark: … }`。
   注意：简写里**不能引用自身**，必须把 `var(--dsw-font-family)` 原样带上，否则字体族会丢。
3. **写 CSS 规则覆盖硬编码字重**（高代价、易碎）：需要针对 36 处具体类名，
   且类名是 CSS Modules 哈希（如 `.6DJyyG_count`），**插件升级即失效**。

> `letter-spacing: -0.04px` 只能走路径 3，或全局
> `html body { letter-spacing: -0.04px }` 一刀切（会连带影响代码块等不该加负字距的地方）。

---

## 7. 圆角映射

### 7.1 现值（【已核实】，`base.css` 的 `:root`）

| token | 现值 | 定义位置 |
|---|---|---|
| `--dsw-radius-xs` | **4px** | `:root` |
| `--dsw-radius-sm` | **8px** | `:root` |
| `--dsw-radius-md` | **12px** | `:root` |
| `--dsw-radius-lg` | **16px** | `:root` |
| `--dsw-radius-xl` | **20px** | `:root` |
| `--dsw-radius-panel` | **28px** | `:root` |

这 6 个**没有浅深变体**（只在 `:root` 定义一次），所以 light/dark 给同值即可。

### 7.2 消费热度（【已核实】，全 asar 引用次数）

`sm` 106 · `md` 86 · `lg` 65 · `xl` 27 · `xs` 25 · `panel` 5。

### 7.3 建议映射到 opencode 的 6px 体系

| token | 现值 | → 目标 | 理由 |
|---|---|---|---|
| `--dsw-radius-xs` | 4px | **6px** | opencode 统一 6px |
| `--dsw-radius-sm` | 8px | **6px** | 最高频，导航项/按钮/小卡片 |
| `--dsw-radius-md` | 12px | **6px** | 按钮/输入框 |
| `--dsw-radius-lg` | 16px | **6px** | 卡片 |
| `--dsw-radius-xl` | 20px | **6px** | 引导页/大容器 |
| `--dsw-radius-panel` | 28px | **6px**（保守可留 8–12px） | 面板/模态；opencode 无大圆角，但一刀切到 6px 观感变化最大，建议实测后再定 |

【推测】把 6 个全部压到 6px 能最接近 opencode「绝不用大圆角或胶囊」的语气，
但 `panel`（28px→6px）影响模态与设置面板，属于**视觉改动最大、最需回归**的一项。

### 7.4 ⚠️ `--dsw-corner-shape`：比圆角数值更容易被忽略的差异

【已核实】`corner-shape.css`：

```css
@supports (corner-shape:superellipse(1.5)){
  :root{--dsw-corner-shape:superellipse(1.5)}
  *,:before,:after{corner-shape:var(--dsw-corner-shape)}
}
```

DSH 给**所有元素**套了 `superellipse(1.5)` 超椭圆平滑。opencode 用的是标准
`rounded-md`（圆形圆角）。**同为 6px，超椭圆和正圆的观感明显不同**（超椭圆更"方中带圆"）。

要匹配 opencode：

```js
"--dsw-corner-shape": { light: "round", dark: "round" },
```

- 定义在 `:root`，通过 `*,:before,:after` 消费 → 覆盖 `:root` 或 `body` 都能生效（自定义属性继承）。
- 【已核实】文档要求「full-round 形状（`border-radius:50%` 圆、胶囊）必须配 `corner-shape:round`」，
  组件里已自行处理（如 `::-webkit-scrollbar-thumb{corner-shape:round}`），所以全局改 `round` 不会破坏它们。
- 若不支持 `corner-shape` 的引擎，整段 `@supports` 不生效，天然就是正圆，无需处理。

---

## 8. 风险清单

| # | 风险 | 影响面 | 缓解 |
|---|---|---|---|
| R1 | **`--dsw-static-*` 不分浅深** | 覆盖 static 会同时改两套配色 | 只在 alias 层映射（§5.2） |
| R2 | **`--dsw-alias-state-business-primary` 是 focus ring 默认色** | 全局焦点环变色（含 box-shadow 焦点环、`::before`/`::after`） | 通常是想要的；但要知道这是全局副作用，别指望"只改状态点" |
| R3 | **`--dsw-alias-brand-primary` 连带 `button-primary-fill`，但 `button-primary-hover` 不连带** | 主按钮 hover 会保持深灰，与蓝底不协调 | 必须**同时**覆盖 `--dsw-alias-button-primary-hover` |
| R4 | **`--dsw-alias-border-l4` 是设置卡片描边来源** | 改它会连带改所有用 l4 的 `.5px` 边框、`--dsw-elevation-stroke-color` 默认值、`--dsw-alias-settings-card-stroke` | 想只改卡片就覆盖 `settings-card-stroke`；想全局统一发丝边框才改 l4 |
| R5 | **`--dsw-radius-panel` 28px→6px** | 模态/面板/引导页外观剧变 | 先只改 sm/md/lg/xl，panel 单独评估 |
| R6 | **36 处硬编码 `font-weight` + 81 处硬编码 `font-size`** | 字重/字号无法靠 token 完全统一；13px 基准在部分组件上做不到 | 接受 400/500；或按 §6.4 分层处理 |
| R7 | **CSS Modules 哈希类名**（`.6DJyyG_count`、`.PIRFFq_sidebarCol` 等） | 针对具体类名的覆盖规则在 DSH 升级后失效 | 优先用 token；必须写类名的地方集中成一份"易碎清单"并加注释 |
| R8 | **`--dsw-hovercard-bg` 是外壳 CSS 局部硬编码 `#2C2C2E`** | 浅色模式下 hovercard 仍是深灰；token 覆盖无效 | 需覆盖 `._card_38jqx_9` 这个类，或用 `html body` 级规则重设 `--dsw-hovercard-bg`（但类上的本地声明会赢，得用更高特异性） |
| R9 | **`--shiki-token-*` 不走 `--dsw-*`** | 代码高亮 12 色仍是 DSH 原配色 | 单独覆盖 `--shiki-*`（`shiki.css` 的 `:root` / `body[data-ds-dark-theme]`） |
| R10 | **组件局部重绑 token** | 菜单/弹层会把 `--dsw-elevation-stroke-color` 重绑到 `border-l1/l3`；滚动条在容器上重绑 | 改**被引用的 alias**（`border-l1/l3`、`scrollbar-*`）而非最终 token |
| R11 | **`--dsw-specific-menu` 在 macOS 被属性选择器覆盖** | `html[data-platform=darwin] body`（0,1,1）优先级高于裸 `body` | 用 `overrideTokens`，或用更高特异性 CSS |
| R12 | **`--dsw-alias-label-caption` / `-dimmed` / `state-idle-primary` 无 opencode 对应** | §5.1 中这些值是**推测**的，可能观感不对 | 落地后按截图回归；别当成 opencode 官方值 |
| R13 | **`--dsw-alias-border-inverted` 浅色是全透明** | 直接映射 opencode 的 `border-inverse`（激活 tab 下划线 `#242424`）会得到"看不见的下划线" | 需新增规则，不能只映射 |
| R14 | **深色 `bg-base` `#151517` vs opencode `#161616`** | 差异极小（ΔE 可忽略），但 `bg-deep` 目标 `#080808` 与 DSH 的 `#1b1b1c` 差距大 | 侧栏改 `#080808` 会明显变深，需确认是否接受 |
| R15 | **13 个悬空 token 里有 4 个无 fallback** | `label-quaternary`、`separator-primary`、`bg-layer-4`、`label-error` 当前就是坏的 | 顺手补上是净收益（修 bug） |

---

## 9. 建议的落地顺序

1. **第一步（零风险、高收益）**：只覆盖 §5.1 中标「已核实」的别名，浅深成对给。
   重点是 `bg-base` / `bg-layer-1,2,3` / `specific-sidebar-fill` / `label-primary,secondary,tertiary`
   / `border-l1..l4` / `interactive-bg-hover,active` / 4 个 state 色 / `brand-primary` +
   `button-primary-hover` + `link` + `state-business-primary`。
2. **第二步**：圆角 6 个 + `--dsw-corner-shape: round`。
3. **第三步**：`--dsw-font-family`（尽力而为）+ `--dsh-content-font-size: 13px`。
4. **第四步（可选）**：补 13 个悬空 token；覆盖 `--shiki-*`；处理 §4.1 的 7 处字面量。
5. **第五步（需权衡）**：字重 440/530（§6.4）；`--dsw-radius-panel`。

---

## 10. 复现方法

```bash
cd ~/Documents/默认项目/.research-opencode-ui

# 1) 403 个 --dsw-* 清单（分类）
grep -o -- '--dsw-[a-z0-9-]*' theme-client.js | sort -u

# 2) 解析 8 张内联 CSS 表，还原选择器与声明
node -e '
const fs=require("fs");const s=fs.readFileSync("theme-client.js","utf8");
const re=/var\s+([A-Za-z0-9_]+_css_default)\s*=\s*("(?:[^"\\]|\\.)*")\s*;/g;
let m,b={};while((m=re.exec(s))){try{b[m[1]]=JSON.parse(m[2]);}catch(e){}}
const css=b.design_platform_css_default;let d=0,c="",r=[];
for(const ch of css){if(ch==="{"){d++;c+=ch;}else if(ch==="}"){d--;c+=ch;if(!d){r.push(c);c="";}}else c+=ch;}
r.forEach((x,i)=>console.log(i,"|",x.slice(0,x.indexOf("{")),"|",(x.match(/--/g)||[]).length));
'
# 期望：0 body/77, 1 body[data-ds-dark-theme]/77, 2 body/200, 3 body[data-ds-dark-theme]/200, 4/5 darwin

# 3) 全 asar 逐字节扫描 --dsw-* 并把命中偏移映射回文件（§4.2 用的方法）
#    见本次会话命令；核心是 asar header 的 offset + dataOffset 二分查找
```

【已核实】的关键断言与出处一览：

| 断言 | 出处 |
|---|---|
| 调色板定义在 `body` / `body[data-ds-dark-theme]` | `design-platform.css` 解析结果（6 条顶层规则） |
| 深色属性是 `data-ds-dark-theme`（在 body） | `ui-layout.js` → `theme-presenter.js` 的 `DARK_ATTRIBUTE` |
| token 会写成 body 内联样式 | 同上 `ThemePresenter.apply()` 的 `body.style.setProperty` |
| `overrideTokens` / `register` 是公开 API | `theme-client.js` 的 `ThemeRuntime`；README「Third-party themes can register alias-token overrides through `ctx.theme`」 |
| 覆盖值必须是 `{light,dark}` 字符串对，无名字白名单 | `validateOverrides()` |
| 主题侧零 `!important` | `grep -c '!important' theme-client.js` = 0 |
| `--dsw-radius-*` 6 个现值 | `base.css` 的 `:root` 规则 |
| 无 Inter 字体文件 | asar `fonts/` 清单：Montserrat ×3 + KaTeX ×19 |
| `--dsw-font-*-font-weight` 无人消费 | 对全部 `ui-*.js` 与外壳 CSS grep 零命中 |
| 13 个悬空 token 及其归属 | 全 asar 字节扫描 + offset→文件映射 |
| `--dsw-alias-settings-card-*` 消费方是设置类插件 | 同上（`ui-settings-account`/`-models`/`-plugin-inventory`/`ui-agent-preset`） |
