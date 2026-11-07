/* Service worker: cache offline com stale-while-revalidate (serve do cache e atualiza em segundo plano).
 * Mude VERSION ao alterar a lista de arquivos; mudanças de conteúdo chegam na abertura seguinte mesmo sem mudar VERSION. */
const VERSION = "ftir-pwa-v0.5.5-p4";
const FILES = ["./", "index.html", "app.js", "ftir_core.js", "espectro.js", "lib.json", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png",
  "demo/pet.sample.csv", "demo/pet.bg.csv", "demo/pet.bg2.csv", "demo/fibra_poliamida.sample.csv", "demo/fibra_poliamida.bg.csv", "demo/fibra_poliamida.bg2.csv", "demo/pet.espectro.csv"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const rq = e.request; if (rq.method !== "GET" || new URL(rq.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(rq).then((hit) => {
    const net = fetch(rq).then((r) => { if (r && r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(rq, cp)); } return r; }).catch(() => hit || new Response("offline", { status: 503 }));
    return hit || net;
  }));
});
