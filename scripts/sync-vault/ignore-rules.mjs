import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { toVaultRelativePath } from "./paths.mjs";

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

export function readIgnoreRules(rootPath) {
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

function matchesPattern(rule, value) {
  return rule.regex ? rule.regex.test(value) : value === rule.pattern;
}

export function createIgnoreMatcher(rootPath) {
  const ignoreRules = readIgnoreRules(rootPath);

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
    return isIgnoredRelative(toVaultRelativePath(rootPath, filePath), isDirectory);
  }

  return {
    rules: ignoreRules,
    isIgnoredRelative,
    isIgnoredPath
  };
}
