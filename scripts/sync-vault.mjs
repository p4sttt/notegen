import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

function readEnvValue(name) {
  const envPath = path.resolve(".env");
  if (!existsSync(envPath)) {
    return undefined;
  }

  const envContent = readFileSync(envPath, "utf8");
  for (const rawLine of envContent.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }

  return undefined;
}

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

function toVaultRelativePath(filePath) {
  return path.relative(resolvedVaultPath, filePath).split(path.sep).join("/");
}

function normalizeSiteBase(input) {
  if (!input || input === "/") {
    return "";
  }

  return `/${input.replace(/^\/+|\/+$/g, "")}`;
}

const publicBasePath = normalizeSiteBase(siteBase);

function escapeRegExp(input) {
  return input.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(input) {
  const source = input
    .split("*")
    .map(escapeRegExp)
    .join("[^/]*");
  return new RegExp(`^${source}$`);
}

function readIgnoreRules(rootPath) {
  const ignorePath = path.join(rootPath, ".notegenignore");
  const defaultRules = [".git/", "node_modules/"];
  const userRules = existsSync(ignorePath) ? readFileSync(ignorePath, "utf8").split("\n") : [];

  return [...defaultRules, ...userRules]
    .map((rawLine) => rawLine.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const normalized = line
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\/+$/, line.endsWith("/") ? "/" : "");
      const dirOnly = normalized.endsWith("/");
      const pattern = dirOnly ? normalized.slice(0, -1) : normalized;

      return {
        pattern,
        dirOnly,
        hasSlash: pattern.includes("/"),
        regex: pattern.includes("*") ? globToRegExp(pattern) : undefined
      };
    })
    .filter((rule) => rule.pattern && rule.pattern !== ".");
}

const ignoreRules = readIgnoreRules(resolvedVaultPath);

function matchesPattern(rule, value) {
  return rule.regex ? rule.regex.test(value) : value === rule.pattern;
}

function isIgnoredRelative(relativePath, isDirectory = false) {
  const normalized = relativePath.split(path.sep).join("/").replace(/^\.\/?/, "");
  if (!normalized) {
    return false;
  }

  return ignoreRules.some((rule) => {
    if (rule.hasSlash) {
      if (rule.dirOnly) {
        return matchesPattern(rule, normalized) || normalized.startsWith(`${rule.pattern}/`);
      }
      return matchesPattern(rule, normalized);
    }

    const segments = normalized.split("/");
    if (rule.dirOnly) {
      const candidates = isDirectory ? segments : segments.slice(0, -1);
      return candidates.some((segment) => matchesPattern(rule, segment));
    }

    return matchesPattern(rule, segments.at(-1) ?? "");
  });
}

