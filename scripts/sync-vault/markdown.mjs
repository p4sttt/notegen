export function parseFrontmatter(raw) {
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

export function stripMarkdown(markdown) {
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

export function excerpt(markdown, length = 180) {
  const plain = stripMarkdown(markdown);
  if (plain.length <= length) {
    return plain;
  }
  return `${plain.slice(0, length).trimEnd()}…`;
}

export function normalizeBlockquoteMath(markdown) {
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

export function firstParagraph(markdown) {
  const paragraph = markdown
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk && !chunk.startsWith("#") && !chunk.startsWith("-") && !chunk.startsWith(">"));

  return paragraph ? stripMarkdown(paragraph) : "";
}

export function toFrontmatter(data) {
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
