# 对话结尾「N 个文件已更改 +A -B」汇总卡片 —— 渲染包与显示条件调研

> 任务：task-8（纯调研，未修改任何插件源码；本文件是唯一写入）
> 证据基线：`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`，版本 **0.2.1-rc.5**
> 标注约定：
> - **【实测读源码】** —— 从 asar 内的真实 bundle 逐行读到的代码/字符串，给出文件 + 行号
> - **【实测读配置/日志】** —— 从磁盘上的 profile 配置或 session 事件日志读到的事实
> - **【推测】** —— 由上述事实推断、但没有直接观测到的结论
>
> 复现命令（shell 的 `ls`/`cat`/`rg` 打不开 asar，必须用脚本）：
> ```bash
> cd /Users/cenuon/Documents/默认项目/.research-opencode-ui
> node asar.mjs cat   "dsh/node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js" > /tmp/deliverables-client.js
> node asar.mjs cat   "dsh/node_modules/@deepseek-ai/dsh-workspace-changes/lib/index.js"          > /tmp/wsc-host.js
> node asar.mjs cat   "dsh/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/index.js"         > /tmp/ui-settings-host.js
> ```

---

## 0. TL;DR

| 问题 | 结论 | 证据等级 |
|---|---|---|
| 哪个包渲染 | `@deepseek-ai/dsh-client-ui-deliverables`（客户端 `ChangedFiles` 组件），数据由 Host 端 `@deepseek-ai/dsh-workspace-changes` 记录并通过 `/api/changes.summary` 提供 | 【实测读源码】 |
| 显示条件 | **四层 AND**：① 本轮 turn 有 `workspace/changes` 事件 ② 开发工具开关 `ui-settings.enabled === true` ③ `/api/changes.summary` 返回 2xx 且能通过结构校验 ④ `summary.files.length > 0` | 【实测读源码】 |
| 为什么有时不出现 | 主因是 ①（本轮确实没记录到任何文件改动 → Host 干脆不发事件）与 ②（开关被关）；次因是 ③（Host 重启/会话销毁 → 404）与 ④（后一次空记录覆盖了前一次） | 【实测读源码】+【实测读日志】 |
| i18n key | 命名空间 `deliverables`：`changes.title` = `已编辑 {count} 个文件` / `Edited {count} files`；行内计数 `changes.added` = `+{count}`、`changes.deleted` = `-{count}` | 【实测读源码】 |
| 有没有开关 | **有，而且只有一个**：设置 → 通用 → **「显示代码工作视图」**，存储键 `ui-settings.enabled`（布尔，默认 `true`） | 【实测读源码】 |
| 本机当前值 | **`true`（截至 2026-11-04 14:40:30，会变动——见 §4.5）**。此前为 `false`：`/Users/cenuon/.dsh/profiles/desktop/cordis.patch.yml` 第 19–22 行的 `ui-settings.enabled` | 【实测读配置】+【实测读源码】 |
| 纯 CSS 能否救 | **不能。** 卡片不存在时 React 根本没有挂载 DOM 节点；插件 CSS 里也没有任何 `display:none` 可被反隐藏 | 【实测读源码】 |
| 基于本轮还是整个工作区 | **本轮 top-level turn 的增量**（turn 开始 / 结束两次 git 快照做 diff），不是整个工作区状态 | 【实测读源码】 |
| 截图那行 `dbx +1 -1` | 极可能是工作区里的**嵌套 git 仓库** `dbx/`（自带 `.git`）被记成 gitlink；`git diff-tree --numstat` 对 gitlink 的输出实测就是 `1  1  dbx`。**在 `dbx/` 内部改文件，卡上永远只显示这一行，看不到具体文件** | 【实测读源码】+【实测读 git 行为】+【推测】识别 |

---

## 1. 这个卡片由哪个包渲染

### 1.1 结论：`@deepseek-ai/dsh-client-ui-deliverables`

**【实测读源码】** 前端渲染全部在：

```
dsh/node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js   (111 054 字节, 2341 行)
```

关键组件 `ChangedFiles`（`client.js:1351-1474`）：

```js
// client.js:1351
function ChangedFiles({ changes, cwd, openReview, t, sessionId, useChangesDiff, loadChangesDiff }) {
    const cardRef = react.useRef(null);
    const pathDescriptionId = react.useId();
    const [expanded, setExpanded] = react.useState(false);
    const singleFile = changes.total === 1 ? changes.files[0] : void 0;   // 1355
    const foldable = changes.files.length > COLLAPSED_ROWS;               // 1356  (COLLAPSED_ROWS = 4, 见 1332)
    const rows = foldable && !expanded ? changes.files.slice(0, COLLAPSED_ROWS) : changes.files;
    ...
    return jsxs("div", {
        ref: cardRef,
        className: ChangedFiles_module_css_default.card,   // 1398
        "data-changed-files": true,                        // 1399  ← 稳定锚点
        "data-single": singleFile !== void 0 || void 0,    // 1400
        children: [ ... ]
    });
}
```

它通过 `conversation.chat.turnTail` 插槽挂到「每个已结束 turn 的尾部」（`client.js:2273-2295`）：

```js
// client.js:2273
ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
    name: "conversation.chat.turnTail",
    id: "@deepseek-ai/dsh-client-ui-deliverables",
    locale: NS,                                  // NS = "deliverables"  (client.js:2110)
    ...
}, DeliverablesTail));
```

### 1.2 数据由谁产生：`@deepseek-ai/dsh-workspace-changes`（Host 端）

**【实测读源码】** `dsh/node_modules/@deepseek-ai/dsh-workspace-changes/lib/index.js`（1097 行）。
它的 README 原文（asar 内 `README.md`）：

> "This plugin summarizes which files each top-level turn changed, with per-file line counts, and serves each listed file's turn-start and turn-end comparison. Git snapshots of the working tree at turn start and turn end are diffed; ... The Session log receives one `workspace/changes` event naming the turn; ... **The Web changed-files card renders them.**"

Host 端 HTTP 路由注册在 deliverables 的 Node 半边（**不在** workspace-changes 里）：

```
dsh/node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/index.js
  :4   const CHANGED_FILES_PATH = "/api/changes.summary";
  :6   const CHANGES_DIFF_PATH  = "/api/changes.diff";
  :8   const CHANGES_OPEN_PATH  = "/api/changes.open";
  :169-186  summary handler ——  summary === undefined 时返回 404
```

### 1.3 排除其它候选

**【实测读源码】** 我逐个核过任务里列的候选：

| 候选包 | 是否渲染该卡片 | 依据 |
|---|---|---|
| `dsh-client-ui-deliverables` | ✅ **是** | 唯一含 `data-changed-files`、`changes.title`、`ChangedFiles.module.css` 的包 |
| `dsh-workspace-changes` | ❌ 只做 Host 端记录与路由服务 | 全包无 React / 无 CSS / 无 `client.js`，`package.json` 里也没有 `dsh.client` 字段 |
| `dsh-client-ui-workspace` | ❌ | `lib/client.js` 里 `grep "个文件"` 无命中；无 `changes.title` |
| `dsh-client-ui-chat` | ❌ | 只**声明** `conversation.chat.turnTail` 这个洞并渲染尾部容器（`client.js:7010`），本身不画改动卡 |
| `dsh-client-ui-trajectory` | ❌ | 中文词条里只有 `layout.fileAttachments: "文件 ×{count}"`，无改动统计 |
| `dsh-client-ui-plan` | ❌ | 无相关字符串 |
| `dsh-client-ui-conversation` | ❌ | 只有 `"{shown} 处匹配 · {files} 个文件"`（grep 结果计数），语义不同 |

