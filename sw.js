// Service Worker لـ «تحضيري» — يُولَّد بواسطة tools/build.mjs
const VERSION = '2634629d9e5d';
const SHELL = [
  "./",
  "./css/app.css",
  "./data/sources.json",
  "./dist/ai.js",
  "./dist/arabic.js",
  "./dist/backup.js",
  "./dist/chapters.js",
  "./dist/contentPack.js",
  "./dist/db.js",
  "./dist/generator.js",
  "./dist/linker.js",
  "./dist/main.js",
  "./dist/malzama.js",
  "./dist/pdfImport.js",
  "./dist/prepParser.js",
  "./dist/quiz.js",
  "./dist/review.js",
  "./dist/search.js",
  "./dist/services.js",
  "./dist/subjects.js",
  "./dist/summaryFormat.js",
  "./dist/textQuality.js",
  "./dist/types.js",
  "./dist/ui/admin.js",
  "./dist/ui/dom.js",
  "./dist/ui/info.js",
  "./dist/ui/library.js",
  "./dist/ui/malzama.js",
  "./dist/ui/prep.js",
  "./dist/ui/searchView.js",
  "./dist/ui/shell.js",
  "./dist/ui/state.js",
  "./dist/ui/study.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon.svg",
  "./icons/maskable-512.png",
  "./index.html",
  "./manifest.webmanifest"
];
const SHELL_CACHE = `tahdiri-shell-${VERSION}`;
const RUNTIME_CACHE = 'tahdiri-runtime-v1';
// مكتبات وخطوط من CDN تُخزَّن عند أول استخدام لتعمل دون اتصال لاحقًا
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tahdiri-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // المحتوى المنشور وسجل المصادر: الشبكة أولًا ثم النسخة المخزنة
    if (url.pathname.includes('/content/') || url.pathname.endsWith('/data/sources.json')) {
      event.respondWith(fetch(req).then(res => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || new Response('{"packs":[]}', { headers: { 'content-type': 'application/json' } }))));
      return;
    }
    event.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).catch(() => caches.match('./index.html'))));
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open(RUNTIME_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
