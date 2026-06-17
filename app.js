/* Ten Million Vote — interactive Swiss-style data viz (D3 v7). Correlational, ecological. Multilingual. */
const W = 1000, H = 630;
let I18N = {}, LANGUI = "en";
function t(path) {
  const segs = path.split(".");
  const dig = o => segs.reduce((a, s) => (a == null ? undefined : a[s]), o);
  let v = dig(I18N[LANGUI]); if (v == null) v = dig(I18N.en);
  return v == null ? path : v;
}
const fmt = { pct: d3.format(".1f"), int: d3.format(",.0f"), ratio: d3.format("+.2f"), signed: d3.format("+.1f") };
const fmtVar = (k, v) => v == null ? "—" :
  k === "pop_2024" || k === "density_per_km2" ? fmt.int(v) :
  k === "sprawl_logratio" ? fmt.ratio(v) :
  k === "model_residual" ? fmt.signed(v) + " " + t("readout.pts") :
  fmt.pct(v) + (k === "init10mio_yes_pct" ? "%" : "");

let RES, GEO, path, active = "init10mio_yes_pct", scaleFor = {}, pinned = null;

Promise.all([d3.json("data/results.json"), d3.json("data/communes.geojson"), d3.json("data/i18n.json")])
  .then(([res, geo, i18n]) => {
    RES = res; GEO = geo; I18N = i18n;
    const proj = d3.geoIdentity().reflectY(true).fitExtent([[8, 8], [W - 8, H - 8]], geo);
    path = d3.geoPath(proj);
    buildScales(); buildMap(); buildSwitcher();
    d3.select("#show-resid").on("click", () => { setVar("model_residual"); document.getElementById("map").scrollIntoView({ behavior: "smooth" }); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") unpin(); });
    const qp = new URLSearchParams(location.search).get("lang");
    const saved = localStorage.getItem("lang10mio");
    const nav2 = navigator.language.slice(0, 2);
    const init = i18n._langs.includes(qp) ? qp : i18n._langs.includes(saved) ? saved : i18n._langs.includes(nav2) ? nav2 : "en";
    applyI18n(init);
  });

/* ---------- language switcher + i18n application ---------- */
function buildSwitcher() {
  const sw = d3.select("#langsw");
  I18N._langs.forEach(code => sw.append("button").attr("class", "langbtn").attr("data-l", code)
    .attr("aria-pressed", "false").text(I18N._names[code]).on("click", () => applyI18n(code)));
}
function applyI18n(lang) {
  LANGUI = lang; localStorage.setItem("lang10mio", lang); document.documentElement.lang = lang;
  d3.selectAll("#langsw .langbtn").attr("aria-pressed", function () { return this.dataset.l === lang; });
  document.querySelectorAll("[data-i18n]").forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  // rebuild language-dependent dynamic UI
  ["#varbar", "#forest", "#scatterbar", "#adjtoggle", "#langtoggle", "#r2", "#sources-grid", "#anom-pos", "#anom-neg", "#tested-table"].forEach(s => d3.select(s).html(""));
  buildVarbar(); buildForest(); buildScatterBar(); buildAdjToggle(); buildLangToggles(); buildR2(); buildAnomalies(); buildSources(); buildTested();
  setVar(active); drawScatter(activeX); hintReadout();
}

/* ---------- colour scales ---------- */
function buildScales() {
  for (const [k, cfg] of Object.entries(RES.variables)) {
    const s = cfg.stats;
    if (cfg.scale === "diverging") {
      const m = cfg.mid, span = Math.max(Math.abs(s.q05 - m), Math.abs(s.q95 - m));
      scaleFor[k] = d3.scaleDiverging([m - span, m, m + span], tt => d3.interpolateRdBu(tt)).clamp(true);
    } else if (cfg.scale === "log") {
      scaleFor[k] = d3.scaleSequentialLog([Math.max(1, s.q05), s.q95], d3.interpolateBlues).clamp(true);
    } else {
      scaleFor[k] = d3.scaleSequential([s.q05, s.q95], d3.interpolateReds).clamp(true);
    }
  }
}
const colour = (k, v) => (v == null || !isFinite(v)) ? "#dcdcdc" : scaleFor[k](v);
const vlabel = k => t(`variables.${k}.label`);

/* ---------- map ---------- */
function buildMap() {
  const svg = d3.select("#chmap").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet").on("click", () => unpin());
  svg.append("g").attr("id", "paths").selectAll("path")
    .data(GEO.features).join("path").attr("class", "cm-path").attr("d", path)
    .attr("fill", d => colour(active, d.properties[active]))
    .on("pointermove", onHover).on("pointerleave", onLeave).on("click", onClick);
}
function repaint() { d3.select("#paths").selectAll("path").attr("fill", d => colour(active, d.properties[active])); }

const tip = d3.select("#tip");
function onHover(ev, d) {
  d3.select(this).raise().classed("is-active", true);
  const p = d.properties;
  tip.style("opacity", 1).attr("aria-hidden", "false")
    .style("left", (ev.clientX + 14) + "px").style("top", (ev.clientY + 14) + "px")
    .html(`<b>${p.commune}</b><br>${vlabel(active)}: <span class="tip__v">${fmtVar(active, p[active])}</span>`);
  showReadout(p);
}
function onLeave() { d3.select(this).classed("is-active", false); tip.style("opacity", 0).attr("aria-hidden", "true"); if (pinned) showReadout(pinned.properties); else hintReadout(); }
function onClick(ev, d) { ev.stopPropagation(); if (pinned === d) { unpin(); return; } pinned = d; d3.select("#paths").selectAll("path").classed("is-pinned", x => x === d); showReadout(d.properties); }
function unpin() { pinned = null; d3.select("#paths").selectAll("path").classed("is-pinned", false); hintReadout(); }
function hintReadout() { d3.select("#readout").html(`<span class="readout__hint">${t("map.readout_hint")}</span>`); }
function showReadout(p) {
  const rows = [
    [t("readout.yes_share"), fmtVar("init10mio_yes_pct", p.init10mio_yes_pct)],
    [t("readout.predicted_yes"), fmtVar("init10mio_yes_pct", p.pred_yes)],
    [t("readout.residual"), p.model_residual == null ? "—" : fmt.signed(p.model_residual) + " " + t("readout.pts")],
    [t("readout.population"), fmtVar("pop_2024", p.pop_2024)],
    [t("readout.density"), fmtVar("density_per_km2", p.density_per_km2)],
    [t("readout.foreign"), fmtVar("pct_foreign_2024", p.pct_foreign_2024)],
    [t("readout.agricultural"), fmtVar("pct_agriculture", p.pct_agriculture)],
  ];
  d3.select("#readout").html(
    `<div class="readout__name">${p.commune}${pinned && pinned.properties === p ? ` <span class="pinmark">${t("readout.pinned")}</span>` : ""}</div>
     <div class="readout__canton">${p.canton || ""}</div>
     <div class="readout__big">${fmt.pct(p.init10mio_yes_pct)}<small>% ${t("bento.yes")}</small></div>
     <table class="rtable">${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table>`);
}

/* ---------- variable bar + description ---------- */
function buildVarbar() {
  const bar = d3.select("#varbar");
  for (const k of Object.keys(RES.variables)) {
    bar.append("button").attr("class", "varbtn").attr("role", "tab").attr("aria-selected", k === active)
      .attr("data-k", k).text(vlabel(k)).on("click", () => setVar(k));
  }
}
function setVar(k) {
  active = k;
  d3.selectAll("#varbar .varbtn").attr("aria-selected", function () { return this.dataset.k === k; });
  d3.select("#vardesc").text(t(`variables.${k}.desc`));
  repaint(); buildLegend();
}
function buildLegend() {
  const cfg = RES.variables[active], s = scaleFor[active], dom = s.domain();
  const lo = dom[0], hi = dom[dom.length - 1], N = 24, stops = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const v = cfg.scale === "log" ? Math.exp(Math.log(dom[0]) + u * (Math.log(hi) - Math.log(dom[0]))) : lo + u * (hi - lo);
    stops.push(`${s(v)} ${Math.round(u * 100)}%`);
  }
  const mid = cfg.mid != null ? cfg.mid : (lo + hi) / 2;
  d3.select("#legend").html(
    `<span class="legend__title">${vlabel(active)}</span>
     <div class="legend__bar" style="background:linear-gradient(90deg,${stops.join(",")})"></div>
     <div class="legend__scale"><span>${fmtVar(active, lo)}</span>
       ${cfg.mid != null ? `<span>${fmtVar(active, mid)}</span>` : ""}<span>${fmtVar(active, hi)}</span></div>`);
}

/* ---------- forest (expandable) ---------- */
function buildForest() {
  const max = d3.max(RES.drivers, d => Math.abs(d.coef)) || 1;
  const host = d3.select("#forest");
  const sorted = [...RES.drivers].sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef));   // by impact
  sorted.forEach((d, i) => {
    const half = (Math.abs(d.coef) / max) * 50, neg = d.coef < 0, ns = d.p === "n.s.";
    const sig = ns ? `<span class="ns"> · n.s.</span>` : "";
    const eid = `fexp-${i}`;
    const item = host.append("div").attr("class", "fitem" + (ns ? " is-ns" : ""));
    item.append("button").attr("class", "frow").attr("aria-expanded", "false").attr("aria-controls", eid).html(
      `<span class="fchev" aria-hidden="true"></span>
       <span class="frow__label">${t(`drivers.${d.v}.label`)}${sig}</span>
       <span class="ftrack"><span class="ftrack__zero"></span>
         <span class="fbar ${neg ? "fbar--neg" : ""}" style="${neg ? `right:50%;width:${half}%` : `left:50%;width:${half}%`}"></span></span>
       <span class="fval">${d3.format("+.2f")(d.coef)}<span class="fsig">${d.p === "n.s." ? "" : d.p}</span></span>`)
      .on("click", function () { const o = this.getAttribute("aria-expanded") === "true"; this.setAttribute("aria-expanded", String(!o)); item.select(".fexp").classed("open", !o); });
    item.append("div").attr("class", "fexp").attr("id", eid).html(`<p>${t(`drivers.${d.v}.explain`)}</p>`);
  });
}

