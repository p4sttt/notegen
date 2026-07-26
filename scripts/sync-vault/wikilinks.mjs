import path from 'node:path';
import { slugify } from './paths.mjs';

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeLinkTarget(input) {
  if (!input) return '';
  return input
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.(md|ipynb|csv)$/i, '')
    .toLowerCase();
}

export function isMediaFile(targetPath) {
  const ext = path.extname(targetPath).toLowerCase();
  return [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.webp',
    '.bmp',
    '.pdf',
    '.mp4',
    '.webm',
    '.ogv',
    '.mp3',
    '.wav',
  ].includes(ext);
}

export class VaultLinkResolver {
  constructor({ publicBasePath }) {
    this.publicBasePath = publicBasePath;
    this.targets = new Map();
  }

  registerTopic(topic) {
    if (!topic || !topic.slug) return;
    const url = `${this.publicBasePath}/${topic.slug}`;
    const item = { url, title: topic.title || topic.slug, type: 'topic' };

    this.addTarget(topic.sourcePath, item);
    this.addTarget(path.join(topic.sourcePath, '_index.md'), item);
    this.addTarget(topic.slug, item);
    this.addTarget(topic.title, item);
    this.addTarget(path.basename(topic.sourcePath), item);
  }

  registerNote(note) {
    if (!note || !note.collectionSlug) return;
    const url = `${this.publicBasePath}/${note.collectionSlug}`;
    const item = { url, title: note.title || note.slug, type: 'note' };

    this.addTarget(note.sourcePath, item);
    const pathNoExt = note.sourcePath.replace(/\.(md|ipynb)$/i, '');
    this.addTarget(pathNoExt, item);
    this.addTarget(note.collectionSlug, item);
    this.addTarget(note.slug, item);
    this.addTarget(note.title, item);
    const baseNameNoExt = path.basename(note.sourcePath).replace(/\.(md|ipynb)$/i, '');
    this.addTarget(baseNameNoExt, item);
  }

  registerDatabase(database) {
    if (!database || !database.collectionSlug) return;
    const url = `${this.publicBasePath}/${database.collectionSlug}`;
    const item = { url, title: database.title || database.slug, type: 'database' };

    this.addTarget(database.sourcePath, item);
    const pathNoExt = database.sourcePath.replace(/\.csv$/i, '');
    this.addTarget(pathNoExt, item);
    this.addTarget(database.collectionSlug, item);
    this.addTarget(database.slug, item);
    this.addTarget(database.title, item);
    const baseNameNoExt = path.basename(database.sourcePath, '.csv');
    this.addTarget(baseNameNoExt, item);
  }

  addTarget(key, item) {
    if (!key) return;
    const normalizedKey = normalizeLinkTarget(key);
    if (normalizedKey && !this.targets.has(normalizedKey)) {
      this.targets.set(normalizedKey, item);
    }
  }

  resolve(targetString) {
    if (!targetString) return null;
    const normalized = normalizeLinkTarget(targetString);

    if (this.targets.has(normalized)) {
      return this.targets.get(normalized);
    }

    const lastSegment = normalized.split('/').at(-1);
    if (lastSegment && this.targets.has(lastSegment)) {
      return this.targets.get(lastSegment);
    }

    return null;
  }
}

function parseWikiLinkInner(inner) {
  const pipeIndex = inner.indexOf('|');
  const rawTarget = pipeIndex !== -1 ? inner.slice(0, pipeIndex).trim() : inner.trim();
  const rawParam = pipeIndex !== -1 ? inner.slice(pipeIndex + 1).trim() : '';

  const hashIndex = rawTarget.indexOf('#');
  const targetName = hashIndex !== -1 ? rawTarget.slice(0, hashIndex).trim() : rawTarget;
  const headerSection = hashIndex !== -1 ? rawTarget.slice(hashIndex + 1).trim() : '';

  return {
    rawTarget,
    rawParam,
    targetName,
    headerSection,
  };
}

