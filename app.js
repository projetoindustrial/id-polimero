/* PWA: duas entradas (interferograma -> FtirCore.run; espectro pronto -> FtirSpec.run) e o mesmo painel de resultado.
 * Opcional: busca ONLINE na biblioteca curada (Worker da Cloudflare, online.js) e aba Raman/NIR (preprocess_grade.js). Sem URL/token configurados, nada disso e usado. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let lib = null, tecCache = null;
  const store = (() => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; } })();
  const conexao = () => (store && typeof Online !== "undefined" ? Online.carregar(store) : null);
  const net = (u, i) => fetch(u, i);
  const status = (t) => { $("status").textContent = t; };
  const friendly = (n) => { let m; if ((m = /^out_([A-Za-z0-9]+)_\d+$/.exec(n))) return m[1] + " (outro polímero)"; if ((m = /^neg_\d+_(.+)$/.exec(n))) return m[1] + " (fibra têxtil)"; return n; };

  fetch("lib.json").then((r) => r.json()).then((j) => { lib = FtirCore.loadLibrary(j); status(`Biblioteca: ${lib.n} entradas (${lib.names.filter((n) => !/^(neg_|out_)/.test(n)).join(", ")} + classes de rejeição).`); })
    .catch((e) => status("Erro ao carregar a biblioteca: " + e.message));

  const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(f); });

  function plot(res, host) {
    const cv = document.createElement("canvas"); cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "Espectro de absorbância de 4000 a 650 cm⁻¹"); host.appendChild(cv);
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1, W = cv.clientWidth || 680, H = 180; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext("2d"); g.scale(dpr, dpr);
    const xs = [], ys = []; for (let k = 0; k < res.A.length; k++) if (Number.isFinite(res.A[k]) && res.nu[k] >= 650 && res.nu[k] <= 4000) { xs.push(res.nu[k]); ys.push(res.A[k]); }
    if (!xs.length) return;
    let lo = Infinity, hi = -Infinity; for (const v of ys) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const css = getComputedStyle(document.documentElement), L = 8, R = W - 8, px = (x) => L + (4000 - x) / 3350 * (R - L), py = (v) => H - 22 - (v - lo) / ((hi - lo) || 1) * (H - 34);
    g.strokeStyle = css.getPropertyValue("--ac").trim() || "#1b4965"; g.lineWidth = 1.2; g.beginPath(); xs.forEach((x, i) => { i ? g.lineTo(px(x), py(ys[i])) : g.moveTo(px(x), py(ys[i])); }); g.stroke();
    g.fillStyle = css.getPropertyValue("--mut").trim() || "#5c6b73"; g.font = "11px system-ui"; g.textAlign = "center";
    [4000, 3000, 2000, 1000, 650].forEach((t) => g.fillText(String(t), Math.min(Math.max(px(t), 14), W - 14), H - 6)); g.textAlign = "left"; g.fillText("cm⁻¹", 4, 12);
  }

  function renderOnline(resp, host, titulo, extras) {   // textContent em tudo que vem do servidor (sem innerHTML)
    const box = document.createElement("div"); box.className = "card"; const h = document.createElement("div"); h.textContent = titulo; box.appendChild(h);
    const t = document.createElement("table"), hr = t.insertRow(); ["Classe", "r", "Fonte", "Licença"].forEach((c) => { hr.insertCell().textContent = c; });
    resp.resultados.forEach((x) => { const tr = t.insertRow(); tr.insertCell().textContent = x.classe; tr.insertCell().textContent = x.r.toFixed(3); tr.insertCell().textContent = x.fonte; tr.insertCell().textContent = x.licenca_classe; }); box.appendChild(t);
    const pc = resp.melhor_por_classe, s = document.createElement("small");
    s.textContent = pc.length > 1 ? `Melhor por classe (entre ${resp.n_candidatos} candidatos): ` + pc.slice(0, 5).map((c) => `${c.classe} ${c.r.toFixed(3)}`).join(" · ") : `Os ${resp.n_candidatos} candidatos são todos da classe ${pc[0] ? pc[0].classe : "?"}.`; box.appendChild(s);
    (resp.alertas || []).map((x) => x.mensagem).concat(extras || []).forEach((msg) => { const ax = document.createElement("div"); ax.className = "aviso"; const sx = document.createElement("small"); sx.textContent = "⚠ " + msg; ax.appendChild(sx); box.appendChild(ax); });
    const a = document.createElement("div"); a.className = "aviso"; const sa = document.createElement("small");
    sa.textContent = "Sem limiar de aceitação calibrado para esta biblioteca: use r, a fonte e a licença como indício, não como decisão. " + (resp.aviso || ""); a.appendChild(sa); box.appendChild(a); host.appendChild(box);
  }
  async function buscarOnline(tec, y, host, titulo) {
    const cx = conexao(); if (!cx) { status("Configure a busca online (URL e token) na seção “Busca online”."); return; }
    status("Consultando a biblioteca online…");
    try { renderOnline(await Online.identificar(cx, tec, y, { topk: 5 }, net), host, titulo); status("Pronto (busca online)."); }
    catch (e) { status("Busca online falhou: " + e.message); }
  }

  function show(res) {
    const known = res.label !== "DESCONHECIDO", top = res.ranking.slice(0, 5), o = $("out"); o.hidden = false; o.innerHTML = "";
    const h = document.createElement("div"); h.className = "big " + (known ? "ok" : "bad"); h.textContent = known ? res.label : "Desconhecido (fora da biblioteca)"; o.appendChild(h);
    const p = document.createElement("div"), noise = res.sigma_line == null ? "limiar fixo (sem 2º background)" : `ruído da linha ${res.sigma_line.toExponential(2)}`;
    p.innerHTML = `<small>r1 = ${res.r1.toFixed(3)} · limiar = ${res.threshold.toFixed(3)} (${noise}) · margem p/ 2ª positiva = ${(res.r1 - res.r2_pos).toFixed(3)} (mín. 0,15)</small>`; o.appendChild(p);
    if (!known) { const n = document.createElement("div"); n.textContent = `Mais próximo: ${friendly(res.ranking[0][0])} (r = ${res.ranking[0][1].toFixed(3)}), abaixo do critério de aceitação.`; o.appendChild(n); }
    const t = document.createElement("table"), hr = t.insertRow(); hr.insertCell().textContent = "Entrada"; hr.insertCell().textContent = "r"; top.forEach(([n, r]) => { const tr = t.insertRow(); tr.insertCell().textContent = friendly(n); tr.insertCell().textContent = r.toFixed(3); }); o.appendChild(t);
    plot(res, o);
    const cx = conexao(), b = document.createElement("button"); b.textContent = "Buscar na biblioteca curada online (FTIR)"; b.disabled = !cx;
    b.onclick = () => { b.disabled = true; buscarOnline("ftir", res.y, o, "Biblioteca curada online · FTIR").then(() => { b.disabled = false; }); }; o.appendChild(b);
    if (!cx) { const hint = document.createElement("small"); hint.textContent = "Para habilitar, informe a URL e o token do seu Worker em “Busca online”."; o.appendChild(hint); }
  }

  async function analyse(btn, fn) {
    if (!lib) { status("Biblioteca ainda não carregada."); return; }
    $(btn).disabled = true; status("Processando…");
    try { await new Promise((r) => setTimeout(r, 20)); show(await fn()); status("Pronto."); }
    catch (e) { status("Erro: " + e.message); } finally { $(btn).disabled = false; }
  }
  const interf = (texts) => FtirCore.run(texts[0], texts[1], texts[2], lib, { atr: $("atr").value === "1", n_fft: parseInt($("nfft").value, 10) });
  const espec = (text) => FtirSpec.run(text, lib, { unit: $("sunit").value, atr: $("satr").value === "1" });
  const txt = (u) => fetch(u).then((r) => r.text());

  $("run").onclick = async () => {
    const fs = [$("fs"), $("fb"), $("fb2")].map((i) => i.files[0]);
    if (fs.some((f) => !f)) { status("Escolha os três arquivos (amostra, background, 2º background)."); return; }
    analyse("run", async () => interf(await Promise.all(fs.map(readFile))));
  };
  const demo = (name, atr) => { $("atr").value = atr; analyse("run", async () => interf(await Promise.all(["sample", "bg", "bg2"].map((s) => txt(`demo/${name}.${s}.csv`))))); };
  $("demo1").onclick = () => demo("pet", "0");
  $("demo2").onclick = () => demo("fibra_poliamida", "1");
  $("srun").onclick = async () => { const f = $("sp").files[0]; if (!f) { status("Escolha o arquivo do espectro."); return; } analyse("srun", async () => espec(await readFile(f))); };
  $("sdemo").onclick = () => { $("sunit").value = "A"; $("satr").value = "0"; analyse("srun", async () => espec(await txt("demo/pet.espectro.csv"))); };

  function tab(n) { [1, 2, 3].forEach((i) => { $("p" + i).hidden = n !== i; $("tab" + i).setAttribute("aria-selected", String(n === i)); }); $("out").hidden = true; }
  $("tab1").onclick = () => tab(1); $("tab2").onclick = () => tab(2); $("tab3").onclick = () => tab(3);

  /* configuracao da busca online: URL e token ficam SO neste aparelho (localStorage); o token nunca volta ao campo nem aparece na tela */
  const refreshCfg = () => { const c = conexao(); $("cfgstatus").textContent = c ? "Configurado: " + c.url + " (token guardado neste aparelho)" : "Não configurado."; };
  $("cfgsalvar").onclick = () => {
    if (!store || typeof Online === "undefined") { status("Este navegador não permite guardar a configuração."); return; }
    try { Online.salvar(store, $("cfgurl").value, $("cfgtoken").value); $("cfgtoken").value = ""; tecCache = null; refreshCfg(); status("Busca online configurada."); } catch (e) { status("Config: " + e.message); }
  };
  $("cfgtestar").onclick = async () => {
    const c = conexao(); if (!c) { status("Salve a URL e o token primeiro."); return; }
    try { tecCache = await Online.tecnicas(c, net); status("Worker ok: " + Object.entries(tecCache).map(([n, v]) => n + (v.implantada ? "" : " (não implantada)")).join(", ")); } catch (e) { status("Teste falhou: " + e.message); }
  };
  $("cfgesquecer").onclick = () => { if (store && typeof Online !== "undefined") Online.esquecer(store); tecCache = null; $("cfgurl").value = ""; $("cfgtoken").value = ""; refreshCfg(); status("URL e token removidos deste aparelho."); };
  if (conexao()) $("cfgurl").value = conexao().url;
  refreshCfg();

  /* aba Raman/NIR: pre-processa NA GRADE da tecnica (vinda de GET /tecnicas, a mesma do indice) e consulta o Worker; nao usa a biblioteca local */
  const INFO = { raman: "Faixa exigida: 620–1800 cm⁻¹ (deslocamento Raman). 79% das referências são do MPX; acerto entre fontes ~67%.", nir: "Faixa exigida: 3999,7–10001,2 cm⁻¹ (se o eixo estiver em nm, escolha nm). Só consulta: solo + PE/PP, unidade de y desconhecida.", nir2: "NIR v2: eixo x em nm, cobrindo 900–1700 nm; escolha o domínio abaixo. Só amostra seca ou úmida: submerso não é suportado; plástico preto ou escuro costuma errar. Uso interno: unidade de y não validada no nirm, sem regra de rejeição (o resultado é indício, não decisão)." };
  $("rtec").onchange = () => { $("rinfo").textContent = INFO[$("rtec").value] || ""; $("rdomrow").hidden = $("rtec").value !== "nir2"; };
  $("rrun").onclick = async () => {
    const f = $("rf").files[0], tec = $("rtec").value; if (!f) { status("Escolha o arquivo do espectro."); return; }
    const cx = conexao(); if (!cx) { status("Configure a busca online (URL e token) primeiro."); return; }
    if (typeof PreprocGrade === "undefined" || (tec === "nir2" && typeof PreprocReceitaA === "undefined")) { status("Módulo de pré-processamento indisponível."); return; }
    $("rrun").disabled = true; status("Processando…");
    try {
      let s = Online.parseXY(await readFile(f));
      if (tec === "nir2") {   // receita A: nm direto, grade 900–1700/4 nm, SNV + Savitzky-Golay; domínio obrigatório
        if ($("rux").value !== "nm") throw new Error("o NIR v2 usa nm: escolha a unidade nm");
        tecCache = tecCache || await Online.tecnicas(cx, net); const c2 = tecCache.nir2;
        if (!c2) throw new Error("técnica nir2 desconhecida no Worker (Worker desatualizado?)"); if (!c2.implantada) throw new Error("técnica nir2 não implantada no Worker");
        const cob2 = Online.cobertura(s, PreprocReceitaA.GRADE); if (!cob2.ok) throw new Error(cob2.msg.replace("cm-1", "nm"));
        const dom = $("rdom").value, y2 = PreprocReceitaA.preprocessA(s.x, s.y), banda = s.y.filter((v, i) => s.x[i] >= 900 && s.x[i] <= 1700 && Number.isFinite(v)), mx = Math.max.apply(null, banda);
        const extras = (mx <= 1.5 && mx < 0.06) ? ["Amostra escura: refletância máxima " + mx.toFixed(3) + " na faixa 900–1700 nm (< 0,06). Plásticos pretos e escuros costumam ser classificados errado; não confie neste resultado."] : [];
        const o2 = $("out"); o2.hidden = false; o2.innerHTML = ""; const h2 = document.createElement("div"); h2.className = "big"; h2.textContent = "NIR v2 · " + dom; o2.appendChild(h2);
        renderOnline(await Online.identificar(cx, "nir2", y2, { topk: 5, filtro: { dominio: dom } }, net), o2, `Biblioteca NIR v2 online · ${dom} (${c2.n_vetores} espectros no total)`, extras); status("Pronto (busca online)."); return;
      }
      if ($("rux").value === "nm") { if (tec !== "nir") throw new Error("a unidade nm só se aplica ao NIR"); s = Online.nmParaCm(s); }
      tecCache = tecCache || await Online.tecnicas(cx, net); const c = tecCache[tec];
      if (!c) throw new Error("técnica desconhecida no Worker"); if (!c.implantada) throw new Error(`técnica '${tec}' não implantada no Worker`);
      const grade = PreprocGrade.gradeDe(c.grade), cob = Online.cobertura(s, grade); if (!cob.ok) throw new Error(cob.msg);
      const y = PreprocGrade.preprocess(s.x, s.y, grade, { atr: false, smooth: c.preprocess.suavizacao, deriv: c.preprocess.derivada, derivWidth: c.preprocess.largura_derivada });
      const o = $("out"); o.hidden = false; o.innerHTML = ""; const hd = document.createElement("div"); hd.className = "big"; hd.textContent = tec === "raman" ? "Raman" : "NIR"; o.appendChild(hd);
      renderOnline(await Online.identificar(cx, tec, y, { topk: 5 }, net), o, `Biblioteca curada online · ${tec.toUpperCase()} (${c.n_vetores} espectros)`); status("Pronto (busca online).");
    } catch (e) { status("Erro: " + e.message); } finally { $("rrun").disabled = false; }
  };

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch((e) => console.warn("service worker:", e));
})();