/* ---------- scatter ---------- */
let activeX = "pred", scatterPinned = null;
const SCATTER_X = ["pred", "density_per_km2", "pop_2024", "pct_foreign_2024", "pct_agriculture",
  "tertiary_share", "pct_noreligion_2000", "jobs_per_1000",
  "main_lang_share_2000", "natz_per_1000_2024"];
// Okabe-Ito colourblind-safe palette; black reserved for the overall (Switzerland) line
const LANG = { de: { color: "#D55E00" }, fr: { color: "#0072B2" }, it: { color: "#009E73" }, rm: { color: "#CC79A7" } };
const LANG_ORDER = ["de", "fr", "it", "rm"];
const visLang = new Set(LANG_ORDER);
const CITIES = { 261: "Zürich", 6621: "Genève", 2701: "Basel", 5586: "Lausanne", 351: "Bern", 230: "Winterthur", 1061: "Luzern", 3203: "St. Gallen", 5192: "Lugano", 371: "Biel/Bienne" };
let showCities = true, scatterAdj = false;
const langName = k => t(`langnames.${k}`);
// model variables (for "adjusted" added-variable plots)
const NUMMODEL = ["density_log", "pop_log", "pct_foreign_2024", "pct_agriculture", "jobs_pc_log",
  "tertiary_share", "pct_noreligion_2000", "main_lang_share_2000", "natz_per_1000_2024"];
