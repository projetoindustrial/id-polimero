/* Entrada de ESPECTRO PRONTO (CSV: número de onda, valor). Reaproveita preprocess/identify do ftir_core.js sem alterá-lo.
 * Sem 2º background não há ruído de linha: o limiar é FIXO no teto da regra adaptativa (0,60), o mais conservador. Decisão a confirmar. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(require("./ftir_core.js")); else root.FtirSpec = factory(root.FtirCore); })(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";
  const THR = 0.60, MARGIN = 0.15;
  function parse(text, unit) {                               /* unit: "A" absorbância, "T%" transmitância em %, "T" fração */
    const p = [];
    for (const raw of text.split(/\r?\n/)) { const l = raw.trim(); if (!l || /^[#;%]/.test(l)) continue;
      const t = l.split(/[,;\t ]+/); const x = parseFloat(t[0]), v = parseFloat(t[1]); if (t.length < 2 || !Number.isFinite(x) || !Number.isFinite(v)) continue;
      p.push([x, unit === "A" ? v : -Math.log10(Math.max(unit === "T%" ? v / 100 : v, 1e-6))]); }
    if (p.length < 50) throw new Error("espectro com poucos pontos (mínimo 50)");
    p.sort((a, b) => a[0] - b[0]); const q = p.filter((r, i) => !i || r[0] > p[i - 1][0]);
    if (q[0][0] > 900 || q[q.length - 1][0] < 3300) throw new Error(`faixa insuficiente (${q[0][0].toFixed(0)}–${q[q.length - 1][0].toFixed(0)} cm⁻¹); preciso cobrir 900–3300`);
    return q;
  }
  function run(text, lib, opts) {
    opts = opts || {}; const q = parse(text, opts.unit || "A"), N = 4001, A = new Float64Array(N).fill(NaN), nu = new Float64Array(N);
    for (let k = 0, j = 0; k < N; k++) { nu[k] = k; if (k < q[0][0] || k > q[q.length - 1][0]) continue; while (q[j + 1][0] < k) j++; const f = (k - q[j][0]) / (q[j + 1][0] - q[j][0]); A[k] = q[j][1] + (q[j + 1][1] - q[j][1]) * f; }
    const y = F.preprocess({ laser_wn: 1, n_fft: 1 }, A, !!opts.atr, 9), res = F.identify(lib, y, THR, MARGIN);
    return Object.assign(res, { sigma_line: null, threshold: THR, A, nu, y });
  }
  return { parse, run, THR };
});
