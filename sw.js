// SeastackSchool app shell. The network is always tried first, so a new version of the site shows at once;
// the saved copy is used only when the phone has no connection. Nothing from Supabase or Stripe is ever saved.
const V = "ss-app-v2";
const SHELL = ["./", "./index.html", "./app/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(r, copy)); } return res; })
      .catch(() => caches.match(r, { ignoreSearch: r.mode === "navigate" }).then((m) => m || (r.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
