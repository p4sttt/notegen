# notegen

Static notes site generated from a private Obsidian vault, supporting interactive databases, Jupyter notebook imports, LaTeX equations, and extensible plugins.

## What It Does

- imports topics from vault directories that contain `_index.md`
- imports note pages from markdown files inside each topic directory
- imports Jupyter notebooks (`.ipynb`) as note pages
- imports CSV files (`.csv`) as interactive database pages
- copies relative assets from `./assets/...`
- builds a static Astro site with light/dark themes
- renders LaTeX via KaTeX
- deploys to GitHub Pages through GitHub Actions
- rebuilds automatically when the private vault repository updates
- **plugin system**: extends vault processing, Astro configuration, global styling, client scripts, preferences, and navigation links.

## Repository Structure

```text
src/
  content/
    notes/        generated note markdown
    topics/       generated topic markdown
  data/generated/ generated topic metadata
  pages/          Astro routes
  styles/         Global and layout CSS stylesheets
  widgets/        Astro UI components (database, preferences, sidebar)
scripts/
  sync-vault.mjs  imports vault content into the site
  sync-vault/     sync implementation modules
plugins/          Git submodules containing extensible plugins
.github/workflows/
  deploy.yml      build and deploy workflow
```

### Vault Sync & Plugin Modules

`scripts/sync-vault.mjs` is the CLI entrypoint and orchestration layer. The implementation details live in `scripts/sync-vault/`:

- `env.mjs` reads values from `.env`
- `ignore-rules.mjs` parses `.notegenignore` and checks ignored paths
- `markdown.mjs` parses frontmatter and prepares Markdown summaries/content
- `notebooks.mjs` converts Jupyter notebooks into Markdown and output assets
- `csv.mjs` parses CSV files and infers database column types
- `assets.mjs` copies local assets and rewrites Markdown/HTML asset links
- `changelog.mjs` parses changelog events and renders generated changelog data
- `vault-files.mjs` walks the vault and resolves topic ancestry
- `site-config.mjs` reads vault-level `notegen.config.json`
- `paths.mjs` normalizes site paths, slugs, and generated content filenames
- `fs-utils.mjs` contains small filesystem helpers shared by sync modules
- `data-file.mjs` renders `src/data/generated/topics.ts`
- `plugins.mjs` registers and runs vault compilation hooks for active plugins

## Code Style & Version Control