function isIgnoredPath(filePath, isDirectory = false) {
  return isIgnoredRelative(toVaultRelativePath(filePath), isDirectory);
}

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function escapeSingleQuotes(input) {
  return input.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseFrontmatter(raw) {
  if (!raw.startsWith("---\n")) {
    return { data: {}, body: raw };
  }

  const end = raw.indexOf("\n---", 4);
  if (end === -1) {
    return { data: {}, body: raw };
  }

  const yamlBlock = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).replace(/^\n/, "");
  const data = {};

  for (const line of yamlBlock.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    let value = rawValue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (value === "true") {
      data[key] = true;
    } else if (value === "false") {
      data[key] = false;
    } else {
      data[key] = value;
    }
  }

  return { data, body };
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/^---[\s\S]*?---\n?/, "")
    .replace(/!\[[^\]]*?\]\([^)]+\)/g, "")
    .replace(/\[[^\]]+]\(([^)]+)\)/g, "$1")
    .replace(/[*_`>#-]/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]+\$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(markdown, length = 180) {
  const plain = stripMarkdown(markdown);
  if (plain.length <= length) {
    return plain;
  }
  return `${plain.slice(0, length).trimEnd()}…`;
}

function normalizeBlockquoteMath(markdown) {
  const lines = markdown.split("\n");
  const normalized = [];
  let insideBlockquoteMath = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isQuoted = trimmed.startsWith(">");
    const afterQuote = isQuoted ? trimmed.replace(/^>\s*/, "") : trimmed;

    if (isQuoted && afterQuote === "$$") {
      insideBlockquoteMath = !insideBlockquoteMath;
      normalized.push(line);
      continue;
    }

    if (insideBlockquoteMath) {
      if (trimmed === "$$") {
        normalized.push(`> ${trimmed}`);
        insideBlockquoteMath = false;
        continue;
      }

      if (trimmed.length === 0) {
        normalized.push(">");
        continue;
      }

      normalized.push(isQuoted ? line : `> ${line}`);
      continue;
    }

    normalized.push(line);
  }

  return normalized.join("\n");
}

function firstParagraph(markdown) {
  const paragraph = markdown
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk && !chunk.startsWith("#") && !chunk.startsWith("-") && !chunk.startsWith(">"));

  return paragraph ? stripMarkdown(paragraph) : "";
}

function isLocalAssetTarget(target) {
  return (
    target &&
    !target.startsWith("/") &&
    !target.startsWith("#") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(target)
  );
}

function splitAssetTarget(target) {
  const markerIndex = target.search(/[?#]/);
  if (markerIndex === -1) {
    return { assetPath: target, suffix: "" };
  }

  return {
    assetPath: target.slice(0, markerIndex),
    suffix: target.slice(markerIndex)
  };
}

function normalizeAssetPath(assetPath) {
  return assetPath
    .replace(/^<|>$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .split("/")
    .filter((segment) => segment && segment !== ".")
    .join("/");
}

function copyReferencedAsset(sourceDirectory, publicScope, rawTarget) {
  const { assetPath, suffix } = splitAssetTarget(rawTarget.trim());
  const normalized = normalizeAssetPath(assetPath);

  if (!normalized || normalized.startsWith("../")) {
    return rawTarget;
  }

  const sourceAssetPath = path.resolve(sourceDirectory, normalized);
  const sourceRoot = path.resolve(sourceDirectory);
  if (!sourceAssetPath.startsWith(`${sourceRoot}${path.sep}`) || !existsSync(sourceAssetPath)) {
    return rawTarget;
  }

  const stat = statSync(sourceAssetPath);
  if (!stat.isFile()) {
    return rawTarget;
  }

  const targetAssetPath = path.join(assetsRoot, publicScope, normalized);
  ensureParentDir(targetAssetPath);
  copyFileSync(sourceAssetPath, targetAssetPath);

  return `${publicBasePath}/generated/notes/${publicScope}/${normalized}${suffix}`;
}

function rewriteAssetLinks(markdown, sourceDirectory, publicScope) {
  return markdown
    .replace(/!\[([^\]]*)]\(([^)]+)\)/g, (match, alt, rawTarget) => {
      const trimmedTarget = rawTarget.trim();
      if (!isLocalAssetTarget(trimmedTarget)) {
        return match;
      }

      const rewrittenTarget = copyReferencedAsset(sourceDirectory, publicScope, trimmedTarget);
      return `![${alt}](${rewrittenTarget})`;
    })
    .replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)(\2)/gi, (match, prefix, quote, rawTarget, closingQuote) => {
      if (!isLocalAssetTarget(rawTarget)) {
        return match;
      }

      return `${prefix}${quote}${copyReferencedAsset(sourceDirectory, publicScope, rawTarget)}${closingQuote}`;
    })
    .replace(/(<img\b[^>]*?\bsrc\s*=\s*)([^\s>"']+)/gi, (match, prefix, rawTarget) => {
      if (!isLocalAssetTarget(rawTarget)) {
        return match;
      }

      return `${prefix}${copyReferencedAsset(sourceDirectory, publicScope, rawTarget)}`;
    });
}

function relativePathSegments(relativePath) {
  return relativePath.split(path.sep).filter(Boolean);
}

function slugifyPath(relativePath) {
  return relativePathSegments(relativePath).map(slugify).join("/");
}

function ensureParentDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function contentFileName(slugPath) {
  return `${slugPath.split("/").map(slugify).join("--")}.md`;
}

function listDirectories(rootPath) {
  const directories = [];

  function visit(directoryPath) {
    const entries = readdirSync(directoryPath, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    );

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "assets") {
        continue;
      }

      const childPath = path.join(directoryPath, entry.name);
      if (isIgnoredPath(childPath, true)) {
        continue;
      }

      directories.push(childPath);
      visit(childPath);
    }
  }

  visit(rootPath);
  return directories;
}

function listMarkdownFiles(rootPath) {
  const files = [];

  function visit(directoryPath) {
    const entries = readdirSync(directoryPath, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    );

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const childPath = path.join(directoryPath, entry.name);
        if (entry.name !== "assets" && !isIgnoredPath(childPath, true)) {
          visit(childPath);
        }
        continue;
      }

      const childPath = path.join(directoryPath, entry.name);
      if (
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        entry.name !== "_index.md" &&
        !isIgnoredPath(childPath, false)
      ) {
        files.push(childPath);
      }
    }
  }

  visit(rootPath);
  return files;
}

function copyDirectoryFiltered(sourceDir, targetDir) {
  const entries = readdirSync(sourceDir, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    if (isIgnoredPath(sourcePath, entry.isDirectory())) {
      continue;
    }

    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyDirectoryFiltered(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      ensureParentDir(targetPath);
      copyFileSync(sourcePath, targetPath);
    }
  }
}

function findNearestSubject(relativeDirectory, subjectBySourcePath) {
  let current = relativeDirectory;

  while (current && current !== ".") {
    const subject = subjectBySourcePath.get(current);
    if (subject) {
      return subject;
    }
    current = path.dirname(current);
  }

  return undefined;
}

function toFrontmatter(data) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
      continue;
    }
    lines.push(`${key}: "${String(value).replace(/"/g, '\\"')}"`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

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
const subjectDirectories = listDirectories(resolvedVaultPath)
  .filter((directoryPath) => {
    const indexPath = path.join(directoryPath, "_index.md");
    return existsSync(indexPath) && !isIgnoredPath(indexPath, false);
  })
  .sort((left, right) => path.relative(resolvedVaultPath, left).localeCompare(path.relative(resolvedVaultPath, right)));
