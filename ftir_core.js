/* ftir_core.js — mesmo núcleo do C (ftir_core.c), em JavaScript puro (sem dependências), para a PWA offline e para Node.
 * Referência numérica: ftir_sim (Python). UMD: window.FtirCore no navegador, module.exports no Node. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.FtirCore = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const GRID_N = 1676, GRID_LO = 650.0, GRID_STEP = 2.0, ATR_REF = 1000.0;

  function defaultCfg() { return { n_fft: 16384, neg_points: 256, laser_wn: 15798.0, apod: "happ-genzel", zpd_search: 16, floor: 0.02 }; }

  /* CSV de interferograma (formato de ftir_sim/export.py): linhas '#' com parâmetros e "indice,valor".
     Contagens inteiras (soma de n_scans) viram média normalizada: valor * lsb / n_scans. */
  function parseInterferogramCSV(text) {
    const cfg = defaultCfg(); let counts = false, nsc = 1, bits = 0, head = 1; const v = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim(); if (!line) continue;
      if (line[0] === "#") {
        if (line.includes("formato=soma_contagens")) counts = true;
        for (const tok of line.slice(1).split(/\s+/)) { const e = tok.indexOf("="); if (e < 0) continue; const k = tok.slice(0, e), val = parseFloat(tok.slice(e + 1));
          if (k === "n_scans") nsc = val; else if (k === "adc_bits") bits = val; else if (k === "adc_headroom") head = val;
          else if (k === "neg_points") cfg.neg_points = val; else if (k === "laser_wn") cfg.laser_wn = val; else if (k === "n_fft") cfg.n_fft = val; }
        continue;
      }
      const c = line.indexOf(","); if (c < 0) continue; const x = parseFloat(line.slice(c + 1)); if (Number.isFinite(x)) v.push(x);
    }
    if (v.length < 32) throw new Error("interferograma muito curto ou ilegível");
    const lsb = counts ? head / (Math.pow(2, bits - 1) - 1) : 1, y = new Float64Array(v.length);
    for (let i = 0; i < v.length; i++) y[i] = counts ? v[i] * lsb / nsc : v[i];
    return { y, cfg };
  }

  function fft(re, im) {                                   /* radix-2 in-place; re, im: Float64Array de tamanho potência de 2 */
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) { const a = i + k, b = a + half, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  function apodize(name, x) {
    x = Math.min(Math.max(x, 0), 1);
    if (name === "boxcar") return 1; if (name === "triangle") return 1 - x;
    if (name === "happ-genzel") return 0.54 + 0.46 * Math.cos(Math.PI * x);
    return 0.42323 + 0.49755 * Math.cos(Math.PI * x) + 0.07922 * Math.cos(2 * Math.PI * x);
  }

  function singleBeam(cfg, I) {
    const N = cfg.n_fft, len = I.length;
    if (N < 16 || (N & (N - 1)) || len < 32) throw new Error("n_fft inválido");
    const lo = Math.max(cfg.neg_points - cfg.zpd_search, 0), hi = Math.min(cfg.neg_points + cfg.zpd_search + 1, len);
    let n0 = lo, best = -1; for (let i = lo; i < hi; i++) { const v = Math.abs(I[i]); if (v > best) { best = v; n0 = i; } }
    const nR = len - 1 - n0, nL = Math.min(cfg.neg_points, n0, nR);
    if (nL < 8) throw new Error("ZPD muito perto do início da janela");
    if (N < nL + nR + 1) throw new Error("n_fft menor que a janela do interferograma");
    let re = new Float64Array(N), im = new Float64Array(N); const mod = (m) => ((m % N) + N) % N;
    for (let m = -nL; m <= nL; m++) re[mod(m)] = I[n0 + m] * (1 - Math.abs(m) / (nL + 1));
    fft(re, im); const nb = N / 2 + 1, phi = new Float64Array(nb); for (let k = 0; k < nb; k++) phi[k] = Math.atan2(im[k], re[k]);
    re.fill(0); im.fill(0);
    for (let m = -nL; m <= nR; m++) { const w = m > nL ? 2 : 1 + m / nL; re[mod(m)] = I[n0 + m] * w * apodize(cfg.apod, Math.abs(m) / Math.max(nR, 1)); }
    fft(re, im); const S = new Float64Array(nb);
    for (let k = 0; k < nb; k++) S[k] = re[k] * Math.cos(phi[k]) + im[k] * Math.sin(phi[k]);
    return S;
  }
  function absorbance(cfg, Ss, Sb) {
    const nb = Ss.length; let mx = -Infinity; for (let k = 0; k < nb; k++) if (Sb[k] > mx) mx = Sb[k];
    const A = new Float64Array(nb);
    for (let k = 0; k < nb; k++) A[k] = (Sb[k] > cfg.floor * mx && Ss[k] > 0) ? -Math.log10(Ss[k] / Sb[k]) : NaN;
    return A;
  }
  const wn = (cfg, k) => k * cfg.laser_wn / cfg.n_fft;

  function smoothEdge(y, w) { const n = y.length, h = w >> 1, o = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = -h; k <= h; k++) { const j = Math.min(Math.max(i + k, 0), n - 1); s += y[j]; } o[i] = s / w; } return o; }
  function solve4(a) {
    for (let i = 0; i < 4; i++) { let p = i; for (let r = i + 1; r < 4; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
      if (p !== i) { const t = a[i]; a[i] = a[p]; a[p] = t; }
      for (let r = i + 1; r < 4; r++) { const f = a[r][i] / a[i][i]; for (let k = i; k < 5; k++) a[r][k] -= f * a[i][k]; } }
    const c = [0, 0, 0, 0]; for (let i = 3; i >= 0; i--) { let s = a[i][4]; for (let k = i + 1; k < 4; k++) s -= a[i][k] * c[k]; c[i] = s / a[i][i]; } return c;
  }

  function preprocess(cfg, A, atr, derivWidth) {
    const n = GRID_N, nb = A.length, fx = [], fy = [];
    for (let k = 0; k < nb; k++) if (Number.isFinite(A[k])) { fx.push(wn(cfg, k)); fy.push(A[k]); }
    if (fx.length < 2) throw new Error("absorbância sem pontos válidos");
    let y = new Float64Array(n);
    for (let i = 0, j = 0; i < n; i++) { const g = GRID_LO + GRID_STEP * i;
      if (g <= fx[0]) y[i] = fy[0]; else if (g >= fx[fx.length - 1]) y[i] = fy[fx.length - 1];
      else { while (fx[j + 1] < g) j++; y[i] = fy[j] + (fy[j + 1] - fy[j]) * (g - fx[j]) / (fx[j + 1] - fx[j]); } }
    if (atr) for (let i = 0; i < n; i++) y[i] *= (GRID_LO + GRID_STEP * i) / ATR_REF;
    y = smoothEdge(y, 5);
    const gmax = GRID_LO + GRID_STEP * (n - 1); let mean = 0; for (let i = 0; i < n; i++) mean += GRID_LO + GRID_STEP * i; mean /= n;
    const xs = new Float64Array(n); for (let i = 0; i < n; i++) xs[i] = ((GRID_LO + GRID_STEP * i) - mean) / (gmax - GRID_LO);
    const G = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < n; i++) { const p = [1]; for (let k = 1; k < 7; k++) p.push(p[k - 1] * xs[i]); for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) G[a][b] += p[a + b]; }
    const fit = (yy) => { const b = [0, 0, 0, 0]; for (let i = 0; i < n; i++) { let p = 1; for (let k = 0; k < 4; k++) { b[k] += p * yy[i]; p *= xs[i]; } }
      return solve4(G.map((r, i) => [...r, b[i]])); };
    const pv = (c, x) => ((c[3] * x + c[2]) * x + c[1]) * x + c[0];
    const yy = Float64Array.from(y);
    for (let it = 0; it < 60; it++) { const c = fit(yy); for (let i = 0; i < n; i++) { const f = pv(c, xs[i]); if (f < yy[i]) yy[i] = f; } }
    const c = fit(yy); for (let i = 0; i < n; i++) y[i] -= pv(c, xs[i]);
    const t = smoothEdge(y, derivWidth), d = new Float64Array(n);
    for (let i = 0; i < n; i++) d[i] = i === 0 ? (t[1] - t[0]) / GRID_STEP : i === n - 1 ? (t[n - 1] - t[n - 2]) / GRID_STEP : (t[i + 1] - t[i - 1]) / (2 * GRID_STEP);
    let m = 0; for (let i = 0; i < n; i++) m += d[i]; m /= n; let nr = 0; for (let i = 0; i < n; i++) { d[i] -= m; nr += d[i] * d[i]; } nr = Math.sqrt(nr);
    if (nr > 0) for (let i = 0; i < n; i++) d[i] /= nr; return d;
  }

  function lineNoise(cfg, A) {
    const xs = [], ys = []; for (let k = 0; k < A.length; k++) { const x = wn(cfg, k); if (x >= 2000 && x <= 2200 && Number.isFinite(A[k])) { xs.push(x); ys.push(A[k]); } }
    const m = xs.length; if (m < 3) return -1; let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < m; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    const sl = (m * sxy - sx * sy) / (m * sxx - sx * sx), ic = (sy - sl * sx) / m; let ss = 0;
    for (let i = 0; i < m; i++) { const r = ys[i] - (sl * xs[i] + ic); ss += r * r; } return Math.sqrt(ss / m);
  }
  function adaptiveThreshold(s) { const t = -0.209 + -0.241 * Math.log10(s); return Math.min(Math.max(t, 0.30), 0.60); }

  function loadLibrary(json) {                              /* lib.json gerado por gen_vectors.py (float32 little-endian em base64) */
    const bin = typeof Buffer !== "undefined" ? Buffer.from(json.vectors_b64, "base64") : Uint8Array.from(atob(json.vectors_b64), (c) => c.charCodeAt(0));
    const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), f = new Float32Array(buf);
    const n = json.names.length, g = json.grid.n; if (f.length !== n * g) throw new Error("biblioteca corrompida");
    return { names: json.names, g, vec: f, n };
  }
  const isNeg = (nm) => nm.startsWith("neg_") || nm.startsWith("out_");
  function identify(lib, y, thr, margin) {                  /* regra G0 (ver ftir_sim.decide) */
    const r = new Float64Array(lib.n);
    for (let i = 0; i < lib.n; i++) { let s = 0; const o = i * lib.g; for (let k = 0; k < lib.g; k++) s += lib.vec[o + k] * y[k]; r[i] = s; }
    const order = Array.from(r.keys()).sort((a, b) => r[b] - r[a]), ranking = order.map((i) => [lib.names[i], r[i]]);
    const pos = ranking.filter((x) => !isNeg(x[0])); if (pos.length < 2) throw new Error("precisa de 2 classes positivas");
    const r1 = pos[0][1], r2 = pos[1][1], ok = !isNeg(ranking[0][0]) && r1 >= thr && r1 - r2 >= margin;
    return { label: ok ? pos[0][0] : "DESCONHECIDO", r1, r2_pos: r2, ranking };
  }

  /* cadeia completa: 3 CSVs (amostra, background, 2º background) -> resultado */
  function run(csvSample, csvBg, csvBg2, lib, opts) {
    opts = opts || {}; const s = parseInterferogramCSV(csvSample), b = parseInterferogramCSV(csvBg), b2 = parseInterferogramCSV(csvBg2);
    const cfg = Object.assign({}, s.cfg); if (opts.n_fft) cfg.n_fft = opts.n_fft;
    const Ss = singleBeam(cfg, s.y), Sb = singleBeam(cfg, b.y), Sb2 = singleBeam(cfg, b2.y);
    const A = absorbance(cfg, Ss, Sb), Al = absorbance(cfg, Sb2, Sb), sigma = lineNoise(cfg, Al), thr = adaptiveThreshold(sigma);
    const y = preprocess(cfg, A, !!opts.atr, 9), res = identify(lib, y, thr, opts.margin == null ? 0.15 : opts.margin);
    return Object.assign(res, { sigma_line: sigma, threshold: thr, A, nu: Float64Array.from(A, (_, k) => wn(cfg, k)), y, cfg });
  }
  return { GRID_N, GRID_LO, GRID_STEP, defaultCfg, parseInterferogramCSV, singleBeam, absorbance, preprocess, lineNoise, adaptiveThreshold, loadLibrary, identify, run };
});