To maintain a consistent codebase across developers and environments, the repository includes standard files:
- **[.editorconfig](file:///home/d4y2k/progs/notegen/.editorconfig)**: Enforces uniform indent sizes, trim whitespace, line endings, and file formatting in editors.
- **[.gitattributes](file:///home/d4y2k/progs/notegen/.gitattributes)**: Normalizes code file line endings (`lf`) and specifies binary attributes for media assets.

---

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

```env
VAULT_PATH=./vault
```

`VAULT_PATH` should point to a local checkout or fixture copy of your Obsidian vault.

### 3. Sync the vault

```bash
npm run sync:vault
```

### 4. Start the dev server

```bash
npm run dev
```

---

## Plugin System

Notegen features a plugin architecture allowing you to extend the core compilation, injection of client-side styles and scripts, and UI layout.

Available plugins live under the `plugins/` directory.

### Supabase Plugin
An active plugin `plugins/supabase` provides database state synchronization and OAuth/Email user auth.

#### Local Integration Showcase
A fully self-contained showcase testing environment exists inside `plugins/supabase/showcase/`. It spins up local PostgreSQL, GoTrue auth, PostgREST API gateway, and an Astro client replica.
Run it locally:
```bash
./plugins/supabase/showcase/run-test.sh
```
Access points:
- Astro Client: `http://localhost:4321`
- pgweb Database Explorer: `http://localhost:8082`

---

## Vault Format

Each topic is a directory in the vault:

```text
vault/
  database.csv
  optimization_methods/
    _index.md
    karush_kuhn-tucker.md
    papers.csv
    assets/
      image.png
```

Expected conventions:

- a topic directory must contain `_index.md`
- `_index.md` may contain frontmatter such as `title`, `slug`, `draft`, `description`
- note files may be Markdown (`.md`) or Jupyter notebooks (`.ipynb`)
- Markdown note files may contain frontmatter such as `title`, `slug`, `date`, `status`, `tags`
- `tags` should be an array of strings: `tags: ["ai", "nlp"]`. Tags are color-coded based on the site accent color.
- CSV files (`.csv`) are imported as database pages; top-level CSV files appear on the home page, and CSV files inside a topic appear in that topic
- note `status` values are `draft`, `in-progress`, or `done`; legacy `draft: true` maps to `status: draft`, and legacy `draft: false` maps to `status: done`
- Jupyter notebooks are converted during `npm run sync:vault`: markdown cells become page Markdown, code cells become syntax-highlighted code blocks, and supported outputs are rendered as HTML, text blocks, or copied image assets
- Jupyter notebooks may define note metadata through `notebook.metadata.notegen` or through YAML frontmatter in the first markdown cell
- relative assets should be referenced like `![desc](./assets/file.png)`

### CSV Database Pages

- use the first row as column headers
- support comma, semicolon, and tab delimiters
- infer column types as `text`, `number`, `date`, or `boolean`
- render boolean values as compact checked/unchecked controls. Boolean columns are fully interactive (click cell to toggle) and persist states locally or via cloud.
- include search, per-column filters, column sorting, column visibility controls, and visible-row counts
- use the filename as the database title and slug

CSV example:

```csv
title;year;read
Attention Is All You Need;2017;true
Scaling Laws;2020;false
```

---

## Site Configuration

Each notes repository can override frontend text by adding `notegen.config.json` to the vault root:

```json
{
  "changelogPath": "changelog.json",
  "siteText": {
    "ru": {
      "brand": "Статьи wiki",
      "heroTitle": "Статьи wiki",
      "metaDescription": "Статьи и заметки.",
      "heroBody": "Материалы, заметки и тексты."
    },
    "en": {
      "brand": "wiki articles",
      "heroTitle": "wiki articles",
      "metaDescription": "wiki articles and notes.",
      "heroBody": "Articles, notes, and long-form writing."
    }
  }
}
```

By default the build reads `$VAULT_PATH/notegen.config.json`. Use `SITE_CONFIG_PATH` to point to another config file.

---

## Ignoring Vault Files

Add `.notegenignore` to the vault root to skip files and directories during import:

```gitignore
# Do not import repository docs as notes
README.md

# Ignore any directory with this name
drafts/

# Ignore a path from the vault root
private/meeting-notes.md

# Ignore copied note assets
raw/
*.tmp
```

Rules are matched relative to the vault root. Directory rules ending with `/` skip the directory and everything inside it.

---

## CI/CD

`notegen` uses GitHub Actions for build and deploy:

- the vault repository sends `repository_dispatch` with event `vault-updated`
- this repository checks out the private vault repo during CI
- `npm run sync:vault` generates site content
- Astro builds the static output
- GitHub Pages publishes `dist/`

---

## Docker

The Docker image builds the static site from a mounted vault repository.

### Published image

Pushes to `main` and version tags publish the frontend image to GitHub Container Registry:

```text
ghcr.io/<github-owner>/notegen:latest
ghcr.io/<github-owner>/notegen:v0.1.0
ghcr.io/<github-owner>/notegen:sha-<commit>
```

### Build a site locally

```bash
docker run --rm \
  -v "$PWD/vault:/vault:ro" \
  -v "$PWD/dist:/out" \
  -e ASTRO_SITE="https://example.github.io" \
  -e ASTRO_BASE="/notegen" \
  notegen
```

---

## Changelog

During `npm run sync:vault`, `notegen` reads the changelog file from the vault root and generates a `/changelog` page. The default file is `vault/changelog.json`.

The parser accepts either a JSON array or JSON Lines format.

Event fields:

- `timestamp`: ISO date string, for example `2026-05-06T22:40:00Z`
- `action`: `created`, `updated`, `deleted`, `renamed`
- `kind`: `note`, `topic`, `database`, `asset`
- `path`: current path relative to the vault root
- `oldPath`: previous path for renamed files
- `title`: display title
- `topic`: display topic
- `source`: optional label (e.g. `pre-commit`)
