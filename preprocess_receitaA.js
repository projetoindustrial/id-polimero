/* preprocess_receitaA.js - receita A (Blueprint v3.1) para o NIR 900-1700 nm, identica ao Python do pipeline (12_pipeline_A/01_processar.py):
 * reamostra linear na grade 900-1700 passo 4 (np.interp, borda replicada) -> SNV (desvio populacional, guarda 1e-10)
 * -> Savitzky-Golay janela 11, polinomio 2, 1a derivada, borda 'interp' (scipy). Devolve o vetor da grade (201 pontos);
 * o Worker faz media 0 e norma 1. UMD: window.PreprocReceitaA no navegador, module.exports no Node. Paridade: test_paridade_receitaA.js. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.PreprocReceitaA = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const GRADE = (() => { const g = new Float64Array(201); for (let i = 0; i < 201; i++) g[i] = 900 + 4 * i; return g; })();
  function interp(grade, xs, ys) {
    const n = grade.length, m = xs.length, out = new Float64Array(n); let j = 0;
    for (let i = 0; i < n; i++) { const g = grade[i];
      if (g <= xs[0]) out[i] = ys[0]; else if (g >= xs[m - 1]) out[i] = ys[m - 1];
      else { while (xs[j + 1] < g) j++; out[i] = ys[j] + (ys[j + 1] - ys[j]) * (g - xs[j]) / (xs[j + 1] - xs[j]); } }
    return out;
  }
  function snv(y) {
    const n = y.length; let m = 0; for (let i = 0; i < n; i++) m += y[i]; m /= n;
    let s = 0; for (let i = 0; i < n; i++) { const d = y[i] - m; s += d * d; } s = Math.sqrt(s / n); if (s === 0) s = 1e-10;
    const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = (y[i] - m) / s; return o;
  }
  function solve3(a) {
    for (let i = 0; i < 3; i++) { let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
      if (p !== i) { const t = a[i]; a[i] = a[p]; a[p] = t; }
      for (let r = i + 1; r < 3; r++) { const f = a[r][i] / a[i][i]; for (let k = i; k < 4; k++) a[r][k] -= f * a[i][k]; } }
    const c = [0, 0, 0]; for (let i = 2; i >= 0; i--) { let s = a[i][3]; for (let k = i + 1; k < 3; k++) s -= a[i][k] * c[k]; c[i] = s / a[i][i]; } return c;
  }
  function derivBorda(y, ini, w, posicoes) {              // ajusta polinomio grau 2 em y[ini..ini+w-1] e devolve a derivada nas posicoes (indices absolutos)
    const xc = (w - 1) / 2, S = new Array(5).fill(0), T = [0, 0, 0];
    for (let j = 0; j < w; j++) { const x = j - xc, v = y[ini + j]; let p = 1; for (let k = 0; k < 5; k++) { S[k] += p; if (k < 3) T[k] += p * v; p *= x; } }
    const c = solve3([[S[0], S[1], S[2], T[0]], [S[1], S[2], S[3], T[1]], [S[2], S[3], S[4], T[2]]]);
    return posicoes.map((i) => c[1] + 2 * c[2] * (i - ini - xc));
  }
  function savgolD1(y, w) {                                // polinomio 2, 1a derivada, delta 1
    if (w % 2 === 0 || w < 5) throw new Error("janela deve ser impar >= 5");
    const n = y.length, h = w >> 1, o = new Float64Array(n); let den = 0; for (let k = -h; k <= h; k++) den += k * k;
    for (let i = h; i < n - h; i++) { let s = 0; for (let k = -h; k <= h; k++) s += k * y[i + k]; o[i] = s / den; }
    const ini = [...Array(h).keys()], fim = [...Array(h).keys()].map((j) => n - h + j);
    derivBorda(y, 0, w, ini).forEach((v, j) => { o[j] = v; }); derivBorda(y, n - w, w, fim).forEach((v, j) => { o[n - h + j] = v; });
    return o;
  }
  /* nu, A: espectro bruto em nm (x estritamente crescente; NaN ignorados). opts.janela (padrao 11). Devolve Float64Array(201) */
  function preprocessA(nu, A, opts) {
    const w = (opts && opts.janela) || 11, xs = [], ys = [];
    for (let k = 0; k < nu.length; k++) if (Number.isFinite(A[k]) && Number.isFinite(nu[k])) { xs.push(nu[k]); ys.push(A[k]); }
    if (xs.length < 2) throw new Error("espectro sem pontos validos");
    for (let k = 1; k < xs.length; k++) if (!(xs[k] > xs[k - 1])) throw new Error("eixo x deve ser estritamente crescente");
    return savgolD1(snv(interp(GRADE, xs, ys)), w);
  }
  return { GRADE, interp, snv, savgolD1, preprocessA };
});
