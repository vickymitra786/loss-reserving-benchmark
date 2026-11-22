// Build paper/reserving.docx. Every number is read from results/summary.json.
// Copyright (C) 2026 Vivek Mitra. GNU AGPL-3.0.   Usage: node paper/build_paper.js
const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ImageRun, Footer, PageNumber, BorderStyle, ShadingType } = require("docx");

const S = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "results", "summary.json"), "utf8"));
const A = S.summary.all, E = A.errors, C = A.coverage, M = S.meta, D = A.incurred_minus_paid_median_abs;
const LINES = Object.keys(S.lines);
const p0 = v => (v * 100).toFixed(0) + "%";
const p1 = v => (v * 100).toFixed(1) + "%";
const sp = v => (v >= 0 ? "+" : "−") + (Math.abs(v) * 100).toFixed(1) + "%";
const range = (a, f = p1) => `${f(a[0])}–${f(a[1])}`;
const bn = k => "$" + (k / 1e6).toFixed(1) + " billion";            // thousands of dollars -> billions
const nFile = Object.values(M.in_file).reduce((a, b) => a + b);
const why = M.dropped_by_reason;

// text helper: **bold** inside a string; underscores are printed as they are
const FONT = "Cambria";
const run = (t, o = {}) => new TextRun({ text: t, font: FONT, size: 22, ...o });
const runs = t => t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(x =>
  x.startsWith("**") ? run(x.slice(2, -2), { bold: true }) : run(x));
const P = t => new Paragraph({ children: runs(t), spacing: { after: 120, line: 276 }, alignment: AlignmentType.JUSTIFIED });
const LI = t => new Paragraph({ children: runs(t), bullet: { level: 0 }, spacing: { after: 60, line: 264 } });
const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [run(t, { size: 26, bold: true, color: "1F4E8C" })] });
const H2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 80 }, children: [run(t, { size: 23, bold: true })] });
const CAP = t => new Paragraph({ spacing: { before: 60, after: 200 }, children: [run(t, { size: 19, italics: true })] });
const FIG = (file, h, cap) => [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: fs.readFileSync(path.join(__dirname, "figures", file)), transformation: { width: 560, height: h } })] }), CAP(cap)];
function TABLE(head, rows, widths) {
  const line = { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" }, none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cell = (t, i, top) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 80, right: 80 },
    borders: { top: top ? line : none, bottom: line, left: none, right: none },
    shading: top ? { type: ShadingType.CLEAR, color: "auto", fill: "EEF2F7" } : undefined,
    children: [new Paragraph({ alignment: i ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run(String(t), { size: 18, bold: top })] })],
  });
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: widths,
    rows: [head, ...rows].map((r, k) => new TableRow({ tableHeader: k === 0, children: r.map((t, i) => cell(t, i, k === 0)) })) });
}

const title = "How good are reserve ranges? Chain-ladder, Mack and bootstrap tested against realised outcomes in Schedule P data";
const abstract = `Loss reserves are an insurer's largest liability, and boards, auditors and regulators increasingly ask for a range around the estimate. We test the most common methods on ${A.n} US company–line triangles from the CAS Loss Reserving Database (NAIC Schedule P, accident years 1988–1997), fitting only on what was known at the end of 1997 and scoring against what was actually paid by development year ten. Paid chain-ladder missed the total reserve by a median ${p1(E.cl.median_abs)} and leaned high (median ${sp(E.cl.median)}). Nominal 90% ranges held the real outcome for only ${p1(C.mack_90.rate)} of triangles under Mack's model and ${p1(C.odp_90.rate)} under the over-dispersed Poisson bootstrap, and most misses fell below the range. Chain-ladder on reported incurred losses had a similar typical miss (${p1(E.cl_inc.median_abs)}) with almost no lean (${sp(E.cl_inc.median)} vs ${sp(E.cl.median)}). A machine-learning model was tried during development but is not part of the released results. Code and results are public and reproducible.`;

