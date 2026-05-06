import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ensureParentDir } from "./fs-utils.mjs";

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

export function createAssetTools({ assetsRoot, publicBasePath, isIgnoredPath }) {
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

  return {
    copyDirectoryFiltered,
    copyReferencedAsset,
    rewriteAssetLinks
  };
}
