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

## Docker

The Docker image builds the static site from a mounted vault repository.

### Published image

Pushes to `main` and version tags publish the frontend image to GitHub Container Registry:

```text
ghcr.io/<github-owner>/notegen:latest
ghcr.io/<github-owner>/notegen:v0.1.0
ghcr.io/<github-owner>/notegen:sha-<commit>
```

To use this image from GitLab or another external CI, make the GHCR package public in GitHub:

`GitHub -> Packages -> notegen -> Package settings -> Change visibility -> Public`

### Build the image

```bash
docker build -t notegen .
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

Container contract:

- `/vault` is the mounted notes repository
- `/out` receives the generated static site
- `VAULT_PATH` defaults to `/vault`
- `OUT_DIR` defaults to `/out`
- `ASTRO_SITE` and `ASTRO_BASE` override Astro `site` and `base`

### Example GitHub Actions usage from a notes repository

```yaml
name: Build notes site

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout notes
        uses: actions/checkout@v4
        with:
          path: vault

      - name: Checkout notegen
        uses: actions/checkout@v4
        with:
          repository: owner/notegen
          path: notegen

      - name: Build notegen image
        run: docker build -t notegen ./notegen

      - name: Build static site
        run: |
          mkdir -p site
          docker run --rm \
            -v "$PWD/vault:/vault:ro" \
            -v "$PWD/site:/out" \
            -e ASTRO_SITE="https://${{ github.repository_owner }}.github.io" \
            -e ASTRO_BASE="/${{ github.event.repository.name }}" \
            ghcr.io/owner/notegen:latest

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site
```

## Notes

- generated vault content is ignored by git
- local `vault/` and `.env` are ignored by git
- current feature status lives in [FEATURES.md](./FEATURES.md)
