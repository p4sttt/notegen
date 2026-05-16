function escapeSingleQuotes(input) {
  return input.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function renderNote(note, indent = "  ") {
  return `${indent}{ slug: '${escapeSingleQuotes(note.slug)}', collectionSlug: '${escapeSingleQuotes(note.collectionSlug)}', title: '${escapeSingleQuotes(note.title)}', summary: '${escapeSingleQuotes(note.summary ?? "")}', description: '${escapeSingleQuotes(note.description ?? "")}', status: '${escapeSingleQuotes(note.status ?? "done")}', sourcePath: '${escapeSingleQuotes(note.sourcePath ?? "")}', updatedAt: '${escapeSingleQuotes(note.updatedAt ?? "")}' }`;
}

function renderDatabase(database, indent = "  ") {
  return `${indent}${JSON.stringify(database)}`;
}

export function renderTopicsDataFile(topics, topLevelNotes, topLevelDatabases = []) {
  return `${[
    "export type Note = {",
    "  slug: string;",
    "  collectionSlug: string;",
    "  title: string;",
    "  summary?: string;",
    "  description?: string;",
    "  status: 'draft' | 'in-progress' | 'done';",
    "  sourcePath?: string;",
    "  updatedAt?: string;",
    "};",
    "",
    "export type DatabaseColumnType = 'text' | 'number' | 'date' | 'boolean';",
    "",
    "export type DatabaseColumn = {",
    "  key: string;",
    "  label: string;",
    "  type: DatabaseColumnType;",
    "};",
    "",
    "export type DatabaseRow = {",
    "  _id: number;",
    "  [key: string]: string | number;",
    "};",
    "",
    "export type Database = {",
    "  slug: string;",
    "  collectionSlug: string;",
    "  title: string;",
    "  summary?: string;",
    "  description?: string;",
    "  sourcePath?: string;",
    "  topic?: string;",
    "  topicSlug?: string;",
    "  parentSlug?: string;",
    "  columns: DatabaseColumn[];",
    "  rows: DatabaseRow[];",
    "};",
    "",
    "export type Topic = {",
    "  slug: string;",
    "  title: string;",
    "  summary?: string;",
    "  description?: string;",
    "  draft?: boolean;",
    "  parentSlug?: string;",
    "  sourcePath?: string;",
    "  notes: Note[];",
    "  databases: Database[];",
    "};",
    "",
    "export const topics: Topic[] = ["
  ].join("\n")}
${topics
  .map((topic) => {
    const noteLines = topic.notes.map((note) => renderNote(note, "    ")).join(",\n");
    const databaseLines = topic.databases.map((database) => renderDatabase(database, "    ")).join(",\n");

    return `  {\n    slug: '${escapeSingleQuotes(topic.slug)}',\n    title: '${escapeSingleQuotes(topic.title)}',\n    summary: '${escapeSingleQuotes(topic.summary ?? "")}',\n    description: '${escapeSingleQuotes(topic.description ?? "")}',\n    draft: ${topic.draft ? "true" : "false"},\n    parentSlug: '${escapeSingleQuotes(topic.parentSlug ?? "")}',\n    sourcePath: '${escapeSingleQuotes(topic.sourcePath ?? "")}',\n    notes: [\n${noteLines}\n    ],\n    databases: [\n${databaseLines}\n    ]\n  }`;
  })
  .join(",\n")}
];

export const topLevelNotes: Note[] = [
${topLevelNotes.map((note) => renderNote(note)).join(",\n")}
];

export const topLevelDatabases: Database[] = [
${topLevelDatabases.map((database) => renderDatabase(database)).join(",\n")}
];
`;
}
