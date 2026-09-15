/* عامل الخدمة: الواجهة تشتغل بلا إنترنت، والمنيو من الشبكة أولاً
 * عشان أي تعديل سعر أو صورة يوصل للعميل أول ما يفتح. */
const VERSION = 'ga-202609152012';
// اسم كاش الصور بيتغيّر لما صورة تتبدّل بنفس اسمها (زي اللوجو) — وإلا الجوالات تفضل تعرض القديمة للأبد
const IMG = 'ga-img-2';
const SHELL = ['./', 'index.html', 'app.css', 'config.js', 'logic.js', 'remote.js', 'app.js',
  'manifest.webmanifest', 'favicon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'data/menu.json', 'github-store.js', 'install.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== IMG).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // المنيو والكود: الشبكة أولاً ثم الكاش
  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || e.request.mode === 'navigate') {
    // المفتاح بلا ?t= عشان الكاش يحتفظ بنسخة واحدة من المنيو يفتح بيها بلا إنترنت
    const key = url.origin + url.pathname;
    e.respondWith(fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
      return r;
    }).catch(() => caches.match(key).then((r) => r || caches.match('index.html'))));
    return;
  }
  // الصور: الكاش أولاً (بتتغيّر باسم ملف جديد لما تتبدّل من اللوحة)
  if (/\.(webp|png|jpg|jpeg|svg)$/.test(url.pathname)) {
    e.respondWith(caches.open(IMG).then((c) => c.match(e.request).then((hit) => hit ||
      fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
  }
});
