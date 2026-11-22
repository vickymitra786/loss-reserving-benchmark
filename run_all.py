"""Rebuild every reserving number on vivekmitra.com and in the paper.

Copyright (C) 2026 Vivek Mitra. Licensed under the GNU Affero General Public License v3.0.

    python run_all.py

For each company that passes the selection rule, fit on the cells known at the
end of 1997, then score against what was really paid by development year 10:
  * chain-ladder on paid and on reported incurred losses (point estimates)
  * Mack's standard error with a lognormal range, and the ODP bootstrap range
Writes results/, the website data files and the paper figures.
"""
import json
import platform
import time
from pathlib import Path

import numpy as np
import pandas as pd

import reserving as r

LINES = {"ppauto": "Private passenger auto", "wkcomp": "Workers' compensation",
         "comauto": "Commercial auto", "othliab": "Other liability",
         "medmal": "Medical malpractice", "prodliab": "Product liability"}
SIMS = 4000
Q = [0.05, 0.10, 0.50, 0.90, 0.95]                      # quantiles kept for each range
ERR_EDGES = np.round(np.arange(-1.0, 2.01, 0.1), 2)    # error histogram: -100% .. +200%
HERE = Path(__file__).parent
SITE = HERE.parent.parent / "site" / "data"


def wilson(k, n):
    """95% Wilson interval for a proportion k / n."""
    p, z = k / n, 1.96
    mid = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [mid - half, mid + half]


def median_ci(x, seed=0):
    """95% bootstrap interval for the median."""
    rng = np.random.default_rng(seed)
    meds = [np.median(rng.choice(x, len(x))) for _ in range(2000)]
    return list(np.quantile(meds, [0.025, 0.975]))


def paired_diff_ci(a, b, seed=0):
    """95% bootstrap interval for median(a) - median(b), resampling the same companies for both."""
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(a), (2000, len(a)))
    return list(np.quantile(np.median(a[idx], 1) - np.median(b[idx], 1), [0.025, 0.975]))


def summarise(d):
    act = d.actual.to_numpy()
    out = {"n": len(d), "actual_total": act.sum(), "errors": {}, "coverage": {}, "err_hist": {}, "pit_hist": {}}
    for k in ["cl", "cl_inc"]:
        e = (d[k].to_numpy() - act) / act
        out["errors"][k] = {"median_abs": np.median(abs(e)), "median_abs_ci": median_ci(abs(e)),
                            "median": np.median(e), "within_25": np.mean(abs(e) <= 0.25),
                            "over": np.mean(e > 0), "aggregate": d[k].sum() / act.sum() - 1}
        out["err_hist"][k] = np.histogram(np.clip(e, -1, 1.999), ERR_EDGES)[0].tolist()
    abs_err = {k: abs(d[k].to_numpy() / act - 1) for k in ["cl", "cl_inc"]}
    out["incurred_minus_paid_median_abs"] = {
        "diff": np.median(abs_err["cl_inc"]) - np.median(abs_err["cl"]),
        "ci": paired_diff_ci(abs_err["cl_inc"], abs_err["cl"])}
    for m in ["mack", "odp"]:
        for lo, hi, name in [("q10", "q90", "80"), ("q05", "q95", "90")]:
            below, above = act < d[f"{m}_{lo}"], act > d[f"{m}_{hi}"]
            inside = int(len(d) - below.sum() - above.sum())
            out["coverage"][f"{m}_{name}"] = {"nominal": int(name) / 100, "inside": inside,
                                              "rate": inside / len(d), "ci": wilson(inside, len(d)),
                                              "below": int(below.sum()), "above": int(above.sum())}
        out["pit_hist"][m] = np.histogram(d[f"pit_{m}"], np.linspace(0, 1, 11))[0].tolist()
        out.setdefault("width_90", {})[m] = np.median((d[f"{m}_q95"] - d[f"{m}_q05"]) / d.cl)   # P5-P95 width / reserve
    return out


