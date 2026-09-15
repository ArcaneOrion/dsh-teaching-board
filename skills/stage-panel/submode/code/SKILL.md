# code —— 代码展示与讲解（面板交互模式·DSH 版）

内容组织遵循 `schemas/lesson.schema.json`（starter / snippets / exercises / annotations / hints）；
示例见 `examples/*.json`；纯展示面板起点模板 `templates/lab.html`（语法高亮 + 讲解通道）。

## 投递（DSH 原生）

1. 按 lesson schema 组织好一课的素材；
2. 渲染为 self-contained HTML（可套 lab.html 的布局与讲解通道，不套死）；
3. `stage_panel`（title=课程名）投影；文字回复只留推理摘要与讲解结论；
4. 需要学习者推进（看下一步 / 做练习 / 换例子）→ `stage_choice`；点选/作答 = 用户消息，无 wait。

## 纪律

- 编程主战场仍是编辑器：本子模式只把代码作为讲解素材展示，不编辑、不编译、不在浏览器执行。
- 讲解回合对 panel 内回传的消息正常继续即可。
- `references/host-toolchains.md` 只在涉及宿主工具链（编译/运行路径）时查阅。