对全 asar 做全文扫描（`scan.mjs`）的结果也支持这个结论：

```
"changes.title"      → 仅 dsh-client-ui-deliverables/lib/client.js
"data-changed-files" → 仅 dsh-client-ui-deliverables/lib/client.js
"个文件已更改"        → 0 个文件命中
"vdszpW_card"        → 仅 dsh-client-ui-deliverables/lib/client.js
```

### 1.4 ⚠️ 文案差异（需要 Lead/用户确认）

任务里描述截图是 **「5 个文件已更改 +1 -1」**，但当前运行版本的**真实中文文案**是：

**【实测读源码】** `client.js:2141`（zh 词典）

```js
"changes.title": "已编辑 {count} 个文件",
```

即真实渲染是 **「已编辑 5 个文件」**，而不是「5 个文件已更改」。全 asar 扫描 `"个文件已更改"` **0 命中**。
截图里「N 个文件 / +A -B / 📄 行 / ⌄ 展开」这组结构特征与 `ChangedFiles` 完全对应，所以我判断就是这张卡（【推测】：截图文字是转述时的改写，或来自更早的版本）。
**如果用户坚持原文是「已更改」，需要向用户确认截图来源**，因为当前版本的 bundle 里不存在这个字符串。

---

## 2. 显示条件的**确切判断表达式**

卡片是否渲染由 **4 层 AND** 决定，任何一层为假 → 卡片完全不渲染（不是隐藏，是不挂载 DOM）。

### 第 ① 层：本轮 turn 是否被 Host 记了一笔 `workspace/changes`

**【实测读源码】** `client.js:1259-1261` —— 把 turn 数据里的 changes 取出来：

```js
/**
* The turn's latest change announcement.
* @param owner - closing turn.
* @returns the announcement, or null when the Host recorded none.
*/
function changesForClosing(owner) {
    return owner.turn.data.get("deliverables")?.changes ?? null;
}
```

`changes` 由 `deliverablesDefinition` 折叠会话事件流得到（`client.js:1152-1240`），**只认 `workspace/changes` 事件**：

```js
// client.js:1175  (deliverablesDefinition.match)
if (event.type === "workspace/changes") return isChangesEvent(event.data) ? {
    id: String(event.data.turn),
    role: "update"
} : null;

// client.js:1194-1197  (update)
if (match.event.type === "workspace/changes") return {
    ...context.state,
    changes: { seq: match.event.seq }        // ← 只留 seq，正文要靠 HTTP 再取
};
```

> 注意 `update` 是**覆盖**：同一 turn 里后一条 `workspace/changes` 会顶掉前一条（Host 在 `turn/stopping` 与 `turn/end` 可能各记一次，见 §6）。

### 第 ② 层：开发工具开关（`showCodeDiff`）

**【实测读源码】** `client.js:1640-1659` —— 这是**最关键、也是唯一一个「开关」闸门**：

```js
// client.js:1640
function Deliverables({ matched, openFile, t, sessionId, useSessions, openPresented,
                        openChangesReview, usePresentedOpen, usePresentedHost, useChangesDiff,
                        loadChangesDiff, useChangesSummary, reloadPresentedHost,
                        loadChangesSummary, useShowCodeDiff, renderSlot }) {
    const [expanded, setExpanded] = react.useState(false);
    const showCodeDiff = useShowCodeDiff((value) => value);                          // 1642
    const cwd = useSessions((state) => state.byId[sessionId]?.cwd);
    ...
    const announced = showCodeDiff ? matched.changes : null;                          // 1646  ★ 闸门
    const summary = useChangesSummary((value) =>
        announced === null ? void 0 : value[changesSummaryUrl(sessionId, announced.seq)]);   // 1647
    react.useEffect(() => {
        if (announced !== null && summary === void 0) loadChangesSummary(sessionId, announced.seq);  // 1649
    }, [announced, summary, sessionId, loadChangesSummary]);
    const changes = announced !== null && typeof summary === "object" && summary.files.length > 0   // 1656  ★ 闸门
        ? { seq: announced.seq, ...summary }
        : null;
```

`showCodeDiff` 的来源（`client.js:2287`）：

```js
inject: () => ({
    hooks: {
        changesDiff: diffs.state,
        presentedOpen: opener.state,
        presentedHost: opener.host,
        changesSummary: summaries.state,
        showCodeDiff: ctx.configForms.developerTools.enabled       // ← 就是它
    },
    ...
```

最终渲染（`client.js:1665`）：

```js
return jsxs(react_jsx_runtime.Fragment, { children: [
    changes !== null && jsx(ChangedFiles, { changes, cwd, t, sessionId, useChangesDiff, loadChangesDiff, openReview: ... }),   // 1665  ★ 闸门
    matched.presented.length > 0 && jsxs("div", { ... })
] });
```

而 `DeliverablesTail` 先做一次「这个 turn 值不值得挂」的判断（`client.js:1613-1632`）：

```js
function selectDeliverables(owner) {
    const changes = changesForClosing(owner);
    const presented = presentedForClosing(owner);
    return changes === null && presented.length === 0 ? null : { changes, presented };
}
function DeliverablesTail(props) {
    const matched = selectDeliverables(props);
    return matched === null ? null : jsx(Deliverables, { ...props, matched });
}
```

### 第 ③ 层：`/api/changes.summary` 必须答得出来

**【实测读源码】** `client.js:248-270` —— 摘要 store 的判定：

```js
var ChangesSummaryStore = class extends HostReadStore {
    constructor() {
        super({
            loading: "loading",
            failed: "missing",
            retryable: () => false,                 // ← 一旦 missing 就**不再重试**
            decode: async (response) => {
                if (!response.ok) return "missing"; // ← 404/500 都算 missing
                const value = await response.json();
                return isChangesSummary(value) ? value : "missing";
            }
        });
    }
    load(sessionId, seq) { return this.loadUrl(changesSummaryUrl(sessionId, seq)); }
};
```

返回的是字符串 `"missing"`，而第 ④ 层的判定要求 `typeof summary === "object"` —— 所以 `"missing"` 直接落空，不渲染。

Host 侧什么时候答 404（`dsh-client-ui-deliverables/lib/index.js:169-186`）：

```js
const summary = ctx.workspaceChanges.summary(id, seq);
if (summary === void 0) return new Response("Change summary unavailable.", { status: 404 });
```

`ctx.workspaceChanges.summary` 的实现在 workspace-changes host 里，`records` 是**内存 Map**，随 Session 销毁而消失（README 原文）：

> "Summaries, snapshot trees, and captured copies live only as long as their Session in this Host process; earlier turns of a conversation reopened after a Host restart have no card and no comparison."

### 第 ④ 层：`summary.files.length > 0`

见上面 `client.js:1656`。`total` 可能 > 0 而 `files` 为空的情况在 Host 端被 `maxFiles` 截断逻辑排除（`files = sorted.slice(0, maxFiles)`，`maxFiles` 默认 500 且必须为正整数），所以实际上第 ④ 层等价于「Host 记到了至少一个文件」。

### 2.1 完整判断表达式（照抄，可直接对照源码）

