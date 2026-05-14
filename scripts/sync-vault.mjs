import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createAssetTools } from "./sync-vault/assets.mjs";
import { defaultChangelogPath, readChangelogEvents, renderChangelogDataFile } from "./sync-vault/changelog.mjs";
import { renderTopicsDataFile } from "./sync-vault/data-file.mjs";
import { readEnvValue } from "./sync-vault/env.mjs";
import { ensureParentDir } from "./sync-vault/fs-utils.mjs";
import { createIgnoreMatcher } from "./sync-vault/ignore-rules.mjs";
import {
  excerpt,
  firstParagraph,
  normalizeBlockquoteMath,
  parseFrontmatter,
  toFrontmatter
} from "./sync-vault/markdown.mjs";
import { createNotebookConverter, notebookNoteFrontmatter } from "./sync-vault/notebooks.mjs";
import { contentFileName, normalizeSiteBase, relativePathSegments, slugify, slugifyPath } from "./sync-vault/paths.mjs";
import { readSiteConfig, resolveVaultConfigPath } from "./sync-vault/site-config.mjs";
import { findNearestTopic, listDirectories, listNoteFiles } from "./sync-vault/vault-files.mjs";

const vaultPath = process.env.VAULT_PATH || readEnvValue("VAULT_PATH");
const siteBase = process.env.ASTRO_BASE || readEnvValue("ASTRO_BASE") || "/notegen";
const contentCollectionsRoot = path.resolve("src/content");
const topicsContentRoot = path.join(contentCollectionsRoot, "topics");
const contentRoot = path.join(contentCollectionsRoot, "notes");
const assetsRoot = path.resolve("public/generated/notes");
const topicsDataPath = path.resolve("src/data/generated/topics.ts");
const changelogDataPath = path.resolve("src/data/generated/changelog.ts");
const topicsDataDir = path.dirname(topicsDataPath);

if (!vaultPath) {
  console.error("VAULT_PATH is not set.");
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
  defaultChangelogPath(resolvedVaultPath)
);
const { isIgnoredPath } = createIgnoreMatcher(resolvedVaultPath);
const { copyDirectoryFiltered, rewriteAssetLinks } = createAssetTools({
  assetsRoot,
  publicBasePath,
  isIgnoredPath
});
const { notebookToMarkdown } = createNotebookConverter({
  assetsRoot,
  publicBasePath
});

rmSync(contentCollectionsRoot, { recursive: true, force: true });
rmSync(assetsRoot, { recursive: true, force: true });
mkdirSync(topicsContentRoot, { recursive: true });
mkdirSync(contentRoot, { recursive: true });
mkdirSync(assetsRoot, { recursive: true });
mkdirSync(topicsDataDir, { recursive: true });

const topics = [];
const topLevelNotes = [];
let generatedNotesCount = 0;
const topicBySourcePath = new Map();

function normalizeNoteStatus(data) {
  if (data.status === "draft" || data.status === "in-progress" || data.status === "done") {
    return data.status;
  }

  return data.draft === true ? "draft" : "done";
}

const topicDirectories = listDirectories(resolvedVaultPath, isIgnoredPath)
  .filter((directoryPath) => {
    const indexPath = path.join(directoryPath, "_index.md");
    return existsSync(indexPath) && !isIgnoredPath(indexPath, false);
  })
  .sort((left, right) => path.relative(resolvedVaultPath, left).localeCompare(path.relative(resolvedVaultPath, right)));

for (const topicPath of topicDirectories) {
  const indexPath = path.join(topicPath, "_index.md");
  const sourceRelativePath = path.relative(resolvedVaultPath, topicPath);
  const topicSlug = slugifyPath(sourceRelativePath);
  const parentTopic = findNearestTopic(path.dirname(sourceRelativePath), topicBySourcePath);

  const rawIndex = readFileSync(indexPath, "utf8");
  const parsedIndex = parseFrontmatter(rawIndex);
  const topicTitle = parsedIndex.data.title || path.basename(topicPath);
  const topicDescription = parsedIndex.data.description || firstParagraph(parsedIndex.body);
  const topicSummary = topicDescription || excerpt(parsedIndex.body, 160);
  const rewrittenTopicBody = rewriteAssetLinks(normalizeBlockquoteMath(parsedIndex.body), topicPath, topicSlug);

  const topicOutputPath = path.join(topicsContentRoot, contentFileName(topicSlug));
  ensureParentDir(topicOutputPath);
  writeFileSync(
    topicOutputPath,
    `${toFrontmatter({
      title: topicTitle,
      slug: topicSlug,
      description: topicDescription,
      draft: parsedIndex.data.draft ?? false,
      sourcePath: path.relative(resolvedVaultPath, indexPath)
    })}${rewrittenTopicBody.trim()}\n`,
    "utf8"
  );

  const topicAssetsDir = path.join(assetsRoot, topicSlug);
  mkdirSync(topicAssetsDir, { recursive: true });

  const sourceAssetsDir = path.join(topicPath, "assets");
  if (existsSync(sourceAssetsDir) && statSync(sourceAssetsDir).isDirectory() && !isIgnoredPath(sourceAssetsDir, true)) {
    copyDirectoryFiltered(sourceAssetsDir, path.join(topicAssetsDir, "assets"));
  }

  const topic = {
    slug: topicSlug,
    title: topicTitle,
    summary: topicSummary,
    description: topicDescription,
    draft: parsedIndex.data.draft ?? false,
    parentSlug: parentTopic?.slug,
    sourcePath: sourceRelativePath,
    notes: []
  };

  topics.push(topic);
  topicBySourcePath.set(sourceRelativePath, topic);
}

