# learn —— 结构化学习面板（面板交互模式·DSH 版）

lesson 结构遵循 `schemas/lesson.schema.json`（concept cards / structure / examples / questions）；
示例：`examples/template-showcase.json`（结构示范）、`examples/epsilon-delta.json`（主题示范）；
模板 `templates/lesson.html` 是参考起点，**不套死：内容结构决定布局**。

## 投递（DSH 原生）

1. 把 lesson 渲染成 self-contained HTML → `stage_panel`；
2. 含 questions 时逐题展示，需要作答/选择 → `stage_choice`（回答以用户消息到达，由会话判定对错与下一步），无 wait 闸门；
3. 教学判断、错因审计、下一步选择均由会话负责——面板只是呈现面。

## 纪律

- 面板内的概念卡/结构图尽量本地交互（hover/tab/折叠），需要用户推进再 `stage_choice`。
- 纯讲解一轮不需要任何回传，`stage_panel` 后正常结束即可。