```text
render(ChangedFiles)
  ⇔  changesForClosing(turn) !== null                                  // ① turn 有 workspace/changes 事件
  && ctx.configForms.developerTools.enabled.getSnapshot() === true      // ② ui-settings.enabled === true
  && typeof summary === "object"                                        // ③ summary 路由 200 + isChangesSummary 通过
  && summary.files.length > 0                                           // ④ 至少一个文件
```

展开成 Host 端「会不会发事件」的等价条件（`dsh-workspace-changes/lib/index.js`）：

```text
emit(workspace/changes)
  ⇔  eligible(session)                                  // :958  origin !== "subagent" && (delegationDepth ?? 0) === 0 && cwd 存在
  && (sorted.length > 0 || state.recordedAfterSeq >= 0)  // :870  本次 diff 非空，或本轮此前已记过一次
```

```js
// dsh-workspace-changes/lib/index.js:870-887
if (sorted.length === 0 && state.recordedAfterSeq < 0) return;     // ★ 本轮一个文件都没变 → 干脆不发事件
const event = this.session.append("workspace/changes", { turn: state.turn });
const kept = sorted.slice(0, this.env.maxFiles);
this.records.set(event.seq, {
    summary: {
        turn: state.turn,
        cwd: this.cwd,
        files: kept.map((entry) => entry.file),
        total: sorted.length,
        added:  sorted.reduce((sum, entry) => sum + entry.file.added, 0),
        deleted: sorted.reduce((sum, entry) => sum + entry.file.deleted, 0),
        ...snapshot === void 0 ? {} : { snapshot }
    },
    sources: kept.map((entry) => entry.sources)
});
state.recordedAfterSeq = event.seq;
```

```js
// dsh-workspace-changes/lib/index.js:958-961
function eligible(session) {
    const { cwd, origin, delegationDepth } = session.header;
    return origin === "subagent" || (delegationDepth ?? 0) > 0 ? void 0 : cwd;
}
```

### 2.2 为什么「有时出现有时不出现」—— 按概率排序

| # | 原因 | 是否「正常」 | 依据 |
|---|---|---|---|
| 1 | **本轮 turn 确实没有文件改动** → Host 不发 `workspace/changes` 事件 → 无卡 | 正常 | 【实测读源码】`:870` +【实测读日志】见下 |
| 2 | **开发工具开关被关**（`ui-settings.enabled = false`）→ `announced = null` → 无卡 | 设计如此（README 明说） | 【实测读源码】`client.js:1646`；README："Turning the preference off removes the card immediately" |
| 3 | **Host 重启过 / 会话已销毁** → `/api/changes.summary` 404 → `"missing"` 且**永不重试** → 无卡 | 设计如此 | 【实测读源码】`client.js:252-258`、`lib/index.js:175-176` |
| 4 | **后一次空记录覆盖前一次**（同一 turn 内 `turn/end` 再记一次，这次 diff 为空） | 设计如此（"An empty list after an earlier record supersedes it."） | 【实测读源码】`client.js:1194-1197`（覆盖语义） |
| 5 | **摘要读取尚在 pending** → 卡片晚一拍出现（不是「不出现」） | 正常 | 【实测读源码】`client.js:1647-1655` |
| 6 | git 失败 / 超时 / 输出超限 → 该轮记录被放弃并只打一条 warning | 罕见 | 【实测读源码】README "Known Limitations"；`Config.timeoutMs=30000`、`outputMaxBytes=8MiB` |
| 7 | 非 git 工作区 + 改动全走 shell（`bash`）→ 只覆盖 file-tool 编辑，shell 编辑不入卡 | 已知限制 | 【实测读源码】README："Outside snapshot coverage only paths a file tool names are captured" |
| 8 | subagent 会话 / `delegationDepth > 0` → 完全不记录 | 设计如此 | 【实测读源码】`eligible()` |

### 2.3 实测日志证据（这是最有力的一条）

**【实测读日志】** 本工作区（`/Users/cenuon/Documents/默认项目`）的历史会话日志里，**确实存在「同一会话内部分轮次有事件、部分轮次没有」的现象**：

```bash
cd "/Users/cenuon/.dsh/sessions/--Users-cenuon-Documents-~9ED8~8BA4~9879~76EE--/session-9997a909-b2aa-4f72-b37a-fddf46c109db"
zstd -dc session.v4.jsonl.zstd | grep '"type":"workspace/changes"'
```

输出（节选，`turn` 号）：

```
seq 535  turn 1      seq 1655 turn 4      seq 2058 turn 7      seq 2290 turn 12
seq 889  turn 2      seq 1817 turn 5      seq 2163 turn 8      seq 2331 turn 13
seq 1418 turn 3      seq 1925 turn 6      seq 2231 turn 9      seq 2379 turn 14
                                                               seq 2505 turn 16
```

**turn 10、11、15 没有事件**。再统计每轮的 tool call：

```
turn 10 toolcalls: []                                             ← 无任何工具调用
turn 11 toolcalls: []                                             ← 无任何工具调用
turn 15 toolcalls: ["bash","bash","bash","bash","bash"]           ← 只有 bash，没有 write/edit
turn 12 toolcalls: ["bash","read","edit","bash","write"]          ← 有 edit/write → 有事件 ✅
turn 13 toolcalls: ["bash","bash","read","edit","bash"]           ← 有 edit       → 有事件 ✅
```

→ **「有时出现有时不出现」的第一大原因就是：那一轮根本没有文件改动（或只跑了只读 bash），Host 按设计不发事件。** 这【实测读日志】验证了 §2.1 的 ① 层。

另一个会话（`session-e5fa161d`）有 9 个事件，`session-2a179f21` 等 0 个 —— 分布同样不均匀。

---

## 3. 「N 个文件 +A -B」的 i18n key 与渲染组件

### 3.1 命名空间与词典位置

**【实测读源码】**
- 命名空间：`const NS = "deliverables";` —— `client.js:2110`
- 中文词典：`client.js:2112-2173`；英文词典：`client.js:2175-2236`
- 注册：`ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-deliverables: dictionaries")` —— `client.js:2269-2272`
- ⚠️ 包内 `locale/zh.json` **只有 meta**（`{"meta":{"title":"...","description":"..."}}`），真正的 UI 文案全部内联在 `client.js` 里 —— 这也是为什么在 locale 文件里查不到开关。

### 3.2 卡片用到的全部 key

**【实测读源码】** `client.js:2141-2152`（zh）/ `2204-2215`（en）：

| i18n key | zh 文案 | en 文案 | 用在哪 |
|---|---|---|---|
| `deliverables:changes.title` | `已编辑 {count} 个文件` | `Edited {count} files` | 多文件卡片**头部主标题**（`client.js:1379`） |
| `deliverables:changes.singleTitle` | `已编辑 {name}` | `Edited {name}` | **单文件**卡片头部标题（`client.js:1379`） |
| `deliverables:changes.added` | `+{count}` | `+{count}` | 绿色增量（`client.js:1338` / `1449`） |
| `deliverables:changes.deleted` | `-{count}` | `-{count}` | 红色减量（`client.js:1341` / `1449`） |
| `deliverables:changes.binary` | `二进制` | `binary` | 二进制文件替代计数 |
| `deliverables:changes.oversized` | `过大` | `too large` | 未捕获文件替代计数 |
| `deliverables:changes.openReview` | `在侧边栏查看本轮改动` | `Review this turn's changes in the sidebar` | 多文件头部 `aria-label` |
| `deliverables:changes.viewDiff` | `查看 {name} 的改动` | `View changes to {name}` | 每行 `aria-label` |
| `deliverables:changes.all` | `全部 {count} 个文件` | `All {count} files` | 折叠展开按钮文案（`client.js:1470`） |
| `deliverables:changes.collapse` | `收起` | `Collapse` | 展开后按钮文案 |
| `deliverables:changes.expandAria` | `展开全部 {count} 个改动文件` | `Show all {count} changed files` | `aria-label` |
| `deliverables:changes.collapseAria` | `收起改动文件列表` | `Collapse changed files` | `aria-label` |
| `deliverables:presented.preview` | `在侧边栏预览` | `Preview in sidebar` | hover 时替换计数的提示（`client.js:1391`） |

