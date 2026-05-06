import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createAssetTools } from "./sync-vault/assets.mjs";
import { renderSubjectsDataFile } from "./sync-vault/data-file.mjs";
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
import { createNotebookConverter, notebookTitle } from "./sync-vault/notebooks.mjs";
import { contentFileName, normalizeSiteBase, relativePathSegments, slugify, slugifyPath } from "./sync-vault/paths.mjs";
import { findNearestSubject, listDirectories, listNoteFiles } from "./sync-vault/vault-files.mjs";

const vaultPath = process.env.VAULT_PATH || readEnvValue("VAULT_PATH");
const siteBase = process.env.ASTRO_BASE || readEnvValue("ASTRO_BASE") || "/notegen";
const subjectsContentRoot = path.resolve("src/content/subjects");
const contentRoot = path.resolve("src/content/notes");
const assetsRoot = path.resolve("public/generated/notes");
const subjectsDataPath = path.resolve("src/data/generated/subjects.ts");
const subjectsDataDir = path.dirname(subjectsDataPath);

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

rmSync(subjectsContentRoot, { recursive: true, force: true });
rmSync(contentRoot, { recursive: true, force: true });
rmSync(assetsRoot, { recursive: true, force: true });
mkdirSync(subjectsContentRoot, { recursive: true });
mkdirSync(contentRoot, { recursive: true });
mkdirSync(assetsRoot, { recursive: true });
mkdirSync(subjectsDataDir, { recursive: true });

const subjects = [];
const topLevelNotes = [];
let generatedNotesCount = 0;
const subjectBySourcePath = new Map();

const subjectDirectories = listDirectories(resolvedVaultPath, isIgnoredPath)
  .filter((directoryPath) => {
    const indexPath = path.join(directoryPath, "_index.md");
    return existsSync(indexPath) && !isIgnoredPath(indexPath, false);
  })
  .sort((left, right) => path.relative(resolvedVaultPath, left).localeCompare(path.relative(resolvedVaultPath, right)));

for (const subjectPath of subjectDirectories) {
  const indexPath = path.join(subjectPath, "_index.md");
  const sourceRelativePath = path.relative(resolvedVaultPath, subjectPath);
  const subjectSlug = slugifyPath(sourceRelativePath);
  const parentSubject = findNearestSubject(path.dirname(sourceRelativePath), subjectBySourcePath);

  const rawIndex = readFileSync(indexPath, "utf8");
  const parsedIndex = parseFrontmatter(rawIndex);
  const subjectTitle = parsedIndex.data.title || path.basename(subjectPath);
  const subjectDescription = parsedIndex.data.description || firstParagraph(parsedIndex.body);
  const subjectSummary = subjectDescription || excerpt(parsedIndex.body, 160);
  const rewrittenSubjectBody = rewriteAssetLinks(normalizeBlockquoteMath(parsedIndex.body), subjectPath, subjectSlug);

  const subjectOutputPath = path.join(subjectsContentRoot, contentFileName(subjectSlug));
  ensureParentDir(subjectOutputPath);
  writeFileSync(
    subjectOutputPath,
    `${toFrontmatter({
      title: subjectTitle,
      slug: subjectSlug,
      description: subjectDescription,
      draft: parsedIndex.data.draft ?? false,
      sourcePath: path.relative(resolvedVaultPath, indexPath)
    })}${rewrittenSubjectBody.trim()}\n`,
    "utf8"
  );

  const subjectAssetsDir = path.join(assetsRoot, subjectSlug);
  mkdirSync(subjectAssetsDir, { recursive: true });

  const sourceAssetsDir = path.join(subjectPath, "assets");
  if (existsSync(sourceAssetsDir) && statSync(sourceAssetsDir).isDirectory() && !isIgnoredPath(sourceAssetsDir, true)) {
    copyDirectoryFiltered(sourceAssetsDir, path.join(subjectAssetsDir, "assets"));
  }

  const subject = {
    slug: subjectSlug,
    title: subjectTitle,
    summary: subjectSummary,
    description: subjectDescription,
    draft: parsedIndex.data.draft ?? false,
    parentSlug: parentSubject?.slug,
    sourcePath: sourceRelativePath,
    notes: []
  };

  subjects.push(subject);
  subjectBySourcePath.set(sourceRelativePath, subject);
}

for (const sourcePath of listNoteFiles(resolvedVaultPath, isIgnoredPath)) {
  const sourceRelativePath = path.relative(resolvedVaultPath, sourcePath);
  const sourceRelativeDir = path.dirname(sourceRelativePath);
  const subject = findNearestSubject(sourceRelativeDir, subjectBySourcePath);
  const isTopLevelNote = sourceRelativeDir === ".";

  if (!subject && !isTopLevelNote) {
    continue;
  }

  const raw = readFileSync(sourcePath, "utf8");
  const isNotebook = sourcePath.endsWith(".ipynb");
  const noteRelativePath = subject
    ? path.relative(path.join(resolvedVaultPath, subject.sourcePath), sourcePath)
    : sourceRelativePath;
  const noteRelativeSegments = relativePathSegments(noteRelativePath.replace(/\.(md|ipynb)$/i, ""));
  const originalName = noteRelativeSegments.at(-1) || path.basename(sourcePath, ".md");
  const notebookPublicScope = subject
    ? `${subject.slug}/${noteRelativeSegments.map(slugify).join("/")}`
    : noteRelativeSegments.map(slugify).join("/");
  const notebookConversion = isNotebook ? notebookToMarkdown(raw, notebookPublicScope) : null;
  const parsed = isNotebook
    ? {
        data: {
          title: notebookTitle(notebookConversion.notebook, originalName),
          description: notebookConversion.notebook.metadata?.description,
          date: notebookConversion.notebook.metadata?.date,
          draft: notebookConversion.notebook.metadata?.draft
        },
        body: notebookConversion.markdown
      }
    : parseFrontmatter(raw);

  noteRelativeSegments[noteRelativeSegments.length - 1] = parsed.data.slug || originalName;
  const noteSlug = noteRelativeSegments.map(slugify).join("/");
  const collectionSlug = subject ? `${subject.slug}/${noteSlug}` : noteSlug;
  const noteTitle = parsed.data.title || originalName;
  const noteDescription = parsed.data.description || excerpt(parsed.body);
  const rewrittenBody = rewriteAssetLinks(normalizeBlockquoteMath(parsed.body), path.dirname(sourcePath), collectionSlug);
  const outputFrontmatter = toFrontmatter({
    title: noteTitle,
    slug: collectionSlug,
    description: noteDescription,
    date: parsed.data.date,
    draft: parsed.data.draft ?? false,
    subject: subject?.title,
    subjectSlug: subject?.slug,
    parentSlug: subject?.parentSlug,
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
    draft: parsed.data.draft ?? false,
    sourcePath: sourceRelativePath,
    updatedAt: parsed.data.date || undefined
  };

  if (subject) {
    subject.notes.push(note);
  } else {
    topLevelNotes.push(note);
  }
}

writeFileSync(subjectsDataPath, renderSubjectsDataFile(subjects, topLevelNotes), "utf8");

console.log(`Imported ${subjects.length} subjects and ${generatedNotesCount} notes from ${resolvedVaultPath}`);
