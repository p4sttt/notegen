# notegen

Static notes site generated from a private Obsidian vault.

## What It Does

- imports subjects from vault directories that contain `_index.md`
- imports note pages from markdown files inside each subject directory
- copies relative assets from `./assets/...`
- builds a static Astro site with light/dark themes
- renders LaTeX via KaTeX
- deploys to GitHub Pages through GitHub Actions
- rebuilds automatically when the private vault repository updates

## Repository Structure

```text
src/
  content/
    notes/        generated note markdown
    subjects/     generated subject markdown
  data/generated/ generated subject metadata
  pages/          Astro routes
scripts/
  sync-vault.mjs  imports vault content into the site
.github/workflows/
  deploy.yml      build and deploy workflow
```

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

## Vault Format

Each subject is a directory in the vault:

```text
vault/
  optimization_methods/
    _index.md
    karush_kuhn-tucker.md
    assets/
      image.png
```

Expected conventions:

- a subject directory must contain `_index.md`
- `_index.md` may contain frontmatter such as `title`, `slug`, `draft`, `description`
- note files may contain frontmatter such as `title`, `slug`, `date`, `draft`
- relative assets should be referenced like `![desc](./assets/file.png)`

## CI/CD

`notegen` uses GitHub Actions for build and deploy:

- the vault repository sends `repository_dispatch` with event `vault-updated`
- this repository checks out the private vault repo during CI
- `npm run sync:vault` generates site content
- Astro builds the static output
- GitHub Pages publishes `dist/`

### Required repository configuration

In `notegen`:

- Action secret: `VAULT_READ_TOKEN`
- Action variable: `VAULT_REPO_URL`

In the vault repository:

- Action secret: `NOTEGEN_DISPATCH_TOKEN`
- Action variable: `NOTEGEN_REPO_URL`

Pages setting in `notegen`:

- `Settings -> Pages -> Source -> GitHub Actions`

## Notes

- generated vault content is ignored by git
- local `vault/` and `.env` are ignored by git
- current feature status lives in [FEATURES.md](./FEATURES.md)
