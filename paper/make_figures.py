"""Paper figures, drawn from results/summary.json.

Copyright (C) 2026 Vivek Mitra. Licensed under the GNU Affero General Public License v3.0.
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import PercentFormatter

HERE = Path(__file__).parent
NAVY, AMBER, GREEN, GREY = "#1f4e8c", "#d97a1e", "#2f7d50", "#5a6472"


def save(fig, ax, name):
    ax.spines[["top", "right"]].set_visible(False)
    ax.tick_params(labelsize=8)
    ax.legend(fontsize=7, frameon=False)
    fig.tight_layout()
    fig.savefig(HERE / "figures" / name)
    plt.close(fig)


def main():
    s = json.loads((HERE.parent / "results" / "summary.json").read_text(encoding="utf-8"))
    a = s["summary"]["all"]
    (HERE / "figures").mkdir(exist_ok=True)

    # Figure 1: error of the total reserve
    fig, ax = plt.subplots(figsize=(6.2, 2.8), dpi=200)
    edges = np.array(s["err_edges"])
    for k, col, label in [("cl", NAVY, "Chain-ladder on paid"), ("cl_inc", GREEN, "Chain-ladder on reported incurred")]:
        ax.stairs(np.array(a["err_hist"][k]) / a["n"], edges, color=col, lw=1.6, label=label)
    ax.axvline(0, color=GREY, lw=1)
    ax.set_xlabel("(estimate - actual) / actual, clipped to [-100%, +200%]", fontsize=8)
    ax.set_ylabel("Share of companies", fontsize=8)
    ax.xaxis.set_major_formatter(PercentFormatter(1, decimals=0))
    ax.yaxis.set_major_formatter(PercentFormatter(1, decimals=0))
    save(fig, ax, "fig1_errors.png")

    # Figure 2: where the truth landed in each predictive distribution
    fig, ax = plt.subplots(figsize=(6.2, 2.8), dpi=200)
    x = np.arange(10)
    ax.bar(x - 0.2, np.array(a["pit_hist"]["odp"]) / a["n"], 0.4, color=NAVY, label="ODP bootstrap")
    ax.bar(x + 0.2, np.array(a["pit_hist"]["mack"]) / a["n"], 0.4, color=AMBER, label="Mack (lognormal)")
    ax.axhline(0.1, color=GREY, ls="--", lw=1, label="Calibrated: 10% in each")
    ax.set_xticks(x, [f"{10 * k}-{10 * k + 10}" for k in x], fontsize=7)
    ax.set_xlabel("Percentile of the predicted range at which the real outcome fell", fontsize=8)
    ax.set_ylabel("Share of companies", fontsize=8)
    ax.yaxis.set_major_formatter(PercentFormatter(1, decimals=0))
    save(fig, ax, "fig2_pit.png")

    # Figure 3: 90% coverage by line with Wilson intervals
    order = ["all", *s["lines"]]
    fig, ax = plt.subplots(figsize=(6.2, 2.9), dpi=200)
    y = np.arange(len(order))
    for off, key, col, label in [(-0.17, "mack_90", AMBER, "Mack P5-P95"), (0.17, "odp_90", NAVY, "ODP bootstrap P5-P95")]:
        c = [s["summary"][ln]["coverage"][key] for ln in order]
        rate = np.array([v["rate"] for v in c])
        err = [rate - [v["ci"][0] for v in c], [v["ci"][1] for v in c] - rate]
        ax.errorbar(rate, y + off, xerr=err, fmt="o", color=col, ms=4, capsize=2, lw=1, label=label)
    ax.axvline(0.9, color=GREY, ls="--", lw=1)
    names = {"all": "All lines", **s["lines"]}
    ax.set_yticks(y, [f"{names[ln]} (n={s['summary'][ln]['n']})" for ln in order], fontsize=7)
    ax.invert_yaxis()
    ax.set_xlim(0, 1)
    ax.xaxis.set_major_formatter(PercentFormatter(1, decimals=0))
    ax.set_xlabel("Share of real outcomes inside the 90% range (with 95% Wilson interval)", fontsize=8)
    save(fig, ax, "fig3_coverage.png")


if __name__ == "__main__":
    main()
