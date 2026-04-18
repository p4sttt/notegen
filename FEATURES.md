# Feature Tracking

Status legend: `planned`, `in_progress`, `done`

## Foundation

| Feature | Status | Notes |
| --- | --- | --- |
| Astro project scaffold | done | Base structure, config, routes, styles |
| Feature tracker | done | This file is the source of progress tracking |
| Localized UI dictionary | done | Minimal `ru` / `en` labels for interface chrome |

## Content Pipeline

| Feature | Status | Notes |
| --- | --- | --- |
| Vault sync script | in_progress | Local import from `VAULT_PATH` implemented, CI integration pending |
| Subject detection via `_index.md` | done | Folder with `_index.md` becomes a subject |
| Markdown note pages | done | Notes are generated into Astro content collection |
| Relative image support | done | `./assets/...` links are rewritten to copied public assets |
| External links | done | Render as standard markdown links |
| Internal Obsidian wiki links | planned | Deferred for later implementation |

## Rendering

| Feature | Status | Notes |
| --- | --- | --- |
| Code block highlighting | in_progress | Astro prose styling is in place, visual tuning pending |
| LaTeX rendering | done | `remark-math` + `rehype-katex` wired into Astro |
| Table of contents | planned | Subject to content shape after import |

## UI

| Feature | Status | Notes |
| --- | --- | --- |
| Swiss-style minimal design system | in_progress | Tokens and baseline layout added |
| Light and dark themes | in_progress | CSS tokens and client-side toggle added |
| Responsive layout | in_progress | Home page and layout are mobile-first |
| Subject index page | done | Route is generated from imported subject metadata |
| Note page template | done | Route renders imported markdown notes |

## Automation

| Feature | Status | Notes |
| --- | --- | --- |
| GitHub Pages deployment | planned | Astro build + Pages deploy workflow |
| Cross-repo rebuild trigger | planned | `repository_dispatch` from vault repo |