计数用 `Intl.NumberFormat("en-US")` 千分位格式化（`client.js:1333`、`1338`、`1341`）。

### 3.3 组件树（【实测读源码】 `client.js:1351-1474`）

```text
<div data-changed-files="true" data-single={bool} class="vdszpW_card">        ← 卡片根 (1396-1400)
├── <button class="vdszpW_header">                                            ← 头部，点击打开 review (1358)
│   ├── <span class="vdszpW_tile">   <FileTypeIcon kind="code"|path>          (1366-1374)
│   └── <span class="vdszpW_titles">
│       ├── <span class="vdszpW_title">   changes.title | changes.singleTitle (1377-1379)
│       └── <span class="vdszpW_stat">
│           ├── <span class="vdszpW_statCounts"> +A -B | binary | too large   (1382-1388)
│           └── <span class="vdszpW_previewHint"> "在侧边栏预览"               (1389-1392)
├── <ul class="vdszpW_list">            （仅多文件；单文件走 HoverCard 包装头部）(1421-1461)
│   └── <li> <button class="vdszpW_row">
│              ├── <span class="vdszpW_path">    file.display                 (1444-1446)
│              └── <span class="vdszpW_counts">  +A -B                        (1447-1454)
└── <button class="vdszpW_toggle">      （仅 files.length > 4）"全部 N 个文件" + ⌄   (1462-1471)
```

- 折叠阈值：`const COLLAPSED_ROWS = 4;`（`client.js:1332`），`files.length > 4` 才出现 `vdszpW_toggle` 与 ⌄ 箭头 —— 与截图里的 ⌄ 吻合。
- 单文件时**不渲染文件列表**，只渲染被 `HoverCard` 包住的头部（`client.js:1402-1420`）。

### 3.4 类名与稳定锚点（CSS 用）

**【实测读源码】** `client.js:1299-1328`（CSS 内联 + class map）：

| class map 键 | 实际类名 | 稳定锚点 |
|---|---|---|
| `card` | `vdszpW_*_card` | **`[data-changed-files]`**、`[data-changed-files][data-single="true"]` |
| `header` | `vdszpW_*_header` | `[data-changed-files] > button` |
| `tile` | `vdszpW_*_tile` | — |
| `titles` / `title` | `vdszpW_*_titles` / `_title` | — |
| `stat` / `statCounts` / `previewHint` | `vdszpW_*_stat` / `_statCounts` / `_previewHint` | — |
| `added` / `deleted` | `vdszpW_*_added` / `_deleted` | — |
| `list` / `row` / `path` / `counts` | `vdszpW_*_list` / `_row` / `_path` / `_counts` | — |
| `toggle` | `vdszpW_*_toggle` | `[aria-expanded]` |
| `preview` / `previewPath` | `vdszpW_*_preview` / `_previewPath` | `[data-changes-hover-preview]` |

- ⚠️ **任务提示里的 `_58QN-a_row` 是错的。** 【实测读源码】全 asar 扫描 `58QN-a` 只命中 `dsh-client-ui-permission-presets/lib/client.js`，与本卡片无关。本卡片的 hash 前缀是 `vdszpW_*`。
- ⚠️ **CSS 不在 web-frontend 里。** 【实测读源码】`dsh-web-frontend/dist/assets/index-BNyAYEM7.css`（77 471 字节）里 `vdszpW` **0 命中**、`data-changed-files` **0 命中**。卡片 CSS 是插件运行时用 `<style data-plugin-css="@deepseek-ai/dsh-client-ui-deliverables/ChangedFiles.module.css">` 注入的（`client.js:1302-1308`）。

---

## 4. 有没有开关能让它「总是显示」

### 4.1 结论：**有，而且只有一个** —— 「显示代码工作视图」

**【实测读源码】** 开关本体定义在 `dsh/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/index.js`：

```js
// ui-settings/lib/index.js:1-20  (Host 半边，全文)
/** Shared Web and desktop developer-tool preference stored by the Host. */
/** New installations and missing values enable the full interface. */
const DeveloperToolsSettingsFields = { enabled: z.boolean().default(true) };
z.object(DeveloperToolsSettingsFields);
/** Live preferences projected to the browser. */
const Config = z.object({ enabled: DeveloperToolsSettingsFields["enabled"].volatile() });
function apply(ctx) {
    ctx.inject(["settings"], (child) => {
        child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
    });
}
```

【实测读源码】客户端读取逻辑（导出到 `.research-opencode-ui/ui-settings.js`，行号按该导出文件）：

```js
// ui-settings.js:1032-1064
/** Shared preference; Host-backed features stay disabled until an accepted value arrives. */
var DeveloperToolsPreference = class {
    scope;
    enabled;
    constructor(scope) {
        this.scope = scope;
        this.enabled = {
            getSnapshot: () => scope.getSnapshot().value?.enabled ?? false,   // ★ 未拿到值 → false
            subscribe: (listener) => { ... }
        };
    }
    async setEnabled(enabled) {
        if (!await this.scope.set("enabled", enabled)) throw new Error("Developer tools preference was not saved");
    }
};

// ui-settings.js:1067
const DEVELOPER_TOOLS_NAMESPACE = "ui-settings";     // ← 命名空间 = Loader entry id
```

```js
// ui-settings.js:1252-1300
var ConfigForms = class extends _deepseek_ai_cordis.Service {
    constructor(ctx, config) {
        super(ctx, "configForms");
        ...
        this.developerTools = new DeveloperToolsPreference(this.get(DEVELOPER_TOOLS_NAMESPACE));
    }
    get(entryId) { ... new ConfigFormController(this.owner, { namespace: entryId }, ...) }
};
```

取值链路（**已完整核对，无断点**）：

```text
profile cordis.patch.yml 的 `- id: ui-settings / config.enabled`
  → Loader 解析成 entry.fiber.config.enabled
  → Host `settings.describe()` 的 value = projectForm(form, plainConfig(entry.fiber.config))   [dsh-settings/lib/index.js:436]
  → 客户端 mirror.namespaces[ns="ui-settings"].value
  → ConfigFormController.derive(): draft.value = decoded = view.value                           [ui-settings.js:1209-1230]
  → DeveloperToolsPreference.enabled.getSnapshot() = value?.enabled ?? false                    [ui-settings.js:1042]
  → deliverables slot inject: showCodeDiff = ctx.configForms.developerTools.enabled              [client.js:2287]
  → const announced = showCodeDiff ? matched.changes : null                                     [client.js:1646]
```

#### ⚠️ 术语澄清：`developerTools` 与 `ui-settings.enabled` 是**同一个东西的两个名字**，不是两个键

