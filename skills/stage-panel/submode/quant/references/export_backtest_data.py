"""
回测数据导出脚本 — Quant Panel 参考实现
------------------------------------
将此脚本复制到你的量化项目中，适配你的因子计算和回测引擎。
输出 JSON 文件供 `localweb quant` 命令使用。

Schema 要求见 localweb/quant/SKILL.md
"""

import json
import numpy as np
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "output"


class NpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, pd.Timestamp):
            return obj.isoformat()
        return super().default(obj)


def long_short_metrics(long_short: "pd.Series") -> dict:
    """多空绩效：年化夏普、胜率、最大回撤、累计收益"""
    import pandas as pd
    ls = long_short.dropna()
    if len(ls) == 0:
        return {"sharpe_annual": 0, "win_rate": 0, "max_drawdown": 0, "total_return": 0}
    monthly_mean = float(ls.mean())
    monthly_std = float(ls.std())
    sharpe = float(monthly_mean / monthly_std * np.sqrt(12)) if monthly_std else 0
    win_rate = float((ls > 0).mean())
    cum = (1 + ls).cumprod()
    peak = cum.cummax()
    dd = (cum - peak) / peak
    max_dd = float(dd.min()) if len(dd) else 0
    total_ret = float(cum.iloc[-1] - 1) if len(cum) else 0
    return {
        "sharpe_annual": round(sharpe, 3),
        "win_rate": round(win_rate, 4),
        "max_drawdown": round(max_dd, 4),
        "total_return": round(total_ret, 4),
    }


def factor_distribution(factor_df: "pd.DataFrame") -> dict:
    """因子值分布统计"""
    import pandas as pd
    df = factor_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    latest_date = df["date"].max()
    latest = df[df["date"] == latest_date].dropna(subset=["factor_value"])
    if len(latest) < 20:
        return {"histogram": [], "stats": {}, "date": str(latest_date.date())}
    vals = latest["factor_value"].dropna()
    counts, bins = np.histogram(vals, bins=20)
    histogram = [
        {"bin_start": round(float(bins[i]), 4), "bin_end": round(float(bins[i + 1]), 4), "count": int(c)}
        for i, c in enumerate(counts)
    ]
    stats = {
        "mean": round(float(vals.mean()), 4),
        "std": round(float(vals.std()), 4),
        "min": round(float(vals.min()), 4),
        "p25": round(float(vals.quantile(0.25)), 4),
        "p50": round(float(vals.quantile(0.50)), 4),
        "p75": round(float(vals.quantile(0.75)), 4),
        "max": round(float(vals.max()), 4),
        "skew": round(float(vals.skew()), 3),
        "n_stocks": int(len(vals)),
    }
    return {"histogram": histogram, "stats": stats, "date": str(latest_date.date())}


def cross_section_detail(merged: "pd.DataFrame") -> dict:
    """每组 Top 10 股票明细"""
    import pandas as pd
    df = merged.copy()
    df["date"] = pd.to_datetime(df["date"])
    latest_date = df["date"].max()
    latest = df[df["date"] == latest_date].copy()
    if len(latest) < 20:
        return {"groups": {}, "date": str(latest_date.date())}
    latest["quantile"] = pd.qcut(
        latest["factor_value"].rank(method="first"),
        q=5, labels=False, duplicates="drop",
    )
    groups = {}
    for q in sorted(latest["quantile"].unique()):
        sub = latest[latest["quantile"] == q].sort_values("factor_value", ascending=(q == 0))
        stocks = []
        for _, row in sub.head(10).iterrows():
            stocks.append({
                "symbol": str(row["symbol"]),
                "factor_value": round(float(row["factor_value"]), 4),
                "forward_return": round(float(row["forward_return"]), 4),
            })
        all_grp = latest[latest["quantile"] == q]
        groups[f"G{int(q)}"] = {
            "count": int(len(all_grp)),
            "factor_mean": round(float(all_grp["factor_value"].mean()), 4),
            "factor_std": round(float(all_grp["factor_value"].std()), 4),
            "forward_mean": round(float(all_grp["forward_return"].mean()), 4),
            "top10": stocks,
        }
    return {"groups": groups, "date": str(latest_date.date())}


def export_one(name: str, label: str, factor_df, backtest_result) -> dict:
    """
    组装单个因子的完整回测数据。
    
    参数:
      name: 因子键名 (如 "momentum")
      label: 因子显示名 (如 "动量(12-1月)")
      factor_df: 因子 DataFrame [date, symbol, factor_value]
      backtest_result: run_backtest() 返回的 dict
    
    返回: 符合 Quant Panel Schema 的 dict
    """
    ic_series = backtest_result["ic_series"]
    cum_returns = backtest_result["cum_returns"]
    long_short = backtest_result["long_short"]
    gr = backtest_result["group_returns"]
    merged = backtest_result["merged_data"]

    return {
        "label": label,
        "ic_summary": {
            k: (float(v) if isinstance(v, (np.floating, float)) else v)
            for k, v in backtest_result["ic_summary"].items()
        },
        "ic_series": [
            {"date": str(d.date()), "ic": float(v)}
            for d, v in ic_series.items()
        ],
        "cum_returns": {
            f"G{int(q)}": [
                {"date": str(d.date()), "cum_return": float(v)}
                for d, v in s.items()
            ]
            for q, s in sorted(cum_returns.items())
        },
        "long_short": [
            {"date": str(d.date()), "return": float(v)}
            for d, v in long_short.items()
        ],
        "long_short_metrics": long_short_metrics(long_short),
        "group_avg_return": {
            f"G{int(q)}": round(float(gr[gr["group"] == q]["return"].mean()), 6)
            for q in sorted(gr["group"].unique())
        },
        "factor_distribution": factor_distribution(factor_df),
        "cross_section": cross_section_detail(merged),
    }


# ============================================================
# 使用示例 (根据你的项目修改)
# ============================================================
if __name__ == "__main__":
    import pandas as pd
    # 替换为你的因子注册表和回测引擎导入
    # from factors import FACTOR_REGISTRY, calc_factor
    # from backtest_factor.engine import run_backtest

    # 示例:
    # data = {}
    # for name, (label, func) in FACTOR_REGISTRY.items():
    #     try:
    #         factor_df = calc_factor(name)
    #         result = run_backtest(factor_df, factor_name=label)
    #         data[name] = export_one(name, label, factor_df, result)
    #     except Exception as e:
    #         data[name] = {"label": label, "error": str(e)}
    #
    # OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    # out_path = OUTPUT_DIR / "backtest_data.json"
    # with open(out_path, "w", encoding="utf-8") as f:
    #     json.dump(data, f, ensure_ascii=False, indent=2, cls=NpEncoder)
    # print(f"导出完成: {out_path}")
    
    print("参考模板 — 请复制到你的项目并修改导入路径和因子注册表。")
