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
function setSaveState(t) { $('#savestate').textContent = t; }
async function flushSave() {
  clearTimeout(saveTimer);
  if (!dirty || !current) return;
  dirty = false;
  all[current] = editor.value;
  setSaveState('Saving…');
  await api('/api/note?path=' + encodeURIComponent(current), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: editor.value })
  });
  setSaveState('All changes saved');
  renderTags();
  updateBacklinks();
}
editor.addEventListener('input', () => {
  dirty = true;
  setSaveState('Unsaved…');
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
  $('#crumb').textContent = p ? p.replace(/\.md$/i, '').split('/').join('  ›  ') : 'No note open';
  if (!p) { renderTree(); return; }
  editor.value = all[p];
  if (mode === 'read') renderPreview();
  renderTree(); updateBacklinks(); updateWordCount();
  setSaveState('All changes saved');
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
  el.innerHTML = `<h4>Backlinks · ${hits.length}</h4>`;
  for (const h of hits) {
    const row = document.createElement('div');
    row.className = 'blrow';
    const nm = document.createElement('div'); nm.className = 'blname'; nm.textContent = baseName(h.p);
    const sn = document.createElement('div'); sn.className = 'blsnip'; sn.textContent = h.line;
    row.append(nm, sn);
    row.onclick = () => openNote(h.p);
    el.append(row);
  }
  if (!hits.length) el.innerHTML += '<div class="blsnip" style="padding:4px 8px;color:var(--dim);font-size:12px">No other note links here yet.</div>';
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

/* ================= graph ================= */
/* Obsidian-style constellation: pan, zoom, drag, hover-highlighting.
   ponytail: O(n²) repulsion each frame — fine into the hundreds of notes */
let graphRAF = null;
function openGraph() {
  const modal = $('#graphmodal'), cv = $('#graph'), ctx = cv.getContext('2d');
  modal.classList.remove('hidden');
  const DPR = devicePixelRatio || 1;
  cv.width = innerWidth * DPR; cv.height = innerHeight * DPR;
  cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';

  const names = Object.keys(all);
  const idx = {}; names.forEach((p, i) => idx[baseName(p).toLowerCase()] = i);
  // color per top-level folder, violet for root notes
  const folderColors = {}, extras = ['#60a5fa', '#f5a623', '#34d399', '#f472b6', '#facc15'];
  const colorOf = p => {
    const f = p.includes('/') ? p.split('/')[0] : '';
    if (!(f in folderColors)) folderColors[f] = f === '' ? '#a78bfa' : extras[Object.keys(folderColors).length % extras.length];
    return folderColors[f];
  };
  const nodes = names.map((p, i) => ({
    p, name: baseName(p), color: colorOf(p),
    x: innerWidth / 2 + Math.cos(i / names.length * 6.283) * 220 + Math.random() * 40,
    y: innerHeight / 2 + Math.sin(i / names.length * 6.283) * 220 + Math.random() * 40,
    vx: 0, vy: 0, deg: 0
  }));
  const edges = [], adj = names.map(() => new Set());
  names.forEach((p, i) => {
    for (const m of all[p].matchAll(/\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g)) {
      const j = idx[m[1].trim().toLowerCase()];
      if (j !== undefined && j !== i) { edges.push([i, j]); nodes[i].deg++; nodes[j].deg++; adj[i].add(j); adj[j].add(i); }
    }
  });

  let scale = 1, ox = 0, oy = 0;            // screen = world * scale + offset
  let hover = -1, dragNode = -1, panning = false, moved = false, lastX = 0, lastY = 0;
  const toWorld = (sx, sy) => [(sx - ox) / scale, (sy - oy) / scale];
  const radiusOf = n => 4 + Math.min(n.deg * 1.5, 13);
  const hitNode = (sx, sy) => {
    const [wx, wy] = toWorld(sx, sy);
    let best = -1, bd = Infinity;
    nodes.forEach((n, i) => {
      const d = (n.x - wx) ** 2 + (n.y - wy) ** 2, r = radiusOf(n) + 6 / scale;
      if (d < r * r && d < bd) { bd = d; best = i; }
    });
    return best;
  };

  const step = () => {
    for (let a = 0; a < nodes.length; a++) {
      const n = nodes[a];
      n.vx += (innerWidth / 2 - n.x) * 0.0015; n.vy += (innerHeight / 2 - n.y) * 0.0015;
      for (let b = a + 1; b < nodes.length; b++) {
        const m2 = nodes[b];
        let dx = n.x - m2.x, dy = n.y - m2.y;
        const d2 = dx * dx + dy * dy || 1, f = Math.min(1200 / d2, 0.6);
        dx *= f; dy *= f;
        n.vx += dx; n.vy += dy; m2.vx -= dx; m2.vy -= dy;
      }
    }
    for (const [a, b] of edges) {
      const n = nodes[a], m2 = nodes[b];
      const dx = m2.x - n.x, dy = m2.y - n.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 130) * 0.002;
      n.vx += dx * f / d * Math.min(d, 60); n.vy += dy * f / d * Math.min(d, 60);
      m2.vx -= dx * f / d * Math.min(d, 60); m2.vy -= dy * f / d * Math.min(d, 60);
    }
    for (const n of nodes) {
      if (nodes.indexOf(n) === dragNode) { n.vx = 0; n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82; n.x += n.vx; n.y += n.vy;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * ox, DPR * oy);
    const focused = hover >= 0;
    // edges
    for (const [a, b] of edges) {
      const lit = focused && (a === hover || b === hover);
      ctx.strokeStyle = lit ? 'rgba(167,139,250,0.85)' : focused ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.09)';
      ctx.lineWidth = (lit ? 1.6 : 1) / scale;
      ctx.beginPath(); ctx.moveTo(nodes[a].x, nodes[a].y); ctx.lineTo(nodes[b].x, nodes[b].y); ctx.stroke();
    }
    // nodes + labels
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], r = radiusOf(n);
      const isHover = i === hover, isNbr = focused && adj[hover].has(i);
      const dimmed = focused && !isHover && !isNbr;
      ctx.globalAlpha = dimmed ? 0.13 : 1;
      ctx.shadowColor = n.color;
      ctx.shadowBlur = (isHover ? 26 : isNbr ? 14 : n.deg ? 7 : 0) * scale;
      ctx.fillStyle = isHover ? '#fff' : n.deg ? n.color : 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(n.x, n.y, isHover ? r + 2 : r, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      const showLabel = isHover || isNbr || scale > 0.7 || n.deg > 2;
      if (showLabel) {
        ctx.globalAlpha = dimmed ? 0.1 : isHover ? 1 : 0.75;
        ctx.fillStyle = isHover ? '#fff' : 'rgba(216,216,224,0.9)';
        ctx.font = (isHover ? 13 : 11.5) / scale + 'px Segoe UI';
        ctx.fillText(n.name, n.x + r + 6 / scale, n.y + 4 / scale);
      }
      ctx.globalAlpha = 1;
    }
    graphRAF = requestAnimationFrame(step);
  };
  step();

  cv.onpointerdown = e => {
    moved = false; lastX = e.clientX; lastY = e.clientY;
    const hit = hitNode(e.clientX, e.clientY);
    if (hit >= 0) dragNode = hit; else panning = true;
    cv.setPointerCapture(e.pointerId);
  };
  cv.onpointermove = e => {
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (dragNode >= 0 || panning) {
      if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 0) moved = true;
      if (dragNode >= 0) {
        const [wx, wy] = toWorld(e.clientX, e.clientY);
        nodes[dragNode].x = wx; nodes[dragNode].y = wy;
      } else { ox += dx; oy += dy; }
      lastX = e.clientX; lastY = e.clientY;
    } else {
      hover = hitNode(e.clientX, e.clientY);
      cv.style.cursor = hover >= 0 ? 'pointer' : 'grab';
    }
  };
  cv.onpointerup = e => {
    if (!moved) {
      const hit = hitNode(e.clientX, e.clientY);
      if (hit >= 0) { closeGraph(); openNote(nodes[hit].p); }
    }
    dragNode = -1; panning = false;
  };
  cv.onwheel = e => {
    e.preventDefault();
    const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const ns = Math.min(4, Math.max(0.2, scale * k));
    ox = e.clientX - (e.clientX - ox) * (ns / scale);
    oy = e.clientY - (e.clientY - oy) * (ns / scale);
    scale = ns;
  };
}
function closeGraph() {
  cancelAnimationFrame(graphRAF);
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
(async function init() {
  const info = await api('/api/info');
  $('#vaultname').textContent = info.name;
  document.title = `Basalt — ${info.name}`;
  await refresh();
  const last = localStorage.getItem('basalt-last');
  if (last && all[last] !== undefined) openNote(last);
  else if (all['Welcome.md'] !== undefined) openNote('Welcome.md');
})();
