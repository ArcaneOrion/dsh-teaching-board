# quant —— 因子回测仪表盘（面板交互模式·DSH 版）

模板 `templates/dashboard.html`（因子指标/净值/回撤仪表盘）；
因子数据导出辅助脚本 `references/export_backtest_data.py`（用 `nix shell nixpkgs#python311 -c python3 ...` 运行）。

## 投递（DSH 原生）

1. 回测结果整理成 self-contained dashboard HTML → `stage_panel`；
2. 需要下钻/切换因子等动作 → `stage_choice`（点选 = 用户消息）。