for (const sourcePath of listNoteFiles(resolvedVaultPath, isIgnoredPath)) {
  const sourceRelativePath = path.relative(resolvedVaultPath, sourcePath);
  const sourceRelativeDir = path.dirname(sourceRelativePath);
  const topic = findNearestTopic(sourceRelativeDir, topicBySourcePath);
  const isTopLevelNote = sourceRelativeDir === ".";

  if (!topic && !isTopLevelNote) {
    continue;
  }

  const raw = readFileSync(sourcePath, "utf8");
  const isNotebook = sourcePath.endsWith(".ipynb");
  const noteRelativePath = topic
    ? path.relative(path.join(resolvedVaultPath, topic.sourcePath), sourcePath)
    : sourceRelativePath;
  const noteRelativeSegments = relativePathSegments(noteRelativePath.replace(/\.(md|ipynb)$/i, ""));
  const originalName = noteRelativeSegments.at(-1) || path.basename(sourcePath, ".md");
  const notebookPublicScope = topic
    ? `${topic.slug}/${noteRelativeSegments.map(slugify).join("/")}`
    : noteRelativeSegments.map(slugify).join("/");
  const notebookConversion = isNotebook ? notebookToMarkdown(raw, notebookPublicScope) : null;
  const parsed = isNotebook
    ? notebookNoteFrontmatter(notebookConversion.notebook, notebookConversion.markdown, originalName)
    : parseFrontmatter(raw);

  noteRelativeSegments[noteRelativeSegments.length - 1] = parsed.data.slug || originalName;
  const noteSlug = noteRelativeSegments.map(slugify).join("/");
  const collectionSlug = topic ? `${topic.slug}/${noteSlug}` : noteSlug;
  const noteTitle = parsed.data.title || originalName;
  const noteDescription = parsed.data.description || excerpt(parsed.body);
  const noteStatus = normalizeNoteStatus(parsed.data);
  const rewrittenBody = rewriteAssetLinks(normalizeBlockquoteMath(parsed.body), path.dirname(sourcePath), collectionSlug);
  const outputFrontmatter = toFrontmatter({
    title: noteTitle,
    slug: collectionSlug,
    description: noteDescription,
    date: parsed.data.date,
    status: noteStatus,
    topic: topic?.title,
    topicSlug: topic?.slug,
    parentSlug: topic?.parentSlug,
    sourcePath: sourceRelativePath
  });
  const noteOutputPath = path.join(contentRoot, contentFileName(collectionSlug));

  ensureParentDir(noteOutputPath);
  writeFileSync(noteOutputPath, `${outputFrontmatter}${rewrittenBody.trim()}\n`, "utf8");

  generatedNotesCount += 1;
  const note = {
    slug: noteSlug,
    collectionSlug,
    title: noteTitle,
    summary: noteDescription,
    description: noteDescription,
    status: noteStatus,
    sourcePath: sourceRelativePath,
    updatedAt: parsed.data.date || undefined
  };

  if (topic) {
    topic.notes.push(note);
  } else {
    topLevelNotes.push(note);
  }
}

writeFileSync(topicsDataPath, renderTopicsDataFile(topics, topLevelNotes), "utf8");
writeFileSync(
  changelogDataPath,
  renderChangelogDataFile(readChangelogEvents(changelogPath), topics, topLevelNotes),
  "utf8"
);

console.log(`Imported ${topics.length} topics and ${generatedNotesCount} notes from ${resolvedVaultPath}`);
