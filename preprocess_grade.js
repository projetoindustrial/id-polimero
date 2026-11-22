/* preprocess_grade.js - pre-processamento para QUALQUER grade (FTIR, Raman, NIR). Mesma cadeia do ftir_sim.matching.preprocess:
 * reamostra (np.interp, borda replicada) -> ATR (opcional) -> media movel 5 (borda replicada) -> linha de base modpoly (cubico, 60 it.)
 * -> media movel de largura derivWidth + 1a derivada (np.gradient, aceita espacamento NAO uniforme) -> media zero, norma 1.
 * O pre-processamento do ftir_core.js tem a grade do FTIR fixa; este aceita a grade da tecnica (GET /tecnicas do Worker).
 * UMD: window.PreprocGrade no navegador, module.exports no Node. Paridade com o Python: test_paridade.js. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.PreprocGrade = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const ATR_REF = 1000.0;

  /* grade da tecnica a partir do `grade` de GET /tecnicas: {inicio, fim, passo} (np.arange(inicio, fim+0.1, passo)) ou {x:[...]} */
  function gradeDe(g) {
    if (Array.isArray(g.x)) return Float64Array.from(g.x);
    const n = Math.round((g.fim - g.inicio) / g.passo) + 1, o = new Float64Array(n);
    for (let i = 0; i < n; i++) o[i] = g.inicio + i * g.passo;
    return o;
  }
  function interp(grade, xs, ys) {                         /* np.interp: xs crescente; fora da faixa vale a borda */
    const n = grade.length, m = xs.length, out = new Float64Array(n); let j = 0;
    for (let i = 0; i < n; i++) { const g = grade[i];
      if (g <= xs[0]) out[i] = ys[0]; else if (g >= xs[m - 1]) out[i] = ys[m - 1];
      else { while (xs[j + 1] < g) j++; out[i] = ys[j] + (ys[j + 1] - ys[j]) * (g - xs[j]) / (xs[j + 1] - xs[j]); } }
    return out;
  }
  function smoothEdge(y, w) {                              /* media movel de w pontos (w impar), borda replicada */
    if (!w || w <= 1) return Float64Array.from(y);
    if (w % 2 === 0) throw new Error("largura de suavizacao deve ser impar");
    const n = y.length, h = w >> 1, o = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = -h; k <= h; k++) s += y[Math.min(Math.max(i + k, 0), n - 1)]; o[i] = s / w; }
    return o;
  }
  function solve4(a) {
    for (let i = 0; i < 4; i++) { let p = i; for (let r = i + 1; r < 4; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
      if (p !== i) { const t = a[i]; a[i] = a[p]; a[p] = t; }
      for (let r = i + 1; r < 4; r++) { const f = a[r][i] / a[i][i]; for (let k = i; k < 5; k++) a[r][k] -= f * a[i][k]; } }
    const c = [0, 0, 0, 0]; for (let i = 3; i >= 0; i--) { let s = a[i][4]; for (let k = i + 1; k < 4; k++) s -= a[i][k] * c[k]; c[i] = s / a[i][i]; } return c;
  }
  function modpoly(x, y) {                                 /* ordem 3, 60 iteracoes; x normalizado como no Python: (x - media)/(max - min) */
    const n = x.length; let mean = 0, mx = -Infinity, mn = Infinity;
    for (let i = 0; i < n; i++) { mean += x[i]; if (x[i] > mx) mx = x[i]; if (x[i] < mn) mn = x[i]; }
    mean /= n; const xs = new Float64Array(n); for (let i = 0; i < n; i++) xs[i] = (x[i] - mean) / (mx - mn);
    const G = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < n; i++) { const p = [1]; for (let k = 1; k < 7; k++) p.push(p[k - 1] * xs[i]); for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) G[a][b] += p[a + b]; }
    const fit = (yy) => { const b = [0, 0, 0, 0]; for (let i = 0; i < n; i++) { let p = 1; for (let k = 0; k < 4; k++) { b[k] += p * yy[i]; p *= xs[i]; } } return solve4(G.map((r, i) => [...r, b[i]])); };
    const pv = (c, v) => ((c[3] * v + c[2]) * v + c[1]) * v + c[0];
    const yy = Float64Array.from(y);
    for (let it = 0; it < 60; it++) { const c = fit(yy); for (let i = 0; i < n; i++) { const f = pv(c, xs[i]); if (f < yy[i]) yy[i] = f; } }
    const c = fit(yy), o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = pv(c, xs[i]); return o;
  }
  function gradiente(f, x) {                               /* np.gradient(f, x): 2a ordem no interior (espacamento variavel), 1a ordem nas pontas */
    const n = f.length, d = new Float64Array(n);
    d[0] = (f[1] - f[0]) / (x[1] - x[0]); d[n - 1] = (f[n - 1] - f[n - 2]) / (x[n - 1] - x[n - 2]);
    for (let i = 1; i < n - 1; i++) { const hs = x[i] - x[i - 1], hd = x[i + 1] - x[i];
      d[i] = (-hd / (hs * (hd + hs))) * f[i - 1] + ((hd - hs) / (hd * hs)) * f[i] + (hs / (hd * (hd + hs))) * f[i + 1]; }
    return d;
  }
  /* nu, A: espectro (A pode ter NaN; sao ignorados); grade: Float64Array da tecnica; opts: {atr, smooth=5, deriv=1, derivWidth=9} */
  function preprocess(nu, A, grade, opts) {
    opts = opts || {}; const smooth = opts.smooth == null ? 5 : opts.smooth, deriv = opts.deriv == null ? 1 : opts.deriv, dw = opts.derivWidth == null ? 9 : opts.derivWidth;
    const xs = [], ys = []; for (let k = 0; k < nu.length; k++) if (Number.isFinite(A[k]) && Number.isFinite(nu[k])) { xs.push(nu[k]); ys.push(A[k]); }
    if (xs.length < 2) throw new Error("espectro sem pontos validos");
    for (let k = 1; k < xs.length; k++) if (!(xs[k] > xs[k - 1])) throw new Error("eixo x deve ser estritamente crescente");
    const n = grade.length; let y = interp(grade, xs, ys);
    if (opts.atr) for (let i = 0; i < n; i++) y[i] *= grade[i] / ATR_REF;
    y = smoothEdge(y, smooth);
    const b = modpoly(grade, y); for (let i = 0; i < n; i++) y[i] -= b[i];
    if (deriv === 1) y = gradiente(smoothEdge(y, dw), grade); else if (deriv !== 0) throw new Error("deriv deve ser 0 ou 1");
    let m = 0; for (let i = 0; i < n; i++) m += y[i]; m /= n;
    let nr = 0; for (let i = 0; i < n; i++) { y[i] -= m; nr += y[i] * y[i]; } nr = Math.sqrt(nr);
    if (nr > 0) for (let i = 0; i < n; i++) y[i] /= nr;
    return y;
  }
  return { gradeDe, interp, smoothEdge, modpoly, gradiente, preprocess };
});
