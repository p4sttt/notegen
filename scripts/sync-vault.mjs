import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createAssetTools } from './sync-vault/assets.mjs';
import { VaultCacheManager, computeFileHash } from './sync-vault/cache.mjs';
import {
  defaultChangelogPath,
  readChangelogEvents,
  renderChangelogDataFile,
} from './sync-vault/changelog.mjs';
import { parseCsvDatabase } from './sync-vault/csv.mjs';
import { renderTopicsDataFile } from './sync-vault/data-file.mjs';
import { readEnvValue } from './sync-vault/env.mjs';
import { ensureParentDir } from './sync-vault/fs-utils.mjs';
import { createIgnoreMatcher } from './sync-vault/ignore-rules.mjs';
import {
  excerpt,
  firstParagraph,
  normalizeBlockquoteMath,
  parseFrontmatter,
  toFrontmatter,
} from './sync-vault/markdown.mjs';
import {
  createNotebookConverter,
  notebookNoteFrontmatter,
  notebookTitle,
} from './sync-vault/notebooks.mjs';
import {
  contentFileName,
  normalizeSiteBase,
  relativePathSegments,
  slugify,
  slugifyPath,
} from './sync-vault/paths.mjs';
import { readSiteConfig, resolveVaultConfigPath } from './sync-vault/site-config.mjs';
import {
  findNearestTopic,
  listDatabaseFiles,
  listDirectories,
  listNoteFiles,
} from './sync-vault/vault-files.mjs';
import { loadPlugins, PluginContext, writePluginsUiFile } from './sync-vault/plugins.mjs';
import { VaultLinkResolver, rewriteWikiLinks } from './sync-vault/wikilinks.mjs';

const vaultPath = process.env.VAULT_PATH || readEnvValue('VAULT_PATH');
const siteBase = process.env.ASTRO_BASE || readEnvValue('ASTRO_BASE') || '/notegen';
const contentCollectionsRoot = path.resolve('src/content');
const topicsContentRoot = path.join(contentCollectionsRoot, 'topics');
const contentRoot = path.join(contentCollectionsRoot, 'notes');
const assetsRoot = path.resolve('public/generated/notes');
const topicsDataPath = path.resolve('src/data/generated/topics.ts');
const changelogDataPath = path.resolve('src/data/generated/changelog.ts');
const topicsDataDir = path.dirname(topicsDataPath);

if (!vaultPath) {
  console.error('VAULT_PATH is not set.');
  process.exit(1);
}

const resolvedVaultPath = path.resolve(vaultPath);

if (!existsSync(resolvedVaultPath)) {
  console.error(`Vault path does not exist: ${resolvedVaultPath}`);
  process.exit(1);
}

const publicBasePath = normalizeSiteBase(siteBase);
const siteConfig = readSiteConfig(resolvedVaultPath);
const changelogPath = resolveVaultConfigPath(
  resolvedVaultPath,
  siteConfig.changelogPath,
  defaultChangelogPath(resolvedVaultPath),
);
const { isIgnoredPath } = createIgnoreMatcher(resolvedVaultPath);

const noCache =
  process.argv.includes('--no-cache') ||
  process.argv.includes('--force') ||
  Boolean(process.env.NO_CACHE);

const cacheManager = new VaultCacheManager({
  resolvedVaultPath,
  siteConfig,
  disabled: noCache,
});

const pluginManager = await loadPlugins(resolvedVaultPath);
const pluginContext = new PluginContext(siteConfig, resolvedVaultPath);
await pluginManager.runBeforeSync(pluginContext);
const { copyDirectoryFiltered, copyReferencedAsset, rewriteAssetLinks } = createAssetTools({
  assetsRoot,
  publicBasePath,
  isIgnoredPath,
});
const { notebookToMarkdown } = createNotebookConverter({
  assetsRoot,
  publicBasePath,
});

mkdirSync(topicsContentRoot, { recursive: true });
mkdirSync(contentRoot, { recursive: true });
mkdirSync(assetsRoot, { recursive: true });
mkdirSync(topicsDataDir, { recursive: true });

const validOutputFiles = new Set();
validOutputFiles.add(path.resolve(topicsDataPath));
validOutputFiles.add(path.resolve(changelogDataPath));
validOutputFiles.add(path.resolve('src/data/generated/plugins-ui.ts'));

