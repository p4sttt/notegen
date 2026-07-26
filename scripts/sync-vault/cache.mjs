import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { ensureParentDir } from './fs-utils.mjs';

export function computeStringHash(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function computeFileHash(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = readFileSync(filePath);
    return computeStringHash(content);
  } catch {
    return null;
  }
}

function walkDirForHash(dirPath, hash) {
  const entries = readdirSync(dirPath, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDirForHash(fullPath, hash);
    } else if (entry.isFile()) {
      hash.update(entry.name);
      try {
        hash.update(readFileSync(fullPath));
      } catch (_err) {
        // Ignore unreadable files during global hash calculation
      }
    }
  }
}

export function computeGlobalHash(resolvedVaultPath, siteConfig) {
  const hash = createHash('sha256');

  // Cache schema / implementation version
  hash.update('notegen-cache-v1');

  // Site config
  hash.update(JSON.stringify(siteConfig || {}));

  // Vault .notegenignore
  const ignorePath = path.join(resolvedVaultPath, '.notegenignore');
  if (existsSync(ignorePath)) {
    try {
      hash.update(readFileSync(ignorePath));
    } catch (_err) {
      // Ignore unreadable ignore file
    }
  }

  // Plugins in project plugins/ or .plugins/
  const projectRoot = path.resolve('.');
  for (const dirName of ['plugins', '.plugins']) {
    const pDir = path.join(projectRoot, dirName);
    if (existsSync(pDir)) {
      try {
        walkDirForHash(pDir, hash);
      } catch (_err) {
        // Ignore unreadable plugin directory
      }
    }
  }

  return hash.digest('hex');
}

function getCacheFilePath() {
  const nodeModulesCacheDir = path.resolve('node_modules/.cache/notegen');
  try {
    mkdirSync(nodeModulesCacheDir, { recursive: true });
    return path.join(nodeModulesCacheDir, 'sync-cache.json');
  } catch {
    const dotCacheDir = path.resolve('.cache/notegen');
    mkdirSync(dotCacheDir, { recursive: true });
    return path.join(dotCacheDir, 'sync-cache.json');
  }
}

export class VaultCacheManager {
  constructor({ resolvedVaultPath, siteConfig, disabled = false }) {
    this.resolvedVaultPath = resolvedVaultPath;
    this.disabled = disabled;
    this.cacheFilePath = getCacheFilePath();
    this.globalHash = computeGlobalHash(resolvedVaultPath, siteConfig);

    this.cache = {
      version: 1,
      globalHash: this.globalHash,
      topics: {},
      notes: {},
      databases: {},
    };

    this.stats = {
      topicsCached: 0,
      topicsRebuilt: 0,
      notesCached: 0,
      notesRebuilt: 0,
      databasesCached: 0,
      databasesRebuilt: 0,
    };

    if (!this.disabled) {
      this.load();
    }
  }

  load() {
    if (!existsSync(this.cacheFilePath)) {
      return;
    }

    try {
      const raw = readFileSync(this.cacheFilePath, 'utf8');
      const loaded = JSON.parse(raw);

      if (loaded && loaded.version === 1 && loaded.globalHash === this.globalHash) {
        this.cache.topics = loaded.topics || {};
        this.cache.notes = loaded.notes || {};
        this.cache.databases = loaded.databases || {};
      }
    } catch {
      this.cache.topics = {};
      this.cache.notes = {};
      this.cache.databases = {};
    }
  }

