import type {
  Note as RawNote,
  Database as RawDatabase,
  Topic as RawTopic,
  DatabaseColumn,
  DatabaseRow,
} from '../data/generated/topics';

export class Note {
  slug: string;
  collectionSlug: string;
  title: string;
  summary?: string;
  description?: string;
  status: 'draft' | 'in-progress' | 'done';
  sourcePath?: string;
  updatedAt?: string;
  tags: string[];
  backlinks: Array<{ collectionSlug: string; title: string; summary?: string }>;

  constructor(raw: RawNote) {
    this.slug = raw.slug;
    this.collectionSlug = raw.collectionSlug;
    this.title = raw.title;
    this.summary = raw.summary;
    this.description = raw.description;
    this.status = raw.status;
    this.sourcePath = raw.sourcePath;
    this.updatedAt = raw.updatedAt;
    this.tags = raw.tags ?? [];
    this.backlinks = raw.backlinks ?? [];
  }

  isPublished(): boolean {
    return this.status !== 'draft';
  }

  isInProgress(): boolean {
    return this.status === 'in-progress';
  }

  isNotebook(): boolean {
    return this.sourcePath?.endsWith('.ipynb') ?? false;
  }
}

export class Database {
  slug: string;
  collectionSlug: string;
  title: string;
  summary?: string;
  description?: string;
  sourcePath?: string;
  topic?: string;
  topicSlug?: string;
  parentSlug?: string;
  columns: DatabaseColumn[];
  rows: DatabaseRow[];

  constructor(raw: RawDatabase) {
    this.slug = raw.slug;
    this.collectionSlug = raw.collectionSlug;
    this.title = raw.title;
    this.summary = raw.summary;
    this.description = raw.description;
    this.sourcePath = raw.sourcePath;
    this.topic = raw.topic;
    this.topicSlug = raw.topicSlug;
    this.parentSlug = raw.parentSlug;
    this.columns = raw.columns ?? [];
    this.rows = raw.rows ?? [];
  }

  getRowsCount(): number {
    return this.rows.length;
  }
}

export class Topic {
  slug: string;
  title: string;
  summary?: string;
  description?: string;
  draft: boolean;
  parentSlug?: string;
  sourcePath?: string;
  notes: Note[];
  databases: Database[];

  constructor(raw: RawTopic) {
    this.slug = raw.slug;
    this.title = raw.title;
    this.summary = raw.summary;
    this.description = raw.description;
    this.draft = raw.draft ?? false;
    this.parentSlug = raw.parentSlug;
    this.sourcePath = raw.sourcePath;
    this.notes = (raw.notes ?? []).map((n) => new Note(n));
    this.databases = (raw.databases ?? []).map((d) => new Database(d));
  }

  getChildTopics(allTopics: Topic[]): Topic[] {
    return allTopics.filter((item) => item.parentSlug === this.slug);
  }

  getVisibleNotes(): Note[] {
    return this.notes.filter((note) => note.isPublished());
  }

  getVisibleDatabases(): Database[] {
    return this.databases;
  }

  getRecursiveNotesCount(allTopics: Topic[], _includeDrafts: boolean): number {
    const ownNotesCount = this.getVisibleNotes().length;
    const childTopics = this.getChildTopics(allTopics);
    const childNotesCount = childTopics.reduce(
      (total, childTopic) => total + childTopic.getRecursiveNotesCount(allTopics, _includeDrafts),
      0,
    );
    return ownNotesCount + childNotesCount;
  }
}