const topics = [];
const topLevelNotes = [];
const topLevelDatabases = [];
let generatedNotesCount = 0;
let generatedDatabasesCount = 0;
const topicBySourcePath = new Map();
const usedCollectionSlugs = new Set();

const activeTopicSourcePaths = [];
const activeNoteSourcePaths = [];
const activeDatabaseSourcePaths = [];

function normalizeNoteStatus(data) {
  if (data.status === 'draft' || data.status === 'in-progress' || data.status === 'done') {
    return data.status;
  }

  return data.draft === true ? 'draft' : 'done';
}

const topicDirectories = listDirectories(resolvedVaultPath, isIgnoredPath)
  .filter((directoryPath) => {
    const indexPath = path.join(directoryPath, '_index.md');
    return existsSync(indexPath) && !isIgnoredPath(indexPath, false);
  })
  .sort((left, right) =>
    path.relative(resolvedVaultPath, left).localeCompare(path.relative(resolvedVaultPath, right)),
  );

// Build VaultLinkResolver index across the entire vault
const linkResolver = new VaultLinkResolver({ publicBasePath });

for (const topicPath of topicDirectories) {
  const indexPath = path.join(topicPath, '_index.md');
  const sourceRelativePath = path.relative(resolvedVaultPath, topicPath);
  const topicSlug = slugifyPath(sourceRelativePath);
  let topicTitle = path.basename(topicPath);
  if (existsSync(indexPath)) {
    try {
      const rawIndex = readFileSync(indexPath, 'utf8');
      const parsedIndex = parseFrontmatter(rawIndex);
      if (parsedIndex.data.title) {
        topicTitle = parsedIndex.data.title;
      }
    } catch {
      // Ignore index read errors during link resolution indexing
    }
  }
  linkResolver.registerTopic({
    slug: topicSlug,
    title: topicTitle,
    sourcePath: sourceRelativePath,
  });
}

const noteFiles = listNoteFiles(resolvedVaultPath, isIgnoredPath);
const preSlugTracker = new Set(
  topicDirectories.map((tp) => slugifyPath(path.relative(resolvedVaultPath, tp))),
);

