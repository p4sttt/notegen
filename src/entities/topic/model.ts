import type { Topic } from "../../data/generated/topics";

export function getTopicNotesCount(topic: Topic, topics: Topic[], includeDrafts: boolean): number {
  const ownNotesCount = includeDrafts ? topic.notes.length : topic.notes.filter((note) => !note.draft).length;
  const childTopics = topics.filter((item) => item.parentSlug === topic.slug);
  const childNotesCount = childTopics.reduce(
    (total, childTopic) => total + getTopicNotesCount(childTopic, topics, includeDrafts),
    0
  );

  return ownNotesCount + childNotesCount;
}
