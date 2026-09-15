# game-study —— 自适应学习（面板交互模式·DSH 版）

题目结构遵循 `schemas/quest.schema.json`（逐题主动回忆：题干/选项/答案/知识点/错因）；
题库示例：`examples/hft-microstructure.json`、`examples/securities-law.json`；
答题模板 `templates/quiz.html`。

## 投递（DSH 原生）

1. 逐题渲染 → `stage_panel`；答题选项用 `stage_choice`（回答 = 用户消息，无 wait）；
2. 一轮完成后用面板给掌握度小结，并 `stage_choice` 出「下一轮 / 复习错题 / 结束」。

## 说明（诚实标注）

原实现的**跨会话掌握度 / 错题本 / FSRS 调度持久化**属于独立服务层（`.localweb/study/`），
本模式暂不引入私有持久化——会话本身是真相。跨会话进度是后续可议的 feature（会话工具输出累积或独立存储服务），
本轮先承接题目内容、答题模板与出题规范。