function getPreCollectionSlug(baseSlug) {
  let slug = baseSlug;
  let counter = 2;
  while (preSlugTracker.has(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
  preSlugTracker.add(slug);
  return slug;
}

for (const sourcePath of noteFiles) {
  const sourceRelativePath = path.relative(resolvedVaultPath, sourcePath);
  const sourceRelativeDir = path.dirname(sourceRelativePath);
  const topicDir = topicDirectories.find(
    (td) => path.relative(resolvedVaultPath, td) === sourceRelativeDir,
  );
  const isTopLevel = sourceRelativeDir === '.';
  if (!topicDir && !isTopLevel) continue;

  const topicSlug = topicDir ? slugifyPath(path.relative(resolvedVaultPath, topicDir)) : null;
  const isNotebook = sourcePath.endsWith('.ipynb');
  const noteRelativePath = topicDir
    ? path.relative(topicDir, sourcePath)
    : sourceRelativePath;
  const noteRelativeSegments = relativePathSegments(
    noteRelativePath.replace(/\.(md|ipynb)$/i, ''),
  );
  const originalName = noteRelativeSegments.at(-1) || path.basename(sourcePath, '.md');
  let title = originalName;
  let customSlug = null;

  try {
    const raw = readFileSync(sourcePath, 'utf8');
    if (isNotebook) {
      const nb = JSON.parse(raw);
      title = notebookTitle(nb, originalName);
    } else {
      const parsed = parseFrontmatter(raw);
      title = parsed.data.title || originalName;
      customSlug = parsed.data.slug;
    }
  } catch {
    // Ignore read errors during link resolution indexing
  }

  noteRelativeSegments[noteRelativeSegments.length - 1] = customSlug || originalName;
  const noteSlug = noteRelativeSegments.map(slugify).join('/');
  const collectionSlug = getPreCollectionSlug(topicSlug ? `${topicSlug}/${noteSlug}` : noteSlug);

  linkResolver.registerNote({
    slug: noteSlug,
    collectionSlug,
    title,
    sourcePath: sourceRelativePath,
  });
}

for (const sourcePath of listDatabaseFiles(resolvedVaultPath, isIgnoredPath)) {
  const sourceRelativePath = path.relative(resolvedVaultPath, sourcePath);
  const databaseRelativeSegments = relativePathSegments(
    sourceRelativePath.replace(/\.csv$/i, ''),
  );
  const originalName = databaseRelativeSegments.at(-1) || path.basename(sourcePath, '.csv');
  const databaseSlug = databaseRelativeSegments.map(slugify).join('/');
  const collectionSlug = getPreCollectionSlug(databaseSlug);

  linkResolver.registerDatabase({
    slug: databaseSlug,
    collectionSlug,
    title: originalName,
    sourcePath: sourceRelativePath,
  });
}

for (const topicPath of topicDirectories) {
  const indexPath = path.join(topicPath, '_index.md');
  const sourceRelativePath = path.relative(resolvedVaultPath, topicPath);
  activeTopicSourcePaths.push(sourceRelativePath);
  const topicSlug = slugifyPath(sourceRelativePath);
  const parentTopic = findNearestTopic(path.dirname(sourceRelativePath), topicBySourcePath);

  const topicOutputPath = path.join(topicsContentRoot, contentFileName(topicSlug));
  validOutputFiles.add(path.resolve(topicOutputPath));

  const cachedEntry = cacheManager.getTopic(sourceRelativePath, indexPath);
  if (cachedEntry) {
    ensureParentDir(topicOutputPath);
    if (
      !existsSync(topicOutputPath) ||
      readFileSync(topicOutputPath, 'utf8') !== cachedEntry.outputContent
    ) {
      writeFileSync(topicOutputPath, cachedEntry.outputContent, 'utf8');
    }

    const topicAssetsDir = path.join(assetsRoot, topicSlug);
    mkdirSync(topicAssetsDir, { recursive: true });

    for (const asset of cachedEntry.copiedAssets || []) {
      validOutputFiles.add(path.resolve(asset.targetPath));
      if (!existsSync(asset.targetPath) && asset.sourcePath && existsSync(asset.sourcePath)) {
        ensureParentDir(asset.targetPath);
        copyFileSync(asset.sourcePath, asset.targetPath);
      }
    }

    const topic = {
      ...cachedEntry.topic,
      parentSlug: parentTopic?.slug,
      notes: [],
      databases: [],
    };
    topics.push(topic);
    topicBySourcePath.set(sourceRelativePath, topic);
    usedCollectionSlugs.add(topicSlug);
    continue;
  }

  const copiedAssets = [];
  const onAssetCopied = ({ sourceAssetPath, targetAssetPath }) => {
    validOutputFiles.add(path.resolve(targetAssetPath));
    copiedAssets.push({ sourcePath: sourceAssetPath, targetPath: targetAssetPath });
  };

  const rawIndex = readFileSync(indexPath, 'utf8');
  const parsedIndex = parseFrontmatter(rawIndex);
  const topicTitle = parsedIndex.data.title || path.basename(topicPath);
  const topicDescription = parsedIndex.data.description || firstParagraph(parsedIndex.body);
  const topicSummary = topicDescription || excerpt(parsedIndex.body, 160);
  const rewrittenTopicBody = rewriteWikiLinks({
    markdown: rewriteAssetLinks(
      normalizeBlockquoteMath(parsedIndex.body),
      topicPath,
      topicSlug,
      onAssetCopied,
    ),
    sourceDirectory: topicPath,
    publicScope: topicSlug,
    linkResolver,
    copyReferencedAsset,
    onAssetCopied,
  });

  const outputContent = `${toFrontmatter({
    title: topicTitle,
    slug: topicSlug,
    description: topicDescription,
    draft: parsedIndex.data.draft ?? false,
    sourcePath: path.relative(resolvedVaultPath, indexPath),
  })}${rewrittenTopicBody.trim()}\n`;

  ensureParentDir(topicOutputPath);
  writeFileSync(topicOutputPath, outputContent, 'utf8');

  const topicAssetsDir = path.join(assetsRoot, topicSlug);
  mkdirSync(topicAssetsDir, { recursive: true });

  const sourceAssetsDir = path.join(topicPath, 'assets');
  if (
    existsSync(sourceAssetsDir) &&
    statSync(sourceAssetsDir).isDirectory() &&
    !isIgnoredPath(sourceAssetsDir, true)
  ) {
    copyDirectoryFiltered(sourceAssetsDir, path.join(topicAssetsDir, 'assets'), onAssetCopied);
  }

  const topic = {
    slug: topicSlug,
    title: topicTitle,
    summary: topicSummary,
    description: topicDescription,
    draft: parsedIndex.data.draft ?? false,
    parentSlug: parentTopic?.slug,
    sourcePath: sourceRelativePath,
    notes: [],
    databases: [],
  };

  cacheManager.setTopic(sourceRelativePath, indexPath, {
    topic,
    outputFilePath: topicOutputPath,
    outputContent,
    copiedAssets,
  });

  topics.push(topic);
  topicBySourcePath.set(sourceRelativePath, topic);
  usedCollectionSlugs.add(topicSlug);
}

function uniqueCollectionSlug(baseSlug) {
  if (!usedCollectionSlugs.has(baseSlug)) {
    usedCollectionSlugs.add(baseSlug);
    return baseSlug;
  }

  let counter = 2;
  while (usedCollectionSlugs.has(`${baseSlug}-${counter}`)) {
    counter += 1;
  }

  const slug = `${baseSlug}-${counter}`;
  usedCollectionSlugs.add(slug);
  return slug;
}

for (const sourcePath of listNoteFiles(resolvedVaultPath, isIgnoredPath)) {
  const sourceRelativePath = path.relative(resolvedVaultPath, sourcePath);
  activeNoteSourcePaths.push(sourceRelativePath);
  const sourceRelativeDir = path.dirname(sourceRelativePath);
  const topic = findNearestTopic(sourceRelativeDir, topicBySourcePath);
  const isTopLevelNote = sourceRelativeDir === '.';

  if (!topic && !isTopLevelNote) {
    continue;
  }

  const cachedEntry = cacheManager.getNote(sourceRelativePath, sourcePath);
  if (cachedEntry) {
    const noteOutputPath = cachedEntry.outputFilePath;
    validOutputFiles.add(path.resolve(noteOutputPath));

    ensureParentDir(noteOutputPath);
    if (
      !existsSync(noteOutputPath) ||
      readFileSync(noteOutputPath, 'utf8') !== cachedEntry.outputContent
    ) {
      writeFileSync(noteOutputPath, cachedEntry.outputContent, 'utf8');
    }

    for (const asset of cachedEntry.generatedAssets || []) {
      validOutputFiles.add(path.resolve(asset.targetPath));
      if (!existsSync(asset.targetPath)) {
        if (asset.sourcePath && existsSync(asset.sourcePath)) {
          ensureParentDir(asset.targetPath);
          copyFileSync(asset.sourcePath, asset.targetPath);
        } else if (asset.contentBase64) {
          ensureParentDir(asset.targetPath);
          writeFileSync(asset.targetPath, Buffer.from(asset.contentBase64, 'base64'));
        }
      }
    }

    generatedNotesCount += 1;
    const note = cachedEntry.note;
    if (topic) {
      topic.notes.push(note);
    } else {
      topLevelNotes.push(note);
    }
    usedCollectionSlugs.add(note.collectionSlug);
    continue;
  }

  const generatedAssets = [];
  const assetHashes = {};

  const onAssetCopied = ({ sourceAssetPath, targetAssetPath, relAssetPath }) => {
    validOutputFiles.add(path.resolve(targetAssetPath));
    generatedAssets.push({ sourcePath: sourceAssetPath, targetPath: targetAssetPath });
    if (relAssetPath) {
      const hashVal = computeFileHash(sourceAssetPath);
      if (hashVal) assetHashes[relAssetPath] = hashVal;
    }
  };

  const onAssetGenerated = ({ targetPath, contentBuffer }) => {
    validOutputFiles.add(path.resolve(targetPath));
    generatedAssets.push({ targetPath, contentBase64: contentBuffer.toString('base64') });
  };

  const raw = readFileSync(sourcePath, 'utf8');
  const isNotebook = sourcePath.endsWith('.ipynb');
  const noteRelativePath = topic
    ? path.relative(path.join(resolvedVaultPath, topic.sourcePath), sourcePath)
    : sourceRelativePath;
  const noteRelativeSegments = relativePathSegments(
    noteRelativePath.replace(/\.(md|ipynb)$/i, ''),
  );
  const originalName = noteRelativeSegments.at(-1) || path.basename(sourcePath, '.md');
  const notebookPublicScope = topic
    ? `${topic.slug}/${noteRelativeSegments.map(slugify).join('/')}`
    : noteRelativeSegments.map(slugify).join('/');
  const notebookConversion = isNotebook
    ? notebookToMarkdown(raw, notebookPublicScope, onAssetGenerated)
    : null;
  const parsed = isNotebook
    ? notebookNoteFrontmatter(
      notebookConversion.notebook,
      notebookConversion.markdown,
      originalName,
    )
    : parseFrontmatter(raw);

  const processedNote = await pluginManager.runProcessNote(
    {
      data: parsed.data,
      body: parsed.body,
      isNotebook,
      originalName,
      sourceRelativePath,
    },
    pluginContext,
  );
  parsed.data = processedNote.data;
  parsed.body = processedNote.body;

  noteRelativeSegments[noteRelativeSegments.length - 1] = parsed.data.slug || originalName;
  const noteSlug = noteRelativeSegments.map(slugify).join('/');
  const collectionSlug = uniqueCollectionSlug(topic ? `${topic.slug}/${noteSlug}` : noteSlug);
  const noteTitle = parsed.data.title || originalName;
  const noteDescription = parsed.data.description || excerpt(parsed.body);
  const noteStatus = normalizeNoteStatus(parsed.data);
  const note = {
    slug: noteSlug,
    collectionSlug,
    title: noteTitle,
    summary: noteDescription,
    description: noteDescription,
    status: noteStatus,
    sourcePath: sourceRelativePath,
    updatedAt: parsed.data.date || undefined,
    tags: parsed.data.tags,
  };

  const rewrittenBodyWithAssets = rewriteAssetLinks(
    normalizeBlockquoteMath(parsed.body),
    path.dirname(sourcePath),
    collectionSlug,
    onAssetCopied,
  );

  const rewrittenBody = rewriteWikiLinks({
    markdown: rewrittenBodyWithAssets,
    sourceDirectory: path.dirname(sourcePath),
    publicScope: collectionSlug,
    linkResolver,
    currentSourceNote: note,
    copyReferencedAsset,
    onAssetCopied,
  });

  const outputFrontmatter = toFrontmatter({
    title: noteTitle,
    slug: collectionSlug,
    description: noteDescription,
    date: parsed.data.date,
    status: noteStatus,
    topic: topic?.title,
    topicSlug: topic?.slug,
    parentSlug: topic?.parentSlug,
    sourcePath: sourceRelativePath,
    tags: parsed.data.tags,
  });
  const outputContent = `${outputFrontmatter}${rewrittenBody.trim()}\n`;
  const noteOutputPath = path.join(contentRoot, contentFileName(collectionSlug));
  validOutputFiles.add(path.resolve(noteOutputPath));

  ensureParentDir(noteOutputPath);
  writeFileSync(noteOutputPath, outputContent, 'utf8');

  generatedNotesCount += 1;

  cacheManager.setNote(sourceRelativePath, sourcePath, {
    note,
    outputFilePath: noteOutputPath,
    outputContent,
    generatedAssets,
    assetHashes,
  });

  if (topic) {
    topic.notes.push(note);
  } else {
    topLevelNotes.push(note);
  }
}

for (const sourcePath of listDatabaseFiles(resolvedVaultPath, isIgnoredPath)) {
  const sourceRelativePath = path.relative(resolvedVaultPath, sourcePath);
  activeDatabaseSourcePaths.push(sourceRelativePath);
  const sourceRelativeDir = path.dirname(sourceRelativePath);
  const topic = findNearestTopic(sourceRelativeDir, topicBySourcePath);
  const isTopLevelDatabase = sourceRelativeDir === '.';

  if (!topic && !isTopLevelDatabase) {
    continue;
  }

  const cachedEntry = cacheManager.getDatabase(sourceRelativePath, sourcePath);
  if (cachedEntry) {
    generatedDatabasesCount += 1;
    const database = cachedEntry.database;
    if (topic) {
      topic.databases.push(database);
    } else {
      topLevelDatabases.push(database);
    }
    usedCollectionSlugs.add(database.collectionSlug);
    continue;
  }

  const raw = readFileSync(sourcePath, 'utf8');
  const databaseRelativePath = topic
    ? path.relative(path.join(resolvedVaultPath, topic.sourcePath), sourcePath)
    : sourceRelativePath;
  const databaseRelativeSegments = relativePathSegments(
    databaseRelativePath.replace(/\.csv$/i, ''),
  );
  const originalName = databaseRelativeSegments.at(-1) || path.basename(sourcePath, '.csv');
  databaseRelativeSegments[databaseRelativeSegments.length - 1] = originalName;

  const databaseSlug = databaseRelativeSegments.map(slugify).join('/');
  const collectionSlug = uniqueCollectionSlug(
    topic ? `${topic.slug}/${databaseSlug}` : databaseSlug,
  );
  const parsedDatabase = parseCsvDatabase(raw);
  const rowCount = parsedDatabase.rows.length;
  const columnCount = parsedDatabase.columns.length;
  const databaseTitle = originalName;
  const databaseDescription = `${rowCount} rows · ${columnCount} columns`;
  const database = {
    slug: databaseSlug,
    collectionSlug,
    title: databaseTitle,
    summary: databaseDescription,
    description: databaseDescription,
    sourcePath: sourceRelativePath,
    topic: topic?.title,
    topicSlug: topic?.slug,
    parentSlug: topic?.parentSlug,
    columns: parsedDatabase.columns,
    rows: parsedDatabase.rows,
  };

  const finalDatabase = await pluginManager.runProcessDatabase(database, pluginContext);
  generatedDatabasesCount += 1;

  cacheManager.setDatabase(sourceRelativePath, sourcePath, {
    database: finalDatabase,
  });

  if (topic) {
    topic.databases.push(finalDatabase);
  } else {
    topLevelDatabases.push(finalDatabase);
  }
}

await pluginManager.runAfterSync(pluginContext, topics, topLevelNotes, topLevelDatabases);
writePluginsUiFile(pluginContext.ui);

const allTags = new Set();
for (const topic of topics) {
  for (const note of topic.notes) {
    if (note.tags) note.tags.forEach((tag) => allTags.add(tag));
  }
}
for (const note of topLevelNotes) {
  if (note.tags) note.tags.forEach((tag) => allTags.add(tag));
}

const sortedTags = Array.from(allTags).sort();
const tagColorMap = {};
sortedTags.forEach((tag, index) => {
  tagColorMap[tag] = (index % 6) + 1;
});

writeFileSync(
  topicsDataPath,
  renderTopicsDataFile(topics, topLevelNotes, topLevelDatabases, tagColorMap),
  'utf8',
);
writeFileSync(
  changelogDataPath,
  renderChangelogDataFile(
    readChangelogEvents(changelogPath),
    topics,
    topLevelNotes,
    topLevelDatabases,
  ),
  'utf8',
);

cacheManager.cleanOrphanedOutputs(validOutputFiles);
cacheManager.pruneUnusedCacheEntries({
  topics: activeTopicSourcePaths,
  notes: activeNoteSourcePaths,
  databases: activeDatabaseSourcePaths,
});
cacheManager.save();

const { stats } = cacheManager;
const topicStatStr = noCache
  ? `${topics.length} topics`
  : `${topics.length} topics (${stats.topicsCached} cached, ${stats.topicsRebuilt} rebuilt)`;
const noteStatStr = noCache
  ? `${generatedNotesCount} notes`
  : `${generatedNotesCount} notes (${stats.notesCached} cached, ${stats.notesRebuilt} rebuilt)`;
const dbStatStr = noCache
  ? `${generatedDatabasesCount} databases`
  : `${generatedDatabasesCount} databases (${stats.databasesCached} cached, ${stats.databasesRebuilt} rebuilt)`;

console.log(`Imported ${topicStatStr}, ${noteStatStr} and ${dbStatStr} from ${resolvedVaultPath}`);