const modelKey = k => k === "density_per_km2" ? "density_log" : k === "pop_2024" ? "pop_log" : k === "jobs_per_1000" ? "jobs_pc_log" : k;
const mval = (p, key) => key === "density_log" ? Math.log10(Math.max(1, p.density_per_km2)) : key === "pop_log" ? Math.log10(Math.max(1, p.pop_2024)) : key === "jobs_pc_log" ? Math.log10(Math.max(1, p.jobs_per_1000)) : p[key];
function solveOLS(Xr, yv, w) {
  const k = Xr[0].length, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  for (let i = 0; i < Xr.length; i++) { const xi = Xr[i], yi = yv[i], wi = w ? w[i] : 1; for (let a = 0; a < k; a++) { b[a] += wi * xi[a] * yi; for (let c = 0; c < k; c++) A[a][c] += wi * xi[a] * xi[c]; } }
  for (let c = 0; c < k; c++) { let piv = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r; [A[c], A[piv]] = [A[piv], A[c]];[b[c], b[piv]] = [b[piv], b[c]]; const d = A[c][c] || 1e-9; for (let r = 0; r < k; r++) { if (r === c) continue; const f = A[r][c] / d; for (let cc = c; cc < k; cc++) A[r][cc] -= f * A[c][cc]; b[r] -= f * b[c]; } }
  return b.map((bi, i) => bi / (A[i][i] || 1e-9));
}
function residualize(rows, ctrlKeys, valFn, w) {
  const X = rows.map(p => [1, ...ctrlKeys.map(k => mval(p, k)), p.main_language === "fr" ? 1 : 0, p.main_language === "it" ? 1 : 0, p.main_language === "rm" ? 1 : 0]);
  const y = rows.map(valFn), beta = solveOLS(X, y, w);
  return rows.map((p, i) => y[i] - X[i].reduce((s, xj, j) => s + xj * beta[j], 0));
}
function buildAdjToggle() {
  const host = d3.select("#adjtoggle").html("");
  [["raw", false], ["adjusted", true]].forEach(([key, val]) =>
    host.append("button").attr("class", "adjbtn").attr("data-adj", val).attr("aria-pressed", String(scatterAdj === val))
      .text(t("scatter." + key)).on("click", () => { scatterAdj = val; drawScatter(activeX); }));
}

