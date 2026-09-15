# @arcaneorion/dsh-teaching-board

DSH 会话内的**教学平面**：把 agent 生成的 self-contained HTML 投影成可讲解的板书界面，
并让使用者直接在板面上**圈画**、把画面**截图**发回对话。

**单一数据流**：面板 = 会话快照的投影，无私有状态、无 RPC、无 wait 闸门。
用户的每一次推进（点选、发图）都是**真实用户消息**。

## 安装

```bash
dsh plugin --profile web add @arcaneorion/dsh-teaching-board
# 然后重启 dsh --profile web 并刷新页面
```

它是一个 **profile 级 bundle**：装一次，这个进程里所有会话都拿得到 `stage_*` 工具与「教学平面」页签。
（`dsh plugin add` 会把依赖与 bundles 条目一起写进该 profile 的 manifest。）

> **发布状态**：截至 2026-09-15，新名 `@arcaneorion/dsh-teaching-board` **尚未发布到 npm**（registry 404），
> 上面这条命令要等发布后才可用；在此之前请走本地 `link:` 挂载。
> 线上仍在的是改名前的 `@arcaneorion/dsh-stage-panel@0.1.0`——老名字别再用，它对应本仓早期 192 行的版本，
> 与当前 0.4.0 不是一回事，装它只会拿到残缺面板。

## 兼容性（DSH 版本）

本包在 **DSH `0.1.1-rc.2`**（`dsh --version`）上开发与实测，宿主侧依赖按该版本**精确钉住**：

| 宿主包 | 声明 | 用途 |
|---|---|---|
| `@deepseek-ai/dsh-tools` | `>=0.1.1-rc.2` | `defineTool` 注册 `stage_*` 四个工具 |
| `@deepseek-ai/dsh-client-ui-conversation` | `0.1.1-rc.2` | `conversation.view` 座位（视图 id `stage-panel`，order 40） |
| `@deepseek-ai/cordis` | `^4.0.2` | 插件生命周期 |
| `react` | `^18.3.1` | client 半 `require('react')` |

**换 DSH 版本（例如 `0.1.2-rc.1`）必须先重新验证、再放宽 peer**：座位契约与会话快照结构跨版本会变，
精确钉住的 peer 会在安装时报冲突，好过装上去静默失效。

## 能力

| 能力 | 实现位置 | 说明 |
|---|---|---|
| 板书展示 | client | 面板 HTML 在 `sandbox="allow-scripts"` 的 iframe 里渲染（无同源、无外网） |
| 手写勾画 | **iframe 内部**（注入 runtime） | 画笔/橡皮、4 色、粗细、撤销、清空；默认不拦截指针事件，切到画笔才接管 |
| 内置截图 | **iframe 内部**（注入 runtime） | 克隆自身文档 → canvas 换位图 → `XMLSerializer` → `<svg><foreignObject>` → PNG，零依赖零外网 |
| 截图交给 agent | client（父层） | PNG → `conversation.createDraftImages` → `inputActions.addImages` → 草稿图片 |
| agent 主动截图 | host 工具 + client 监听 | `stage_snapshot` 工具 → client 从快照看到调用 → 拍图 → 作为用户消息提交 |
| 状态条 / 方向选择 | host 工具 | `stage_status` / `stage_choice` |

## 架构：两条硬约束

1. **面板 iframe 是 `sandbox="allow-scripts"`（无 `allow-same-origin`）**
   → 父页面永远读不到面板内部 DOM，也截不了它的图。
   所以勾画与光栅化都必须在 iframe 内部完成：client 半把一段 runtime **注入**进面板 HTML
   （`injectRuntime`），父层只通过 `postMessage` 下命令、收结果。
   好处是笔迹与板书同坐标系：面板内滚动不会让笔迹错位，截图也天然包含笔迹。

2. **静态 bundle 无法注册自定义 Remote，宿主拿不到浏览器里的像素**
   → 截图**不可能**出现在工具结果里。它走产品既有的用户输入通道回来：
   client 把 PNG 放进输入草稿，agent 主动请求时再替用户提交——
   图片作为一条真实用户消息进入会话，模型下一轮就能看见（与 `stage_choice` 同机制）。

## 文件

| 文件 | 说明 |
|---|---|
| `src/index.js` | host 半：`stage_panel / stage_status / stage_choice / stage_snapshot` 四个无状态工具 |
| `src/client.js` | client 半：「教学平面」视图（工具栏 + 注入 runtime + 截图交付 + agent 请求监听） |
| `package.json` / `cordis.patch.yml` | bundle 声明（行 id `teaching-board`），挂载进 `web` profile |
| `PROTOTYPE-*.js` | 早期动态原型（`lwst-2`）存档，仅供历史参考 |

