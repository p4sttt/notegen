import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function escapeSingleQuotes(input) {
  return String(input).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeVaultPath(input) {
  return String(input ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^\.\//, "");
}

function asString(value) {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeAction(value) {
  const action = asString(value).toLowerCase();
  return ["created", "updated", "deleted", "renamed"].includes(action) ? action : "changed";
}

function normalizeKind(value) {
  const kind = asString(value).toLowerCase();
  return ["note", "topic", "database", "asset"].includes(kind) ? kind : "other";
}

function parseJsonLines(content, sourcePath) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Failed to parse changelog JSONL line ${index + 1} at ${sourcePath}: ${String(error)}`);
      }
    });
}

function parseRawChangelog(content, sourcePath) {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error(`Changelog JSON at ${sourcePath} must be an array.`);
    }
    return parsed;
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed.events)) {
        return parsed.events;
      }
      return [parsed];
    } catch (error) {
      if (!trimmed.includes("\n")) {
        throw error;
      }
      return parseJsonLines(content, sourcePath);
    }
  }

  return parseJsonLines(content, sourcePath);
}

function normalizeEvent(rawEvent, index) {
  const pathValue = normalizeVaultPath(rawEvent.path);
  const oldPath = normalizeVaultPath(rawEvent.oldPath ?? rawEvent.previousPath);

  return {
    id: asString(rawEvent.id) || `${asString(rawEvent.timestamp) || "event"}-${pathValue || oldPath || index}`,
    timestamp: asString(rawEvent.timestamp || rawEvent.date),
    action: normalizeAction(rawEvent.action || rawEvent.type),
    kind: normalizeKind(rawEvent.kind),
    path: pathValue,
    oldPath,
    title: asString(rawEvent.title),
    topic: asString(rawEvent.topic),
    source: asString(rawEvent.source)
  };
}

export function readChangelogEvents(changelogPath) {
  if (!existsSync(changelogPath)) {
    return [];
  }

  const content = readFileSync(changelogPath, "utf8");
  return parseRawChangelog(content, changelogPath)
    .map(normalizeEvent)
    .filter((event) => event.path || event.oldPath);
}

function createContentLookup(topics, topLevelNotes, topLevelDatabases = []) {
  const lookup = new Map();

  for (const topic of topics) {
    lookup.set(normalizeVaultPath(topic.sourcePath), {
      kind: "topic",
      title: topic.title,
      href: topic.slug,
      topic: ""
    });

    for (const note of topic.notes) {
      lookup.set(normalizeVaultPath(note.sourcePath), {
        kind: "note",
        title: note.title,
        href: note.collectionSlug,
        topic: topic.title
      });
    }

    for (const database of topic.databases ?? []) {
      lookup.set(normalizeVaultPath(database.sourcePath), {
        kind: "database",
        title: database.title,
        href: database.collectionSlug,
        topic: topic.title
      });
    }
  }

  for (const note of topLevelNotes) {
    lookup.set(normalizeVaultPath(note.sourcePath), {
      kind: "note",
      title: note.title,
      href: note.collectionSlug,
      topic: ""
    });
  }

  for (const database of topLevelDatabases) {
    lookup.set(normalizeVaultPath(database.sourcePath), {
      kind: "database",
      title: database.title,
      href: database.collectionSlug,
      topic: ""
    });
  }

  return lookup;
}

function enrichEvent(event, lookup) {
  const current = lookup.get(event.path);
  const previous = event.oldPath ? lookup.get(event.oldPath) : undefined;
  const matched = current ?? previous;
  const id = event.id || `${event.timestamp || "event"}-${event.path || event.oldPath || matched?.href || "unknown"}`;

  return {
    ...event,
    id,
    kind: event.kind === "other" && matched ? matched.kind : event.kind,
    title: event.title || matched?.title || event.path || event.oldPath,
    topic: event.topic || matched?.topic || "",
    href: current?.href || ""
  };
}

function renderEvent(event) {
  return `  { id: '${escapeSingleQuotes(event.id)}', timestamp: '${escapeSingleQuotes(event.timestamp)}', action: '${escapeSingleQuotes(event.action)}', kind: '${escapeSingleQuotes(event.kind)}', path: '${escapeSingleQuotes(event.path)}', oldPath: '${escapeSingleQuotes(event.oldPath)}', title: '${escapeSingleQuotes(event.title)}', topic: '${escapeSingleQuotes(event.topic)}', source: '${escapeSingleQuotes(event.source)}', href: '${escapeSingleQuotes(event.href)}' }`;
}

export function renderChangelogDataFile(events, topics, topLevelNotes, topLevelDatabases = []) {
  const lookup = createContentLookup(topics, topLevelNotes, topLevelDatabases);
  const enrichedEvents = events.map((event) => enrichEvent(event, lookup));

  return `${[
    "export type ChangelogAction = 'created' | 'updated' | 'deleted' | 'renamed' | 'changed';",
    "export type ChangelogKind = 'note' | 'topic' | 'database' | 'asset' | 'other';",
    "",
    "export type ChangelogEvent = {",
    "  id: string;",
    "  timestamp: string;",
    "  action: ChangelogAction;",
    "  kind: ChangelogKind;",
    "  path: string;",
    "  oldPath?: string;",
    "  title: string;",
    "  topic?: string;",
    "  source?: string;",
    "  href?: string;",
    "};",
    "",
    "export const changelog: ChangelogEvent[] = ["
  ].join("\n")}
${enrichedEvents.map(renderEvent).join(",\n")}
];
`;
}

export function defaultChangelogPath(vaultPath) {
  return path.join(vaultPath, "changelog.json");
}