这一点极易混淆（Lead 复核时也提出过），这里按「名字出现在哪一层」拆开讲：

| 出现的名字 | 出现的地方 | 它是什么 | 是不是配置文件里的键 |
|---|---|---|---|
| `ui-settings` | `cordis.patch.yml` 的 `- id:`；`DEVELOPER_TOOLS_NAMESPACE` | **Loader 条目 id**，同时也是 settings 命名空间名 | ✅ 是（`- id: ui-settings`） |
| `enabled` | `dsh-client-ui-settings/lib/index.js:10` 的 `Config`；`cordis.patch.yml:22` | **真正持久化的配置字段** | ✅ **是** |
| `developerTools` | `ui-settings.js:1274` `this.developerTools = new DeveloperToolsPreference(...)` | `configForms` **服务上的一个 JS 属性名**（一个 API 句柄） | ❌ 不是 |
| `developerTools` | `settings-general/client.js:1085` `hooks: { developerTools: ... }` | 传给 React 行的 **prop/hook 名** | ❌ 不是 |
| `developerTools` | `settings-general/client.js:994` `"developerTools.title"` | settings-general 命名空间下的 **i18n key 前缀** | ❌ 不是 |
| `developerTools` | `settings-account` 段（patch 第 13 行） | `ui-settings-account` **另一个命名空间**的 onboarding 字段 | ✅ 是，但**是另一个键** |

**决定性证据**（`dsh-client-ui-settings-general/lib/client.js:1086-1091`）—— 调用 `developerTools.setEnabled(enabled)` 之后，代码立刻断言 **`ui-settings` 命名空间的 `enabled` 已经变成同一个值**：

```js
setEnabled: async (enabled) => {
    const settings = ctx.configForms.get("ui-settings");        // 1087
    const previous = settings.getSnapshot().value?.enabled;     // 1088
    const timestamp = Date.now();
    await ctx.configForms.developerTools.setEnabled(enabled);   // 1090
    if (previous !== void 0 && previous !== enabled && settings.getSnapshot().value?.enabled === enabled)  // 1091
        ctx.get("productAnalytics")?.track("code_work_view_toggle", { is_enabled: enabled }, timestamp);
}
```

并且 `DeveloperToolsPreference` 自己（`ui-settings.js:1059-1061`）就是往 `scope`（= `get("ui-settings")` 这个 form）写 `"enabled"`：

```js
async setEnabled(enabled) {
    if (!await this.scope.set("enabled", enabled)) throw new Error("Developer tools preference was not saved");
}
```

→ **结论**：`ctx.configForms.developerTools.enabled` 读的就是 `ui-settings` 命名空间的 `enabled` 字段；配置文件里能改的键是 **`ui-settings: config: enabled`**（patch 第 19-22 行）。
第 13 行 `ui-settings-account` 段里那个同名的 `developerTools` 是**引导流程的用途记录**，单独为 `false` **不会**关掉卡片。

### 4.2 开关在设置页里的位置与文案

**【实测读源码】** `dsh/node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js`：

```js
// settings-general/lib/client.js:1078-1094
ctx.slots.inject("settings.general.item", () => ctx.slots.register({
    name: "settings.general.item",
    id: "developer-tools",          // ← 设置页里的 slot id
    order: 15,
    locale: NS,
    inject: () => ({
        hooks: { developerTools: ctx.configForms.developerTools.enabled },
        setEnabled: async (enabled) => { ... await ctx.configForms.developerTools.setEnabled(enabled); ... }
    })
}, DeveloperToolsRow));

// settings-general/lib/client.js:994-996 (zh)
"developerTools.title": "显示代码工作视图",
"developerTools.description": "开启后，显示轨迹、本轮代码差异，可选择完整的 Agent 预设切换",
"developerTools.error": "保存失败，请重试",

// settings-general/lib/client.js:1038-1040 (en)
"developerTools.title": "Show coding view",
"developerTools.description": "Shows trajectory, code diffs, and all Agent presets",
```

### 4.3 这个开关还控制什么（关掉的副作用）

**【实测读源码】** 全 asar 扫描 `configForms.developerTools` 得到 5 个消费方：

| 包 | 位置 | 关掉后 |
|---|---|---|
| `dsh-client-ui-deliverables` | `client.js:2287` | **改动卡消失**（本任务主角） |
| `dsh-client-ui-conversation` | `client.js:19758` | `conversation.view` 里 id 为 `trajectory` 的标签页被跳过 |
| `dsh-client-ui-agent-preset` | `client.js:2326-2329` | 清空 staged preset，禁止完整预设切换 |
| `dsh-client-ui-sidebar-documentpreview` | `client.js:4523` | HTML 交互预览关闭 |
| `dsh-client-ui-settings-general` | `client.js:1085` | 就是开关本身 |

### 4.4 怎么开

**方式 A（推荐，等价于用户点设置页开关）** —— 改 profile patch：

```yaml
# /Users/cenuon/.dsh/profiles/desktop/cordis.patch.yml
- id: ui-settings
  name: "@deepseek-ai/dsh-client-ui-settings"
  config:
    enabled: true          # ← 改成 true（或整段删掉，回落到默认 true）
```

**方式 B** —— 设置页 → 通用 → 「显示代码工作视图」开关打开（走 `setEnabled`，写回同一处）。

### 4.5 ⚠️ 本机当前状态：**`false`**

**【实测读配置】** `/Users/cenuon/.dsh/profiles/desktop/cordis.patch.yml`：

```yaml
19: - id: ui-settings
20:   name: "@deepseek-ai/dsh-client-ui-settings"
21:   config:
22:     enabled: false          # ★ 显式关掉了
```

对比备份 `cordis.patch.yml.bak-1792568170301`（2026-10-21）—— 当时是 `enabled: true`：

```yaml
10: - id: ui-settings
11:   name: "@deepseek-ai/dsh-client-ui-settings"
12:   config:
13:     enabled: true
```

**两个必须区分开的键**（Lead 复核时特别指出，这里澄清）：

| 位置 | 键 | 归属 | 是否影响改动卡 |
|---|---|---|---|
| 第 **13** 行 | `developerTools: false` | `ui-settings-account` 的 config（**onboarding 引导结果**，schema 见 `dsh-client-ui-settings-account/lib/index.js` 的 `OnboardingSettingsFields`） | ❌ **不影响**。它只是「用户在引导里选了哪一类用途」的记录 |
| 第 **19-22** 行 | `enabled: false` | `ui-settings` 的 config（= 命名空间 `ui-settings`，`DEVELOPER_TOOLS_NAMESPACE`） | ✅ **就是它**。这是 `configForms.developerTools.enabled` 读的那个键 |

我报告里引用的是**第 19-22 行的 `ui-settings.enabled`**，不是第 13 行。
两者有关联（引导流程在 `save()` 里会通过 `ctx.configForms.developerTools.setEnabled(development)` 把第 13 行的值**写进**第 19-22 行，见 `dsh-client-ui-settings-account/lib/client.js:3355`），但它们是两个不同的键，第 13 行单独为 `false` 不会关掉卡片。

**关于时间戳（已复核并更正）**：

