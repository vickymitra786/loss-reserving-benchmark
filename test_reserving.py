"""Check chain-ladder and Mack against published numbers and the chainladder package.

Copyright (C) 2026 Vivek Mitra. Licensed under the GNU Affero General Public License v3.0.

    python test_reserving.py
"""
import warnings

import chainladder as cl
import numpy as np
import pandas as pd

import reserving as r

warnings.filterwarnings("ignore")

# 1. Taylor and Ashe (1983) triangle, as used by Mack (1993).
#    Mack's published total reserve is 18,680,856 with standard error 2,447,095.
genins = np.nan_to_num(np.asarray(cl.load_sample("genins").values)[0, 0])
_, reserve, se = r.mack(genins)
assert round(reserve) == 18_680_856, reserve
assert round(se) == 2_447_095, se

# 2. A real Schedule P triangle against the chainladder package.
c = r.load_line("data/wkcomp_pos.csv")[0]
rows = [{"origin": str(1988 + i), "dev": str(1988 + i + j), "paid": c["paid"][i, j]}
        for i in range(10) for j in range(10 - i)]
T = cl.Triangle(pd.DataFrame(rows), origin="origin", development="dev", columns="paid", cumulative=True)
pkg = cl.MackChainladder().fit(cl.Development(sigma_interpolation="mack").fit_transform(T))
_, reserve, se = r.mack(c["paid"])
assert np.isclose(reserve, pkg.ibnr_.sum().sum(), rtol=1e-9)
assert np.isclose(se, float(pkg.total_mack_std_err_.values.ravel()[0]), rtol=1e-9)

print(f"ok: Taylor-Ashe reserve 18,680,856 and s.e. 2,447,095 match Mack (1993); "
      f"{c['name']} workers' comp matches the chainladder package")
