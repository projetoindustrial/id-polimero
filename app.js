/* PWA: duas entradas (interferograma -> FtirCore.run; espectro pronto -> FtirSpec.run) e o mesmo painel de resultado. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let lib = null;
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

  function show(res) {
    const known = res.label !== "DESCONHECIDO", top = res.ranking.slice(0, 5), o = $("out"); o.hidden = false; o.innerHTML = "";
    const h = document.createElement("div"); h.className = "big " + (known ? "ok" : "bad"); h.textContent = known ? res.label : "Desconhecido (fora da biblioteca)"; o.appendChild(h);
    const p = document.createElement("div"), noise = res.sigma_line == null ? "limiar fixo (sem 2º background)" : `ruído da linha ${res.sigma_line.toExponential(2)}`;
    p.innerHTML = `<small>r1 = ${res.r1.toFixed(3)} · limiar = ${res.threshold.toFixed(3)} (${noise}) · margem p/ 2ª positiva = ${(res.r1 - res.r2_pos).toFixed(3)} (mín. 0,15)</small>`; o.appendChild(p);
    if (!known) { const n = document.createElement("div"); n.textContent = `Mais próximo: ${friendly(res.ranking[0][0])} (r = ${res.ranking[0][1].toFixed(3)}), abaixo do critério de aceitação.`; o.appendChild(n); }
    const t = document.createElement("table"), hr = t.insertRow(); hr.insertCell().textContent = "Entrada"; hr.insertCell().textContent = "r"; top.forEach(([n, r]) => { const tr = t.insertRow(); tr.insertCell().textContent = friendly(n); tr.insertCell().textContent = r.toFixed(3); }); o.appendChild(t);
    plot(res, o);
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

  function tab(n) { $("p1").hidden = n !== 1; $("p2").hidden = n !== 2; $("tab1").setAttribute("aria-selected", String(n === 1)); $("tab2").setAttribute("aria-selected", String(n === 2)); $("out").hidden = true; }
  $("tab1").onclick = () => tab(1); $("tab2").onclick = () => tab(2);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch((e) => console.warn("service worker:", e));
})();
