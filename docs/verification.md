# opencode ui 插件 —— 独立验证报告

验证者：`verifier`（独立复核，非任何被验证文件的作者）
任务：共享任务板 `task-7`
日期：2026-11-04
分支：`feature/opencode-ui-skin`
被验证对象：`dsh-opencode-ui/`（commit 工作区状态，`client.js` sha256 `481648f5a219252f1796ee342a947ed0afd1cff78a2d26512317f57a11a3eebf`，78993 字节）
设计文档：`docs/superpowers/specs/2026-11-04-opencode-ui-design.md`

> **本次验证只写了这一个文件**，未改动任何插件源码、未安装/卸载插件、未改 profile、未重启服务。

---

## 0. 结论速览

| # | 设计文档验收标准 | 结论 |
|---|---|---|
| 1 | `node --check client.js` 通过；清单合法，`./client.js`/`./icon`/`./locale/*.json` 在 `exports` 与 `files` 中 | **通过** |
| 2 | `plugin_manager` 安装后 `application: applied`；旧 bundle `@local/git-branch` 已移除 | **通过（间接证据）** —— 无法复现 `application: applied` 字符串本身；旧 bundle 在清单/锁/活动插件树中均已消失，但 `node_modules` 留有悬空软链（问题 P4） |
| 3 | `cordis_inspect_query` 能查到 `conversation.composer.dock` 上的 `opencode-ui` 条目 | **无法验证**（client inspect 不可用，见 §5） |
| 4 | 插件停用后 UI 完整复原（token 层有 disposer，样式标签随 effect 移除） | **静态通过**；运行时复原效果**无法验证** |
| 5 | 浅色/深色两套都覆盖到（每项都有 `light` + `dark`） | **通过**（58/58） |
| 6 | 所有结构选择器都有祖先限定，不出现裸 `[class$="_root"]` | **部分通过** —— `settings.css` / `app.css` 均为 100% 限定（0/93、0/138），但 `src/module.js` 的 `OWN_CSS` 仍带 2 条裸 `[class$=]` + `!important`（问题 P2） |

**发现的问题：9 条**（1 条会导致观感明显不对且与作者自己的警告直接冲突；2 条会导致观感明显不对；6 条吹毛求疵）。

**作者自查中经复核不成立的结论：3 条**（见 §4）。

**无法验证项：6 类**（见 §5）——其中最重要的是：**运行时观感、真实 DOM 命中、明暗两套配色效果，本次一律无法验证**，本报告任何"选择器能命中"的说法都只是**静态推断**，不等于运行时命中。

---

## 1. 验证方法（全部自己跑，不复用作者脚本）

| 手段 | 做法 |
|---|---|
| 独立构建比对 | 把 `dsh-opencode-ui/` 整目录复制到 `/tmp/ocui-verify/rebuild/`，**删掉副本里的 `client.js`**，在副本里跑 `node build.mjs`，再用 `cmp` 与 `shasum` 逐字节比对原件。**没有用** `node build.mjs --check`。 |
| 独立产物解析 | 自写扫描器（`/tmp/ocui-verify/extract-inlined.mjs`）从 `client.js` 里按 JSON 词法扫描出 `TOKENS` / `SETTINGS_CSS` / `APP_CSS` 三个内联块并 `JSON.parse`，与 `src/` 三个源文件比对。**没有**执行 `build.mjs` 的比对逻辑。 |
| 独立类名宇宙 | 用 `asar.mjs extract` 把 asar 里**全部** `@deepseek-ai/dsh-client-ui-*/lib/client.js`（502 个条目）导出到 `/tmp/ocui-verify/asar/`，加上 `dsh-web-frontend` 的 `index-BNyAYEM7.css` / `index-BXV-oxvX.js` / `vendor-*.css`，提取 **15090 个真实类名**（三路合并：CSS 里的 `.name` 定义、`<hash>_<名字>` 约定、`_<名字>_<hash>_<数字>` 约定）。 |
| 独立选择器解析 | 自写 CSS 分词器（`/tmp/ocui-verify/direct.mjs`、`final.mjs`）：处理注释、`@media` 递归、字符串、括号深度；按顶层逗号拆选择器列表，按组合符拆复合选择器，逐条做类名测试。**没有**用正则一把梭。 |
| token 宇宙交叉验证 | 从 asar 全部 JS + `dsh-assets` 全部 CSS/JS 里抽出 `--dsw-*` / `--dsh-*` / `--ds-*` 的**定义集**（458 个）与**引用集**（496 个），逐一核对 `tokens.json` 的 58 个键。 |
| 运行时契约核对 | 从 asar 读真实实现：`dsh-client-ui-theme/lib/client.js` 的 `overrideTokens` / `validateOverrides`、`@deepseek-ai/cordis/src/fiber.ts` 的 `effect` 实现。 |
| 安装状态 | 读 `~/.dsh/profiles/desktop/package.json`、`pnpm-lock.yaml`、`node_modules/@local/*` 软链、`.plugin-manager/logs/*/pnpm.log`；用 `plugin_manager action=list_plugins`（只读）翻完 216 条活动插件树。 |

**一条工具环境说明**：本会话里 `cordis_inspect_query` 的 `input` 参数被 harness 序列化成了字符串，带参数的查询一律被拒（`"input" must be an object`）；不带参数的 host 查询可用，不带参数的 **client** 查询超时。这限制了标准 3 的验证手段，详见 §5。

---

## 2. 逐条验收标准

### 标准 1 —— 构建与清单 ✅ 通过

**1a. 构建可复现（逐字节）**

