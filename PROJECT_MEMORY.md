# Notegen — Project Memory & Architecture Guide

This document serves as the long-term memory and knowledge base for the `notegen` repository. It outlines key architectural patterns, features, caching mechanisms, markdown pipeline logic, and the product UX roadmap.

---

## 🏛 Architecture Overview

`notegen` is a static notes site generator that compiles an Obsidian vault into a modern, static Astro web application.

```text
vault/ (Obsidian source)
   ├── _index.md               -> Topic entrypoint
   ├── note.md / note.ipynb     -> Note pages
   ├── database.csv             -> Interactive CSV databases
   └── assets/                  -> Local note media
         │
         ▼  npm run sync:vault
scripts/sync-vault.mjs (Vault Sync Pipeline)
   ├── cache.mjs                -> Fast file-level persistent caching
   ├── wikilinks.mjs            -> Obsidian WikiLinks & media embed resolution
   ├── assets.mjs               -> Media copying and link rewriting
   ├── notebooks.mjs            -> Jupyter notebook conversion (.ipynb -> MD/assets)
   ├── csv.mjs                  -> CSV database parsing
   └── markdown.mjs             -> Frontmatter & excerpt processing
         │
         ▼
src/
   ├── content/                 -> Generated Astro markdown collections (topics/, notes/)
   ├── data/generated/          -> Generated metadata (topics.ts, changelog.ts, plugins-ui.ts)
   └── styles/pages/prose.css   -> Typography, WikiLinks, and embedded component styles
```

---

## ⚡ Key Implemented Features

### 1. Build Caching System (`VaultCacheManager`)

- **Location**: [scripts/sync-vault/cache.mjs](file:///home/d4y2k/progs/notegen/scripts/sync-vault/cache.mjs)
- **Cache Storage**: `node_modules/.cache/notegen/sync-cache.json` (fallback `.cache/notegen/sync-cache.json`).
- **Global Invalidation**: Computes a SHA-256 hash of `notegen.config.json`, `.notegenignore`, active plugins code/configs, and cache schema version.
- **Per-File Invalidation**: Computes SHA-256 content hashes for topics (`_index.md`), notes (`.md`, `.ipynb`), local assets, and CSV databases.
- **Orphaned Output Cleanup**: Cleans stale generated files from `src/content/` and `public/generated/notes/` when source files are deleted or renamed.
- **Bypass**: `--no-cache`, `--force`, or `NO_CACHE=1 npm run sync:vault`.

### 2. Obsidian WikiLinks & Media Embeds (`wikilinks.mjs`)

- **Location**: [scripts/sync-vault/wikilinks.mjs](file:///home/d4y2k/progs/notegen/scripts/sync-vault/wikilinks.mjs)
- **Resolver**: Pre-indexes all topics, notes, databases, titles, filenames, and relative paths across the vault.
- **Internal Note Links**:
  - `[[Note]]` -> `<a href="/notegen/collection-slug" class="internal-link">Note Title</a>`
  - `[[Note|Display Label]]` -> `<a href="/notegen/collection-slug" class="internal-link">Display Label</a>`
  - `[[Note#Section Title]]` -> `<a href="/notegen/collection-slug#section-title" class="internal-link">...</a>`
  - `[[#Section Title]]` -> Current page anchor `<a href="#section-title" class="internal-link">...</a>`
  - Unresolved links render as `<span class="internal-link is-unresolved">...</span>`.
- **Embedded Media & Transclusions**:
  - `![[image.png]]` / `![[image.png|300]]` / `![[image.png|300x200]]` -> Copies asset and renders `<img class="internal-embed-image" />`.
  - `![[Note Title]]` -> Renders an interactive note transclusion card (`.internal-embed-note`).
- **Code Fence Protection**: Preserves code blocks (` ``` `) and inline code (`` `...` ``) without substituting WikiLinks.

---

## 🎨 Styling System & Components

- **Typography & Prose**: Defined in [prose.css](file:///home/d4y2k/progs/notegen/src/styles/pages/prose.css).
- **Internal Link Classes**:
  - `a.internal-link`: Styled accent link.
  - `.internal-link.is-unresolved`: Muted text with dashed underline and help cursor.
  - `img.internal-embed-image`: Centered responsive image with subtle border and shadow.
  - `.internal-embed-note`: Interactive preview card for embedded note transclusions.

---

## 🚀 UX Audit Findings & Future Improvement Roadmap

### 1. Speed of Access (Скорость доступа)

- [ ] **Cmd+K Command Palette**: Add client-side global instant search (FlexSearch / Fuse.js).
- [ ] **Hover Link Previews**: Show glassmorphic popover preview on hovering `.internal-link`.
- [ ] **Backlinks Section**: Render "Mentioned in" notes at the bottom of note pages.

### 2. Information Density (Плотность информации)

- [ ] **Fluid Width Toggle**: Option to expand main prose container for tables, code, and CSVs.
- [ ] **Collapsible Headings**: Allow folding `h2`/`h3` sections on long notes.
- [ ] **Compact List View**: Grid vs List view switcher on topic pages.

### 3. Mobile Usability (Мультиплатформенность)

- [ ] **Bottom Action Bar**: Fixed bottom bar on screens `< 768px` for Home, Search, and TOC.
- [ ] **Mobile TOC Drawer**: Slide-out bottom sheet for table of contents on mobile.
- [ ] **Code Copy Button**: Quick "Copy Code" button and language label on code blocks.

### 4. Visual Aesthetics (Эстетика и Дизайн)

- [ ] **Glassmorphic Floating Header**: Backdrop blur with translucent borders.
- [ ] **Custom Accent Color Picker**: Preset accent themes (Emerald, Indigo, Violet, Rose).
- [ ] **Reading Progress & Time**: Top progress bar and reading time indicator (`⏱ 3 min read`).

---

## 🛠 Commands Reference

```bash
# Sync vault with incremental caching (fast)
npm run sync:vault

# Sync vault clean (force full rebuild without cache)
npm run sync:vault:clean

# Dev server
npm run dev

# Production build
npm run build

# Code diagnostics
npm run lint
npm run check
```
