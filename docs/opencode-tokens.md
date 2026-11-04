# opencode console — 设计 token 参考（实测提取）

来源：<https://opencode.ai/console/wrk_01KPMAVERCZH6HVMGDS878CJ35/settings>
提取方式：浏览器 `getComputedStyle` + 样式表规则读取，2026-11-04。
截图：`opencode/view.png`（浅色设置页）、`opencode/full.png`（整页）。

## 1. 颜色（浅色 / 深色）

opencode 用 `--v2-*` 变量，`:root` 为浅色，`:root[data-color-scheme="dark"]` 为深色。

| 语义 | opencode 变量 | 浅色 | 深色 | 用途 |
|---|---|---|---|---|
| 页面底 | `--v2-background-bg-deep` | `#fafafa` | `#080808` | 最外层 app 背景 |
| 基准面 | `--v2-background-bg-base` | `#fff` | `#161616` | 主内容面 |
| 一级层 | `--v2-background-bg-layer-01` | `#fafafa` | `#242424` | 卡片面 |
| 二级层 | `--v2-background-bg-layer-02` | `#f2f2f2` | `#2e2e2e` | 嵌套面 |
| 主文字 | `--v2-text-text-base` | `#161616` | `#fafafa` | 标题、正文 |
| 次文字 | `--v2-text-text-muted` | `#5c5c5c` | `#aeaeae` | 说明文字 |
| 弱文字 | `--v2-text-text-faint` | `gray` | `gray` | 未激活 tab |
| 强调 | `--v2-text-text-accent` | `#3b5cf6` | `#a2bcff` | 链接、主按钮 |
| 强调 hover | `--v2-text-text-accent-hover` | `#3250df` | `#c3d4fd` | |
| 边框 | `--v2-border-border-base` | `#0000001a` | `#ffffff1a` | |
| 弱边框 | `--v2-border-border-muted` | `#00000014` | `#ffffff14` | **卡片边框用这个** |
| 强边框 | `--v2-border-border-strong` | `#0003` | `#fff3` | 顶栏竖分隔线 |
| 反色 | `--v2-border-border-inverse` | `#242424` | `#fafafa` | **激活 tab 下划线** |
| 导航 hover | `--console-nav-hover` | `#0000001a`(alpha-light-10) | 同 | 顶栏按钮 hover |
| 成功 | `--v2-state-fg-success` | `#198b43` | `#6bd586` | |
| 警告 | `--v2-state-fg-warning` | `#cb9f34` | `#f2cf76` | |
| 危险 | `--v2-state-fg-danger` | `#b82d35` | `#f17471` | |

**激活导航项背景** = `rgba(0,0,0,.08)`（浅色）。深色下对应 `--v2-alpha-light-8` = `#ffffff14`。

## 2. 字体

```
font-family: Inter, sans-serif
body:       font-size 13px; font-weight 440; line-height 16.25px; letter-spacing -0.04px
行内正文:   font-size 13px; font-weight 440; line-height 20px;    letter-spacing -0.04px
标题/强调:  font-weight 530
未激活 tab: color rgb(128,128,128)
```

opencode 实际加载 Inter 可变字体（weight 100–900）。

## 3. 形状与间距

| 项 | 值 |
|---|---|
| 圆角 | `6px`（`rounded-md`）——卡片、导航项、按钮统一 |
| 卡片边框 | `0.5px solid rgba(0,0,0,.08)`（**半像素**，不是 1px） |
| 卡片内边距 | `20px` |
| 卡片行 | `display:flex; justify-content:space-between; gap:24px; padding:20px 0`；首行 `padding-top:0`，末行 `padding-bottom:0` |
| 行分隔线 | `divide-y-[0.5px]`，颜色同卡片边框 |
| 区块间距 | `margin-bottom: 32px`（`mb-8`） |

## 4. 布局结构

```
┌─ app 外壳：display:flex; flex-direction:column; height:100dvh;
│            background:#fafafa; padding:0 8px 8px   ─────────────────────┐
│ ┌─ 顶栏 nav：position:sticky; top:0; z-index:20; padding:8px 0 ───────┐ │
│ │  [logo 22px]  │竖线 #0003 h-12px mx-4│  [头像 C] 工作区名 ⌄         │ │
│ │  内层 div: display:flex; height:28px; align-items:center; gap:4px; px:8px│
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ┌─ tab 条：display:flex; height:48px; align-items:center; gap:2px; px:5px│
│ │  Activity  Go  Models  Providers  Controls  [Settings]                │ │
│ │  ▲ 激活项：font-weight 530, color #161616                            │ │
│ │    未激活：color gray                                                 │ │
│ │  ▲ 下划线：绝对定位 1px 高，背景 #242424，origin-left，                │ │
│ │    transition transform 220ms cubic-bezier(.77,0,.175,1)，            │ │
│ │    translateX + scaleX 贴合激活项宽度                                  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ┌─ 内容区（设置页）：三段式 ───────────────────────────────────────────┐ │
│ │   [ 空白 ]      [ 左导航 180px ]      [ 内容 640px ]                 │ │
│ │                  ┌ Search ─────┐      General                        │ │
│ │                  │ ⚙ General   │◄激活  Set up your workspace…       │ │
│ │                  │ 👥 Members  │      说明文字 #5c5c5c 13px/440     │ │
│ │                  │ 🔑 Service… │                                     │ │
│ │                  │ 📄 Billing  │      Details        ← 区块标题      │ │
│ │                  │ 🛡 Security │      ┌──────────────────────┐      │ │
│ │                  │ 🔒 Privacy  │      │ Name          [值]   │      │ │
│ │                  └─────────────┘      │ 说明文字             │      │ │
│ │                  ─────────────        ├─ 0.5px 分隔 ────────┤      │ │
│ │                  👤 Personal account →│ Avatar       [Add]   │      │ │
│ │                                       └──────────────────────┘      │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

左导航项实测：`height:28px; display:flex; align-items:center; gap:8px;
border-radius:6px; padding:0 6px; font-size:13px; font-weight:440`；
列表 `display:flex; flex-direction:column; gap:4px`。
激活项背景 `rgba(0,0,0,.08)`，图标 16px 线性描边。

区块标题（如 "General"、"Details"、"Features"）：`font-size:13px; font-weight:530; line-height:20px`。

## 5. 交互与动效

- tab 下划线滑动：`transform 220ms cubic-bezier(0.77, 0, 0.175, 1)`
- 颜色过渡：`background-color 85ms ease-out, color 85ms ease-out`
- hover：文字从 faint(`gray`) → base(`#161616`)，背景 → `#0000001a`
- 全部动效在 `prefers-reduced-motion: reduce` 下关闭（opencode 用 `motion-reduce:` 变体）

## 6. 视觉语气总结

- 极简、文档式：白/近白底 + 0.5px 发丝边框，**没有阴影**（实测 `box-shadow: none`）
- 统一 6px 圆角，绝不用大圆角或胶囊
- 13px 小字号 + 负字距，信息密度高但留白充足（20px 行内边距）
- 层级靠**字重（440 / 530）和灰度**拉开，不靠颜色和阴影
- 唯一的彩色是强调蓝 `#3b5cf6` 和状态色，且都只用于文字
- 深色模式是真正的深灰阶（`#080808`/`#161616`/`#242424`），不是纯黑