const subjectBySourcePath = new Map();

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

for (const sourcePath of listMarkdownFiles(resolvedVaultPath)) {
  const sourceRelativePath = path.relative(resolvedVaultPath, sourcePath);
  const sourceRelativeDir = path.dirname(sourceRelativePath);
  const subject = findNearestSubject(sourceRelativeDir, subjectBySourcePath);
  const isTopLevelNote = sourceRelativeDir === ".";

  if (!subject && !isTopLevelNote) {
    continue;
  }

  const raw = readFileSync(sourcePath, "utf8");
  const parsed = parseFrontmatter(raw);
  const noteRelativePath = subject
    ? path.relative(path.join(resolvedVaultPath, subject.sourcePath), sourcePath)
    : sourceRelativePath;
  const noteRelativeSegments = relativePathSegments(noteRelativePath.replace(/\.md$/i, ""));
  const originalName = noteRelativeSegments.at(-1) || path.basename(sourcePath, ".md");
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

const dataFile = `${[
  "export type Note = {",
  "  slug: string;",
  "  collectionSlug: string;",
  "  title: string;",
  "  summary?: string;",
  "  description?: string;",
  "  draft?: boolean;",
  "  sourcePath?: string;",
  "  updatedAt?: string;",
  "};",
  "",
  "export type Subject = {",
  "  slug: string;",
  "  title: string;",
  "  summary?: string;",
  "  description?: string;",
  "  draft?: boolean;",
  "  parentSlug?: string;",
  "  sourcePath?: string;",
  "  notes: Note[];",
  "};",
  "",
  "export const subjects: Subject[] = ["
].join("\n")}
${subjects
  .map((subject) => {
    const noteLines = subject.notes
      .map(
        (note) =>
          `    { slug: '${escapeSingleQuotes(note.slug)}', collectionSlug: '${escapeSingleQuotes(note.collectionSlug)}', title: '${escapeSingleQuotes(note.title)}', summary: '${escapeSingleQuotes(note.summary ?? "")}', description: '${escapeSingleQuotes(note.description ?? "")}', draft: ${note.draft ? "true" : "false"}, sourcePath: '${escapeSingleQuotes(note.sourcePath ?? "")}', updatedAt: '${escapeSingleQuotes(note.updatedAt ?? "")}' }`
      )
      .join(",\n");

    return `  {\n    slug: '${escapeSingleQuotes(subject.slug)}',\n    title: '${escapeSingleQuotes(subject.title)}',\n    summary: '${escapeSingleQuotes(subject.summary ?? "")}',\n    description: '${escapeSingleQuotes(subject.description ?? "")}',\n    draft: ${subject.draft ? "true" : "false"},\n    parentSlug: '${escapeSingleQuotes(subject.parentSlug ?? "")}',\n    sourcePath: '${escapeSingleQuotes(subject.sourcePath ?? "")}',\n    notes: [\n${noteLines}\n    ]\n  }`;
  })
  .join(",\n")}
];

export const topLevelNotes: Note[] = [
${topLevelNotes
  .map(
    (note) =>
      `  { slug: '${escapeSingleQuotes(note.slug)}', collectionSlug: '${escapeSingleQuotes(note.collectionSlug)}', title: '${escapeSingleQuotes(note.title)}', summary: '${escapeSingleQuotes(note.summary ?? "")}', description: '${escapeSingleQuotes(note.description ?? "")}', draft: ${note.draft ? "true" : "false"}, sourcePath: '${escapeSingleQuotes(note.sourcePath ?? "")}', updatedAt: '${escapeSingleQuotes(note.updatedAt ?? "")}' }`
  )
  .join(",\n")}
];
`;

writeFileSync(subjectsDataPath, dataFile, "utf8");

console.log(`Imported ${subjects.length} subjects and ${generatedNotesCount} notes from ${resolvedVaultPath}`);
