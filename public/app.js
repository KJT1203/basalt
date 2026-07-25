/* ============ Basalt ▲ — app ============ */
const $ = s => document.querySelector(s);
const api = (p, opts) => fetch(p, opts).then(r => r.json());

let tree = [], all = {}, current = null, dirty = false, mode = 'edit';
let saveTimer = null;
const collapsed = new Set(JSON.parse(localStorage.getItem('basalt-collapsed') || '[]'));

const editor = $('#editor'), preview = $('#preview');
const baseName = p => p.replace(/\.md$/i, '').split('/').pop();
const noteByName = name => Object.keys(all).find(p =>
  baseName(p).toLowerCase() === name.toLowerCase() || p.toLowerCase() === (name.toLowerCase() + '.md'));

/* ================= markdown renderer ================= */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function wikilink(link, alias) {
  const exists = noteByName(link.trim());
  return `<a class="wl${exists ? '' : ' new'}" data-link="${escAttr(link.trim())}">${esc(alias)}</a>`;
}
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push('<code>' + esc(c) + '</code>'); return '\x00' + (codes.length - 1) + '\x00'; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\[\[([^\]|\n]+)\|([^\]\n]+)\]\]/g, (m, l, a) => wikilink(l, a));
  s = s.replace(/\[\[([^\]\n]+)\]\]/g, (m, l) => wikilink(l, l));
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  s = s.replace(/(^|\s)#([A-Za-z][\w/-]*)/g, '$1<span class="tag" data-tag="$2">#$2</span>');
  s = s.replace(/\x00(\d+)\x00/g, (m, i) => codes[i]);
  return s;
}
function splitRow(s) { return s.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()); }
function renderList(items) {
  let html = '', stack = [];
  for (const it of items) {
    while (stack.length && stack[stack.length - 1].indent > it.indent) html += stack.pop().ordered ? '</ol>' : '</ul>';
    if (!stack.length || stack[stack.length - 1].indent < it.indent) {
      stack.push({ indent: it.indent, ordered: it.ordered });
      html += it.ordered ? '<ol>' : '<ul>';
    }
    const t = it.text.match(/^\[( |x|X)\]\s+(.*)$/);
    if (t) html += `<li class="task"><input type="checkbox" data-line="${it.line}"${t[1] !== ' ' ? ' checked' : ''}><span${t[1] !== ' ' ? ' class="done"' : ''}>${inline(t[2])}</span></li>`;
    else html += '<li>' + inline(it.text) + '</li>';
  }
  while (stack.length) html += stack.pop().ordered ? '</ol>' : '</ul>';
  return html;
}
function mdRender(src, lineOffset = 0) {
  const lines = src.split('\n');
  let html = '', i = 0;
  while (i < lines.length) {
    const L = lines[i];
    if (/^```/.test(L)) {
      let j = i + 1, buf = [];
      while (j < lines.length && !/^```/.test(lines[j])) buf.push(lines[j++]);
      html += '<pre><code>' + esc(buf.join('\n')) + '</code></pre>'; i = j + 1; continue;
    }
    const h = L.match(/^(#{1,6})\s+(.*)/);
    if (h) { html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(L)) { html += '<hr>'; i++; continue; }
    if (/^>/.test(L)) {
      let buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      html += '<blockquote>' + mdRender(buf.join('\n'), -1) + '</blockquote>'; continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(L)) {
      let items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (!m) break;
        items.push({ indent: Math.floor(m[1].replace(/\t/g, '  ').length / 2), ordered: /\d/.test(m[2]), text: m[3], line: lineOffset < 0 ? -1 : i + lineOffset });
        i++;
      }
      html += renderList(items); continue;
    }
    if (/\|/.test(L) && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])) {
      const head = splitRow(L); i += 2; let rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) rows.push(splitRow(lines[i++]));
      html += '<table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'
        + rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
      continue;
    }
    if (!L.trim()) { i++; continue; }
    let buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s+|\s*-{3,}\s*$)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) buf.push(lines[i++]);
    html += '<p>' + buf.map(inline).join('<br>') + '</p>';
  }
  return html;
}