```
$ cp -R dsh-opencode-ui/. /tmp/ocui-verify/rebuild/ && rm /tmp/ocui-verify/rebuild/client.js
$ cd /tmp/ocui-verify/rebuild && node build.mjs
client.js written — 58 tokens, 184 CSS rules, 68394 bytes

$ shasum -a 256 dsh-opencode-ui/client.js /tmp/ocui-verify/rebuild/client.js
481648f5a219252f1796ee342a947ed0afd1cff78a2d26512317f57a11a3eebf  .../dsh-opencode-ui/client.js
481648f5a219252f1796ee342a947ed0afd1cff78a2d26512317f57a11a3eebf  .../tmp/ocui-verify/rebuild/client.js

$ cmp dsh-opencode-ui/client.js /tmp/ocui-verify/rebuild/client.js && echo IDENTICAL
IDENTICAL
```

两个文件都是 78993 字节，sha256 相同，`cmp` 逐字节一致。**构建可复现。**

**1b. 语法**

```
$ node --check dsh-opencode-ui/client.js && echo "SYNTAX OK"
SYNTAX OK
```

**1c. 清单**

`package.json` 是合法 JSON（`JSON.parse` 通过）。`exports` / `files` 覆盖：

| 设计要求 | `exports` | `files` |
|---|---|---|
| `./client.js` | ✅ 以子路径 `"./client": "./client.js"` 暴露 | ✅ `client.js` |
| `./icon` | ✅ `"./icon": "./icon.svg"` | ✅ `icon.svg` |
| `./locale/*.json` | ✅ | ✅ `locale/*.json` |
| `src` | —（不需要对外导出） | ✅ `src` |
| `build.mjs` | —（不需要对外导出） | ✅ `build.mjs` |

> 说明：`exports` 的键是 **`./client`** 而不是字面量 `./client.js`。这与 DSH 自带插件的约定完全一致（`dsh-client-ui-chat`、`dsh-client-ui-brand-official` 的 `package.json` 都写 `"./client": { ... "./lib/client.js" }`），所以按"清单合法"的实质要求通过；如果按字面抠 `./client.js` 这个键名，则不存在。

`index.js`（host 半部）、`cordis.patch.yml`（`- insert: [{id: opencode-ui, name: '@local/opencode-ui'}]`）、`dsh.bundle.patch`、`dsh.client.{platform:web, inject:['@deepseek-ai/dsh-client-ui-conversation']}` 齐备且与自带插件同构。

---

### 标准 2 —— 安装结果 ✅ 通过（间接证据）

**2a. profile 清单**（`~/.dsh/profiles/desktop/package.json`）

```json
"dsh": { "profile": { "bundles": [ ..., "@local/opencode-ui" ] } },
"dependencies": {
  "@deepseek-ai/dsh-subagent-claude-code": "0.2.1-rc.3",
  "@local/opencode-ui": "link:/Users/cenuon/Documents/默认项目/dsh-opencode-ui"
}
```

**2b. 软链指向**

```
$ readlink -f ~/.dsh/profiles/desktop/node_modules/@local/opencode-ui
/Users/cenuon/Documents/默认项目/dsh-opencode-ui      ← 正确
```

**2c. 活动插件树**（`plugin_manager action=list_plugins`，216 条，翻完三页）

```json
{"entryId":"include:opencode-ui","moduleName":"@local/opencode-ui",
 "enabled":true,"fiberPhase":"active","patchId":"opencode-ui"}
```

**2d. 旧 bundle 已移除**

- `~/.dsh/profiles/desktop/package.json`：`grep -c git-branch` = **0**
- `~/.dsh/profiles/desktop/pnpm-lock.yaml`：`grep -c git-branch` = **0**；`opencode-ui` 出现 3 次
- 216 条活动插件树里**没有** `@local/git-branch`
- 安装日志顺序：`operation-BjqAOr/pnpm.log`（10:08:18）`+ @local/opencode-ui 1.0.0`；`operation-TuPIHf/pnpm.log`（10:08:27）`- @local/git-branch`
- ⚠️ 但 `node_modules/@local/git-branch` 软链**还在**且已悬空 —— 见 **P4**

**关于 `application: applied`**：这条字符串由安装动作当场返回，本任务禁止我重跑安装，因此**无法复现**。上面 4 项（清单 + 软链 + 活动插件树 active + pnpm 日志）是充分的间接证据，但不等于我看到了那句返回值。

---

### 标准 3 —— `cordis_inspect_query` 查到 composer.dock 条目 ❌ 无法验证

尝试了三种方式：

| 尝试 | 结果 |
|---|---|
| `client / Slots / listSubTree`，`input={"root":"conversation.composer.dock"}` | `Error: Client Cordis inspect Slots.listSubTree rejected input: "input" must be an object` |
| 同上，`input={}` | 同样的 input 拒绝 |
| `client / Slots / listSubTree`，不带 `input` | `Error: Slots.listSubTree: Client inspect query Slots.listSubTree timed out after 10000ms. Open or reconnect the Harness page, then retry.` |
| `host / Service / listService`（对照，验证 inspect 通道本身可用） | ✅ 正常返回完整服务目录 |

结论：**host inspect 通道可用，client inspect 通道不可用**（带参被 harness 序列化问题挡住，不带参 10s 超时）。**标准 3 无法验证。**

旁证（不等于验证）：活动插件树显示 `@local/opencode-ui` 为 `enabled + fiberPhase:active`，且 `dsh.client.platform = "web"` 已声明；`conversation.composer.dock` 这个 slot key 在 `dsh-client-ui-chat` / `dsh-client-ui-conversation` 的 bundle 里真实存在（共 5 处引用）。但 **slot 上到底有没有挂上 `opencode-ui` 条目，我没有观察到**。

