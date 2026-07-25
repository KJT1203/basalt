# Design — Basalt

A locked design system for this app. Every future redesign reads this file
before emitting code. Do not regenerate per surface — extend or amend this file
when the system needs to grow.

## Genre

**atmospheric** — a tool you actually want to use after dark. Basalt is a
late-night thinking instrument, not a productivity dashboard.

## Theme

**Lumen · Night Foundry.** Cool-violet near-black canvas, molten-brass accent
that emits, coral chord as the secondary. Chosen over Midnight and Aurora
because Lumen is the only atmospheric theme built around a *hand-engineered
apparatus* rather than ambient blooms — and Basalt's graph is exactly that.

| Token | Value | Role |
|---|---|---|
| `--color-paper` | `oklch(13% 0.014 265)` | canvas |
| `--color-paper-2` | `oklch(17% 0.016 265)` | rails, cards |
| `--color-paper-3` | `oklch(21% 0.018 265)` | raised chrome |
| `--color-ink` | `oklch(96% 0.006 262)` | headings |
| `--color-ink-2` | `oklch(86% 0.008 262)` | body |
| `--color-muted` | `oklch(64% 0.012 262)` | labels |
| `--color-accent` | `oklch(76% 0.17 50)` | molten brass |
| `--color-accent-2` | `oklch(68% 0.16 18)` | coral chord |
| `--color-focus` | `oklch(76% 0.17 50)` | focus ring |
| `--rule-blueprint` | `oklch(96% 0.006 262 / 0.04)` | grid hairline |

Diversification axes: **paper band** dark (L 13 %) · **display style**
classical-serif · **accent hue** brass (H 50).

## Macrostructure families

- **App shell** — **Workbench**. Small functional headings, no marketing voice,
  the working surface *is* the content. Variation knobs: rail width, panel
  presence.
- **Graph** — **Map / Diagram**. One spatial composition, a legend, an
  orientation line. No internal sections.
- **Content (notes)** — typography only. The user's markdown is the design.

Nav archetype: **N3 side-rail** — for an app, the rail *is* the nav. No footer
archetype: app surfaces have no footer; the status bar closes the page.

## Typography

- **Display** — Instrument Serif 400, roman. Note headings, brand, empty states.
- **Body** — Geist 400/500/600. All UI prose.
- **Mono** — JetBrains Mono 400/500. The editor source view, every label, every
  readout.

All three are **self-hosted** in `public/fonts/` (168 KB, latin subsets).
Basalt is local-first; a Google Fonts request on every launch would break both
the offline promise and the privacy promise. This is a deliberate deviation
from Lumen's stated CDN dependency and it is not negotiable in this project.

Display tracking `-0.02em`. Type scale anchor `--text-display:
clamp(1.75rem, 2.2vw + 1rem, 2.5rem)` — an app, not a landing page, so the
display ceiling is far below Lumen's 6 rem.

## The two-register rule — amended for this app

Lumen renders all prose lowercase and all mono labels UPPERCASE. Basalt adopts
this **for app chrome only**:

- **Lowercase** — buttons, brand, hints, empty states, menu items.
- **UPPERCASE mono** — panel labels, status readouts, graph legend.
- **Untouched, natural case** — note content, note titles, file and folder
  names, search results, tag names.

Rationale: Lumen's lowercase rule was written for marketing prose the designer
controls. Basalt's tree and editor render *user data*. Case-transforming
someone's file names and prose is data vandalism dressed as art. The register
split stops at the boundary between our chrome and their words.

## Spacing

4-point named scale, tokens in `public/tokens.css`. Surfaces reference named
tokens (`var(--space-md)`), never raw values.

## Motion

- Easings: `--ease-soft: cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-in-out`.
- Reveal: **fade only**. No slide, no bounce, no scroll-triggered staggering.
- Durations: `--dur-short: 180ms`, `--dur-mid: 320ms`.
- Focus rings never animate — they appear instantly.
- `prefers-reduced-motion: reduce` collapses everything to final state and
  stops the graph's idle drift.

## Microinteraction stance

- **Silent success.** The status bar states `SAVED`; nothing toasts.
- Hover affordances always have a focus equivalent.
- Optimistic edits; the file on disk is the source of truth.
- No celebratory feedback anywhere. The vault is quiet.

## The apparatus — one per app

Basalt's single hand-engineered object is the **graph sphere**: notes
positioned on a rotating globe, wikilinks as edges, a blueprint graticule
behind them. It is Lumen's documented *topology* apparatus (knowledge graphs,
"anything that traverses a structured space"), not a decorative orb — every
node is a real file and every edge a real link.

Two deliberate deviations from Lumen's apparatus rules, both driven by explicit
user request:

1. **It rotates.** Lumen says the Night apparatus pulses and never rotates,
   because rotation was the orb's signature. Basalt's sphere is *manipulated* —
   drag to turn it, scroll to zoom — with a slow idle drift that stops on
   interaction. An instrument you steer is not an orb that spins at you.
2. **It fills a modal, not a hero slot.** App surfaces have no hero.

Never add a second apparatus. No CSS orbs, no ambient blooms, no particles.

## CTA voice

- **Primary** — brass fill, `--radius-input`, lowercase label, one verb.
- **Secondary** — hairline border, transparent fill, lowercase.
- Destructive actions are coral-chord text on hairline, never a filled red
  button.

## What every surface MUST share

The brass accent and its ≤ 5 % footprint. The three fonts. The blueprint grid
on the canvas. Hairline cards lit from within (inner radial ≤ 6 % rest,
≤ 12 % hover) — never drop-shadowed. The mono UPPERCASE label voice.

## What surfaces MAY differ on

Panel composition, rail contents, whether the blueprint grid is visible.

## Refuses

No glassmorphism or `backdrop-filter`. No gradient text. No emoji as icons.
No invented metrics — every readout is a real count from the vault. No italic
headers. No drop-shadowed cards. No second accent hue beyond the coral chord.
No scroll-triggered fade-up. No confirmation dialogs for reversible actions.