/* ================= saving ================= */
function setSaveState(t, isDirty) {
  const el = $('#savestate');
  el.textContent = t;
  el.dataset.dirty = isDirty ? '1' : '0';
}
async function flushSave() {
  clearTimeout(saveTimer);
  if (!dirty || !current) return;
  dirty = false;
  all[current] = editor.value;
  setSaveState('saving');
  await api('/api/note?path=' + encodeURIComponent(current), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: editor.value })
  });
  setSaveState('saved');
  renderTags();
  updateBacklinks();
}
editor.addEventListener('input', () => {
  dirty = true;
  setSaveState('unsaved', true);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 600);
  updateWordCount();
  updateAutocomplete();
});
addEventListener('beforeunload', () => {
  if (dirty && current) fetch('/api/note?path=' + encodeURIComponent(current), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: editor.value }), keepalive: true
  });
});

/* ================= open / render ================= */
async function openNote(p) {
  if (p && all[p] === undefined) return;
  await flushSave();
  current = p;
  localStorage.setItem('basalt-last', p || '');
  $('#empty').classList.toggle('hidden', !!p);
  editor.classList.toggle('hidden', !p || mode !== 'edit');
  preview.classList.toggle('hidden', !p || mode !== 'read');
  $('#backlinks').classList.toggle('hidden', !p);
  $('#crumb').textContent = p ? p.replace(/\.md$/i, '').split('/').join(' · ') : 'no note open';
  if (!p) { renderTree(); return; }
  editor.value = all[p];
  if (mode === 'read') renderPreview();
  renderTree(); updateBacklinks(); updateWordCount();
  setSaveState('saved');
  if (mode === 'edit') editor.focus();
}
function renderPreview() { preview.innerHTML = mdRender(editor.value); preview.scrollTop = 0; }
function setMode(m) {
  mode = m;
  $('#modebtn').textContent = m === 'edit' ? 'Read' : 'Edit';
  if (!current) return;
  editor.classList.toggle('hidden', m !== 'edit');
  preview.classList.toggle('hidden', m !== 'read');
  if (m === 'read') renderPreview(); else editor.focus();
}
$('#modebtn').onclick = () => setMode(mode === 'edit' ? 'read' : 'edit');
function updateWordCount() {
  const w = editor.value.trim() ? editor.value.trim().split(/\s+/).length : 0;
  $('#wordcount').textContent = current ? `${w} words · ${editor.value.length} chars` : '';
}

/* click handling inside preview: wikilinks, tags, checkboxes */
preview.addEventListener('click', async e => {
  const wl = e.target.closest('a.wl');
  if (wl) {
    const name = wl.dataset.link;
    const p = noteByName(name);
    if (p) openNote(p);
    else { // create on click, like Obsidian
      const np = name + '.md';
      all[np] = `# ${name}\n\n`;
      await api('/api/note?path=' + encodeURIComponent(np), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: all[np] }) });
      await refresh(); setMode('edit'); openNote(np);
    }
    return;
  }
  const tag = e.target.closest('.tag');
  if (tag) { $('#search').value = '#' + tag.dataset.tag; runSearch(); return; }
  if (e.target.matches('input[type=checkbox][data-line]')) {
    const ln = +e.target.dataset.line;
    if (ln < 0) return;
    const lines = editor.value.split('\n');
    lines[ln] = /\[ \]/.test(lines[ln]) ? lines[ln].replace('[ ]', '[x]') : lines[ln].replace(/\[(x|X)\]/, '[ ]');
    editor.value = lines.join('\n');
    dirty = true; await flushSave(); renderPreview();
  }
});