---

### 标准 4 —— 停用可复原 ✅ 静态通过（运行时无法验证）

三处资源都核对过真实实现：

**4a. token 层 disposer 确实存在且语义正确**

`dsh-client-ui-theme/lib/client.js:1835`：

```js
overrideTokens(source, tokens) {
  const layer = { seq: this.overrideSeq++, tokens: validateOverrides(source, tokens) };
  this.overrides.set(source, layer);
  this.publish();
  return () => {
    if (this.overrides.get(source) !== layer) return;   // 只摘自己那一层
    this.overrides.delete(source);
    this.publish();
  };
}
```

**4b. `ctx.effect` 确实把返回值当 disposer 接管**

`@deepseek-ai/cordis/src/fiber.ts:366-368`：

```js
const effect: Effect = runner.execute.call(this)
if (typeof effect === 'function') {
  return runner.collect(effect)
}
```

`module.js:128-133` 的写法 `scope.effect(() => scope.theme.overrideTokens(PLUGIN_ID, TOKENS), '...')` 正好命中这个契约；且它注册在 `ctx.inject(['theme'], (scope) => …)` 的 scope 上，scope 随插件 fiber 一起销毁 → disposer 会被调用。同一份源码里 `theme-client.js:1980` 也用了同样的 `scope.effect(...)` 模式，是既有惯例。

**4c. 样式标签有 remove**

`module.js:135-141`：

```js
ctx.effect(() => {
  const tag = document.createElement('style');
  tag.dataset.plugin = PLUGIN_ID;
  tag.textContent = STYLES;
  document.head.appendChild(tag);
  return () => tag.remove();
}, 'opencode-ui: skin stylesheet');
```

**4d. 没有其它全局副作用**：`ctx.slots.inject(...)` / `ctx.slots.register(...)` 走 slot 服务自身的生命周期；`remoteRef` 只是一个普通对象。

**但**：标准 4 的实质是"停用后 UI **完整复原**"。这需要真在浏览器里停用一次插件、对比 DOM/计算样式。**运行时部分我无法验证。**

---

### 标准 5 —— 浅深两套都覆盖 ✅ 通过

```
$ node token-check.mjs
{"total":58,"problems":[],"problem_count":0,
 "defined_token_count_in_dsh":458,"referenced_token_count_in_dsh":496,
 "keys_not_defined_in_dsh":["--dsw-alias-label-quaternary","--dsw-alias-separator-primary",
                            "--dsw-alias-bg-layer-4","--dsw-alias-label-error"],
 "keys_not_referenced_in_dsh":[],"static_overrides":[]}
```

- **58/58** 项都有非空字符串 `light` + `dark`；0 个裸字符串；0 个多余键；0 个 `var(`；0 个 `!important`；0 个换行/首尾空格。
- **0 个 `--dsw-static-*` 覆盖**（符合设计"只在 alias 层分叉"的要求）。
- 58 个键**全部**在 DSH 里被引用过（`keys_not_referenced_in_dsh` 为空）→ **没有拼错的 token 名**。
- 只有设计已声明的 4 个悬空 token 未被主题定义 —— 正好是设计决策 5 要"顺手修"的那 4 个，且都已补上。这一条是**净收益**，不是问题。
- 深色分支写法：`tokens.json` 走 `overrideTokens` 的 `{light,dark}` 对，不涉及 CSS 选择器，不存在"用 `@media (prefers-color-scheme)` 代替 `body[data-ds-dark-theme]`"的问题。

---

### 标准 6 —— 所有结构选择器都有祖先限定 ⚠️ 部分通过

**`settings.css`：78 条规则 / 93 条选择器 / 未加祖先限定 0 条 / `!important` 0 个 / 死类名测试 0 个。**
**`app.css`：102 条规则 / 138 条选择器 / 未加祖先限定 0 条 / `!important` 0 个 / 死类名测试 0 个。**

即两个主 CSS 文件**确实**做到了 100% 祖先限定，且**没有** `[class$=]` 被误用在 `_名字_hash_数字` 那套 primitives 约定上（逐条核对了每个 `[class$="X"]` 的值：是否存在真实类 `X_<hash>_<n>` 而没有任何类以 X 结尾 —— 结果 **0 条**）。

**但 `src/module.js:117-118` 的 `OWN_CSS` 例外：**

```js
'[class$="_logoRow"]{display:none!important}',
'button[class$="_newSession"]{display:none!important}',
```

这 6 条选择器里 **5 条没有祖先限定**、**2 个 `!important`**，而且会随 `STYLES` 一起被内联进 `client.js`（`module.js:121`：`[SETTINGS_CSS, APP_CSS, OWN_CSS].filter(Boolean).join('\n')`）→ 最终产物里确实存在裸 `[class$=]` 结构规则。

实际风险很低（`_logoRow` / `_newSession` 在 15090 个真实类名里各只命中 **1** 个），但按标准 6 的**字面**要求（"所有结构选择器都有祖先限定，不出现裸 `[class$="_root"]` 这类写法"）应当算不满足。详见 **P2**。

---

## 3. 发现的问题（按严重度）

### 🔴 P1 —— `tokens.json` 覆盖 `--dsw-alias-border-inverted`，与作者自己的警告和 `app.css` 注释直接冲突，会让两处本该"看不见"的边框变成实色硬边

**文件 / 行号**：`dsh-opencode-ui/src/tokens.json:33`

```json
"--dsw-alias-border-inverted": { "light": "#242424", "dark": "#fafafa" },
```

**证据 1 —— DSH 里这个 token 的默认值是"透明"**