function renderInternalWikiLink(inner, linkResolver) {
  const { targetName, headerSection, rawParam } = parseWikiLinkInner(inner);
  const headerAnchor = headerSection ? `#${slugify(headerSection)}` : '';

  if (!targetName) {
    // Current page section link: [[#Section]]
    const displayText = rawParam || headerSection || 'Section';
    return `<a href="${headerAnchor}" class="internal-link">${escapeHtml(displayText)}</a>`;
  }

  const resolved = linkResolver ? linkResolver.resolve(targetName) : null;
  if (resolved) {
    const url = `${resolved.url}${headerAnchor}`;
    const defaultText = headerSection ? `${resolved.title} > ${headerSection}` : resolved.title;
    const displayText = rawParam || defaultText;
    return `<a href="${url}" class="internal-link">${escapeHtml(displayText)}</a>`;
  }

  // Unresolved link
  const defaultText = headerSection ? `${targetName} > ${headerSection}` : targetName;
  const displayText = rawParam || defaultText;
  return `<span class="internal-link is-unresolved" title="Page not found: ${escapeHtml(targetName)}">${escapeHtml(displayText)}</span>`;
}

function renderEmbeddedWikiLink(
  inner,
  linkResolver,
  copyReferencedAsset,
  sourceDirectory,
  publicScope,
  onAssetCopied,
) {
  const { targetName, headerSection, rawParam } = parseWikiLinkInner(inner);

  if (
    isMediaFile(targetName) ||
    (copyReferencedAsset && (targetName.includes('/') || targetName.includes('.')))
  ) {
    let width = '';
    let height = '';
    let alt = '';

    if (rawParam) {
      if (/^\d+$/.test(rawParam)) {
        width = rawParam;
      } else if (/^(\d+)x(\d+)$/i.test(rawParam)) {
        const match = rawParam.match(/^(\d+)x(\d+)$/i);
        if (match) {
          width = match[1];
          height = match[2];
        }
      } else {
        alt = rawParam;
      }
    }

    let assetUrl = null;
    if (typeof copyReferencedAsset === 'function') {
      assetUrl = copyReferencedAsset(sourceDirectory, publicScope, targetName, onAssetCopied);
    }

    if (assetUrl && assetUrl !== targetName) {
      const widthAttr = width ? ` width="${width}"` : '';
      const heightAttr = height ? ` height="${height}"` : '';
      const altAttr = escapeHtml(alt || path.basename(targetName));
      return `<img src="${assetUrl}"${widthAttr}${heightAttr} alt="${altAttr}" class="internal-embed-image" />`;
    }

    return `<span class="internal-embed-broken" title="Asset not found: ${escapeHtml(targetName)}">${escapeHtml(targetName)}</span>`;
  }

  // Transclusion of note: ![[Note Name]]
  const resolved = linkResolver ? linkResolver.resolve(targetName) : null;
  const headerAnchor = headerSection ? `#${slugify(headerSection)}` : '';

  if (resolved) {
    const url = `${resolved.url}${headerAnchor}`;
    const titleText = headerSection ? `${resolved.title} > ${headerSection}` : resolved.title;
    return `<div class="internal-embed-note"><a href="${url}" class="internal-embed-link"><span class="internal-embed-icon">📄</span> <span class="internal-embed-title">${escapeHtml(titleText)}</span></a></div>`;
  }

  return `<span class="internal-link is-unresolved" title="Note not found: ${escapeHtml(targetName)}">${escapeHtml(targetName)}</span>`;
}

export function rewriteWikiLinks({
  markdown,
  sourceDirectory,
  publicScope,
  linkResolver,
  copyReferencedAsset,
  onAssetCopied,
}) {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  let inCodeBlock = false;
  const resultLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      resultLines.push(line);
      continue;
    }

    if (inCodeBlock) {
      resultLines.push(line);
      continue;
    }

    // Protect inline code `...`
    const inlineCodePlaceholders = [];
    const protectedLine = line.replace(/`[^`]+`/g, (match) => {
      const id = `__INLINE_CODE_PH_${inlineCodePlaceholders.length}__`;
      inlineCodePlaceholders.push({ id, value: match });
      return id;
    });

    // 1. Process embedded links ![[...]]
    let processedLine = protectedLine.replace(/!\[\[([^\]]+)\]\]/g, (_match, inner) => {
      return renderEmbeddedWikiLink(
        inner,
        linkResolver,
        copyReferencedAsset,
        sourceDirectory,
        publicScope,
        onAssetCopied,
      );
    });

    // 2. Process internal links [[...]]
    processedLine = processedLine.replace(/\[\[([^\]]+)\]\]/g, (_match, inner) => {
      return renderInternalWikiLink(inner, linkResolver);
    });

    // Restore inline code placeholders
    for (const ph of inlineCodePlaceholders) {
      processedLine = processedLine.replace(ph.id, ph.value);
    }

    resultLines.push(processedLine);
  }

  return resultLines.join('\n');
}