- 我在报告里写的 `mtime Nov 4 14:09`，来自本会话 **seq 416（2026-11-04T06:19:23.692Z = 14:19:23 CST）** 的 `ls -la` 输出：`-rw-------@ 1 cenuon staff 4979 Nov 4 14:09 cordis.patch.yml`。这个数字在**当时是准确的**。
- 该文件随后在 **14:28:00** 被**整体替换**了一次（`stat` 显示 `birth=mtime=ctime=2026-11-04 14:28:00`，新 inode，签名符合 DSH 的 atomic-write「写临时文件 + rename」，而不是 shell `>` 重定向——后者会保留 birth）。
- **但内容零字节变化**：我在 14:19:27（seq 423）`cat` 到的完整内容，与当前文件 `diff` 完全一致，`sha256 = 81b7550113f5e17dc9aa1fde5c896374a040c89afeaa9db76f1e8e5b53ed67d7`，两者同为 4979 字节。
- 写入者**不是本会话的任何成员**（本会话事件流里对该路径只有 `cat` / `ls` / `grep` / `diff` / `stat` 这类只读调用，没有任何 write/edit/重定向）。`lsof` 显示只有 DSH 桌面端主进程（pid 21837）以**只读**方式持有该文件。**写入者的身份未能确定。**
- 因此 §4.5 的结论**不依赖**这次 14:28 的重写：`enabled: false` 在 14:19（我首次读取时）就已经存在，与备份（10-21 的 `enabled: true`）不同。

**⚠️ 该文件仍在被反复重写（截至 14:45 仍在发生）—— 观测记录：**

| 时刻(CST) | birth/mtime | size | 第 22 行 | sha256(前16) | 内容是否变化 |
|---|---|---|---|---|---|
| 14:09 | 14:09 | 4979 | `enabled: false` | — | （我 14:19:23 首次观测到的状态） |
| 14:19:27 | — | 4979 | `enabled: false` | `81b7550113f5e17d` | 我 `cat` 存档（seq 423） |
| 14:28:00 | 14:28:00 | 4979 | `enabled: false` | `81b7550113f5e17d` | ❌ **零字节变化**（整文件原子替换） |
| **14:40:30** | **14:40:30** | **4978** | **`enabled: true`** | `f6d604c2957c5d21` | ✅ **真的变了：`false` → `true`** |

- 同一 profile 的 `package.json` 也在 **14:42** 被重写（内容未变），目录 mtime 14:42。
- 我 14:36:57–14:39:53 的 180s 每 5s 采样**未发现变化**，说明不是固定周期；但 14:28 与 14:40:30 两次都**不是**我发起的。
- 【实测读日志】本会话事件流在 14:28:00 与 14:40:30 前后，**只有我自己的只读命令**（`grep` / `node asar.mjs cat` / `node verify-lines.mjs`），**没有任何 write/edit/重定向**。
- 【实测读文件】`.plugin-manager/logs/` 下**没有** 14:20 之后的新操作记录，所以不是 `plugin_manager` 安装/启停流程。
- `lsof` 只显示 DSH 桌面端主进程（pid 21837）以**只读**持有该文件。
- `com.apple.provenance` xattr 在我自己创建的文件上同样是 `11`，**不具备区分能力**，不能用来指认写入者。
- **结论：写入者身份未能确定。我不做推测性归因。** 但可以确定的是：**开关的当前值是 `true`，卡片应当恢复正常显示。**

**【推测】** 如果这个 `false` 在用户观察到「有时不出现」的时段内一直存在，那么它才是**「完全不出现」**的主因；而 §2.3 日志里那种「一部分轮次有、一部分没有」的分布，主因是第 ① 层（那一轮没改动）。两者可以并存：`false` 让卡片彻底消失，`true` 之后仍会因为「本轮无改动」而时有时无。

**【推测】** 如果这个 `false` 在用户观察到「有时不出现」的时段内一直存在，那么它才是**「完全不出现」**的主因；而 §2.3 日志里那种「一部分轮次有、一部分没有」的分布，主因是第 ① 层（那一轮没改动）。两者可以并存：`false` 让卡片彻底消失，`true` 之后仍会因为「本轮无改动」而时有时无。

> **给 Lead 的行动建议**：先确认用户期望的是哪种「总是显示」。若只是要恢复卡片的正常行为，把 `ui-settings.enabled` 改回 `true` 即可（**零代码改动**，但会连带恢复轨迹页 / HTML 预览 / 完整预设切换）。若用户要求「哪怕本轮没有改动也要显示」，那就不是开关能解决的，见 §5。

### 4.6 其它配置项（都不能让它「总是显示」）

**【实测读源码】** `@deepseek-ai/dsh-workspace-changes` 的 `Config`（`lib/index.js:950-957`）：

```js
const Config = z.object({
    timeoutMs:      z.number().default(3e4),            // 单条 git 命令超时
    outputMaxBytes: z.number().default(8 * 1024 * 1024),// 单条 git 输出上限
    maxFiles:       z.number().default(500),            // 单次摘要最多列多少文件（total 仍报全量）
    maxFileBytes:   z.number().default(2 * 1024 * 1024),// 参与比较的单文件上限
    diffTimeoutMs:  z.number().default(100)             // 行级比较超时
});
```

这 5 个只影响「记录多少 / 多大 / 多久」，**没有一个能让「本轮无改动」也出卡**。
`@deepseek-ai/dsh-client-ui-deliverables` **没有 Config schema**（其 `package.json` 无 `dsh.config`；`lib/index.js` 只注册路由与 prompt section）。

---

## 5. 纯 CSS 能做到什么 / 必须改行为的部分

### 5.1 前提：卡片消失时**根本没有 DOM**

**【实测读源码】** 卡片的三条渲染路径全部是 React 条件渲染，返回 `null` 即不挂载：

```js
// client.js:1628   —— selectDeliverables 返回 null 时
return matched === null ? null : jsx(Deliverables, { ...props, matched });

// client.js:1665   —— changes === null 时 ChangedFiles 不参与 children
children: [ changes !== null && jsx(ChangedFiles, { ... }), ... ]
```

**【实测读源码】** 卡片 CSS 里**没有任何隐藏规则**可被反隐藏：

```css
/* client.js:1300 片段 */
.vdszpW_*_card{ ...; display:flex; overflow:hidden }          /* 恒为 flex，无 display:none */
.vdszpW_*_card[data-single=true]{ border-color:var(--dsw-alias-border-l1) }
```

全 asar 扫描 `data-changed-files` → 只命中 deliverables 自己的 `client.js`；web-frontend 的 77KB CSS 里 0 命中。
**【实测读源码】** `dsh-opencode-ui/src/app.css` / `src/settings.css` 里对 `[class$="_card"]` 的两条规则都被祖先限定（`:is([class$="_composerSeat"]…)` 与 `[data-shortcut-modal="settings"]`），**不会**误伤改动卡（`app.css:654`、`settings.css:282`）。

### 5.2 明确分界