```
$ grep -o -- "--dsw-alias-border-inverted:[^;"]*" .research-opencode-ui/theme-client.js | sort -u
--dsw-alias-border-inverted:#0000        ← 浅色：全透明
--dsw-alias-border-inverted:#ffffff0f    ← 深色：6% 白
```

**证据 2 —— 它的真实消费者把它当"透明边框"用（占位，不是可见描边）**

```
$ grep -roh -- ".\{0,120\}--dsw-alias-border-inverted.\{0,60\}" asar dsh-assets
# dsh-client-ui-commands/lib/client.js
.m00Doa_retry{border:.5px solid var(--dsw-alias-border-inverted);border-radius:var(--dsw-radius-sm);
              color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;...}
# dsh-client-ui-settings-account/lib/client.js
.SO3V2q_dialog{user-select:none;box-sizing:border-box;
               border:.5px solid var(--dsw-alias-border-inverted)}
```

全 asar 只有这 2 个消费者 + 1 个定义（`theme/lib/client.js`）。

**后果（静态推断）**：覆盖后

- 命令面板的 **retry 按钮**在浅色下多出一圈 0.5px 的 `#242424`（近黑）实色边 —— 原本是透明、视觉上不存在；
- **账号设置对话框**在浅色下同样多出一圈近黑实边，在深色下变成一圈 `#fafafa`（近白）实边 —— 深色下是一条**亮白线**，与"0.5px 发丝边框"完全不是一回事。

**证据 3 —— 作者自己警告过不能这么干**

`.research-opencode-ui/token-map.md:556`：

> `--dsw-alias-border-inverted` 浅色是**全透明 `#0000`**、深色 `#ffffff0f`，语义完全不同。若要做 tab 下划线，需**新增规则**而非映射

`.research-opencode-ui/token-map.md:711`（风险 R13）：

> **`--dsw-alias-border-inverted` 浅色是全透明** → 直接映射 opencode 的 `border-inverse`（激活 tab 下划线 `#242424`）会得到"看不见的下划线" → **需新增规则，不能只映射**

**证据 4 —— `app.css` 的注释因此已经过期，两处改动互不知情**

`dsh-opencode-ui/src/app.css:416-424`：

```css
/* D12 · 激活 tab 下划线。
   ★ 这里**故意不用** --dsw-alias-border-inverted（opencode 的
   --v2-border-border-inverse 对应物）：DSH 确实定义了这个 token，但浅色下值是
   `#0000`（全透明）、深色下是 `#ffffff0f`（6% 白），而且 tokens.json 没有覆盖它。
   用它会让下划线在浅色模式**完全看不见**——比不改造更糟。
   改用 tokens.json 已定义、且语义最接近「反色实线」的 --dsw-alias-label-primary
   （浅 #161616 / 深 #fafafa，opencode 目标为 #242424 / #fafafa）。
   → 若后续 tokens.json 补上 --dsw-alias-border-inverted 并给到 #242424/#fafafa，
     把这两处换回去更贴合语义。 */
```

`app.css` 作者写这段注释时 `tokens.json` **确实没有**覆盖它；之后 token 层补上了，但 `app.css` 没同步。结果是**最坏组合**：全局覆盖生效了（带来 retry 按钮 / 账号对话框的副作用），而它本来想服务的那个消费者（tab 下划线）仍然用着 `--dsw-alias-label-primary`。

**建议修法（择一，推荐 A）**

- **A（推荐）**：从 `tokens.json` 删掉 `--dsw-alias-border-inverted` 这一项。tab 下划线本来就走 `--dsw-alias-label-primary`，删掉不会有任何回归，retry 按钮 / 账号对话框恢复"无可见边框"的原设计。
- B：保留 token 覆盖，并把 `app.css` D12 换回 `--dsw-alias-border-inverted` —— 语义更贴合，但**必须同时接受** retry 按钮和账号对话框上的实色边（不推荐，因为深色下的 `#fafafa` 亮白线明显不是发丝边框）。
- 无论选哪个，都要顺手把 `app.css:416-424` 那段注释改成与 `tokens.json` 一致的现状。

---

### 🟠 P2 —— `module.js` 的 `OWN_CSS` 有 2 条裸 `[class$=]` + `!important`，与标准 6 的字面要求冲突

**文件 / 行号**：`dsh-opencode-ui/src/module.js:117-118`

```js
'[class$="_logoRow"]{display:none!important}',
'button[class$="_newSession"]{display:none!important}',
```

**证据**

```
$ node final.mjs
== module.js OWN_CSS ==
  rules 6 selectors 6 unqualified 5 !important 2
  top hit counts:
      $=_logoRow -> 1 real classes
      $=_newSession -> 1 real classes
```

（同一脚本下 `settings.css` / `app.css` 的 `unqualified` 都是 0。）

**影响**：最终产物 `client.js` 的样式表里存在 2 条无祖先限定的 `[class$=]` 规则，违反标准 6 的字面表述。**实际风险很低**：两个后缀在 15090 个真实类名里各只命中 1 个（分别是侧栏 `kB3qhq_logoRow` 和 `kB3qhq_newSession`），不会误伤别的模块；这两条也是从用户原来的 `@local/git-branch` 原样继承的（`git show HEAD:dsh-git-branch/client.js:122-123` 完全一致），是用户的明确选择。

**建议修法**：若要严格满足标准 6，给两条加上祖先限定，例如 `html body [class$="_logoRow"]{…}`、`html body button[class$="_newSession"]{…}`；顺带评估能否去掉 `!important`（主题 CSS 里 `!important` 实测 0 次，见下）。若判断"保留原插件的这两条"优先于字面达标，也应在报告里显式声明这是**已知例外**。