def main():
    t0 = time.time()
    rows, dropped, site = [], [], {}
    for ln in LINES:
        companies = r.load_line(HERE / "data" / f"{ln}_pos.csv")
        site[ln] = []
        for c in companies:
            why = r.reason_to_drop(c)
            if why:
                dropped.append({"line": ln, "code": c["code"], "name": c["name"], "reason": why})
                continue
            paid = c["paid"]
            to_date = r.latest(paid).sum()
            actual = paid[:, -1].sum() - to_date
            full, cl, se = r.mack(paid)
            inc_full, _ = r.chain_ladder(c["incurred"])
            cl_inc = inc_full[:, -1].sum() - to_date
            sims = r.odp_bootstrap(paid, SIMS, seed=c["code"])
            dist = r.lognormal(cl, se)
            mack_q, odp_q = dist.ppf(Q), np.quantile(sims, Q)
            rows.append({"line": ln, "code": c["code"], "name": c["name"], "actual": actual,
                         "cl": cl, "cl_inc": cl_inc, "mack_se": se, "odp_mean": sims.mean(),
                         **{f"mack_q{int(q * 100):02d}": v for q, v in zip(Q, mack_q)},
                         **{f"odp_q{int(q * 100):02d}": v for q, v in zip(Q, odp_q)},
                         "pit_mack": dist.cdf(actual), "pit_odp": np.mean(sims <= actual)})
            lo, hi = min(sims[20], actual), max(sims[-21], actual)      # histogram range: P0.5-P99.5
            site[ln].append({
                "code": c["code"], "name": c["name"], "premium": c["premium"].round().tolist(),
                "paid": paid.round().tolist(), "cl_full": np.round(full).tolist(),
                "to_date": round(to_date), "actual": round(actual), "cl": round(cl), "cl_inc": round(cl_inc),
                "mack_se": round(se), "mack_q": np.round(mack_q).tolist(), "odp_q": np.round(odp_q).tolist(),
                "hist_lo": round(lo), "hist_hi": round(hi),
                "hist": np.histogram(np.clip(sims, lo, hi), np.linspace(lo, hi, 41))[0].tolist(),
                "pit_odp": round(float(np.mean(sims <= actual)), 4)})
        site[ln].sort(key=lambda x: -x["actual"])
        print(f"{ln}: kept {len(site[ln])} of {len(companies)}")

    df = pd.DataFrame(rows)
    (HERE / "results").mkdir(exist_ok=True)
    df.to_csv(HERE / "results" / "companies.csv", index=False)
    pd.DataFrame(dropped).to_csv(HERE / "results" / "dropped.csv", index=False)

    import scipy
    summary = {
        "meta": {"data": "CAS Loss Reserving Database (Meyers and Shi, 2011), NAIC Schedule P",
                 "units": "thousands of US dollars", "sims": SIMS,
                 "in_file": {ln: int((df.line == ln).sum() + sum(x["line"] == ln for x in dropped)) for ln in LINES},
                 "kept": {ln: int((df.line == ln).sum()) for ln in LINES},
                 "dropped_by_reason": pd.DataFrame(dropped).reason.value_counts().to_dict(),
                 "versions": {"python": platform.python_version(), "numpy": np.__version__,
                              "pandas": pd.__version__, "scipy": scipy.__version__},
                 "seconds": round(time.time() - t0, 1)},
        "lines": LINES, "err_edges": ERR_EDGES.tolist(),
        "summary": {"all": summarise(df), **{ln: summarise(df[df.line == ln]) for ln in LINES}},
    }
    text = json.dumps(summary, indent=1, default=float)
    (HERE / "results" / "summary.json").write_text(text, encoding="utf-8")
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "reserving.json").write_text(text, encoding="utf-8")
    for ln, comps in site.items():
        (SITE / f"reserving-{ln}.json").write_text(json.dumps(comps, separators=(",", ":")), encoding="utf-8")

    a = summary["summary"]["all"]
    print(f"{a['n']} companies; paid chain-ladder median miss {a['errors']['cl']['median_abs']:.1%}; "
          f"90% ranges held the truth: Mack {a['coverage']['mack_90']['rate']:.1%}, "
          f"bootstrap {a['coverage']['odp_90']['rate']:.1%}")

    import paper.make_figures
    paper.make_figures.main()
    print(f"done in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
