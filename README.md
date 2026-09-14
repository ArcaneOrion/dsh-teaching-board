# @arcaneorion/dsh-teaching-board

DSH 会话内的**教学平面**：把 agent 生成的 self-contained HTML 投影成可讲解的板书界面，
并让使用者直接在板面上**圈画**、把画面**截图**发回对话。

**单一数据流**：面板 = 会话快照的投影，无私有状态、无 RPC、无 wait 闸门。
用户的每一次推进（点选、发图）都是**真实用户消息**。

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