---

### 🟠 P3 —— 作者自己列出的两个风险（R8 / R9）没有落地，浅色模式下 hovercard 仍是深灰

**证据 1 —— hovercard 颜色被 DSH 局部硬编码**

```
$ grep -rohE "\.([A-Za-z_][A-Za-z0-9_-]*)\{--dsw-hovercard-bg: #2C2C2E" dsh-assets
._card_38jqx_9{--dsw-hovercard-bg: #2C2C2E;position:fixed;z-index:100;box-sizing:border-box;
               width:244px;padding:12px 16px;border-radius:var(--dsw-radius-lg);
               background:var(--dsw-hovercard-bg);box-shadow:var(--dsw-shadow-lv3)}
```

这是在 `dsh-web-frontend` 的 CSS 里**挂在类上**的局部声明，会遮蔽 `body` 级的 token 覆盖。

```
$ grep -n "hovercard" dsh-opencode-ui/src/app.css dsh-opencode-ui/src/settings.css
（无输出）
```

**证据 2 —— 作者自己写过缓解方案**

`.research-opencode-ui/token-map.md:709`（风险 R8）：

> **`--dsw-hovercard-bg` 是外壳 CSS 局部硬编码 `#2C2C2E`** → 浅色模式下 hovercard 仍是深灰；token 覆盖无效 → 需覆盖 `._card_38jqx_9` 这个类，或用 `html body` 级规则重设 `--dsw-hovercard-bg`（但类上的本地声明会赢，得用更高特异性）

**后果（静态推断）**：浅色模式下悬停卡片仍是深灰底 —— 与"灰阶层级 + 零阴影"的 opencode 语言明显冲突。深色模式下 `#2C2C2E` 恰好接近 opencode 的 `#2e2e2e`，所以只有浅色模式受影响。

**同类未落地项：R9（`--shiki-token-*`）**

```
$ grep -n "shiki" dsh-opencode-ui/src/app.css dsh-opencode-ui/src/settings.css
（无输出）
```

代码块背景已被 token 层改掉（`--dsw-alias-markdown-code-block`），但 12 色语法高亮仍是 DSH 原配色 —— 浅色模式下代码块底色变白而 token 配色未跟着调，属于观感断层。作者在 `token-map.md:710` 已列出该风险。

**建议修法**：
- hovercard：加一条针对 `._card_38jqx_9`（或 `html body [class^="_card_"]`，需注意 primitives 前缀约定）的规则重设 `--dsw-hovercard-bg` 为 `var(--dsw-alias-bg-layer-2)` 之类；
- shiki：单独覆盖 `--shiki-*` 12 色（浅深两套），或在设计文档里显式接受为已知差距。

---

### 🟠 P4 —— profile 里遗留一个悬空的 `@local/git-branch` 软链

**证据**

```
$ ls -la ~/.dsh/profiles/desktop/node_modules/@local/
lrwxr-xr-x  git-branch -> ../../../../../Documents/默认项目/dsh-git-branch
lrwxr-xr-x  opencode-ui -> ../../../../../Documents/默认项目/dsh-opencode-ui

$ test -e ~/.dsh/profiles/desktop/node_modules/@local/git-branch && echo EXISTS || echo DANGLING
DANGLING (target missing)
```

目标目录 `dsh-git-branch/` 已从磁盘删除，软链仍在（mtime 仍是 Oct 30 10:11，说明 pnpm remove 没有清掉它）。

**影响**：不会被加载（`package.json` 与 `pnpm-lock.yaml` 里都已是 0 引用，216 条活动插件树里也没有它），所以**不是功能问题**；但 `ls node_modules/@local` 仍会看到旧插件，容易被后续排查误导。

**建议修法**：`rm ~/.dsh/profiles/desktop/node_modules/@local/git-branch`。

---

### 🟡 P5 —— "46/46 一致" 不成立：`tokens.json` 与 `token-map.md §5.1` 有 2 处数值不一致（+1 处需解释）

**证据**（自写脚本解析 `token-map.md §5.1` 表格的「→ opencode 浅 / 深」两列，与 `tokens.json` 逐项比对）

```
§5.1 data rows: 46          ← 与"46 条别名映射"的说法吻合
tokens.json entries: 58
rows absent from tokens.json: 0
rows whose opencode target differs from tokens.json: 3
   DIFF --dsw-alias-label-tertiary     map= #808080/  json= #808080/#808080   ← 表格写的是 `gray`，非真差异
   DIFF --dsw-alias-border-l4          map= #0000001a/#ffffff1a  json= #00000014/#ffffff14
   DIFF --dsw-alias-interactive-bg-hover map= #0000000f/#ffffff14 json= #0000001a/#ffffff1a
```

