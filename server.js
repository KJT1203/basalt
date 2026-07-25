/* Basalt ▲ — local-first markdown vault. Zero dependencies.
   Usage: node server.js [vaultPath]   (default C:/Study/Vault) */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const PORT = 8088;
const VAULT = path.resolve(process.argv[2] || 'C:/Study/Vault');
const PUB = path.join(__dirname, 'public');

fs.mkdirSync(VAULT, { recursive: true });

/* seed an empty vault with starter notes */
if (!fs.readdirSync(VAULT).some(f => f.toLowerCase().endsWith('.md'))) {
  fs.writeFileSync(path.join(VAULT, 'Welcome.md'),
`# Welcome to Basalt ▲

Your vault lives at \`${VAULT.replace(/\\/g, '\\\\')}\` — every note is a plain \`.md\` file on disk.

- Link notes with [[Claude]]-style wikilinks (type \`[[\` for autocomplete)
- Toggle edit / reading view with **Ctrl+E**
- Quick-open any note with **Ctrl+O**
- Click **Graph** to see your vault as a constellation
- Tag things #like-this

## Why plain files?

Because both of us can use them. You write here; Claude reads and writes
the same files straight from disk in any session. No lock-in, no export —
your notes are already just text.

#welcome
`);
  fs.writeFileSync(path.join(VAULT, 'Claude.md'),
`# Claude

This vault is shared between Khai and Claude.

**Claude:** this vault lives at \`${VAULT.replace(/\\/g, '\\\\')}\`. Read and write
notes here directly with your file tools. Conventions:

- Wikilinks: \`[[Note Name]]\` — matches by file name, no \`.md\`
- Tags: \`#like-this\`
- Daily notes: \`Journal/YYYY-MM-DD.md\`

Leave notes for each other here. See [[Welcome]] for the app's features.

#meta
`);
}

function safePath(rel) {
  const abs = path.resolve(VAULT, String(rel || '').replace(/\\/g, '/'));
  if (abs !== VAULT && !abs.startsWith(VAULT + path.sep)) throw new Error('path escapes vault');
  return abs;
}

async function walk(dir, base = '') {
  const out = [];
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) { out.push({ path: rel, dir: true }); out.push(...await walk(path.join(dir, e.name), rel)); }
    else if (e.name.toLowerCase().endsWith('.md')) out.push({ path: rel });
  }
  return out;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
async function readBody(req) { let b = ''; for await (const c of req) b += c; return b ? JSON.parse(b) : {}; }

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/info') return json(res, { vault: VAULT, name: path.basename(VAULT) });
    if (url.pathname === '/api/tree') return json(res, await walk(VAULT));
    if (url.pathname === '/api/all') {
      const all = {};
      for (const f of (await walk(VAULT)).filter(f => !f.dir))
        all[f.path] = await fsp.readFile(safePath(f.path), 'utf8');
      return json(res, all);
    }
    if (url.pathname === '/api/note') {
      const p = safePath(url.searchParams.get('path'));
      if (req.method === 'GET') return json(res, { content: await fsp.readFile(p, 'utf8') });
      if (req.method === 'PUT') {
        const { content } = await readBody(req);
        await fsp.mkdir(path.dirname(p), { recursive: true });
        await fsp.writeFile(p, content, 'utf8');
        return json(res, { ok: true });
      }
      if (req.method === 'DELETE') { await fsp.rm(p, { recursive: true }); return json(res, { ok: true }); }
    }
    if (url.pathname === '/api/mkdir' && req.method === 'POST') {
      await fsp.mkdir(safePath((await readBody(req)).path), { recursive: true });
      return json(res, { ok: true });
    }
    if (url.pathname === '/api/rename' && req.method === 'POST') {
      const { from, to } = await readBody(req);
      const src = safePath(from), dst = safePath(to);
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      await fsp.rename(src, dst);
      // Obsidian behavior: renaming a note rewrites [[wikilinks]] across the vault
      const oldName = path.basename(from, '.md'), newName = path.basename(to, '.md');
      if (from.toLowerCase().endsWith('.md') && oldName !== newName) {
        const rx = new RegExp('\\[\\[' + oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\]\\]|\\|)', 'gi');
        for (const f of (await walk(VAULT)).filter(f => !f.dir)) {
          const p2 = safePath(f.path);
          const txt = await fsp.readFile(p2, 'utf8');
          const upd = txt.replace(rx, '[[' + newName + '$1');
          if (upd !== txt) await fsp.writeFile(p2, upd, 'utf8');
        }
      }
      return json(res, { ok: true });
    }
    // static frontend
    const fp = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!fp.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    try {
      const data = await fsp.readFile(fp);
      res.writeHead(200, { 'Content-Type': (MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream') + '; charset=utf-8' });
      res.end(data);
    } catch { res.writeHead(404); res.end('not found'); }
  } catch (e) { json(res, { error: e.message }, 400); }
})
  // ponytail: localhost-only on purpose — this API writes to disk
  .on('error', e => {
    // the app shortcut launches this every time; a running copy is success, not failure
    if (e.code === 'EADDRINUSE') { console.log(`Basalt is already running on http://localhost:${PORT}`); process.exit(0); }
    throw e;
  })
  .listen(PORT, '127.0.0.1', () =>
    console.log(`Basalt ▲  vault: ${VAULT}  →  http://localhost:${PORT}`));
