# opencode ui

把 DSH Web UI 的**设置页**和**主界面**换成 [opencode console](https://opencode.ai/console) 的视觉语言。

在输入框下方的状态区显示当前会话工作区的 git 分支（沿用自 `@local/git-branch`）。

## 它做了什么

分三层，从最稳到最细：

**1. 主题 token 层（零风险）** —— 走 DSH 官方的 `ctx.theme.overrideTokens()`：

```js
ctx.theme.overrideTokens('@local/opencode-ui', {
  '--dsw-alias-bg-base':       { light: '#fff',    dark: '#161616' },
  '--dsw-alias-label-primary': { light: '#161616', dark: '#fafafa' },
  // …颜色与圆角
});
```

`ThemePresenter` 把 token 写成 `body` 的**内联样式**，所以这一层天然赢过所有样式表，不需要 `!important`，也不依赖任何类名。返回的 disposer 会在插件卸载时完整还原基础主题。

**2. 结构层** —— 一个 `<style>` 标签，覆盖布局、间距、发丝边框、字重字距、去掉阴影。选择器一律用**稳定锚点**（`data-*`、ARIA）或类名**后缀**匹配，并逐条加祖先限定。

**3. git 分支状态项** —— 注册进 `conversation.composer.dock` 插槽，读 `.git/HEAD`，每 3 秒轮询，切分支无需刷新；非 git 工作区自动隐藏。

## 安装

```
plugin_manager  action=install_bundle  target=~/dsh-opencode-ui
```

安装后刷新页面生效。

## 想微调？都是单点改动

改完 `src/` 跑 `node build.mjs`，刷新页面即可。

| 想改什么 | 改哪里 |
|---|---|
| 深色下次要文字太暗 | `src/tokens.json` 的 `--dsw-alias-label-tertiary`（当前浅深都是 `#808080`，取自 opencode 的 `text-faint`）。它在全代码库被引用 **349 次**，深色下从 DSH 原本的 `#adb2b8` 掉到 `#808080`，**这是最该先看的一处**。偏暗就改成 `#9a9a9a` 左右 |
| 小圆角太圆 | `--dsw-radius-xs` 当前 `6px`，可改回 `4px`（`xs` 多用于 24px 缩略图） |
| 卡片边框想更淡 | `--dsw-alias-border-l4` 当前 `#00000014`（8%，对齐 opencode 卡片）；想更明显改成 `#0000001a` |
| 不要隐藏侧栏品牌行 | 删掉 `src/module.js` 里 `OWN_CSS` 的最后两行 |

## 开发

源码在 `src/`，`client.js` 是**构建产物**：

```
node build.mjs                              # 生成 client.js
node build.mjs --check                      # 校验 client.js 是否与 src/ 同步
node tools/widen-class-selectors.mjs        # 加宽类名选择器（见下）
```

`build.mjs` 只做字符串内联，无第三方依赖。它把 `src/tokens.json`、`src/settings.css`、`src/app.css`、`src/module.js` 合成一个 `window.__ModuleLoader__.load({ id, factory })` 文件 —— DSH 的 Client 每个插件只加载一个文件，`factory` 拿到的是模块表 `require`，没有相对路径 require，所以所有源码必须落进同一个文件。

**改样式请改 `src/` 下的文件，不要直接改 `client.js`。**

### ⚠️ 写选择器前必读：不要用裸的 `[class$="_x"]`

DSH 用 `clsx` 拼 class，**状态类会和基础类拼在同一个属性里**。设置页激活的导航项，class 是：

```
kB3qhq_navCell kB3qhq_active      ← 不以 _navCell 结尾！
```

所以 `[class$="_navCell"]` 能命中所有**未激活**的项，却**永远命中不了激活项** —— 结果是选中那一行保留 DSH 出厂的 40px 蓝灰样式，旁边几行却是改造后的 28px 中性灰。这个 bug 在 v1 里存在，靠用户截图才量出来（选中项 39px vs 其它 28px）。

正确写法是同时匹配「结尾」和「后面还跟着别的类」两种情况：

```css
:is([class$="_navCell"], [class*="_navCell "])
```

那个尾随空格是关键：`"_navCell "` 匹配不到 `"_navCellExtra"`，所以精度仍然等同于后缀匹配。`:is()` 取参数里最高的特异度，权重不变。

`node tools/widen-class-selectors.mjs` 会自动做这个改写（幂等），`build.mjs` 里也有守卫：一旦 `src/` 里出现裸的 `[class$=]`/`[class^=]` 就直接构建失败。

| 文件 | 职责 |
|---|---|
| `src/tokens.json` | `overrideTokens` 的映射。每项**必须**同时有 `light` 和 `dark` 两个字符串，否则运行时 `validateOverrides()` 抛 `TypeError`，插件激活失败 |
| `src/settings.css` | 设置页（全屏化 + opencode 化） |
| `src/app.css` | 主界面（侧栏、顶栏、消息区、composer、右栏） |
| `src/module.js` | 工厂主体：token 注册、样式注入、git 分支项 |

## 维护资料（`docs/`）

DSH 升级后选择器失配时，从这里查：

| 文件 | 内容 |
|---|---|
| [`docs/surface-app.md`](docs/surface-app.md) | 主界面的 DOM/CSS 结构：34 个模块 / 303 个类名后缀，含**后缀碰撞表**（`_root` 命中 17 个模块） |
| [`docs/surface-settings.md`](docs/surface-settings.md) | 设置页结构：模态框骨架、左导航、卡片行、表单原语；含**两套类名约定**的区分 |
| [`docs/token-map.md`](docs/token-map.md) | 403 个 `--dsw-*` 变量的清单与到 opencode 的映射依据 |
| [`docs/opencode-tokens.md`](docs/opencode-tokens.md) | opencode 参考页实测提取的浅/深两套 token |
| [`docs/verification.md`](docs/verification.md) | 独立验证报告：逐条验收结论、发现的问题、**无法验证项** |

设计定稿在 [`docs/superpowers/specs/2026-11-04-opencode-ui-design.md`](../../docs/superpowers/specs/2026-11-04-opencode-ui-design.md)。

## 设计要点与已知差距

完整设计见 [`docs/superpowers/specs/2026-11-04-opencode-ui-design.md`](../../docs/superpowers/specs/2026-11-04-opencode-ui-design.md)。

- **设置页被改成全屏**。DSH 原本是 `body` 上的模态框（800×800、圆角 28px）；opencode 是整页设置，这里用 CSS 把面板铺满。**没有伪造顶栏和标签条** —— opencode 那条标签条是它自己的顶层导航，DSH 设置页里没有对应元素，用伪元素画个不可交互的假货会误导。这是有意接受的差距。
- **不覆盖你的字号偏好**。DSH 正文基准 14px 是你在设置里能改的，皮肤不替你改。opencode 是 13px，这个差值保留。
- **不自带 Inter 字体**。字体栈把 `Inter` 放在最前 —— 你机器上装了就用，没装就回落 DSH 原有的系统栈。opencode 的字重 440/530 用 400/500 近似，因为 DSH 的字重是烤进字体简写字符串的，那 30 个字重子 token 全代码库无人消费。
- **顺手修了 4 个坏掉的悬空 token**（`--dsw-alias-label-quaternary`、`--dsw-alias-separator-primary`、`--dsw-alias-bg-layer-4`、`--dsw-alias-label-error`）：它们被组件引用、主题却从未定义、也没有 fallback。
- 还覆盖了 `--dsw-corner-shape: round`，抵消 DSH 默认的 `superellipse(1.5)` 超椭圆平滑。

## 保留的旧行为

插件的前身 `@local/git-branch` 附带两条规则，隐藏侧栏顶部的品牌行和新会话按钮。**这两条被保留**（`src/module.js` 的 `OWN_CSS`），因为改名不该悄悄改变你已经习惯的界面。不需要的话删掉那两行即可。

## 停用 / 卸载

在 Plugins 页停用或移除 `opencode-ui`。token 层有 disposer、样式标签随 effect 移除，停用后 UI 完整复原。