function buildScatterBar() {
  const bar = d3.select("#scatterbar");
  SCATTER_X.forEach(k => bar.append("button").attr("class", "varbtn").attr("role", "tab")
    .attr("aria-selected", k === activeX).attr("data-xk", k)
    .text(k === "pred" ? t("scatter.model_prediction") : vlabel(k)).on("click", () => drawScatter(k)));
}
function buildLangToggles() {
  const host = d3.select("#langtoggle");
  host.append("span").attr("class", "lt-label").text(t("scatter.langregions"));
  LANG_ORDER.forEach(k => host.append("button").attr("class", "lchip").attr("aria-pressed", String(visLang.has(k))).attr("data-l", k)
    .html(`<span class="lsw" style="background:${LANG[k].color}"></span>${langName(k)}`)
    .on("click", function () { visLang.has(k) ? visLang.delete(k) : visLang.add(k); this.setAttribute("aria-pressed", String(visLang.has(k))); drawScatter(activeX); }));
  host.append("button").attr("class", "lchip lchip--cities").attr("aria-pressed", String(showCities))
    .html(`<span class="lsw lsw--ring"></span>${t("scatter.label_cities")}`)
    .on("click", function () { showCities = !showCities; this.setAttribute("aria-pressed", String(showCities)); drawScatter(activeX); });
}
function regStats(gp, xv, yv, wv) {
  const n = gp.length, xs = gp.map(xv), ys = gp.map(yv), wi = gp.map(d => wv ? wv(d) : 1);
  let W = 0; for (let i = 0; i < n; i++) W += wi[i];
  let xbar = 0, ybar = 0; for (let i = 0; i < n; i++) { xbar += wi[i] * xs[i]; ybar += wi[i] * ys[i]; } xbar /= W; ybar /= W;
  let Sxx = 0, Sxy = 0; for (let i = 0; i < n; i++) { Sxx += wi[i] * (xs[i] - xbar) ** 2; Sxy += wi[i] * (xs[i] - xbar) * (ys[i] - ybar); }
  const b = Sxy / Sxx, a = ybar - b * xbar;
  let SSE = 0; for (let i = 0; i < n; i++) { const e = ys[i] - (a + b * xs[i]); SSE += wi[i] * e * e; }
  return { n, a, b, xbar, Sxx: Sxx / (W / n), s: Math.sqrt(SSE / W * n / Math.max(1, n - 2)), xmin: d3.min(xs), xmax: d3.max(xs) };
}
function bandPath(R, x, y) {
  const N = 32, up = [], lo = [], cl = v => Math.max(-8, Math.min(108, v));
  for (let i = 0; i <= N; i++) { const xx = R.xmin + (i / N) * (R.xmax - R.xmin), yh = R.a + R.b * xx, se = R.s * Math.sqrt(1 / R.n + (xx - R.xbar) ** 2 / R.Sxx); up.push([x(xx), y(cl(yh + 1.96 * se))]); lo.push([x(xx), y(cl(yh - 1.96 * se))]); }
  return "M" + up.map(p => p.join(" ")).join("L") + "L" + lo.reverse().map(p => p.join(" ")).join("L") + "Z";
}
function drawScatter(xKey) {
  activeX = xKey; scatterPinned = null;
  d3.selectAll("#scatterbar .varbtn").attr("aria-selected", function () { return this.dataset.xk === xKey; });
  const isPred = xKey === "pred", isLog = !isPred && RES.variables[xKey].scale === "log", isAdj = scatterAdj && !isPred;
  d3.selectAll("#adjtoggle .adjbtn").attr("aria-pressed", function () { const v = this.dataset.adj === "true"; return String(isPred ? v === false : v === scatterAdj); }).property("disabled", isPred);

  let all, xVal, yVal, xext, yext, xlabel, ylabel;
  if (isAdj) {
    const Xm = modelKey(xKey), ctrl = NUMMODEL.filter(k => k !== Xm);
    const rows = GEO.features.map(f => f.properties).filter(p => p.init10mio_yes_pct != null && p.main_language && NUMMODEL.every(k => { const v = mval(p, k); return v != null && isFinite(v); }));
    const wts = rows.map(p => p.valid_votes || 1);
    const rx = residualize(rows, ctrl, p => mval(p, Xm), wts), ry = residualize(rows, ctrl, p => p.init10mio_yes_pct, wts);
    rows.forEach((p, i) => { p.__rx = rx[i]; p.__ry = ry[i]; });
    all = rows; xVal = p => p.__rx; yVal = p => p.__ry;
    xext = d3.extent(all, xVal); yext = d3.extent(all, yVal);
    xlabel = vlabel(xKey) + " " + t("scatter.adj_suffix"); ylabel = t("scatter.yaxis") + " " + t("scatter.adj_suffix");
  } else {
    all = GEO.features.map(f => f.properties).filter(p => p.init10mio_yes_pct != null && p.main_language && (isPred ? p.pred_yes != null : (p[xKey] != null && isFinite(p[xKey]))));
    xVal = p => isPred ? p.pred_yes : (isLog ? Math.log10(Math.max(1, p[xKey])) : p[xKey]); yVal = p => p.init10mio_yes_pct;
    xext = isPred ? [0, 100] : d3.extent(all, xVal); yext = [0, 100];
    xlabel = isPred ? t("scatter.xaxis_pred") : vlabel(xKey); ylabel = t("scatter.yaxis");
  }
  const pts = all.filter(p => visLang.has(p.main_language));
  const wv = isAdj ? (d => d.valid_votes || 1) : null;   // adjusted plot is vote-weighted (matches the model)
  const sw = 540, sh = 540, m = 54;
  const x = d3.scaleLinear(xext, [m, sw - 10]).nice(), y = d3.scaleLinear(yext, [sh - m, 10]).nice();
  const xTickLab = tk => isPred ? tk : isAdj ? d3.format(".1f")(tk) : fmtVar(xKey, isLog ? Math.pow(10, tk) : tk);
  const yTickLab = tk => isAdj ? d3.format(".0f")(tk) : tk;
  const svg = d3.select("#scatter").attr("viewBox", `0 0 ${sw} ${sh}`).attr("preserveAspectRatio", "xMidYMid meet");
  svg.selectAll("*").remove();
  const g = svg.append("g").on("click", clearScatterPin);
  x.ticks(5).forEach(tk => { g.append("line").attr("x1", x(tk)).attr("x2", x(tk)).attr("y1", y(yext[0])).attr("y2", y(yext[1])).attr("class", "sx-grid"); g.append("text").attr("x", x(tk)).attr("y", y(yext[0]) + 16).attr("class", "sx-tick").attr("text-anchor", "middle").text(xTickLab(tk)); });
  (isAdj ? y.ticks(5) : [0, 25, 50, 75, 100]).forEach(tk => { g.append("line").attr("y1", y(tk)).attr("y2", y(tk)).attr("x1", x(xext[0])).attr("x2", x(xext[1])).attr("class", "sx-grid"); g.append("text").attr("x", m - 8).attr("y", y(tk) + 4).attr("class", "sx-tick").attr("text-anchor", "end").text(yTickLab(tk)); });
  if (isPred) g.append("line").attr("x1", x(0)).attr("y1", y(0)).attr("x2", x(100)).attr("y2", y(100)).attr("class", "sx-diag");
  if (isAdj) { g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", y(yext[0])).attr("y2", y(yext[1])).attr("class", "sx-zero"); g.append("line").attr("y1", y(0)).attr("y2", y(0)).attr("x1", x(xext[0])).attr("x2", x(xext[1])).attr("class", "sx-zero"); }
  for (const k of LANG_ORDER) { if (!visLang.has(k)) continue; const gp = all.filter(p => p.main_language === k); if (gp.length < 5) continue; g.append("path").attr("d", bandPath(regStats(gp, xVal, yVal, wv), x, y)).attr("fill", LANG[k].color).attr("class", "sx-band"); }
  g.selectAll("circle.sx-pt").data(pts).join("circle").attr("class", "sx-pt").attr("cx", d => x(xVal(d))).attr("cy", d => y(yVal(d))).attr("r", 2).style("fill", d => LANG[d.main_language].color).on("pointermove", scatterHover).on("pointerleave", scatterLeave).on("click", scatterClick);
  const slopes = [];
  for (const k of LANG_ORDER) { if (!visLang.has(k)) continue; const gp = all.filter(p => p.main_language === k); if (gp.length < 5) continue; const R = regStats(gp, xVal, yVal, wv); g.append("line").attr("x1", x(R.xmin)).attr("y1", y(R.a + R.b * R.xmin)).attr("x2", x(R.xmax)).attr("y2", y(R.a + R.b * R.xmax)).attr("stroke", LANG[k].color).attr("class", "sx-langline"); slopes.push(`${langName(k)} ${d3.format("+.1f")(R.b)}`); }
  let r = NaN;
  if (pts.length > 5) {
    const Ro = regStats(pts, xVal, yVal, wv);
    g.append("line").attr("x1", x(Ro.xmin)).attr("y1", y(Ro.a + Ro.b * Ro.xmin)).attr("x2", x(Ro.xmax)).attr("y2", y(Ro.a + Ro.b * Ro.xmax)).attr("class", "sx-overall");
    let W = 0, mx = 0, my = 0; pts.forEach(d => { const w = wv ? wv(d) : 1; W += w; mx += w * xVal(d); my += w * yVal(d); }); mx /= W; my /= W;
    let sxy = 0, sx = 0, sy = 0; pts.forEach(d => { const w = wv ? wv(d) : 1; sxy += w * (xVal(d) - mx) * (yVal(d) - my); sx += w * (xVal(d) - mx) ** 2; sy += w * (yVal(d) - my) ** 2; });
    r = sxy / Math.sqrt(sx * sy);
  }
  if (showCities) { const cg = g.append("g"); pts.filter(p => CITIES[p.bfs_nr]).forEach(d => { const gx = x(xVal(d)), gy = y(yVal(d)); cg.append("circle").attr("cx", gx).attr("cy", gy).attr("r", 3.6).attr("class", "sx-citydot").style("fill", LANG[d.main_language].color); cg.append("text").attr("x", gx + 6).attr("y", gy - 4).attr("class", "sx-citylabel").text(CITIES[d.bfs_nr]); }); }
  const stat = isPred ? `R² = ${d3.format(".2f")(RES.fit.full_r2)}` : `r = ${d3.format("+.2f")(r)}${isAdj ? " ·" : ""}`;
  g.append("text").attr("x", x(xext[0]) + 6).attr("y", y(yext[1]) + 6).attr("class", "sx-r2").text(stat);
  g.append("text").attr("x", (m + sw) / 2 - 6).attr("y", sh - 6).attr("text-anchor", "middle").attr("class", "sx-axis").text(xlabel);
  g.append("text").attr("transform", `translate(13 ${sh / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("class", "sx-axis").text(ylabel);
  d3.select("#scatter-cap").html(`${pts.length} ${t("scatter.cap_communes")} · <b>${t("scatter.cap_overall")}</b> · ${t("scatter.cap_lang")}` + (isPred ? ` · ${t("scatter.cap_diag")}` : "") + (slopes.length ? ` · ${t("scatter.cap_slope")}: ${slopes.join(" · ")}` : "") + (isAdj ? `<br>${t("scatter.adj_caption")}` : ""));
  clearScatterPin();
}
function scatterHover(ev, d) {
  d3.select(this).classed("is-active", true);
  tip.style("opacity", 1).attr("aria-hidden", "false").style("left", (ev.clientX + 14) + "px").style("top", (ev.clientY + 14) + "px")
    .html(`<b>${d.commune}</b> · ${langName(d.main_language)}<br>${t("readout.yes_share")}: <span class="tip__v">${fmt.pct(d.init10mio_yes_pct)}%</span>` + (activeX === "pred" ? "" : `<br>${vlabel(activeX)}: <span class="tip__v">${fmtVar(activeX, d[activeX])}</span>`));
}
function scatterLeave() { d3.select(this).classed("is-active", false); tip.style("opacity", 0).attr("aria-hidden", "true"); }
function scatterClick(ev, d) {
  ev.stopPropagation(); scatterPinned = d;
  d3.selectAll("#scatter circle.sx-pt").classed("is-sel", x => x === d);
  const xrow = activeX === "pred"
    ? `${t("readout.predicted_yes")}: <b>${fmt.pct(d.pred_yes)}%</b> · ${t("readout.residual")}: <b>${fmt.signed(d.model_residual)} ${t("readout.pts")}</b>`
    : `${vlabel(activeX)}: <b>${fmtVar(activeX, d[activeX])}</b>`;
  d3.select("#scatter-readout").html(`<span class="sr-name">${d.commune}</span> <span class="sr-canton">${shortCanton(d.canton)}</span><span class="sr-stat">${t("readout.yes_share")} <b>${fmt.pct(d.init10mio_yes_pct)}%</b> · ${xrow}</span>`);
}
function clearScatterPin() { scatterPinned = null; d3.selectAll("#scatter circle.sx-pt").classed("is-sel", false); d3.select("#scatter-readout").html(`<span class="readout__hint">${t("scatter.readout_hint")}</span>`); }

/* ---------- r2 buildup ---------- */
function buildR2() {
  const host = d3.select("#r2"), max = 0.88;
  host.append("div").attr("class", "r2head").text(t("r2.head"));
  RES.r2.forEach((d, i) => {
    const last = i === RES.r2.length - 1;
    host.append("div").attr("class", "r2row").html(
      `<div class="r2row__label">${t(`r2.blocks.${i}`)}</div>
       <div class="r2track"><div class="r2fill ${last ? "r2fill--last" : ""}" style="width:${(d.r2 / max) * 100}%"></div></div>
       <div class="r2val">${d3.format(".2f")(d.r2)}</div>`);
  });
  host.append("div").attr("class", "r2row").html(
    `<div class="r2row__label" style="color:var(--red);font-weight:700">${t("r2.spatial")}</div>
     <div class="r2track"><div class="r2fill r2fill--last" style="width:${(0.867 / max) * 100}%"></div></div>
     <div class="r2val" style="color:var(--red)">0.87</div>`);
}

/* ---------- anomalies ---------- */
function buildAnomalies() {
  const head = `<tr><th>${t("anomalies.th_commune")}</th><th>${t("anomalies.th_canton")}</th><th>${t("anomalies.th_yes")}</th><th>${t("anomalies.th_resid")}</th></tr>`;
  const row = a => `<tr><td>${a.commune}</td><td class="ac">${shortCanton(a.canton)}</td><td>${fmt.pct(a.obs)}%</td><td class="${a.resid >= 0 ? "rp" : "rn"}">${fmt.signed(a.resid)}</td></tr>`;
  d3.select("#anom-pos").html(head + RES.anomalies.pos.map(row).join(""));
  d3.select("#anom-neg").html(head + RES.anomalies.neg.map(row).join(""));
}
const shortCanton = c => (c || "").split(/[\/ ]/)[0];

/* ---------- sources ---------- */
function buildSources() {
  const host = d3.select("#sources-grid");
  RES.sources.forEach((s, i) => host.append("div").attr("class", "scard").html(
    `<span class="scard__n">${String(i + 1).padStart(2, "0")} · ${s.n}</span>
     <span class="scard__name">${t(`sources.items.${i}.name`)}</span>
     <span class="scard__org">${t(`sources.items.${i}.org`)}</span>
     <span class="scard__detail">${t(`sources.items.${i}.detail`)}</span>`));
}

function buildTested() {
  const host = d3.select("#tested-table"); if (host.empty() || !RES.tested) return;
  host.html("");
  const tbl = (rows, head4) => {
    let h = `<table class="ttab"><thead><tr>${head4.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
    h += rows.map(r => `<tr>${r.map((c, j) => `<td class="${j === 0 ? "tv" : ""}">${c}</td>`).join("")}</tr>`).join("");
    return h + "</tbody></table>";
  };
  host.append("h4").attr("class", "ttab__h ttab__h--in").text(`${t("disc.tested.kept_head")} (${RES.tested.kept.length})`);
  host.append("div").attr("class", "ttab__wrap").html(
    tbl(RES.tested.kept, [t("disc.tested.col_var"), t("disc.tested.col_src"), t("disc.tested.col_coef"), t("disc.tested.col_stab")]));
  host.append("h4").attr("class", "ttab__h ttab__h--out").text(`${t("disc.tested.dropped_head")} (${RES.tested.dropped.length})`);
  host.append("div").attr("class", "ttab__wrap").html(
    tbl(RES.tested.dropped, [t("disc.tested.col_var"), t("disc.tested.col_src"), t("disc.tested.col_reason"), t("disc.tested.col_stab")]));
  host.append("p").attr("class", "ttab__foot").html(
    `<strong>${t("disc.tested.unavail")}:</strong> ${RES.tested.unavailable.join(" · ")}`);
}
