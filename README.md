# Basalt ▲

**A local-first Obsidian-style markdown vault. Zero dependencies.**

Your notes are plain `.md` files in a folder on your disk. Basalt is a tiny
Node server (~150 lines, no npm packages) plus a web UI that edits them.
Built so a human *and* an AI assistant can share the same vault: you write in
the app, Claude reads and writes the same files with its file tools.

## Features

- **Wikilinks** — `[[Note Name]]` with autocomplete when you type `[[`, click-to-create for notes that don't exist yet
- **Backlinks** — every note shows what links to it
- **Reading view** — own markdown renderer: headings, lists, task checkboxes (clickable — they write back to the file), tables, quotes, fenced code, tags, images
- **Graph view** — force-directed constellation of your vault; click a node to open it
- **Quick switcher** — `Ctrl+O`, fuzzy matching, create-if-missing
- **Search** — full-text and `#tag` search, tag index in the sidebar
- **Daily notes** — one click creates `Journal/YYYY-MM-DD.md`
- **Rename refactoring** — renaming a note rewrites `[[wikilinks]` to it across the whole vault
- **Autosave** — 600 ms debounce; external edits (e.g. by Claude) are picked up when the window regains focus

## Install as a desktop app (Windows)

```powershell
.\install.ps1
```

Adds **Basalt** to your Start Menu and Desktop with its own icon. Clicking it
starts the server silently (no console window) and opens Basalt in a clean
app window with no browser chrome. Clicking it again when it's already running
just reopens the window — the second server sees the port is taken and exits.

`.\uninstall.ps1` removes the shortcuts. Your notes are never touched.

It's also a PWA: with Basalt open in Edge or Chrome, use the browser menu's
**Install Basalt** for a second, browser-managed copy of the app window.

## Or just run it

```
node server.js            # vault at C:/Study/Vault (created + seeded if missing)
node server.js D:/notes   # or any folder you like
```

Then open http://localhost:8088 — or double-click `basalt.bat`.

The server binds to `127.0.0.1` only: your notes never leave your machine.

## Keyboard

| Key | Action |
|-----|--------|
| `Ctrl+E` | Toggle edit / reading view |
| `Ctrl+O` / `Ctrl+P` | Quick switcher |
| `Ctrl+S` | Save now (it autosaves anyway) |
| `[[` | Link autocomplete |

---

Built by [Khai Jian](https://github.com/KJT1203) · vibecoded with Claude Fable 5
