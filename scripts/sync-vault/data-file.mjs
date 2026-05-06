function escapeSingleQuotes(input) {
  return input.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function renderNote(note, indent = "  ") {
  return `${indent}{ slug: '${escapeSingleQuotes(note.slug)}', collectionSlug: '${escapeSingleQuotes(note.collectionSlug)}', title: '${escapeSingleQuotes(note.title)}', summary: '${escapeSingleQuotes(note.summary ?? "")}', description: '${escapeSingleQuotes(note.description ?? "")}', draft: ${note.draft ? "true" : "false"}, sourcePath: '${escapeSingleQuotes(note.sourcePath ?? "")}', updatedAt: '${escapeSingleQuotes(note.updatedAt ?? "")}' }`;
}

export function renderSubjectsDataFile(subjects, topLevelNotes) {
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
    "export type Subject = {",
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
    "export const subjects: Subject[] = ["
  ].join("\n")}
${subjects
  .map((subject) => {
    const noteLines = subject.notes.map((note) => renderNote(note, "    ")).join(",\n");

    return `  {\n    slug: '${escapeSingleQuotes(subject.slug)}',\n    title: '${escapeSingleQuotes(subject.title)}',\n    summary: '${escapeSingleQuotes(subject.summary ?? "")}',\n    description: '${escapeSingleQuotes(subject.description ?? "")}',\n    draft: ${subject.draft ? "true" : "false"},\n    parentSlug: '${escapeSingleQuotes(subject.parentSlug ?? "")}',\n    sourcePath: '${escapeSingleQuotes(subject.sourcePath ?? "")}',\n    notes: [\n${noteLines}\n    ]\n  }`;
  })
  .join(",\n")}
];

export const topLevelNotes: Note[] = [
${topLevelNotes.map((note) => renderNote(note)).join(",\n")}
];
`;
}