/* ================= tree ================= */
function renderTree() {
  const el = $('#tree');
  el.innerHTML = '';
  const dirs = tree.filter(t => t.dir).map(t => t.path);
  const notes = tree.filter(t => !t.dir).map(t => t.path);
  const children = parent => {
    const pref = parent ? parent + '/' : '';
    const d = dirs.filter(p => p.startsWith(pref) && !p.slice(pref.length).includes('/'));
    const n = notes.filter(p => p.startsWith(pref) && !p.slice(pref.length).includes('/'));
    return { d: d.sort(), n: n.sort() };
  };
  const build = (parent, container, depth) => {
    const { d, n } = children(parent);
    for (const dir of d) {
      const row = document.createElement('div');
      row.className = 'titem' + (collapsed.has(dir) ? '' : ' open');
      row.style.paddingLeft = 8 + depth * 14 + 'px';
      const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '▶';
      row.append(arrow, document.createTextNode(dir.split('/').pop()));
      const box = document.createElement('div');
      row.onclick = () => {
        collapsed.has(dir) ? collapsed.delete(dir) : collapsed.add(dir);
        localStorage.setItem('basalt-collapsed', JSON.stringify([...collapsed]));
        renderTree();
      };
      container.append(row, box);
      if (!collapsed.has(dir)) build(dir, box, depth + 1);
    }
    for (const note of n) {
      const row = document.createElement('div');
      row.className = 'titem note' + (note === current ? ' active' : '');
      row.style.paddingLeft = 22 + depth * 14 + 'px';
      row.textContent = baseName(note);
      row.title = note;
      row.onclick = () => openNote(note);
      container.append(row);
    }
  };
  build('', el, 0);
}

/* ================= backlinks ================= */
function updateBacklinks() {
  const el = $('#backlinks');
  if (!current) return;
  const name = baseName(current).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp('\\[\\[' + name + '(\\||\\]\\])', 'i');
  const hits = [];
  for (const p in all) {
    if (p === current) continue;
    if (rx.test(all[p])) {
      const line = all[p].split('\n').find(l => rx.test(l)) || '';
      hits.push({ p, line: line.trim() });
    }
  }
  el.innerHTML = `<h4>linked from · ${hits.length}</h4>`;
  for (const h of hits) {
    const row = document.createElement('div');
    row.className = 'blrow';
    const nm = document.createElement('div'); nm.className = 'blname'; nm.textContent = baseName(h.p);
    const sn = document.createElement('div'); sn.className = 'blsnip'; sn.textContent = h.line;
    row.append(nm, sn);
    row.onclick = () => openNote(h.p);
    el.append(row);
  }
  if (!hits.length) el.innerHTML += '<div class="blempty">no other note links here yet</div>';
}

/* ================= tags ================= */
function renderTags() {
  const counts = {};
  for (const p in all)
    for (const m of all[p].matchAll(/(^|\s)#([A-Za-z][\w/-]*)/g))
      counts[m[2]] = (counts[m[2]] || 0) + 1;
  const el = $('#tags');
  el.innerHTML = '';
  for (const t of Object.keys(counts).sort((a, b) => counts[b] - counts[a])) {
    const chip = document.createElement('span');
    chip.className = 'tagchip';
    chip.textContent = `#${t} ${counts[t]}`;
    chip.onclick = () => { $('#search').value = '#' + t; runSearch(); };
    el.append(chip);
  }
}

/* ================= search ================= */
function runSearch() {
  const q = $('#search').value.trim();
  const res = $('#results'), treeEl = $('#tree');
  if (!q) { res.classList.add('hidden'); treeEl.classList.remove('hidden'); return; }
  res.classList.remove('hidden'); treeEl.classList.add('hidden');
  res.innerHTML = '';
  const ql = q.toLowerCase();
  const isTag = q.startsWith('#');
  const hits = [];
  for (const p in all) {
    const content = all[p];
    if (isTag) {
      const rx = new RegExp('(^|\\s)' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (rx.test(content)) hits.push({ p, snip: (content.split('\n').find(l => rx.test(l)) || '').trim() });
    } else {
      const nameHit = baseName(p).toLowerCase().includes(ql);
      const idx = content.toLowerCase().indexOf(ql);
      if (nameHit || idx !== -1) {
        const line = idx !== -1 ? content.slice(0, idx).split('\n').length - 1 : 0;
        hits.push({ p, snip: (content.split('\n')[line] || '').trim(), nameHit });
      }
    }
  }
  hits.sort((a, b) => (b.nameHit || 0) - (a.nameHit || 0));
  for (const h of hits.slice(0, 50)) {
    const row = document.createElement('div');
    row.className = 'rrow';
    const nm = document.createElement('div'); nm.className = 'rname'; nm.textContent = baseName(h.p);
    const sn = document.createElement('div'); sn.className = 'rsnip'; sn.textContent = h.snip;
    row.append(nm, sn);
    row.onclick = () => openNote(h.p);
    res.append(row);
  }
  if (!hits.length) res.innerHTML = '<div class="rrow"><div class="rsnip">No results</div></div>';
}
$('#search').addEventListener('input', runSearch);
$('#search').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; runSearch(); e.target.blur(); } });

