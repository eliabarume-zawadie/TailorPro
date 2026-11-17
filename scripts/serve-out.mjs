// Static server for out/ (stands in for Cloudflare static assets in tests). Serves /route/ as /route/index.html and
// applies out/_headers the way Cloudflare does: a rule matches an exact path, or a prefix when it ends in *.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};
const root = 'out';

async function loadRules() {
  const text = await readFile(join(root, '_headers'), 'utf8').catch(() => '');
  const rules = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (/^\s/.test(line)) {
      const i = line.indexOf(':');
      rules.at(-1)?.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    } else rules.push({ pattern: line.trim(), headers: [] });
  }
  return rules;
}
const matches = (pattern, path) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path);

createServer(async (req, res) => {
  const rules = await loadRules(); // re-read per request so a rebuild takes effect without restarting the server
  const urlPath = new URL(req.url, 'http://x').pathname;
  const extra = {};
  for (const r of rules) if (matches(r.pattern, urlPath)) for (const [k, v] of r.headers) extra[k] = v;
  try {
    const p = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, p);
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache', ...extra });
    res.end(body);
  } catch {
    const nf = await readFile(join(root, '404.html')).catch(() => Buffer.from('not found'));
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end(nf);
  }
}).listen(3000, () => console.log('serving out/ on http://localhost:3000'));
