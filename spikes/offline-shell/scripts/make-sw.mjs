// Generates out/sw.js with a precache list of every exported file. App shell only:
// authenticated API responses and storage URLs are never cached (SECURITY.md section 6).
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

const out = 'out';
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f !== 'sw.js') files.push('/' + relative(out, p).split(sep).join('/'));
  }
})(out);

const version = createHash('sha256')
  .update(files.join('|') + Date.now())
  .digest('hex')
  .slice(0, 12);

const sw = `
const CACHE = 'shell-${version}';
const PRECACHE = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // never touch cross-origin (Supabase etc.)
  if (url.pathname.startsWith('/api/')) return; // never cache API
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // exported routes are stored as /route/index.html but requested as /route/
    const key = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const hit = (await cache.match(key)) || (await cache.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') {
        const shell = await cache.match('/index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
`;
writeFileSync(join(out, 'sw.js'), sw);
console.log('sw.js written:', files.length, 'precached files, version', version);