/* ================= toolbar actions ================= */
$('#newnote').onclick = async () => {
  const name = prompt('New note name (use / for folders):', 'Untitled');
  if (!name) return;
  const p = name.replace(/\.md$/i, '') + '.md';
  if (all[p] !== undefined) return openNote(p);
  all[p] = `# ${baseName(p)}\n\n`;
  await api('/api/note?path=' + encodeURIComponent(p), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: all[p] }) });
  await refresh(); setMode('edit'); openNote(p);
};
$('#newfolder').onclick = async () => {
  const name = prompt('New folder name:');
  if (!name) return;
  await api('/api/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: name }) });
  refresh();
};
$('#todaybtn').onclick = async () => {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const p = `Journal/${iso}.md`;
  if (all[p] === undefined) {
    all[p] = `# ${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n`;
    await api('/api/note?path=' + encodeURIComponent(p), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: all[p] }) });
    await refresh();
  }
  setMode('edit'); openNote(p);
};
$('#renamebtn').onclick = async () => {
  if (!current) return;
  const to = prompt('Rename / move note:', current);
  if (!to || to === current) return;
  const dest = to.replace(/\.md$/i, '') + '.md';
  await flushSave();
  await api('/api/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: current, to: dest }) });
  current = null;
  await refresh(); openNote(dest);
};
$('#delbtn').onclick = async () => {
  if (!current || !confirm(`Delete "${baseName(current)}"? The file is removed from disk.`)) return;
  await api('/api/note?path=' + encodeURIComponent(current), { method: 'DELETE' });
  delete all[current];
  current = null;
  await refresh(); openNote(null);
};

/* ================= quick switcher ================= */
let palSel = 0;
function fuzzy(q, s) {
  q = q.toLowerCase(); s = s.toLowerCase();
  let i = 0, score = 0, last = -1;
  for (const ch of q) {
    const idx = s.indexOf(ch, i);
    if (idx === -1) return -1;
    score += idx === last + 1 ? 3 : 1;
    last = idx; i = idx + 1;
  }
  return score + (s.startsWith(q) ? 10 : 0);
}
function openPalette() { $('#palette').classList.remove('hidden'); $('#palinput').value = ''; palSel = 0; renderPalette(); $('#palinput').focus(); }
function closePalette() { $('#palette').classList.add('hidden'); }
function renderPalette() {
  const q = $('#palinput').value.trim();
  const list = $('#pallist');
  list.innerHTML = '';
  let items = Object.keys(all)
    .map(p => ({ p, score: q ? fuzzy(q, baseName(p)) : 0 }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  const canCreate = q && !noteByName(q);
  const total = items.length + (canCreate ? 1 : 0);
  if (palSel >= total) palSel = Math.max(0, total - 1);
  items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'palrow' + (i === palSel ? ' sel' : '');
    const nm = document.createElement('span'); nm.textContent = baseName(it.p);
    const dir = document.createElement('span'); dir.className = 'pdir'; dir.textContent = it.p.includes('/') ? it.p.split('/').slice(0, -1).join('/') : '';
    row.append(nm, dir);
    row.onclick = () => { closePalette(); openNote(it.p); };
    list.append(row);
  });
  if (canCreate) {
    const row = document.createElement('div');
    row.className = 'palrow create' + (palSel === items.length ? ' sel' : '');
    row.textContent = `Create "${q}"`;
    row.onclick = () => paletteCreate(q);
    list.append(row);
  }
  return { items, canCreate };
}
async function paletteCreate(name) {
  closePalette();
  const p = name.replace(/\.md$/i, '') + '.md';
  all[p] = `# ${baseName(p)}\n\n`;
  await api('/api/note?path=' + encodeURIComponent(p), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: all[p] }) });
  await refresh(); setMode('edit'); openNote(p);
}
$('#palinput').addEventListener('input', () => { palSel = 0; renderPalette(); });
$('#palinput').addEventListener('keydown', e => {
  const { items, canCreate } = renderPalette();
  const total = items.length + (canCreate ? 1 : 0);
  if (!total) return;
  if (e.key === 'ArrowDown') { palSel = (palSel + 1) % total; renderPalette(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { palSel = (palSel - 1 + total) % total; renderPalette(); e.preventDefault(); }
  else if (e.key === 'Enter') {
    if (palSel < items.length && items.length) { closePalette(); openNote(items[palSel].p); }
    else if (canCreate) paletteCreate($('#palinput').value.trim());
  }
  else if (e.key === 'Escape') closePalette();
});
$('#palette').addEventListener('click', e => { if (e.target.id === 'palette') closePalette(); });

/* ================= [[ autocomplete ================= */
let acSel = 0, acItems = [], acRange = null;
function caretXY() {
  const d = document.createElement('div');
  const cs = getComputedStyle(editor);
  for (const p of ['fontFamily', 'fontSize', 'lineHeight', 'padding', 'border', 'letterSpacing', 'boxSizing']) d.style[p] = cs[p];
  const r = editor.getBoundingClientRect();
  d.style.cssText += `position:absolute;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;width:${r.width}px;`;
  d.textContent = editor.value.slice(0, editor.selectionStart);
  const span = document.createElement('span'); span.textContent = '​';
  d.appendChild(span);
  document.body.appendChild(d);
  const xy = { top: r.top + span.offsetTop - editor.scrollTop + 26, left: r.left + span.offsetLeft - editor.scrollLeft };
  d.remove();
  return xy;
}
function updateAutocomplete() {
  const ac = $('#autocomplete');
  const upto = editor.value.slice(0, editor.selectionStart);
  const m = upto.match(/\[\[([^\]\n]*)$/);
  if (!m) { ac.classList.add('hidden'); acItems = []; return; }
  const q = m[1];
  acItems = Object.keys(all).map(baseName)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .map(n => ({ n, score: q ? fuzzy(q, n) : 0 }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (!acItems.length) { ac.classList.add('hidden'); return; }
  acRange = { start: editor.selectionStart - q.length, end: editor.selectionStart };
  acSel = Math.min(acSel, acItems.length - 1);
  ac.innerHTML = '';
  acItems.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'acrow' + (i === acSel ? ' sel' : '');
    row.textContent = it.n;
    row.onmousedown = e => { e.preventDefault(); acceptAC(i); };
    ac.append(row);
  });
  const xy = caretXY();
  ac.style.left = Math.min(xy.left, innerWidth - 340) + 'px';
  ac.style.top = Math.min(xy.top, innerHeight - 260) + 'px';
  ac.classList.remove('hidden');
}
function acceptAC(i) {
  const it = acItems[i];
  if (!it || !acRange) return;
  const after = editor.value.slice(acRange.end);
  editor.value = editor.value.slice(0, acRange.start) + it.n + ']]' + (after.startsWith(']]') ? after.slice(2) : after);
  const pos = acRange.start + it.n.length + 2;
  editor.setSelectionRange(pos, pos);
  $('#autocomplete').classList.add('hidden'); acItems = [];
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 600);
  updateWordCount();
  editor.focus();
}
editor.addEventListener('keydown', e => {
  if (acItems.length && !$('#autocomplete').classList.contains('hidden')) {
    if (e.key === 'ArrowDown') { acSel = (acSel + 1) % acItems.length; updateAutocomplete(); e.preventDefault(); return; }
    if (e.key === 'ArrowUp') { acSel = (acSel - 1 + acItems.length) % acItems.length; updateAutocomplete(); e.preventDefault(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { acceptAC(acSel); e.preventDefault(); return; }
    if (e.key === 'Escape') { $('#autocomplete').classList.add('hidden'); acItems = []; return; }
  }
  if (e.key === 'Tab') { // insert two spaces instead of leaving the editor
    e.preventDefault();
    const s = editor.selectionStart;
    editor.value = editor.value.slice(0, s) + '  ' + editor.value.slice(editor.selectionEnd);
    editor.setSelectionRange(s + 2, s + 2);
    editor.dispatchEvent(new Event('input'));
  }
});
editor.addEventListener('click', () => updateAutocomplete());

/* ================= the apparatus — graph sphere ================= */
/* Every note is a point on a globe; every wikilink an arc between two of them.
   3D force layout on a shell, perspective projection, painter's-algorithm depth
   sort. Drag turns it, scroll zooms, hover lights a note's neighbourhood.
   ponytail: O(n^2) repulsion each frame — fine into the hundreds of notes. */
let graphRAF = null, graphCleanup = null;
function openGraph() {
  const modal = $('#graphmodal'), cv = $('#graph'), ctx = cv.getContext('2d');
  modal.classList.remove('hidden');

  const css = getComputedStyle(document.documentElement);
  const tok = n => css.getPropertyValue(n).trim();
  const C = { accent: tok('--color-accent'), accent2: tok('--color-accent-2'),
              muted: tok('--color-muted'), ink: tok('--color-ink') };
  const FONT = tok('--font-body');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const DPR = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, R = 0;
  const resize = () => {
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    R = Math.min(W, H) * 0.3;
  };
  resize();
  addEventListener('resize', resize);

  const names = Object.keys(all), N = names.length;
  const idx = {};
  names.forEach((p, i) => idx[baseName(p).toLowerCase()] = i);

  // Fibonacci sphere — even seeding, no clumping at the poles
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const nodes = names.map((p, i) => {
    const uy = N === 1 ? 0 : 1 - (i / (N - 1)) * 2;
    const rr = Math.sqrt(Math.max(0, 1 - uy * uy));
    const th = GOLDEN * i;
    return { p, name: baseName(p), folder: p.includes('/'),
             x: Math.cos(th) * rr * R, y: uy * R, z: Math.sin(th) * rr * R,
             vx: 0, vy: 0, vz: 0, deg: 0 };
  });

  const edges = [], adj = names.map(() => new Set());
  names.forEach((p, i) => {
    for (const m of all[p].matchAll(/\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g)) {
      const j = idx[m[1].trim().toLowerCase()];
      if (j === undefined || j === i || adj[i].has(j)) continue;
      edges.push([i, j]);
      nodes[i].deg++; nodes[j].deg++;
      adj[i].add(j); adj[j].add(i);
    }
  });
  $('#graphorient').innerHTML =
    '<b>basalt</b> · ' + N + (N === 1 ? ' note · ' : ' notes · ') +
    edges.length + (edges.length === 1 ? ' link' : ' links');

  // graticule: unit-sphere meridians + parallels, scaled at projection time
  const SEG = 72, graticule = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI, pts = [];
    for (let i = 0; i <= SEG; i++) {
      const t = (i / SEG) * Math.PI * 2;
      pts.push([Math.cos(t) * Math.cos(a), Math.sin(t), Math.cos(t) * Math.sin(a)]);
    }
    graticule.push(pts);
  }
  for (let k = 1; k <= 3; k++) {
    const phi = (k / 4) * Math.PI - Math.PI / 2;
    const cr = Math.cos(phi), yy = Math.sin(phi), pts = [];
    for (let i = 0; i <= SEG; i++) {
      const t = (i / SEG) * Math.PI * 2;
      pts.push([Math.cos(t) * cr, yy, Math.sin(t) * cr]);
    }
    graticule.push(pts);
  }

  let yaw = 0.6, pitch = -0.3, zoom = 1;
  let hover = -1, dragging = false, moved = false, lastX = 0, lastY = 0;

  const project = (x, y, z) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    let X = x * cy - z * sy, Z = x * sy + z * cy;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const Y = y * cp - Z * sp;
    Z = y * sp + Z * cp;
    const depth = R * 3.4 + Z;              // smaller depth = nearer the eye
    const s = (R * 3.1 / depth) * zoom;
    return [W / 2 + X * s, H / 2 + Y * s, s, Z];
  };
  const radiusOf = n => 2.6 + Math.min(n.deg * 1.25, 8);

  const physics = () => {
    for (let a = 0; a < N; a++) {
      const n = nodes[a];
      for (let b = a + 1; b < N; b++) {
        const m = nodes[b];
        let dx = n.x - m.x, dy = n.y - m.y, dz = n.z - m.z;
        const d2 = dx * dx + dy * dy + dz * dz || 1;
        const f = Math.min(R * R * 0.35 / d2, 0.8);
        dx *= f; dy *= f; dz *= f;
        n.vx += dx; n.vy += dy; n.vz += dz;
        m.vx -= dx; m.vy -= dy; m.vz -= dz;
      }
    }
    const rest = R * 0.62;
    for (const [a, b] of edges) {
      const n = nodes[a], m = nodes[b];
      const dx = m.x - n.x, dy = m.y - n.y, dz = m.z - n.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const f = (d - rest) * 0.015;
      const ux = dx / d * f, uy = dy / d * f, uz = dz / d * f;
      n.vx += ux; n.vy += uy; n.vz += uz;
      m.vx -= ux; m.vy -= uy; m.vz -= uz;
    }
    for (const n of nodes) {
      n.vx *= 0.78; n.vy *= 0.78; n.vz *= 0.78;
      n.x += n.vx; n.y += n.vy; n.z += n.vz;
      // Hard shell: snap back to radius R every frame. A soft spring loses to
      // repulsion when the vault is small, and the notes drift off the globe.
      const d = Math.hypot(n.x, n.y, n.z) || 1, k = R / d;
      n.x *= k; n.y *= k; n.z *= k;
    }
  };

  const draw = () => {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.globalAlpha = 0.05;
    for (const pts of graticule) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const q = project(pts[i][0] * R, pts[i][1] * R, pts[i][2] * R);
        if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
      }
      ctx.stroke();
    }

    const P = nodes.map(n => project(n.x, n.y, n.z));
    const focused = hover >= 0;

    const eo = edges.map((_, i) => i).sort((a, b) =>
      (P[edges[b][0]][3] + P[edges[b][1]][3]) - (P[edges[a][0]][3] + P[edges[a][1]][3]));
    for (const ei of eo) {
      const a = edges[ei][0], b = edges[ei][1];
      const lit = focused && (a === hover || b === hover);
      const near = 1 - ((P[a][3] + P[b][3]) / 2 + R) / (2 * R);
      ctx.globalAlpha = lit ? 0.85 : focused ? 0.04 : 0.08 + near * 0.14;
      ctx.strokeStyle = lit ? C.accent : C.ink;
      ctx.lineWidth = lit ? 1.4 : 1;
      ctx.beginPath(); ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); ctx.stroke();
    }

    const order = nodes.map((_, i) => i).sort((a, b) => P[b][3] - P[a][3]);
    for (const i of order) {
      const n = nodes[i], sx = P[i][0], sy = P[i][1], s = P[i][2], z = P[i][3];
      const near = 1 - (z + R) / (2 * R);
      const isHover = i === hover, isNbr = focused && adj[hover].has(i);
      const dim = focused && !isHover && !isNbr;
      const col = n.deg === 0 ? C.muted : n.folder ? C.accent2 : C.accent;
      const r = Math.max(1, radiusOf(n) * s);

      ctx.globalAlpha = dim ? 0.08 : 0.3 + near * 0.7;
      ctx.fillStyle = isHover ? C.ink : col;
      if (!dim && (isHover || isNbr || near > 0.55)) {
        ctx.shadowColor = col;
        ctx.shadowBlur = (isHover ? 22 : isNbr ? 13 : 6) * s;
      }
      ctx.beginPath(); ctx.arc(sx, sy, isHover ? r + 1.5 : r, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;

      if (!dim && (isHover || isNbr || (z < 0 && (n.deg > 1 || zoom > 1.5)))) {
        ctx.globalAlpha = isHover ? 1 : 0.5 + near * 0.4;
        ctx.fillStyle = isHover ? C.ink : C.muted;
        ctx.font = (isHover ? 12.5 : 11) + 'px ' + FONT;
        ctx.fillText(n.name, sx + r + 6, sy + 4);
      }
      ctx.globalAlpha = 1;
    }
  };

  const hitAt = (mx, my) => {
    let best = -1, bz = Infinity;
    for (let i = 0; i < N; i++) {
      const q = project(nodes[i].x, nodes[i].y, nodes[i].z);
      const r = Math.max(7, radiusOf(nodes[i]) * q[2] + 5);
      if ((q[0] - mx) ** 2 + (q[1] - my) ** 2 < r * r && q[3] < bz) { bz = q[3]; best = i; }
    }
    return best;
  };

  const tick = () => {
    physics();
    if (!dragging && hover < 0 && !reduced) yaw += 0.0015;   // idle drift, stops on touch
    draw();
    graphRAF = requestAnimationFrame(tick);
  };
  tick();

  const onDown = e => {
    dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
    cv.classList.add('dragging');
    cv.setPointerCapture(e.pointerId);
  };
  const onMove = e => {
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      yaw += dx * 0.006;
      pitch = Math.max(-1.45, Math.min(1.45, pitch + dy * 0.006));
      lastX = e.clientX; lastY = e.clientY;
    } else {
      hover = hitAt(e.clientX, e.clientY);
      cv.style.cursor = hover >= 0 ? 'pointer' : '';
    }
  };
  const onUp = e => {
    cv.classList.remove('dragging');
    const wasDrag = moved;
    dragging = false;
    if (!wasDrag) {
      const hit = hitAt(e.clientX, e.clientY);
      if (hit >= 0) { closeGraph(); openNote(nodes[hit].p); }
    }
  };
  const onWheel = e => {
    e.preventDefault();
    zoom = Math.min(4, Math.max(0.35, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  };
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false });

  graphCleanup = () => {
    removeEventListener('resize', resize);
    cv.removeEventListener('pointerdown', onDown);
    cv.removeEventListener('pointermove', onMove);
    cv.removeEventListener('pointerup', onUp);
    cv.removeEventListener('wheel', onWheel);
  };
}
function closeGraph() {
  cancelAnimationFrame(graphRAF);
  if (graphCleanup) { graphCleanup(); graphCleanup = null; }
  $('#graphmodal').classList.add('hidden');
  $('#graph').style.cursor = '';
}
$('#graphbtn').onclick = openGraph;

/* ================= global keys ================= */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); if (current) setMode(mode === 'edit' ? 'read' : 'edit'); }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'p')) { e.preventDefault(); openPalette(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flushSave(); }
  if (e.key === 'Escape' && !$('#graphmodal').classList.contains('hidden')) closeGraph();
});

/* ================= refresh / init ================= */
async function refresh() {
  const [t, a] = await Promise.all([api('/api/tree'), api('/api/all')]);
  tree = t; all = a;
  renderTree(); renderTags();
  if (current) updateBacklinks();
}
addEventListener('focus', async () => {
  await refresh();
  // pick up edits made outside the app (e.g. by Claude) if we have no local changes
  if (current && !dirty && all[current] !== undefined && all[current] !== editor.value) {
    editor.value = all[current];
    if (mode === 'read') renderPreview();
    updateWordCount();
  }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

(async function init() {
  const info = await api('/api/info');
  $('#vaultname').textContent = info.name;
  document.title = `Basalt — ${info.name}`;
  await refresh();
  const last = localStorage.getItem('basalt-last');
  if (last && all[last] !== undefined) openNote(last);
  else if (all['Welcome.md'] !== undefined) openNote('Welcome.md');
})();
