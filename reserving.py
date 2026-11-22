"""Loss reserving maths: load Schedule P triangles, chain-ladder, Mack, ODP bootstrap.

Copyright (C) 2026 Vivek Mitra. Licensed under the GNU Affero General Public License v3.0.

A triangle here is a 10x10 numpy array of cumulative amounts: row i = accident
year 1988+i, column j = development year j+1. Cell (i, j) was known at the end
of 1997 when i + j <= 9. Every function below reads only those known cells.
"""
import numpy as np
import pandas as pd

N = 10
KNOWN = np.add.outer(np.arange(N), np.arange(N)) <= N - 1   # True for cells known in 1997


def latest(tri):
    """Most recent known value for each accident year (the 1997 diagonal)."""
    return np.array([tri[i, N - 1 - i] for i in range(N)])


# ---------- data ----------

def load_line(path):
    """Read one CAS file. Returns a list of dicts with paid, incurred, premium and name."""
    df = pd.read_csv(path)
    df.columns = [c.split("_")[0] for c in df.columns]          # IncurLoss_B -> IncurLoss
    out = []
    for code, g in df.groupby("GRCODE"):
        g = g.sort_values(["AccidentYear", "DevelopmentLag"])
        out.append({
            "code": int(code),
            "name": g.GRNAME.iloc[0].strip(),
            "paid": g.CumPaidLoss.to_numpy(float).reshape(N, N),
            "incurred": (g.IncurLoss - g.BulkLoss).to_numpy(float).reshape(N, N),
            "premium": g.EarnedPremNet.to_numpy(float)[::N],
        })
    return out


def reason_to_drop(c):
    """The selection rule, applied before any method is scored. None means keep."""
    paid = c["paid"]
    if (c["premium"] <= 0).any():
        return "non-positive premium"
    if (paid[:, 0] <= 0).any():
        return "non-positive first-year paid"
    if paid[:, N - 1].sum() - latest(paid).sum() <= 0:
        return "no outstanding amount"
    for i in range(N):
        for j in range(1, N - i):
            if paid[i, j] < 0.95 * paid[i, j - 1]:
                return "paid decreases in known triangle"
    return None


# ---------- chain-ladder ----------

def factors(tri):
    """Volume-weighted link ratios f_j = sum C[i, j+1] / sum C[i, j] over rows with both known."""
    return np.array([tri[:N - 1 - j, j + 1].sum() / tri[:N - 1 - j, j].sum() for j in range(N - 1)])


def chain_ladder(tri):
    """Fill the unknown cells by multiplying forward with the link ratios."""
    f = factors(tri)
    full = np.where(KNOWN, tri, np.nan)
    for i in range(1, N):
        for j in range(N - i, N):
            full[i, j] = full[i, j - 1] * f[j - 1]
    return full, f


# ---------- Mack (1993) ----------

def mack(tri):
    """Chain-ladder reserve and Mack's standard error of the total reserve."""
    full, f = chain_ladder(tri)
    ult = full[:, N - 1]
    reserve = ult.sum() - latest(tri).sum()

    sig2 = np.zeros(N - 1)                                   # variance parameter per lag
    for j in range(N - 2):
        rows = N - 1 - j
        c0, c1 = tri[:rows, j], tri[:rows, j + 1]
        sig2[j] = (c0 * (c1 / c0 - f[j]) ** 2).sum() / (rows - 1)
    a, b = sig2[N - 4], sig2[N - 3]                          # last one: Mack's extrapolation rule
    sig2[N - 2] = min(b * b / a, a, b) if a > 0 else 0.0

    col_sum = np.array([tri[:N - 1 - k, k].sum() for k in range(N - 1)])
    w = sig2 / f ** 2
    mse = 0.0
    for i in range(1, N):
        lags = range(N - 1 - i, N - 1)                          # future steps of accident year i
        mse += ult[i] ** 2 * sum(w[k] * (1 / full[i, k] + 1 / col_sum[k]) for k in lags)
        mse += 2 * ult[i] * ult[i + 1:].sum() * sum(w[k] / col_sum[k] for k in lags)
    return full, reserve, np.sqrt(mse)


def lognormal(mean, sd):
    """Lognormal distribution with the given mean and standard deviation (for Mack's range)."""
    from scipy.stats import lognorm
    s2 = np.log(1 + (sd / mean) ** 2)
    return lognorm(s=np.sqrt(s2), scale=np.exp(np.log(mean) - s2 / 2))


# ---------- over-dispersed Poisson bootstrap (England and Verrall) ----------

def odp_bootstrap(tri, sims=4000, seed=0):
    """Sorted simulated total reserves: parameter error by residual resampling,
    process error by gamma draws with variance phi * mean."""
    rng = np.random.default_rng(seed)
    full, f = chain_ladder(tri)

    # fitted cumulative values: back-cast each row from its latest diagonal
    fit = np.full((N, N), np.nan)
    for i in range(N):
        fit[i, N - 1 - i] = tri[i, N - 1 - i]
        for j in range(N - 2 - i, -1, -1):
            fit[i, j] = fit[i, j + 1] / f[j]
    inc = np.diff(np.where(KNOWN, tri, 0), prepend=0, axis=1)  # actual incremental
    m = np.diff(np.nan_to_num(fit), prepend=0, axis=1)        # fitted incremental

    n, p = KNOWN.sum(), 2 * N - 1                             # 55 cells, 19 parameters
    with np.errstate(divide="ignore", invalid="ignore"):
        resid = np.where(m != 0, (inc - m) / np.sqrt(np.abs(m)), 0.0)
    phi = (resid[KNOWN] ** 2).sum() / (n - p)
    pool_mask = KNOWN.copy()
    pool_mask[0, N - 1] = pool_mask[N - 1, 0] = False          # corner residuals are always 0
    pool = resid[pool_mask] * np.sqrt(n / (n - p))

    # all simulations at once: axis 0 is the simulation number
    ii, jj = np.nonzero(KNOWN)
    fake = np.zeros((sims, N, N))
    fake[:, ii, jj] = m[ii, jj] + rng.choice(pool, (sims, ii.size)) * np.sqrt(np.abs(m[ii, jj]))
    fake_cum = np.where(KNOWN, fake.cumsum(axis=2), 0)
    g = np.stack([fake_cum[:, :N - 1 - j, j + 1].sum(1) / fake_cum[:, :N - 1 - j, j].sum(1)
                  for j in range(N - 1)], axis=1)

    total = np.zeros(sims)
    for i in range(1, N):
        c = fake_cum[:, i, N - 1 - i]
        for j in range(N - i, N):
            mean = c * (g[:, j - 1] - 1)                       # expected payment in the next year
            total += np.sign(mean) * rng.gamma(np.abs(mean) / phi, phi)
            c = c * g[:, j - 1]
    return np.sort(total)