## 分层

- **能力层（本 bundle，profile 级）**：投影 + 勾画 + 截图 + 工具。
- **行为层（preset `arcane-stage-panel`）**：教学模式纪律、内容规范（图型/HTML 模式/视觉风格）。

## 板面模型：一块板 = 一个主题

`stage_panel` 不是「一次调用画一张图」，而是**一块板可以被写很多次**——像上课时的黑板：老师写、擦一角、再写，学生上台补几笔，板本身不换。

| 参数 | 作用 |
|---|---|
| `board` | 板面 id。同一 id 的连续调用 = **同一块板的演进**；换 id 才是换新板（新主题）。省略 = 一次性整块替换，不保留笔迹 |
| `op` | `open`（开板/整块重写）/ `append`（默认，在板尾再写一段）/ `set`（替换 `data-stage-region="名称"` 的区域）/ `remove`（擦掉该区域） |
| `region` | `set`/`remove` 的目标区域名 |

**折叠而非存储**：客户端的板 = 会话日志里同一 `board` id 的那串调用按顺序折叠出来的（`composeBoard`）。没有客户端私有状态，板面内容仍然只是快照的函数——和这套设计的单一数据流一致。`set`/`remove` 用父页面自己的 `DOMParser` 定位区域再序列化，不触碰沙箱里的文档。

**为什么必须这样**：整块重发有三个代价——把学生的笔迹冲掉、把滚动位置顶回顶部、白烧 token（一块 8KB 的板写十次 = 80KB 输出）。`append` 让「再写一段」的成本与「老师在板上再写一行」相当。

**增量而不是重载**：面板是沙箱 iframe，父页面碰不到它的 DOM，所以「换 `srcdoc`」= 整块文档重建：JS 状态、滚动、动画、展开状态全部归零。因此只有三种情况才真的重装——**首次挂载、换 `board`、`op:"open"`**（外加切走页签再切回来这种客户端重挂）。其余 `append`/`set`/`remove` 由父层 `postMessage {cmd:'patch'}` 交给 runtime **原地打进活着的文档**：不重载 → 板内交互状态、滚动位置、动画、笔迹全都不受影响。

**一笔带过的限制**：增量块用 `innerHTML` 插入，所以**块内的 `<script>` 不会执行**——交互逻辑写在 `op:"open"` 那一次里；静态排版、MathML、内联 `onclick` 属性都正常。切走页签再回来会整块重装，那时脚本照常跑。

**画笔与点击共存**：画笔模式下，`pointerdown` 会先做一次 `elementFromPoint` 命中测试，落点是 `a[href]/button/input/select/textarea/label/summary/[role=button]/[onclick]/[contenteditable]` 就把这次点击**转发给控件**、不落笔。所以「偶尔画、偶尔点」不需要来回切模式；唯一代价是控件正上方那几个像素画不了线（要先退出画笔）。

**保留与边界**：
- 笔迹按 `board` id 存在客户端，板面更新后由父层重新注入（`cmd:'load'`）；滚动位置同理。
- 笔迹是**视口坐标**：`append` 只往板尾加内容、已有内容不动，所以笔迹对得上；若演进时上半部分重排，旧笔迹会错位——规范是「接着写」时保持板上半部分稳定。
- 笔迹存在每个客户端自己那里：同一会话开了两个浏览器，两边各画各的，不互相同步。
- 第一块（`op:"open"`）决定整块板的样式：后续片段共享它的 CSS，所以视觉规范要写在开板那一次里。

## 已知边界

- **截图需要面板处于挂载状态**：`conversation.view` 是「一次只渲染一个」的页签环，
  用户切到「对话/轨迹」时面板卸载，`stage_snapshot` 就拍不到图（页签没挂载）。
  （下一步可加一个常驻的离屏截图宿主，挂在对话视图的常驻槽位上。）
- 外链字体/图片不会进截图，也不会渲染（面板规范要求 self-contained）。
- 截图为**视口**画面（所见即所得），不是整页长图。
- 单图超过约 1.2 MB 时自动退化为 JPEG / 等比缩小（模型单图预算）。

## 加载/验证

```bash
dsh plugin --profile web install        # 补 link symlink（改包源后必须重跑）
# 重启 dsh --profile web 后：
# 视图槽位 occupancy 出现 id=teaching-board；工具目录出现 stage_*
```

> 静态 bundle 改动**需要重启 dsh 进程并刷新页面**，与动态 Cordis 插件的热更新不同。
> 其它静态化踩坑（boot 解析 / host 需 JS 源 / ModuleLoader handoff / 空配置分支）详见 `../README.md` §4。