| 目标 | 纯 CSS 能否 | 说明 |
|---|---|---|
| 卡片被**外部** CSS 隐藏时反隐藏 | ✅ 能 | 加 `[data-changed-files]{display:flex!important}` 即可 —— 但当前**不存在**这样的隐藏规则，所以这条目前是空转 |
| 重新配色 / 圆角 / 边框 / 间距 / 字号 / 去阴影 | ✅ 能 | `[data-changed-files]`、`.vdszpW_*_header`、`_row`、`_toggle` 等都是稳定锚点；颜色建议走 token 层 |
| 把 hover 时被换掉的计数常显 | ✅ 能 | `.vdszpW_*_previewHint{display:none}` + `.vdszpW_*_statCounts{display:inline-flex}`（`client.js:1300` 里那条 hover 交换规则是纯 CSS） |
| **展开超过 4 行的折叠** | ❌ **不能** | 折叠是 React state：`rows = foldable && !expanded ? changes.files.slice(0, 4) : changes.files`（`client.js:1357`）。第 5 行起的 `<li>` **不在 DOM 里**，CSS 无从显示。要常显只能改行为（点 `_toggle` 或改代码） |
| **本轮没有 `workspace/changes` 事件时让它出现** | ❌ **不能** | 没有数据源，没有 DOM |
| **`ui-settings.enabled === false` 时让它出现** | ❌ **不能** | 闸门在 JS 里（`client.js:1646`），DOM 不挂载 |
| **Host 重启后摘要 404 时让它出现** | ❌ **不能** | `client.js:252-258`，且 `retryable: () => false` 永不重试 |
| 让「单文件形态」也显示文件列表 | ❌ 不能 | 单文件走的是 `HoverCard` 分支，`<ul>` 根本不渲染（`client.js:1402-1421`） |

### 5.3 「必须改行为」的最小集合

1. **把 `ui-settings.enabled` 置回 `true`** —— 严格说这不是改代码，是改配置（§4.4 方式 A/B）。
2. 如果要求「本轮无文件改动也要出现汇总」→ 需求本身与产品设计冲突（没数据可汇总），必须由插件自己渲染一张卡片，即：
   - `@local/opencode-ui` 注册进 `conversation.chat.turnTail` 插槽（目前它只注册了 `conversation.composer.dock`，见 `dsh-opencode-ui/README.md`），或
   - 注册进 `conversation.chat.turnTail` 的同级 slot 并在自己的组件里读会话事件。
   **这是 JS 行为改动，不是 CSS。**
3. 如果要求「折叠默认展开 / 全部行常显」→ 也需要行为改动（或每次自动点击 `[aria-expanded]` 的 `_toggle`，属于脚本注入而非纯 CSS）。

### 5.4 对 `@local/opencode-ui` 的结论

**【实测读源码】** 该插件当前是「token 覆盖 + 一个 `<style>` + 一个 `composer.dock` 状态项」三层结构（`dsh-opencode-ui/README.md`、`src/module.js`）。
**纯 CSS 方案对「让卡片总是可见」无效** —— 它最多只能让卡片在**已经渲染出来**的时候更好看、hover 提示常显、行数 ≤ 4 时样式统一。
**要让卡片在原本不渲染的场景下出现，必须改行为（JS）。**

---

## 6. 它是基于「本轮 turn 的改动」还是「整个工作区」

### 6.1 结论：**本轮 top-level turn 的增量**

**【实测读源码】** `dsh-workspace-changes/README.md` 原文：

> "This plugin summarizes which files **each top-level turn** changed, with per-file line counts... **Git snapshots of the working tree at turn start and turn end are diffed**; every file a file tool edits is copied whole before its first edit and again at turn end, covering the files git does not."

> "the user's **earlier uncommitted changes never enter a summary**."

实现（`dsh-workspace-changes/lib/index.js`）：

- `turn/start` 建基线：用临时 index（以仓库 index 为种子）`add --all --ignore-errors` + `write-tree` → `baseline.tree`
- `agent/turn-stopping` 记录：再取一次 `after = snapshotTree(...)`，然后
  `diffTrees(baseline.git, baseline.workspace, baseline.tree, after, signal)` → **两次快照之间的差异**
- `turn/end` 只有在「上次记录之后又有工具结果落定」时才再记一次（"An empty list after an earlier record supersedes it."）

也就是说：**baseline 是 turn 开始那一刻的工作区快照，而不是 HEAD**。所以用户在 turn 之前留下的未提交改动**不会**进卡；turn 期间的改动（含用户手改、shell 改）**会**进卡。

### 6.2 与 `git status` 的关系

| 维度 | 行为 | 依据 |
|---|---|---|
| 是否等于 `git status` | **不等于**。是 `diff-tree(turnStartTree, turnEndTree)`，即「本轮增量」 | 【实测读源码】 |
| 仓库 index / objects / refs | 只读；快照写进 Session 私有临时对象目录（`GIT_OBJECT_DIRECTORY` + `GIT_ALTERNATE_OBJECT_DIRECTORIES`） | 【实测读源码】README |
| 无 git / 非仓库 | 退化为「只列 file-tool 编辑（`write` / `edit` / 可变 `str_replace_editor`）」，**shell 改动不入卡** | 【实测读源码】README |
| 用户当前工作区 | **是 git 仓库**（`git rev-parse --show-toplevel` → `/Users/cenuon/Documents/默认项目`），所以 shell 改动会被 git 快照覆盖 | 【实测读配置】 |
| submodule / 嵌套仓库 | 记为 gitlink，内部改动不出现 | 【实测读源码】README |
| `/tmp` 下文件 | 排除（除非在仓库内） | 【实测读源码】README |
| 生命周期 | 摘要只活在 Host 内存里，Session 销毁 / Host 重启即失效 | 【实测读源码】README + `records` Map |

### 6.3 卡片读的是「哪一次」记录

**【实测读源码】** 读的是该 turn **最后一条** `workspace/changes` 事件的 seq：

```js
// client.js:1194-1197   update() 覆盖式写入
if (match.event.type === "workspace/changes") return { ...context.state, changes: { seq: match.event.seq } };
```

```js
// client.js:1647  按 seq 去 Host 取摘要
const summary = useChangesSummary((value) =>
    announced === null ? void 0 : value[changesSummaryUrl(sessionId, announced.seq)]);
```

### 6.4 ⚠️ 本工作区的具体陷阱：`dbx/` 是**嵌套 git 仓库**，在卡上只会显示成 `dbx +1 -1`

**【实测读文件】** 用户工作区里存在嵌套仓库：

```bash
$ ls -la /Users/cenuon/Documents/默认项目/dbx/
drwxr-xr-x  .git            ← dbx/ 自己就是一个 git 仓库
$ cd /Users/cenuon/Documents/默认项目 && git status --porcelain dbx
?? dbx/
```

**【实测读源码】** `dsh-workspace-changes/README.md` 明确写了这个行为：

> "Nested repositories and submodules inside the working directory are **recorded as gitlinks, so their internal changes do not appear**."

实现上还有一段专门把 gitlink 内部路径从捕获集合里剔掉的逻辑（`dsh-workspace-changes/lib/index.js:856-860`）：

```js
let inWorkspace = captured.filter((absolute) => isInside(root, absolute));
if (baseline !== null && inWorkspace.length > 0) {
    const gitlinks = await gitlinkPaths(baseline.git, baseline.workspace, signal);
    inWorkspace = inWorkspace.filter((absolute) => ![...gitlinks].some((link) => isInside(resolve(root, link), absolute)));
}
```

**【实测读 git 行为】** 我用一个一次性沙盒仓库复现了嵌套仓库的快照 diff（`/tmp` 内，已删除，未触碰用户仓库）：

```bash
# 外层仓库 + 内层嵌套仓库，用临时 index 做两次快照
git add --all --ignore-errors ; T1=$(git write-tree)
# 在内层仓库里提交一次改动
git add --all --ignore-errors ; T2=$(git write-tree)
git diff-tree -r -M --numstat $T1 $T2
```

输出：

