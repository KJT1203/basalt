# Basalt — interface redesign + 3D graph sphere

Date: 2026-07-18 · Status: implemented · Skills: hallmark (redesign), superpowers:brainstorming

## Problem

Basalt worked but looked like a default dark app: neutral near-black, one orange
accent, Segoe UI everywhere, and a flat 2D force graph. The user asked for a
creative interface redesign and for the graph to become a rotating 3D sphere.

## Approaches considered — the graph

| # | Approach | Verdict |
|---|---|---|
| 1 | **Three.js / WebGL** | **Rejected.** 100–300 KB dependency plus a CDN fetch. Basalt's whole promise is zero dependencies and no network. Hallmark's own anti-pattern list also flags Three.js for objects that don't earn it. |
| 2 | **Canvas 2D + manual 3D projection** | **Chosen.** Full control, zero bytes added, works offline. Rotation, perspective, and depth cues are ~40 lines of maths. |
| 3 | **CSS 3D transforms on DOM nodes** | **Rejected.** `preserve-3d` gives depth cheaply, but edges between 3D points are near-impossible, and hundreds of DOM nodes animate badly. |

## Design — the sphere

- **Seeding.** Fibonacci sphere, so notes distribute evenly with no polar clumping.
- **Layout.** 3D force simulation: all-pairs repulsion, springs along wikilinks,
  then a **hard shell constraint** — every node is renormalised to radius `R`
  each frame. A soft radial spring was tried first and lost to repulsion on
  small vaults, letting notes drift off the globe and out of frame.
- **Projection.** Yaw/pitch rotation → perspective divide (`s = 3.1R / (3.4R + z)`).
  Near nodes render up to 1.17×, far nodes 0.81× — measured, not asserted.
- **Depth cues.** Painter's algorithm (sort by z, draw far first), opacity fog,
  glow only on the near hemisphere, labels suppressed on the back face.
- **Graticule.** Six meridians + three parallels at 5 % opacity. This is what
  makes it read as a *sphere* rather than a cloud, and it doubles as the Lumen
  blueprint-grid signature wrapped onto the globe.
- **Interaction.** Drag turns it, scroll zooms, hover lights a note's
  neighbourhood and dims the rest, click opens the note. Idle drift is slow and
  stops on hover/drag and under `prefers-reduced-motion`.

## Design — the interface

Genre **atmospheric**, theme **Lumen · Night Foundry**, macrostructure
**Workbench** (app) + **Map/Diagram** (graph). Full token set and rationale in
[`design.md`](../../../design.md).

Two decisions worth recording:

1. **Self-hosted fonts.** Lumen specifies three Google Fonts. Basalt is
   local-first, so a CDN fetch on every launch would break both the offline
   promise and the privacy promise. The latin subsets are vendored into
   `public/fonts/` (168 KB total).
2. **The two-register rule stops at user data.** Lumen renders all prose
   lowercase. Applied literally, that would case-transform the user's file names
   and note text. Chrome is lowercased; note content, headings, file names, and
   tags keep their natural case. Verified: every content surface computes
   `text-transform: none`.

## Verification

Run against a live server, not asserted:

- Fonts load from disk; tokens resolve; no console errors.
- Content case preserved across editor, reading view, and tree.
- Edit → autosave → confirmed on disk via the API, then reverted.
- Markdown, wikilinks, tags, backlinks, search, quick switcher all still pass.
- Sphere: nodes sit on the shell and stay in frame, depth and scale genuinely
  vary, zoom scales the projection (486 → 828 → 963 px), hit-testing
  round-trips, click opens the correct note.
- Slop test 58/58 after fixing six real failures: off-scale padding, missing
  `:active`/`:disabled`, unlabelled canvas, inline OKLCH bypassing tokens,
  headings without long-word wrap, and unverified responsive behaviour.
- No horizontal scroll and no wrapped clickable text at 320 / 375 / 414 / 768 px.
- Contrast: every pair clears WCAG AA (5.68–17.94 against 4.5 / 3.0 required).

## Known limitation

The graph renders via `requestAnimationFrame`, which browsers pause in hidden
tabs. Verification therefore drove frames manually through a temporary debug
hook, which was removed before shipping. Two early "bugs" (zoom not working,
contrast failing) were both artefacts of the test harness, not the product.
