# Loss reserving benchmark

How good are insurance reserve ranges? This project takes 269 real US insurer claims triangles from NAIC Schedule P, forecasts what each company still owed at the end of 1997 using only what it knew then, and checks the forecasts against what it actually paid over the following years.

Methods, kept deliberately simple and standard:

- **Chain-ladder** on paid losses, and on reported (case-incurred) losses.
- **Mack's model** (Mack, 1993): the standard error of the chain-ladder reserve, turned into a range with a lognormal curve.
- **Over-dispersed Poisson bootstrap** (England and Verrall, 1999, 2002): 4,000 simulations per company for a full range of outcomes.

A machine-learning model was tried during development. It did not beat chain-ladder in a preliminary run, so it was removed and is not part of these results.

## Results

Typical miss = median absolute error of the total reserve. Lean = median signed error (+ means the reserve was too high). A good 90% range should hold the truth 90% of the time.

| Line | Triangles | Chain-ladder (paid) typical miss | Chain-ladder (paid) lean | Chain-ladder (reported) typical miss | Mack 90% range held truth | Bootstrap 90% range held truth |
|---|---:|---:|---:|---:|---:|---:|
| All lines | 269 | 21.9% | +11.3% | 20.1% | 65% | 67% |
| Private passenger auto | 77 | 19.6% | +13.0% | 11.2% | 62% | 60% |
| Workers' compensation | 46 | 21.8% | +13.7% | 31.0% | 48% | 50% |
| Commercial auto | 67 | 21.9% | +11.0% | 20.2% | 73% | 78% |
| Other liability | 62 | 29.7% | +12.8% | 28.1% | 74% | 77% |
| Medical malpractice | 8 | 45.2% | +23.3% | 25.5% | 38% | 50% |
| Product liability | 9 | 16.4% | -2.3% | 18.8% | 67% | 67% |

The ranges are too narrow, and they are usually set too high. Full details, uncertainty intervals and figures are in the paper.

## Run it

1. Install Python 3.13 and the packages: `pip install -r requirements.txt`
2. Download the six CSV files of the CAS Loss Reserving Database into `data/`:
   `comauto_pos.csv`, `medmal_pos.csv`, `othliab_pos.csv`, `ppauto_pos.csv`, `prodliab_pos.csv`, `wkcomp_pos.csv`.
   They are linked from the CAS page "Loss Reserving Data Pulled From NAIC Schedule P":
   https://www.casact.org/publications-research/research/research-resources/loss-reserving-data-pulled-naic-schedule-p
3. Check the maths: `python test_reserving.py` (reproduces Mack's published Taylor-Ashe reserve and standard error, and matches the `chainladder` package on a Schedule P triangle).
4. Rebuild every number: `python run_all.py` (under a minute). It writes `results/summary.json`, `results/companies.csv`, `results/dropped.csv`, the paper figures and the website data files.
5. Rebuild the paper (optional, needs Node.js): `cd paper && npm install && npm run build`, then save `paper/reserving.docx` as PDF.

## Files

- `reserving.py`: data loading, the selection rule, chain-ladder, Mack and the bootstrap.
- `run_all.py`: runs every company, scores the methods and writes the outputs.
- `test_reserving.py`: checks against published results.
- `paper/`: figures script, paper builder and the paper (`reserving.pdf`).

## Paper

[How good are reserve ranges? Chain-ladder, Mack and bootstrap tested against realised outcomes in Schedule P data](paper/reserving.pdf). Interactive version: https://vivekmitra.com/reserving.html

## Data credit

Casualty Actuarial Society, Loss Reserving Database. Meyers, G. and Shi, P. (2011), *Loss Reserving Data Pulled From NAIC Schedule P*. Company names and codes are as given in that database. Amounts are in thousands of US dollars.

## Licence

Copyright (C) 2026 Vivek Mitra. Licensed under the GNU Affero General Public License v3.0.