  save() {
    if (this.disabled) return;

    try {
      ensureParentDir(this.cacheFilePath);
      writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch (err) {
      console.warn('[Cache] Failed to save cache:', err.message);
    }
  }

  getTopic(sourceRelativePath, indexPath) {
    if (this.disabled) return null;

    const entry = this.cache.topics[sourceRelativePath];
    if (!entry) return null;

    const currentHash = computeFileHash(indexPath);
    if (!currentHash || currentHash !== entry.fileHash) {
      return null;
    }

    this.stats.topicsCached += 1;
    return entry;
  }

  setTopic(sourceRelativePath, indexPath, data) {
    if (this.disabled) return;

    const fileHash = computeFileHash(indexPath);
    if (!fileHash) return;

    this.cache.topics[sourceRelativePath] = {
      fileHash,
      topic: data.topic,
      outputFilePath: data.outputFilePath,
      outputContent: data.outputContent,
      copiedAssets: data.copiedAssets || [],
    };
    this.stats.topicsRebuilt += 1;
  }

  getNote(sourceRelativePath, sourcePath) {
    if (this.disabled) return null;

    const entry = this.cache.notes[sourceRelativePath];
    if (!entry) return null;

    const currentHash = computeFileHash(sourcePath);
    if (!currentHash || currentHash !== entry.fileHash) {
      return null;
    }

    if (entry.assetHashes) {
      for (const [relAssetPath, expectedHash] of Object.entries(entry.assetHashes)) {
        const fullAssetPath = path.resolve(path.dirname(sourcePath), relAssetPath);
        const actualHash = computeFileHash(fullAssetPath);
        if (actualHash !== expectedHash) {
          return null;
        }
      }
    }

    this.stats.notesCached += 1;
    return entry;
  }

  setNote(sourceRelativePath, sourcePath, data) {
    if (this.disabled) return;

    const fileHash = computeFileHash(sourcePath);
    if (!fileHash) return;

    this.cache.notes[sourceRelativePath] = {
      fileHash,
      assetHashes: data.assetHashes || {},
      note: data.note,
      outputFilePath: data.outputFilePath,
      outputContent: data.outputContent,
      generatedAssets: data.generatedAssets || [],
    };
    this.stats.notesRebuilt += 1;
  }

  getDatabase(sourceRelativePath, sourcePath) {
    if (this.disabled) return null;

    const entry = this.cache.databases[sourceRelativePath];
    if (!entry) return null;

    const currentHash = computeFileHash(sourcePath);
    if (!currentHash || currentHash !== entry.fileHash) {
      return null;
    }

    this.stats.databasesCached += 1;
    return entry;
  }

  setDatabase(sourceRelativePath, sourcePath, data) {
    if (this.disabled) return;

    const fileHash = computeFileHash(sourcePath);
    if (!fileHash) return;

    this.cache.databases[sourceRelativePath] = {
      fileHash,
      database: data.database,
    };
    this.stats.databasesRebuilt += 1;
  }

  cleanOrphanedOutputs(validOutputFiles) {
    const validSet = new Set(Array.from(validOutputFiles).map((p) => path.resolve(p)));

    const checkDirs = [
      path.resolve('src/content/topics'),
      path.resolve('src/content/notes'),
      path.resolve('public/generated/notes'),
    ];

    for (const dirPath of checkDirs) {
      if (!existsSync(dirPath)) continue;
      this.removeUnusedFiles(dirPath, validSet);
      this.removeEmptyDirs(dirPath);
    }
  }

  removeUnusedFiles(dirPath, validSet) {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        this.removeUnusedFiles(fullPath, validSet);
      } else if (entry.isFile()) {
        if (!validSet.has(path.resolve(fullPath))) {
          try {
            rmSync(fullPath, { force: true });
          } catch (_err) {
            // Ignore removal errors for individual files
          }
        }
      }
    }
  }

  removeEmptyDirs(dirPath) {
    if (!existsSync(dirPath)) return;
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dirPath, entry.name);
        this.removeEmptyDirs(fullPath);
      }
    }
    const remaining = readdirSync(dirPath);
    if (remaining.length === 0) {
      try {
        rmSync(dirPath, { recursive: true, force: true });
      } catch (_err) {
        // Ignore removal errors for empty directories
      }
    }
  }

  pruneUnusedCacheEntries(activeSourcePaths) {
    const topicSources = new Set(activeSourcePaths.topics || []);
    for (const key of Object.keys(this.cache.topics)) {
      if (!topicSources.has(key)) {
        delete this.cache.topics[key];
      }
    }

    const noteSources = new Set(activeSourcePaths.notes || []);
    for (const key of Object.keys(this.cache.notes)) {
      if (!noteSources.has(key)) {
        delete this.cache.notes[key];
      }
    }

    const dbSources = new Set(activeSourcePaths.databases || []);
    for (const key of Object.keys(this.cache.databases)) {
      if (!dbSources.has(key)) {
        delete this.cache.databases[key];
      }
    }
  }
}
