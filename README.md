# @arcaneorion/dsh-stage-panel

DSH 会话内「面板」视图：把 agent 生成的 self-contained HTML 投影为会话的可视化界面（沙箱 iframe），
交互视情况转为真实用户消息。**单一数据流**：面板 = 会话快照的投影，无私有状态/RPC/wait 闸门。

## 文件

| 文件 | 说明 |
|---|---|
| `src/index.js` | host 半：`stage_panel / stage_status / stage_choice` 三个无状态工具（`ctx.tools.register(defineTool(...))`） |
| `src/client.js` | client 半：「面板」视图（`__ModuleLoader__` handoff + `useSession` 快照投影 + `inputActions` 交互） |
| `package.json` / `cordis.patch.yml` | bundle 声明（行 id `stage-panel`），已挂载进 `web` profile 并通过 `dsh plugin --profile web install` 链接 |
| `PROTOTYPE-host.js` / `PROTOTYPE-client.js` | 早期动态原型（`lwst-2`）存档，仅供历史参考 |

## 分层

- **能力层（本 bundle，profile 级）**：投影 + 轻交互。
- **行为层（preset `arcane-stage-panel`）**：「面板交互模式」人格、内容规范（图型选择/HTML 模式/视觉风格）、教学纪律。

> 静态化踩坑（boot 解析 / host 需 JS 源 / ModuleLoader handoff / 空配置分支）详见 `../README.md` §4。

## 加载/验证

```bash
dsh plugin --profile web install        # 补 link symlink（改了包源后必须重跑）
# 重启 dsh --profile web 后：
# 视图槽位 occupancy 出现 id=stage-panel；工具目录出现 stage_*
```
