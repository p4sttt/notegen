import { readdirSync } from "node:fs";
import path from "node:path";

export function listDirectories(rootPath, isIgnoredPath) {
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

export function listNoteFiles(rootPath, isIgnoredPath) {
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
        (entry.name.endsWith(".md") || entry.name.endsWith(".ipynb")) &&
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

export function findNearestTopic(relativeDirectory, topicBySourcePath) {
  let current = relativeDirectory;

  while (current && current !== ".") {
    const topic = topicBySourcePath.get(current);
    if (topic) {
      return topic;
    }
    current = path.dirname(current);
  }

  return undefined;
}
