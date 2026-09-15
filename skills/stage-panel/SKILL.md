---
name: stage-panel
description: DSH 教学平面（板书面板）使用手册，随 @arcaneorion/dsh-teaching-board 插件发布：board id 与 op 语义、data-stage-region 替换约定、self-contained HTML 与 MathML 铁律、本地交互与 stage_choice 的分工、圈画与截图的往返纪律，以及选型 / 布局 / 视觉三份规范与五个素材库。
---

# 教学平面 · 使用手册

> 这份手册随 `@arcaneorion/dsh-teaching-board` 一起发布：**会话挂着这个插件，就能读到它**，不需要任何 preset 额外安装。
> 它讲的是**怎么用**；「能开板、能圈画、能截图」是插件本身的**能力**。

## 单一数据流

```text
会话  = 主上下文、唯一真相
面板  = 会话的投影：agent 生成 self-contained HTML → stage_panel → 隔离 iframe
本地  = 面板内交互（筛选 / tab / hover / 滑块 / 折叠）→ 只在面板里变，不打扰会话
回声  = 需要 agent 知道的事 → 真实用户消息（stage_choice 点选 / DSH 输入框 / 截图）
```

没有私有状态、没有 RPC、没有 wait 闸门：面板当前的样子 = 会话里最近一次 `stage_*` 调用的参数。

## 工具

| 工具 | 用途 | 必须记住的一点 |
|---|---|---|
| `stage_panel` | 写板书（HTML） | 同一个 `board` 的连续调用是**同一块板在演进**；换 `board` 才是换板 |
| `stage_status` | 状态条 + 上下文行 | 讲到哪、任务、阶段、等待态 |
| `stage_choice` | 发布方向选项 | 用户点选 = 一条真实用户消息；**发布后结束本轮**，不要 wait |
| `stage_snapshot` | 把当前画面（含圈画）截图发回 | 图在**下一轮**才看得到；每轮最多一次 |

## 板面身份：`board` 与 `op`

一块板 = 一个主题 / 一节课。`board` 用语义短名（`stats-se5`、`gradient-descent`），不要用序号。

| op | 语义 | 何时用 |
|---|---|---|
| `append`（默认） | 在板尾再写一段 | **默认选择**：接着讲、加一节、补一张表 |
| `open` | 开板，或整块重写 | 开新主题，或确实要推翻全部内容 |
| `set` | 替换一个区域 | 只更新某一块（例如"当前步骤"高亮） |
| `remove` | 擦掉一个区域 | 删掉已经讲完的临时块 |

**再讲一段时不要重发整块 HTML**：那会丢掉用户的圈画笔迹、把滚动位置顶回去，也白烧 token。用 `append`。

### 区域替换的约定

`set` / `remove` 靠 HTML 里的 `data-stage-region="名称"` 定位，所以**写第一版时就要预判哪些块以后会被单独替换**，给它们挂上这个属性：

```html
<section data-stage-region="当前步骤">…</section>
<section data-stage-region="练习">…</section>
```

没挂属性的内容只能靠 `open` 整块重写，而整块重写会清掉笔迹。**区域名从第一版就带上**，后面才改得动。

## 铁律：self-contained

面板运行在 `sandbox="allow-scripts"` 的隔离 iframe 里（没有 `allow-same-origin`），且按设计必须自带全部依赖：

- CSS / JS 全部内联；字体用系统字体栈，不要 web font。
- 图片用 `data:` URI；不要引用远程图片、CDN、外链样式表。
- **公式用 MathML**（浏览器原生，零依赖）。不要引 KaTeX / MathJax：它们要从外网加载脚本和字体，一失败就是空白公式。
- 交互脚本写在同一个文件的 `<script>` 里，数据写在同一个文件里；不要 `fetch()`。

## 交互分工

- **面板内本地交互**（筛选、tab、hover、滑块、折叠）：面板自己变就行，不进入会话，尽管加。
- **需要用户推进时**才用 `stage_choice`：下一步讲什么、要不要继续、选哪条路。发布后结束本轮——点选会以用户消息到达。
- **长文本输入**走 DSH 自己的输入框。不要在面板里复制"手动回传 / 发送到 CLI"卡片：那是旧原型的做法，现在唯一的回声通道是真实用户消息。
- 聊天区只留**推理与结论**，画面内容放面板；一轮只问一个决定。

## 圈画与截图

- 用户可以用面板工具栏圈画、擦除、撤销、清空。
- `stage_snapshot` 把当前画面（含笔迹）截图发回会话，作为**一条带图片的真实用户消息**。
- 所以：调用后**结束本轮**，下一轮才看得到图。不要在同一个回合里假装已经看过。
- 前提是用户此刻停在「教学平面」页签；没挂着就截不到，会返回失败原因——请用户切过去再试。
- 每轮最多一次，不要连发。

## 什么时候**不**开板

- 纯文本或一张小表格就能说清 → **纯文本就是正确答案**。板是放大器，不是入口。
- 选不出图型、或内容不值得可视化 → 不要为了"用上面板"而开板。
- 内容结构决定形式：证明推导、代码路径、协议时序、调试排查、错因复盘、密集图谱各有各的信息结构。**不要把任意内容塞进固定栏目的模板。**

## 规范：选型 → 布局 → 视觉

按这个顺序读，不要跳：

| 文件 | 管什么 |
|---|---|
| `references/diagram-selection.md` | 选型：信息类型 → 图型、Shannon 依据、生成前的声明格式 |
| `references/html-patterns.md` | 选型之后的 HTML 组织：不同任务类型的布局模式 |
| `references/visual-style.md` | 视觉语言：蓝灰控制台 / 硬描边 / 高对比（可选风格，不是强制） |

生成前用 1-3 行在会话里说明"信息类型 → 图型"，再开板。

## 素材库（按需取用，不是五个必须套的模式）

| 素材 | 内容 | 用得上时 |
|---|---|---|
| `submode/code/` | lesson schema（starter / snippets / exercises / annotations / hints）+ lab.html + 7 个真实课程示例 | 代码展示与讲解 |
| `submode/learn/` | lesson schema（概念卡 / 结构 / 例子 / 问题）+ lesson.html + epsilon-delta 范例 | 结构化讲解 |
| `submode/game-study/` | quest schema（主动回忆 / 干扰项 / 错因）+ quiz.html + 两个真题库 | 出题与答题面板 |
| `submode/quant/` | 因子回测 dashboard.html + 数据导出脚本 | 回测结果呈现 |
| `submode/ml/` | 交互式数值可视化 gd.html + gd.json | 训练 / 优化过程演示 |

它们是**起点素材**：可以借用布局与 schema，但内容结构说了算——不要为了套模板生成空 section 或不贴合内容的控件。
