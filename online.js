/* online.js - cliente da busca ONLINE (Worker da Cloudflare). Opcional: o PWA continua funcionando sem rede e sem isto.
 * O que sai do aparelho: SO o vetor pre-processado (media zero, norma 1) e a tecnica; a amostra bruta nao sai.
 * URL e token ficam no localStorage DESTE aparelho (nunca no codigo, que e publico). UMD: window.Online / module.exports. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.Online = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const KEY = "ftir-online-v1";

  function normalizarUrl(u) {
    u = String(u || "").trim().replace(/\/+$/, ""); if (!u) throw new Error("informe a URL do Worker");
    let url; try { url = new URL(u); } catch (e) { throw new Error("URL invalida"); }
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("use https:// (o token nao deve trafegar sem criptografia)");
    return url.origin + url.pathname.replace(/\/+$/, "");
  }
  function carregar(st) { try { const j = JSON.parse(st.getItem(KEY) || "null"); return j && j.url && j.token ? j : null; } catch (e) { return null; } }
  function salvar(st, url, token) {
    token = String(token || "").trim(); if (token.length < 16) throw new Error("token curto demais (gere 32+ caracteres: openssl rand -hex 32)");
    const u = normalizarUrl(url); st.setItem(KEY, JSON.stringify({ url: u, token })); return u;
  }
  function esquecer(st) { st.removeItem(KEY); }

  async function chamar(cfg, caminho, init, f, ms) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null, to = ctl ? setTimeout(() => ctl.abort(), ms || 20000) : null;
    let r;
    try { r = await f(cfg.url + caminho, Object.assign({}, init, { headers: Object.assign({}, init && init.headers, { Authorization: "Bearer " + cfg.token, "Content-Type": "application/json" }), signal: ctl ? ctl.signal : undefined })); }
    catch (e) { throw new Error(e && e.name === "AbortError" ? "tempo esgotado (20 s)" : "sem rede ou Worker inacessivel (confira a URL e o CORS: ALLOWED_ORIGIN do Worker)"); }
    finally { if (to) clearTimeout(to); }
    let j = null; try { j = await r.json(); } catch (e) { /* corpo vazio ou nao JSON */ }
    if (!r.ok) throw new Error(r.status === 401 ? "token invalido ou ausente" : (j && j.erro) || "erro " + r.status);
    return j;
  }
  const tecnicas = (cfg, f) => chamar(cfg, "/tecnicas", { method: "GET" }, f);
  function identificar(cfg, tecnica, y, opts, f) {
    const v = Array.from(y, (x) => Math.round(x * 1e7) / 1e7); opts = opts || {};
    return chamar(cfg, "/identificar", { method: "POST", body: JSON.stringify(Object.assign({ tecnica, y: v, topk: opts.topk || 5 }, opts.filtro ? { filtro: opts.filtro } : {})) }, f);
  }

  /* CSV generico x,y (Raman/NIR): separadores , ; tab espaco; linhas nao numericas sao ignoradas; ordena e remove x repetido */
  function parseXY(texto) {
    const pts = [];
    for (const ln of String(texto).split(/\r?\n/)) { const p = ln.trim().split(/[,;\t ]+/); if (p.length < 2) continue; const x = Number(p[0]), y = Number(p[1]); if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]); }
    if (pts.length < 50) throw new Error("poucos pontos numericos (" + pts.length + "); esperado CSV com eixo x e intensidade");
    pts.sort((a, b) => a[0] - b[0]); const xs = [], ys = [];
    for (const [x, y] of pts) if (!xs.length || x > xs[xs.length - 1]) { xs.push(x); ys.push(y); }
    return { x: Float64Array.from(xs), y: Float64Array.from(ys) };
  }
  /* nm -> cm-1 (1e7/nm), de volta em ordem crescente */
  function nmParaCm(s) { const n = s.x.length, x = new Float64Array(n), y = new Float64Array(n); for (let i = 0; i < n; i++) { x[i] = 1e7 / s.x[n - 1 - i]; y[i] = s.y[n - 1 - i]; } return { x, y }; }
  /* o espectro precisa cobrir a grade da tecnica (tolerancia 10 cm-1, como na construcao do indice): extrapolar com a borda geraria lixo */
  function cobertura(s, grade, tol) {
    tol = tol == null ? 10 : tol; const ok = s.x[0] <= grade[0] + tol && s.x[s.x.length - 1] >= grade[grade.length - 1] - tol;
    return { ok, msg: ok ? "" : `o espectro (${s.x[0].toFixed(0)}-${s.x[s.x.length - 1].toFixed(0)}) nao cobre a faixa ${grade[0].toFixed(0)}-${grade[grade.length - 1].toFixed(0)} cm-1 desta tecnica` };
  }
  return { normalizarUrl, carregar, salvar, esquecer, chamar, tecnicas, identificar, parseXY, nmParaCm, cobertura, KEY };
});
