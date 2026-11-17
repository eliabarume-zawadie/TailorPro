// Generates out/sw.js after `next build` from scripts/sw.template.js: precaches every exported file so the app shell
// opens with no network. The cache name is a hash of the files' contents, so any change to the app produces a new worker
// and a new cache. A new worker WAITS until the user accepts the update (see src/pwa); it never takes over open tabs.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const out = 'out';
const SKIP = new Set(['sw.js', '_headers']);
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (!SKIP.has(f)) files.push('/' + relative(out, p).split(sep).join('/'));
  }
})(out);

// A page is requested and served as /route/, and its security headers are attached to that address. Cache it under the
// same address so the offline copy carries the same policy. Everything else is cached under its file path.
const canonical = (f) => (f.endsWith('/index.html') ? f.slice(0, -'index.html'.length) : f);
const urls = files.map(canonical);

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(out, f)));
const version = hash.digest('hex').slice(0, 12);

const sw = readFileSync('scripts/sw.template.js', 'utf8')
  .replace("'__CACHE__'", JSON.stringify(`shell-${version}`))
  .replace('__PRECACHE__', JSON.stringify(urls));
writeFileSync(join(out, 'sw.js'), sw);
console.log('sw.js written:', files.length, 'precached files, version', version);
