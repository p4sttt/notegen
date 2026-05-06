import path from "node:path";

export function toVaultRelativePath(vaultRoot, filePath) {
  return path.relative(vaultRoot, filePath).split(path.sep).join("/");
}

export function normalizeSiteBase(input) {
  if (!input || input === "/") {
    return "";
  }

  return `/${input.replace(/^\/+|\/+$/g, "")}`;
}

export function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function relativePathSegments(relativePath) {
  return relativePath.split(path.sep).filter(Boolean);
}

export function slugifyPath(relativePath) {
  return relativePathSegments(relativePath).map(slugify).join("/");
}

export function contentFileName(slugPath) {
  return `${slugPath.split("/").map(slugify).join("--")}.md`;
}