```
1	1	sub          ← ★ 嵌套仓库在 numstat 里就是「+1 -1」
```

`git ls-tree` 也印证它是 gitlink：

```
160000 commit 0dacc837…  sub
160000 commit a123a35a…  sub
```

**结论（【实测读源码】+【实测读 git 行为】，截图识别部分为【推测】）**：
用户截图里那一行 **`📄 dbx  +1 -1`** 极可能就是 `/Users/cenuon/Documents/默认项目/dbx/` 这个嵌套仓库的 **gitlink 条目**。
这意味着一个对用户很关键的实际后果：

> **在 `dbx/` 目录内部修改文件时，汇总卡上只会出现一行 `dbx +1 -1`，永远不会列出里面被改的具体文件。**

如果用户的抱怨是「我明明改了好几个文件，卡上却只有一行 / 数字不对」，那**根因就在这里**，而且它既不是开关问题、也不是 CSS 能解决的问题 —— 这是 `dsh-workspace-changes` 的既定设计（嵌套仓库按 gitlink 处理）。绕过它只能改 Host 端行为（把 `dbx/` 移出工作区、或把 `dbx/` 改成非嵌套目录、或改插件）。

---

## 7. 证据清单（可逐条复现）

| # | 事实 | 来源 | 标注 |
|---|---|---|---|
| 1 | 卡片由 `@deepseek-ai/dsh-client-ui-deliverables` 的 `ChangedFiles` 渲染 | `…/dsh-client-ui-deliverables/lib/client.js:1351-1474` | 【实测读源码】 |
| 2 | 挂在 `conversation.chat.turnTail` 插槽 | `…/lib/client.js:2273-2295` | 【实测读源码】 |
| 3 | 显示条件 4 层 AND | `…/lib/client.js:1642,1646,1647,1656,1665` + `1259-1261` + `1613-1632` | 【实测读源码】 |
| 4 | 开关 = `ui-settings.enabled`，默认 `true` | `…/dsh-client-ui-settings/lib/index.js:4,10` | 【实测读源码】 |
| 5 | `showCodeDiff = ctx.configForms.developerTools.enabled` | `…/lib/client.js:2287` | 【实测读源码】 |
| 6 | 设置页项 id `developer-tools`，文案「显示代码工作视图」 | `…/dsh-client-ui-settings-general/lib/client.js:1078-1094`、`994-996` | 【实测读源码】 |
| 7 | Host 在本轮无改动时不发事件 | `…/dsh-workspace-changes/lib/index.js:870` | 【实测读源码】 |
| 8 | subagent 会话不记录 | `…/dsh-workspace-changes/lib/index.js:958-961` | 【实测读源码】 |
| 9 | 摘要 404 语义与「永不重试」 | `…/lib/index.js:169-186` + `…/lib/client.js:248-270` | 【实测读源码】 |
| 10 | i18n key `deliverables:changes.*` | `…/lib/client.js:2112-2173`（zh）、`2175-2236`（en） | 【实测读源码】 |
| 11 | 类名前缀 `vdszpW_*`、锚点 `[data-changed-files]` | `…/lib/client.js:1299-1328`、`1399` | 【实测读源码】 |
| 12 | 卡片 CSS 不在 web-frontend，是运行时注入 | `client.js:1302-1308`；`index-BNyAYEM7.css` 0 命中 | 【实测读源码】 |
| 13 | 组合里两个包都已挂载（无 config） | `dsh/node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml:349-358` | 【实测读源码】 |
| 14 | 本机 profile 把开关设为 `false` | `/Users/cenuon/.dsh/profiles/desktop/cordis.patch.yml:19-22` | 【实测读配置】 |
| 15 | 该 profile 正是桌面端在用的 | `ps aux` → `dsh-desktop-host … /Users/cenuon/.dsh/profiles/desktop` | 【实测读进程】 |
| 16 | 同一会话内 turn 10/11/15 无事件，且这些轮次没有 write/edit | `~/.dsh/sessions/--…~9ED8~8BA4~9879~76EE--/session-9997a909-…/session.v4.jsonl.zstd` | 【实测读日志】 |
| 17 | 用户截图文字「N 个文件已更改」在当前 bundle 中不存在 | 全 asar 扫描 `"个文件已更改"` → 0 命中 | 【实测读源码】 |
| 18 | `ui-settings.enabled=false` 会让卡片**完全**消失 | 由 #4+#5+#3 推导，未在运行时观测 | 【推测】 |
| 19 | 14:09 那次 `enabled: true → false` 的改动来自设置页开关或外部流程 | 会话事件流无对应 edit/write | 【推测】 |
| 20 | 截图那张卡就是本卡片 | 结构特征（计数 + `+A -B` + 行 + ⌄ 折叠）唯一匹配 | 【推测】 |
| 21 | `dbx/` 是工作区内的嵌套 git 仓库（自带 `.git`） | `ls -la /Users/cenuon/Documents/默认项目/dbx/`、`git status --porcelain dbx` → `?? dbx/` | 【实测读文件】 |
| 22 | 嵌套仓库在 `diff-tree --numstat` 里就是 `1  1  <name>`（= `+1 -1`） | `/tmp` 一次性沙盒仓库复现（见 §6.4），未触碰用户仓库 | 【实测读 git 行为】 |
| 23 | 嵌套仓库内部改动**不会**出现在卡上（按 gitlink 记录） | `dsh-workspace-changes/README.md` + `lib/index.js:856-860` 的 gitlink 过滤 | 【实测读源码】 |

## 8. 未能验证的部分（如实说明）

- **运行时 DOM 未能观测。** 桌面端渲染进程加载的是 `dsh-app://app`，未开 `--remote-debugging-port`；Web 入口 `http://127.0.0.1:53361` 需要鉴权 token，本会话拿不到（与 task-7 的结论一致）。因此第 18/19/20 条只能标【推测】。
- **`client` 平台的 Cordis Inspect provider 在本会话超时**（`Service.listService` 10s timeout），无法读取客户端实时状态。
- 文档中所有「代码片段」均逐字来自 asar 内 bundle，但**行号以本次提取的 0.2.1-rc.5 版本为准**，升级后可能漂移。
- **写入者身份未能确定**：§4.5 记录的 14:28:00 那次 `cordis.patch.yml` 整体替换，我无法确定是谁写的（见 §4.5 的复核证据）。

### 8.1 行号自检（机器校验）

本文引用的**全部 58 处行号**已用脚本逐条机器校验（读取真实文件对应行并断言包含预期片段），当前结果 **58/58 通过、0 处不符**。脚本：`.research-opencode-ui/verify-lines.mjs`（只读，可重跑）：

```bash
cd /Users/cenuon/Documents/默认项目/.research-opencode-ui && node verify-lines.mjs
```

Lead 复核后我更正了 5 处引用偏差（均为 off-by-one / 范围不准，已修正）：
- `dsh-client-ui-deliverables/lib/index.js` 的路由常量：`:3/:5/:7` → **`:4/:6/:8`**
- `dsh-client-ui-settings/lib/index.js`：`:1-15` → **`:1-20`**；`Config` 定义实为**第 10 行**
- `dsh-client-ui-deliverables/lib/client.js` 的 `workspace/changes` 两个分支：`:1176` → **`:1175`**，`:1195-1198` → **`:1194-1197`**
- `ui-settings.js` 的 `setEnabled`：`:1044` → **`:1059-1061`**