- **真差异 2 处**：`--dsw-alias-border-l4`（`tokens.json:32`）、`--dsw-alias-interactive-bg-hover`（`tokens.json:35`）。
- `--dsw-alias-label-tertiary`（`tokens.json:13`）是**假差异**：表格两个单元格写的是 `` `gray`(=#808080) `` 和 `` `gray` ``，`#808080/#808080` 与之一致。
- 另有 **12 个键不在 §5.1 里**：6 个 `--dsw-radius-*` + `--dsw-corner-shape` + 4 个悬空 token（这 11 个是设计/任务明确要求的）+ **`--dsw-alias-border-inverted`**（这个既不在设计决策 5 的 4 个悬空 token 里，也不在 §5.1 里 —— 就是 P1）。

**值得注意**：这 2 处差异**方向上看起来是 `tokens.json` 更对、`§5.1` 更旧**：

- `opencode-tokens.md:23` 明确写「弱边框 `--v2-border-border-muted` = `#00000014` / `#ffffff14`，**卡片边框用这个**」，而 `token-map.md` 自己（R4）说 `border-l4` 正是设置卡片描边的来源 → `tokens.json` 的 `#00000014` 更贴合；
- `opencode-tokens.md:26/101` 的导航 hover 是 `#0000001a`（alpha-light-10），`tokens.json` 的 `#0000001a` 对得上，`§5.1` 的 `#0000000f` 在 opencode 参考里找不到出处。

所以问题**不在数值本身，而在"46/46 一致"这个说法**：要么 `§5.1` 该更新，要么 `tokens.json` 该改，两者不能同时说"一致"。

**顺带一处文档自相矛盾**：`token-map.md:446` 的标题写「语义别名 → opencode（**核心 30 条**，建议直接落地）」，但同一节的表格有 **46** 行数据。任务书里"46 条"的说法与表格行数一致，与标题不一致。

**建议修法**：把 `§5.1` 的这两行改成与 `tokens.json` 一致（并订正标题的"30 条"），或在 `tokens.json` 里写注释说明为何偏离清单；不要再用"46/46 一致"的表述。

---

### 🟡 P6 —— dock 分支状态项改成硬编码 12px/20px，不再跟随用户字号偏好（与设计决策 2 相悖）

**文件 / 行号**：`dsh-opencode-ui/src/module.js:113`

```js
'.ocui-anchor{min-width:0;display:inline-flex;font-size:12px;line-height:20px;letter-spacing:-.04px}',
```

**对照原实现**（`git show HEAD:dsh-git-branch/client.js:112`）：

```js
'.dshgb-anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);
               line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}',
```

**证据 —— 这两个 token 真实存在且由用户偏好驱动**

```
$ grep -ohE ".{0,90}--dsh-content-font-size-secondary.{0,60}" theme-client.js
body{--dsh-content-font-delta:calc(var(--dsh-content-font-size,14px) - 14px);
     --dsh-content-font-size-secondary:min(calc(var(--dsh-content-font-size,14px) - 1px),
                                            max(13px, calc(var(--dsh-content-font-size,14px) - 2px)));
     --dsh-content-font-delta-secondary:calc(var(--dsh-content-font-size-secondary) - 13px); ...}

$ 全 asar + dsh-assets 引用计数
--dsh-content-font-size-secondary: 59
--dsh-content-font-delta-secondary: 25
```

设计文档「已定决策 2」写得很清楚：

> **不覆盖用户的字号偏好。** DSH 的正文基准是 14px…字号在 DSH 里是用户可设的偏好（`ctx.theme.setFontSize`），皮肤不该替用户改。

改之前的状态项**是**跟随偏好的，改之后**不跟随**了 —— 方向与决策 2 相反。

**建议修法**：把 `module.js:113` 恢复成 `font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))`。

---

### 🟡 P7 —— 后缀碰撞半径：每条规则都能命中，但命中的组件数远超"设置页标题"这类直觉

**证据**（自写脚本，统计设置相关 bundle 内每个后缀对应的不同类名数）

```
$ node -e "…bySuffix…"
_title         6   SO3V2q_title _1Uuwqq_title xdKASq_title tUAPGa_title …
_section       6
_content       5
_row           4   _7lc4_a_row dsjt_a_row xdKASq_row RX-52G_row
_card          4
_actions       4
_description   4
_close         3
_header        3
_group         1
_options       1
_nav           1
--- total distinct suffixes in settings-related bundles: 256
```

全局（15090 个类名）口径下更夸张：

```
$=_root   -> 40 real classes
$=_title  -> 36 real classes
$=_row    -> 35 real classes
$=_card   -> 21 real classes
```

**这不是死规则**（每条都命中），也不是标准 6 的违规（都加了祖先限定）。但例如 `[data-shortcut-modal="settings"] [class$="_title"]` 会在设置模态框里同时命中 6 个不同组件的 `_title`（settings shell 标题、卡片标题、账号对话框标题…）。这是设计有意为之（"统一设置页排版"），但**命中范围是否符合预期只有真实 DOM 能确认**。

**建议**：列为已知取舍即可；若发现某个后缀改多了，再针对具体模块加限定（如 `> [class$="_nav"]`）。

---

### ⚪ P8 —— `build.mjs` 报告的 "bytes" 不是字节数

**文件 / 行号**：`dsh-opencode-ui/build.mjs:84`

```js
console.log(`client.js written — ${Object.keys(tokens).length} tokens, ${rules} CSS rules, ${out.length} bytes`);
```

`out.length` 是 JS 字符串的 UTF-16 code unit 数，不是字节数：

```
$ node build.mjs
client.js written — 58 tokens, 184 CSS rules, 68394 bytes
$ wc -c client.js
   78993 client.js          ← 实际字节数（差 10599，来自中文注释的 UTF-8 多字节）
```

**建议修法**：改用 `Buffer.byteLength(out)`。纯提示信息问题，不影响产物。

---

### ⚪ P9 —— `radius-panel` 28px→6px 属于作者自己标为"需单独评估"的高风险项

`token-map.md:707`（风险 R5）：

> **`--dsw-radius-panel` 28px→6px** → 模态/面板/引导页外观剧变 → 先只改 sm/md/lg/xl，panel 单独评估

`tokens.json` 把 `--dsw-radius-panel` 改成了 `6px`（`token-map.md §7.3` 与 task-4 都明确要求 panel 一起收敛，所以**这是照任务书执行**，不是擅自偏离）。全 asar 只有 4 处消费 `var(--dsw-radius-panel)`，面不大，但"设置页全屏化 + 面板圆角归零 + panel 6px"三者叠加后的观感只能靠截图确认。

**建议**：保留（符合任务书），但列入"刷新后优先看一眼"的清单。

---

## 4. 作者自查中经复核后不成立的结论

### 4.1 ❌「祖先限定 100%」—— 对 `settings.css`/`app.css` 成立，对最终产物不成立

我的独立测量：

- `settings.css`：93 条选择器，未加祖先限定 **0** 条；
- `app.css`：138 条选择器，未加祖先限定 **0** 条；
- `module.js` 的 `OWN_CSS`：6 条选择器，未加祖先限定 **5** 条。

而 `client.js` 的样式表是 `SETTINGS_CSS + APP_CSS + OWN_CSS` 拼接（`module.js:121`）。所以"祖先限定 100%"只对两个 `.css` 文件成立；**按"插件全部结构选择器"口径，实际是 5/237 条未限定（97.9%）**，而且那 5 条正是会隐藏 DOM 元素的 `display:none!important` 规则。

### 4.2 ❌「0 个死规则」—— 主结论成立，但覆盖面被低估，且有 10 条无法静态判定

- `settings.css` 0 个死类名测试、`app.css` 0 个死类名测试 —— 这**是真的**（我用 15090 个真实类名逐条验证）。
- 但 `app.css` 里有 **10 条** `[class*=" _名字_"]`（**前导空格**）写法：

  ```
  896: html body [class*=" _dialog_"] {          ← 896/904/909/916/921 共 5 条
  928: html body [class*=" _list_"] {
  936: html body [class*=" _item_"] {            ← 936/945/947/953 共 4 条
  817: html body … [class*=" _tabActive_"] {
  ```

  这类选择器要求元素的 `class` 属性里出现 `" _dialog_"`，即**该元素必须同时挂 ≥2 个类**。我的类名宇宙是"单个类名"集合，**无法静态判定**这一点，所以我最初把它们判成了死规则；人工复核后确认：基础类真实存在（`_dialog_o6lrb_33`、`_list_4ub78_7`、`_item_4ub78_90`），写法本身是作者刻意的（配套 `[class^="_item_"]` 覆盖"类在首位"的情况），**大概率能命中，但只有真实 DOM 能确认**。

  结论：把"0 个死规则"说成"已核实"是**过度断言**，正确表述应是「无静态可判定的死规则；另有 10 条依赖元素多类名的规则需 DOM 确认」。

### 4.3 ❌「46/46 一致」—— 实际是 44/46 精确一致（+1 条语义一致 +2 条真不一致）

见 **P5**。另外 `token-map.md` 自己标题写"核心 30 条"、表格 46 行，文档内部也不自洽。

### 4.4 ✅ 复核后**成立**的作者结论（列出来是为了说明我没有一味挑刺）

| 作者/设计的说法 | 我的独立复核 |
|---|---|
| 主题 CSS 里 `!important` 0 次 | ✅ `grep -o "!important" theme-client.js \| wc -l` = **0** |
| `--dsw-corner-shape` 默认 `superellipse(1.5)` | ✅ 实测 `--dsw-corner-shape:superellipse(1.5)}*,:before,:after{corner-shape:var(--dsw-corner-shape)}` |
| `overrideTokens` 对缺 `light`/`dark` 或裸字符串直接抛 `TypeError` | ✅ 读 `validateOverrides` 原文确认，两种都抛 `TypeError` |
| 两套类名约定确实存在（`<hash>_<名字>` / `_<名字>_<hash>_<数字>`） | ✅ 15090 个真实类名里两套都能大量观察到 |
| `_root` 后缀跨模块复用（设计说 17 个模块） | ✅ 我的全局口径下 `$=_root` 命中 **40** 个真实类名（口径更宽，方向一致，说明"必须加祖先限定"是对的） |
| `--dsw-static-*` 浅深几乎不分叉、不该覆盖 | ✅ `tokens.json` 里 `--dsw-static-*` 覆盖数 = **0** |
| 4 个悬空 token 当前就是坏的、补上是净收益 | ✅ 全 asar 扫描：这 4 个被引用但主题从未定义，其余 54 个键全部有定义 |
| 构建脚本只做字符串内联、无第三方依赖 | ✅ 复现出的产物与原件逐字节一致 |

---

## 5. 无法验证项（不要把这些当已核实）

### 5.1 ⛔ 运行时观感（最重要，本报告的硬边界）

**浏览器控制进不去 DSH GUI**：`http://127.0.0.1:60311` 需要鉴权，且官方验证规范禁止翻找鉴权 token。因此以下**全部无法验证**：

- 浅色 / 深色两套配色的实际效果、对比度、可读性；
- 0.5px 发丝边框在 Retina 上的实际呈现（是否真的"发丝"还是消失）；
- 6px 圆角、零阴影、字重 400/500 近似的观感；
- 设置页全屏化的实际观感（`[data-shortcut-modal="settings"]` 铺满后内容列居中限宽是否合适）；
- macOS 侧栏紫蓝渐变覆盖后的实际底色；
- 动效（85ms ease-out）与 `prefers-reduced-motion` 分支的实际行为。

**本报告所有"选择器命中 N 个真实类名"的结论都是静态推断，不等于运行时真的命中了那些元素。**

### 5.2 ⛔ 真实 DOM 命中

我没有观察到任何真实 DOM。具体无法确认：

- `[data-shortcut-modal="settings"]` 是否真的是设置面板的锚点（我确认了它被 `settings.css` 使用，但没确认它在运行时存在）；
- `[class$=]` / `[class^=]` / `[class*=]` 规则在真实 `class` 属性上的匹配结果；
- `app.css` 里 10 条 `[class*=" _名字_"]` 是否命中（见 4.2）；
- `_title` / `_row` / `_card` 等后缀规则实际影响了哪些组件（见 P7）；
- 标准 3 要求的 slot 条目（见下）。

### 5.3 ⛔ 标准 3：`cordis_inspect_query` 查 `conversation.composer.dock` 上的 `opencode-ui`

三种尝试全部失败（input 被拒 / 无 input 超时），host inspect 对照可用 → **client inspect 通道在本会话不可用**。标准 3 无法验证。

### 5.4 ⛔ 标准 2 的 `application: applied` 字符串

禁止重跑安装，无法复现这句返回值。只有间接证据（profile 清单 + 软链 + 活动插件树 `active` + pnpm 日志）。

### 5.5 ⛔ 标准 4 的运行时复原

静态链路（disposer 契约、effect 接管、`tag.remove()`）已核对，但"停用后 UI **完整**复原"必须在浏览器里停用一次并对比 DOM/计算样式 —— 无法验证。特别是：token 层复原靠 `overrideTokens` 的 disposer（可信），但**样式层复原后是否有 FOUC/残留布局**无从得知。

### 5.6 ⛔ 反目标「不改坏 DSH 的交互」

焦点、快捷键、拖拽、模态框语义必须原样可用 —— 这需要真人操作，无法验证。我只能说：**静态上**插件只做三件事（token 覆盖层、一个 `<style>` 标签、一个 composer dock 槽位注册），没有改 React 组件、没有注入 DOM、没有改会话逻辑（`index.js` 的 host 半部是空 `apply()`），与设计"非目标"一致。

---

## 6. 给 lead 的处置建议（按优先级）

1. **P1 先修**（`tokens.json:33` 删掉 `--dsw-alias-border-inverted`，并把 `app.css:416-424` 的过期注释同步）—— 这是唯一一条"作者自己警告过、又被违反、且有真实消费者"的问题。
2. **P6 顺手修**（`module.js:113` 恢复 calc 写法）—— 一行，且直接对应设计决策 2。
3. **P3 决定做不做**（hovercard / shiki）—— 需要新增规则；如果决定不做，请在设计文档里显式列为已知差距。
4. **P4 清理**（删悬空软链）—— 一条 `rm`。
5. **P2 决定口径**（`OWN_CSS` 两条裸规则）—— 要么加祖先限定，要么在报告里声明为已知例外。
6. **P5 改说法**（`token-map.md §5.1` 两行 + 标题"30 条"）—— 纯文档。
7. **P8 / P9 / P7** 可忽略或仅记录。

**修完 P1/P6 后必须重新构建并重跑本报告 §2 标准 1、标准 2 的产物一致性检查**（`client.js` 会变，sha256 会变）。

---

## 附录 A：本次验证用到的自写脚本（都在 `/tmp/ocui-verify/`，不在仓库内）

| 脚本 | 用途 |
|---|---|
| `extract-inlined.mjs` | 从 `client.js` 按 JSON 词法独立抽出 `TOKENS`/`SETTINGS_CSS`/`APP_CSS` 并与 `src/` 比对 |
| `token-check.mjs` | token 合法性 + DSH token 定义集/引用集交叉验证 |
| `direct.mjs` | 独立 CSS 分词器 + 类名宇宙 + 死规则检测（主结果） |
| `final.mjs` | 同上，另加 `OWN_CSS`、祖先限定、`!important`、后缀碰撞半径统计 |
| `summary.mjs` / `selector-check.mjs` | 中间产物（第一版正则法，已被 `direct.mjs` 取代；其结论因正则跨属性选择器误配而作废，本报告未采用） |
| `mapcheck2.mjs` | 解析 `token-map.md §5.1` 表格并与 `tokens.json` 逐项比对 |

## 附录 B：关键原始命令

```bash
# 构建可复现
cp -R dsh-opencode-ui/. /tmp/ocui-verify/rebuild/ && rm /tmp/ocui-verify/rebuild/client.js
(cd /tmp/ocui-verify/rebuild && node build.mjs)
shasum -a 256 dsh-opencode-ui/client.js /tmp/ocui-verify/rebuild/client.js
cmp dsh-opencode-ui/client.js /tmp/ocui-verify/rebuild/client.js
node --check dsh-opencode-ui/client.js

# 类名宇宙
cd .research-opencode-ui && node asar.mjs extract "dsh-client-ui-" /tmp/ocui-verify/asar

# 选择器分析
cd /tmp/ocui-verify && node direct.mjs && node final.mjs

# token
cd /tmp/ocui-verify && node token-check.mjs && node mapcheck2.mjs

# 安装状态
cat ~/.dsh/profiles/desktop/package.json
readlink -f ~/.dsh/profiles/desktop/node_modules/@local/opencode-ui
test -e ~/.dsh/profiles/desktop/node_modules/@local/git-branch && echo EXISTS || echo DANGLING
grep -c git-branch ~/.dsh/profiles/desktop/package.json ~/.dsh/profiles/desktop/pnpm-lock.yaml

# 真实消费者（P1 / P3）
grep -rl -- "--dsw-alias-border-inverted" /tmp/ocui-verify/asar
grep -rohE "\.([A-Za-z_][A-Za-z0-9_-]*)\{--dsw-hovercard-bg: #2C2C2E" \
  .research-opencode-ui/dsh-assets/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/*.css
```

**报告结束。本文件是本次验证唯一的写入产物。**
