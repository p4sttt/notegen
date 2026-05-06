function escapeSingleQuotes(input) {
  return input.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function renderNote(note, indent = "  ") {
  return `${indent}{ slug: '${escapeSingleQuotes(note.slug)}', collectionSlug: '${escapeSingleQuotes(note.collectionSlug)}', title: '${escapeSingleQuotes(note.title)}', summary: '${escapeSingleQuotes(note.summary ?? "")}', description: '${escapeSingleQuotes(note.description ?? "")}', draft: ${note.draft ? "true" : "false"}, sourcePath: '${escapeSingleQuotes(note.sourcePath ?? "")}', updatedAt: '${escapeSingleQuotes(note.updatedAt ?? "")}' }`;
}

export function renderTopicsDataFile(topics, topLevelNotes) {
  return `${[
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
    "export type Topic = {",
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
    "export const topics: Topic[] = ["
  ].join("\n")}
${topics
  .map((topic) => {
    const noteLines = topic.notes.map((note) => renderNote(note, "    ")).join(",\n");

    return `  {\n    slug: '${escapeSingleQuotes(topic.slug)}',\n    title: '${escapeSingleQuotes(topic.title)}',\n    summary: '${escapeSingleQuotes(topic.summary ?? "")}',\n    description: '${escapeSingleQuotes(topic.description ?? "")}',\n    draft: ${topic.draft ? "true" : "false"},\n    parentSlug: '${escapeSingleQuotes(topic.parentSlug ?? "")}',\n    sourcePath: '${escapeSingleQuotes(topic.sourcePath ?? "")}',\n    notes: [\n${noteLines}\n    ]\n  }`;
  })
  .join(",\n")}
];

export const topLevelNotes: Note[] = [
${topLevelNotes.map((note) => renderNote(note)).join(",\n")}
];
`;
}
