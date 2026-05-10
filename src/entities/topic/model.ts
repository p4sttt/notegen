import type { Topic } from "../../data/generated/topics";

export function isPublishedNote(note: { status?: string; draft?: boolean }): boolean {
  return (note.status ?? (note.draft ? "draft" : "done")) !== "draft";
}

export function isInProgressNote(note: { status?: string }): boolean {
  return note.status === "in-progress";
}

export function getTopicNotesCount(topic: Topic, topics: Topic[], includeDrafts: boolean): number {
  const ownNotesCount = topic.notes.filter(isPublishedNote).length;
  const childTopics = topics.filter((item) => item.parentSlug === topic.slug);
  const childNotesCount = childTopics.reduce(
    (total, childTopic) => total + getTopicNotesCount(childTopic, topics, includeDrafts),
    0
  );

  return ownNotesCount + childNotesCount;
}