const children = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [run(title, { size: 32, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [run("Vivek Mitra, Independent researcher, vivekmitra.com")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [run("November 2026", { size: 20, color: "555555" })] }),
  H1("Abstract"), P(abstract),
  P("**Keywords:** loss reserving; IBNR; chain-ladder; Mack model; bootstrap; reserve ranges; calibration; Schedule P."),

  H1("1. Introduction"),
  P("When a claim happens, the insurer may pay it over many years. The money held today for claims that have already happened but are not yet fully paid is the loss reserve. Part of it covers claims already reported (case reserves) and part covers claims that are incurred but not reported or not yet fully valued, usually called IBNR. In long-tailed lines such as workers' compensation and liability, reserves can be several times a year's premium, so a few per cent of error is a large amount of capital."),
  P("Actuaries start from a claims triangle. Rows are accident years, columns are years of development, and only the upper-left part is known at the valuation date. The chain-ladder method fills in the lower-right part by applying average growth factors from one column to the next. A single number hides its uncertainty, so stochastic methods put a range around it. Two of the most used are Mack's distribution-free standard error (Mack, 1993) and the over-dispersed Poisson (ODP) bootstrap (England and Verrall, 1999, 2002). Their ranges feed reserve opinions, capital models and board reporting."),
  P("A range is useful only if it is calibrated: a 90% range should contain the eventual outcome about nine times in ten. This is rarely checked, because the outcome takes years to arrive. The CAS Loss Reserving Database (Meyers and Shi, 2011) makes the check possible. It holds Schedule P triangles for accident years 1988–1997 together with their later development, so the part that was unknown at the end of 1997 can be compared with each forecast. Meyers (2015) used it to show that standard models were poorly calibrated on 200 selected triangles from four lines and proposed Bayesian models with a changing settlement rate."),
  P("This paper asks two practical questions on a rule-selected set of triangles from all six lines in the database. How accurate is the chain-ladder reserve? How often do Mack and bootstrap ranges hold the truth? We deliberately keep the methods to their standard textbook form, verify the code against published results, and release it, so that any reader can rerun every number in a few seconds."),

  H1("2. Data"),
  P("The database contains NAIC Schedule P Part 1 data for six lines: private passenger auto, workers' compensation, commercial auto, other liability (occurrence), medical malpractice (claims-made) and product liability (occurrence). For each insurer group and line it gives cumulative paid losses, incurred losses, bulk and IBNR reserves and net earned premium for accident years 1988–1997 and development years 1–10, in thousands of US dollars, net of reinsurance. Reported incurred loss is incurred loss minus bulk and IBNR reserves, as in Meyers (2015)."),
  P("A cell is known at the end of 1997 when accident year plus development year minus one is at most 1997. That gives 55 known and 45 unknown cells per triangle. The realised reserve is the paid amount at development year 10, summed over accident years, minus the paid amount on the 1997 diagonal. Development year 10 is treated as ultimate for every method; no tail factor is used, so all methods forecast the same quantity."),
  P(`**Selection rule.** Each of the ${nFile} triangles is used only if (1) net earned premium is positive in every accident year, (2) cumulative paid in development year 1 is positive in every accident year, (3) the realised reserve is positive, so that a percentage error is defined, and (4) cumulative paid never falls by more than 5% from one year to the next inside the known triangle, which signals a restatement or commutation rather than claim development. The rule was fixed before any method was scored. It removed ${why["non-positive premium"]} triangles for premium, ${why["non-positive first-year paid"]} for first-year paid, ${why["no outstanding amount"]} for no outstanding amount and ${why["paid decreases in known triangle"]} for falling paid, leaving ${A.n} (Table 1).`),
  TABLE(["Line", "In database", "Used", "Realised reserve of used triangles"],
    [...LINES.map(ln => [S.lines[ln], M.in_file[ln], M.kept[ln], bn(S.summary[ln].actual_total)]), ["All lines", nFile, A.n, bn(A.actual_total)]],
    [3400, 1800, 1500, 2660]),
  CAP("Table 1. Triangles in the database and triangles that pass the selection rule (lines do not sum exactly to the total due to rounding)."),

  H1("3. Methods"),
  P("All methods are fitted on the 55 known cells only. Nothing from the unknown part is used for fitting or for any choice of method."),
  H2("3.1 Chain-ladder"),
  P("The volume-weighted factor for development year j is f(j) = Σ C(i, j+1) / Σ C(i, j), where C(i, j) is the cumulative amount for accident year i at development year j, summed over accident years where both cells are known. Each accident year's latest cumulative amount is multiplied by the remaining factors up to development year 10. The reserve is the projected amount minus paid to date. The same method on reported incurred losses gives a second estimate: projected incurred at year 10 minus paid to date."),
  H2("3.2 Mack's model"),
  P("Mack (1993) gives a distribution-free estimate of the mean squared error of the chain-ladder reserve. It assumes that the expected next cumulative amount is proportional to the current one, that accident years are independent, and that the variance of the next amount is proportional to the current amount with a parameter σ²(j) for each development year. The last σ², which has only one observation, uses Mack's rule min(σ₇⁴/σ₆², σ₆², σ₇²) with zero-based indices. The standard error of the total includes the correlation between accident years that share the same estimated factors. A lognormal distribution with the chain-ladder reserve as mean and Mack's standard error as standard deviation turns this into a range."),
  H2("3.3 Over-dispersed Poisson bootstrap"),
  P(`Following England and Verrall (1999, 2002), fitted incremental amounts are obtained by back-casting each accident year from its latest diagonal with the chain-ladder factors. Pearson residuals on the 55 known cells are scaled by √(n/(n−p)) with n = 55 and p = 19, and the dispersion φ is the sum of squared residuals divided by n−p. The two corner residuals are always zero and are left out of the pool. Each of ${M.sims.toLocaleString("en-US")} simulations resamples the residuals, rebuilds a pseudo triangle, re-estimates the factors, projects each future year's expected payment from the pseudo triangle's latest diagonal and draws the actual payment from a gamma distribution with that mean and variance φ times the mean. The simulated totals form the predictive distribution.`),
  H2("3.4 Scoring"),
  P("For each triangle the error of a point estimate is (estimate − actual) / actual on the total reserve. We report the median absolute error (the typical miss) with a 95% bootstrap interval from 2,000 resamples of companies, the median signed error (the typical lean), the share within 25%, and the aggregate error of the summed reserves. Paid and incurred chain-ladder are compared by a paired bootstrap interval for the difference in median absolute error, resampling the same companies for both. Coverage is the share of triangles whose realised reserve lies between P10 and P90, or between P5 and P95, with Wilson (1927) 95% intervals. Calibration is also shown by the probability integral transform: the percentile of the predictive distribution at which the outcome falls, which should be uniform for a calibrated forecast (Gneiting, Balabdaoui and Raftery, 2007)."),
  H2("3.5 Verification"),
  P(`The code is written from the published formulas in a single short file and checked by a test. On the Taylor and Ashe (1983) triangle used by Mack (1993), it reproduces Mack's published total reserve of 18,680,856 and standard error of 2,447,095 exactly. On a Schedule P workers' compensation triangle it agrees with the open-source chainladder Python package to nine significant figures.`),
  H2("3.6 A method that was dropped"),
  P("A pooled gradient-boosted model of the development factors was tried during development. It did not beat chain-ladder in a preliminary run. Under the study's rule that a more complex method is kept only if it clearly beats the simple baseline, it was removed and is not part of the released code or results."),

  H1("4. Results"),
  H2("4.1 How accurate is the reserve?"),
  P(`Across all ${A.n} triangles, paid chain-ladder had a median absolute error of ${p1(E.cl.median_abs)} (95% interval ${range(E.cl.median_abs_ci)}) and was within 25% of the truth for ${p0(E.cl.within_25)} of companies. It leaned high: the median signed error was ${sp(E.cl.median)}, ${p0(E.cl.over)} of estimates were above the outcome, and the summed reserve was ${sp(E.cl.aggregate)} above the realised ${bn(A.actual_total)}. Chain-ladder on reported incurred losses had a similar typical miss, ${p1(E.cl_inc.median_abs)} (${range(E.cl_inc.median_abs_ci)}), with almost no lean (${sp(E.cl_inc.median)} vs ${sp(E.cl.median)}). The paired difference in median miss, incurred minus paid, was ${sp(D.diff)} with a 95% interval of ${sp(D.ci[0])} to ${sp(D.ci[1])}, which includes zero, so neither is clearly more accurate overall. By line, the interval excludes zero only in private passenger auto, where incurred was better (${sp(S.summary.ppauto.incurred_minus_paid_median_abs.diff)}; ${sp(S.summary.ppauto.incurred_minus_paid_median_abs.ci[0])} to ${sp(S.summary.ppauto.incurred_minus_paid_median_abs.ci[1])}) (Table 2, Figure 1).`),
  TABLE(["Line", "n", "CL paid: miss", "CL paid: lean", "CL incurred: miss", "CL incurred: lean"],
    [["all", ...LINES]].flat().map(ln => { const d = S.summary[ln]; return [ln === "all" ? "All lines" : S.lines[ln], d.n, p1(d.errors.cl.median_abs), sp(d.errors.cl.median), p1(d.errors.cl_inc.median_abs), sp(d.errors.cl_inc.median)]; }),
    [2860, 700, 1450, 1450, 1450, 1450]),
  CAP("Table 2. Median absolute error (miss) and median signed error (lean; positive means the reserve was too high) of the total reserve. CL = chain-ladder."),
  ...FIG("fig1_errors.png", 253, "Figure 1. Error of the total reserve across all triangles, for chain-ladder on paid and on reported incurred losses."),

  H2("4.2 Do the ranges hold the truth?"),
  P(`No. A nominal 90% range (P5–P95) held the realised reserve for ${C.mack_90.inside} of ${A.n} triangles under Mack (${p1(C.mack_90.rate)}, 95% interval ${range(C.mack_90.ci)}) and ${C.odp_90.inside} under the bootstrap (${p1(C.odp_90.rate)}, ${range(C.odp_90.ci)}). Nominal 80% ranges (P10–P90) held ${p1(C.mack_80.rate)} and ${p1(C.odp_80.rate)}. Even the upper end of each interval is far below the nominal level. The misses are lopsided: of the ${C.odp_90.below + C.odp_90.above} bootstrap 90% misses, ${C.odp_90.below} were outcomes below P5 and ${C.odp_90.above} above P95. Figure 2 shows where each outcome landed: ${p0(A.pit_hist.odp[0] / A.n)} fell in the bottom tenth of the bootstrap distribution, against 10% for a calibrated forecast, and the top tenth is also over-full. The ranges were both too narrow and centred too high.`),
  ...FIG("fig2_pit.png", 253, "Figure 2. Where the realised reserve fell within each triangle's predicted range, in tenths. A calibrated method gives about 10% in each bar."),
  TABLE(["Line", "n", "Mack 80%", "Mack 90%", "Bootstrap 80%", "Bootstrap 90%"],
    ["all", ...LINES].map(ln => { const d = S.summary[ln], c = d.coverage; return [ln === "all" ? "All lines" : S.lines[ln], d.n, p0(c.mack_80.rate), p0(c.mack_90.rate), p0(c.odp_80.rate), p0(c.odp_90.rate)]; }),
    [2900, 700, 1440, 1440, 1440, 1440]),
  CAP("Table 3. Share of triangles whose realised reserve lies inside the nominal 80% (P10–P90) and 90% (P5–P95) ranges."),
  P(`Coverage was worst in workers' compensation (${p0(S.summary.wkcomp.coverage.odp_90.rate)} for the bootstrap 90% range) and private passenger auto (${p0(S.summary.ppauto.coverage.odp_90.rate)}), and closest to nominal in commercial auto (${p0(S.summary.comauto.coverage.odp_90.rate)}) and other liability (${p0(S.summary.othliab.coverage.odp_90.rate)}), where the ranges are wider: the median width of the bootstrap P5–P95 range was ${p0(S.summary.comauto.width_90.odp)} and ${p0(S.summary.othliab.width_90.odp)} of the chain-ladder reserve, against ${p0(S.summary.ppauto.width_90.odp)} in private passenger auto and ${p0(S.summary.wkcomp.width_90.odp)} in workers' compensation (Figure 3). Medical malpractice and product liability have only ${S.summary.medmal.n} and ${S.summary.prodliab.n} usable triangles, so their rates are very uncertain.`),
  ...FIG("fig3_coverage.png", 262, "Figure 3. Share of real outcomes inside the 90% range, by line, with 95% Wilson intervals. The dashed line is the nominal 90%."),

  H1("5. Discussion"),
  P("Two simple mechanisms are likely to explain most of the result. First, paid chain-ladder assumes that each accident year pays out at the same speed as earlier years did. If claims settle faster over time, the most recent years look further from complete than they are and the projection overshoots; this is the effect Meyers (2015) modelled with a changing settlement rate, and it matches the high lean found here. Second, Mack and the bootstrap measure only the noise visible inside one company's 55 cells. They do not include the chance that the whole pattern shifts, which may affect many companies at once (for example a shift in settlement speed), so the misses are correlated. Reported incurred losses carry the case reserves set by claims handlers, who see each claim, so they partly correct for the first mechanism."),
  P("For practice, the evidence supports three habits: back-test ranges against run-off wherever possible; treat a paid chain-ladder range as too narrow and widen it, or set it alongside incurred methods; and judge any new method, including machine learning, on the multi-year reserve it is meant to forecast."),

  H1("6. Limitations"),
  LI("**One period.** All triangles share the same calendar years, 1998–2006, so outcomes are not independent across companies. The intervals above treat companies as independent and are too narrow for the question “would this hold in another decade?”"),
  LI("**Selection.** The rule removes about two-thirds of triangles, mostly for missing premium or volatile paid data. Ranges on the excluded triangles may do worse."),
  LI("**Development year 10 as ultimate.** Later payments are ignored for forecasts and outcomes alike, which matters most in long-tailed lines."),
  LI("**Standard settings only.** All-year volume-weighted factors, no tail, a lognormal for Mack and residual resampling with gamma process error for the bootstrap. Actuarial judgement, such as excluding outlying factors, would change individual results."),
  LI("**Small lines.** Medical malpractice and product liability have fewer than ten usable triangles each."),

  H1("7. Reproducibility"),
  P(`Data: the six CSV files of the CAS Loss Reserving Database, downloaded from casact.org. Code: github.com/vickymitra786/loss-reserving-benchmark, licensed under the GNU Affero General Public License v3.0. It has two short Python files: reserving.py (data, chain-ladder, Mack, bootstrap) and run_all.py (selection, scoring, outputs), plus test_reserving.py. Software: Python ${M.versions.python}, NumPy ${M.versions.numpy}, pandas ${M.versions.pandas} and SciPy ${M.versions.scipy}; the test also uses the chainladder package. The command python run_all.py writes results/summary.json, results/companies.csv, results/dropped.csv, the figures and the website data in under a minute on a laptop. Each company's bootstrap uses its company code as the random seed, so reruns give identical numbers. This paper is generated from results/summary.json by paper/build_paper.js. An interactive version, where readers pick a company and reveal its outcome, is at vivekmitra.com/reserving.html.`),

  H1("References"),
  ...[
    "England, P. and Verrall, R. (1999). Analytic and bootstrap estimates of prediction errors in claims reserving. Insurance: Mathematics and Economics, 25(3), 281–293.",
    "England, P. D. and Verrall, R. J. (2002). Stochastic claims reserving in general insurance. British Actuarial Journal, 8(3), 443–518.",
    "Gneiting, T., Balabdaoui, F. and Raftery, A. E. (2007). Probabilistic forecasts, calibration and sharpness. Journal of the Royal Statistical Society Series B, 69(2), 243–268.",
    "Mack, T. (1993). Distribution-free calculation of the standard error of chain ladder reserve estimates. ASTIN Bulletin, 23(2), 213–225.",
    "Meyers, G. (2015). Stochastic Loss Reserving Using Bayesian MCMC Models. CAS Monograph Series No. 1. Casualty Actuarial Society.",
    "Meyers, G. and Shi, P. (2011). Loss Reserving Data Pulled From NAIC Schedule P. Casualty Actuarial Society. https://www.casact.org/publications-research/research/research-resources/loss-reserving-data-pulled-naic-schedule-p",
    "Taylor, G. C. and Ashe, F. R. (1983). Second moments of estimates of outstanding claims. Journal of Econometrics, 23(1), 37–61.",
    "Wilson, E. B. (1927). Probable inference, the law of succession, and statistical inference. Journal of the American Statistical Association, 22(158), 209–212.",
    "chainladder: property and casualty loss reserving in Python. Casualty Actuarial Society. https://github.com/casact/chainladder-python",
  ].map(t => new Paragraph({ children: [run(t, { size: 20 })], spacing: { after: 80 }, indent: { left: 360, hanging: 360 } })),
];

const doc = new Document({
  creator: "Vivek Mitra", title,
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Vivek Mitra · How good are reserve ranges? · ", PageNumber.CURRENT], font: FONT, size: 16, color: "777777" })] })] }) },
    children,
  }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(path.join(__dirname, "reserving.docx"), b); console.log("wrote paper/reserving.docx"); });
