import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

const vaultPath = process.env.VAULT_PATH;
const subjectsContentRoot = path.resolve("src/content/subjects");
const contentRoot = path.resolve("src/content/notes");
const assetsRoot = path.resolve("public/generated/notes");
const subjectsDataPath = path.resolve("src/data/generated/subjects.ts");

if (!vaultPath) {
  console.error("VAULT_PATH is not set.");
  process.exit(1);
}

const resolvedVaultPath = path.resolve(vaultPath);

if (!existsSync(resolvedVaultPath)) {
  console.error(`Vault path does not exist: ${resolvedVaultPath}`);
  process.exit(1);
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

function rewriteAssetLinks(markdown, subjectSlug) {
  return markdown.replace(/\]\((\.\/assets\/[^)]+)\)/g, (_match, assetPath) => {
    const normalized = assetPath.replace(/^\.\//, "");
    return `](/generated/notes/${subjectSlug}/${normalized})`;
  });
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

const subjectDirectories = readdirSync(resolvedVaultPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const subjects = [];
let generatedNotesCount = 0;

for (const directoryName of subjectDirectories) {
  const subjectPath = path.join(resolvedVaultPath, directoryName);
  const indexPath = path.join(subjectPath, "_index.md");
  if (!existsSync(indexPath)) {
    continue;
  }

  const subjectSlug = slugify(directoryName);
  const rawIndex = readFileSync(indexPath, "utf8");
  const parsedIndex = parseFrontmatter(rawIndex);
  const subjectTitle = parsedIndex.data.title || directoryName;
  const subjectDescription = parsedIndex.data.description || firstParagraph(parsedIndex.body);
  const subjectSummary = subjectDescription || excerpt(parsedIndex.body, 160);
  const rewrittenSubjectBody = rewriteAssetLinks(normalizeBlockquoteMath(parsedIndex.body), subjectSlug);

  writeFileSync(
    path.join(subjectsContentRoot, `${subjectSlug}.md`),
    `${toFrontmatter({
      title: subjectTitle,
      slug: subjectSlug,
      description: subjectDescription,
      draft: parsedIndex.data.draft ?? false,
      sourcePath: path.relative(resolvedVaultPath, indexPath)
    })}${rewrittenSubjectBody.trim()}\n`,
    "utf8"
  );

  const subjectContentDir = path.join(contentRoot, subjectSlug);
  const subjectAssetsDir = path.join(assetsRoot, subjectSlug);
  mkdirSync(subjectContentDir, { recursive: true });
  mkdirSync(subjectAssetsDir, { recursive: true });

  const sourceAssetsDir = path.join(subjectPath, "assets");
  if (existsSync(sourceAssetsDir) && statSync(sourceAssetsDir).isDirectory()) {
    cpSync(sourceAssetsDir, path.join(subjectAssetsDir, "assets"), { recursive: true });
  }

  const notes = readdirSync(subjectPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "_index.md")
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const sourcePath = path.join(subjectPath, entry.name);
      const raw = readFileSync(sourcePath, "utf8");
      const parsed = parseFrontmatter(raw);
      const noteSlug = slugify(parsed.data.slug || entry.name.replace(/\.md$/i, ""));
      const collectionSlug = `${subjectSlug}/${noteSlug}`;
      const noteTitle = parsed.data.title || entry.name.replace(/\.md$/i, "");
      const rewrittenBody = rewriteAssetLinks(normalizeBlockquoteMath(parsed.body), subjectSlug);
      const outputFrontmatter = toFrontmatter({
        title: noteTitle,
        slug: noteSlug,
        date: parsed.data.date,
        draft: parsed.data.draft ?? false,
        subject: subjectTitle,
        subjectSlug,
        sourcePath: path.relative(resolvedVaultPath, sourcePath)
      });

      writeFileSync(
        path.join(subjectContentDir, `${noteSlug}.md`),
        `${outputFrontmatter}${rewrittenBody.trim()}\n`,
        "utf8"
      );

      generatedNotesCount += 1;

      return {
        slug: noteSlug,
        collectionSlug,
        title: noteTitle,
        summary: excerpt(parsed.body),
        sourcePath: path.relative(resolvedVaultPath, sourcePath),
        updatedAt: parsed.data.date || undefined
      };
    });

  subjects.push({
    slug: subjectSlug,
    title: subjectTitle,
    summary: subjectSummary,
    description: subjectDescription,
    sourcePath: path.relative(resolvedVaultPath, subjectPath),
    notes
  });
}

const dataFile = `${[
  "export type Note = {",
  "  slug: string;",
  "  collectionSlug: string;",
  "  title: string;",
  "  summary?: string;",
  "  sourcePath?: string;",
  "  updatedAt?: string;",
  "};",
  "",
  "export type Subject = {",
  "  slug: string;",
  "  title: string;",
  "  summary?: string;",
  "  description?: string;",
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
          `    { slug: '${escapeSingleQuotes(note.slug)}', collectionSlug: '${escapeSingleQuotes(note.collectionSlug)}', title: '${escapeSingleQuotes(note.title)}', summary: '${escapeSingleQuotes(note.summary ?? "")}', sourcePath: '${escapeSingleQuotes(note.sourcePath ?? "")}', updatedAt: '${escapeSingleQuotes(note.updatedAt ?? "")}' }`
      )
      .join(",\n");

    return `  {\n    slug: '${escapeSingleQuotes(subject.slug)}',\n    title: '${escapeSingleQuotes(subject.title)}',\n    summary: '${escapeSingleQuotes(subject.summary ?? "")}',\n    description: '${escapeSingleQuotes(subject.description ?? "")}',\n    sourcePath: '${escapeSingleQuotes(subject.sourcePath ?? "")}',\n    notes: [\n${noteLines}\n    ]\n  }`;
  })
  .join(",\n")}
];
`;

writeFileSync(subjectsDataPath, dataFile, "utf8");

console.log(`Imported ${subjects.length} subjects and ${generatedNotesCount} notes from ${resolvedVaultPath}`);
