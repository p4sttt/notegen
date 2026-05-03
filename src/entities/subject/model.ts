import type { Subject } from "../../data/generated/subjects";

export function getSubjectNotesCount(subject: Subject, subjects: Subject[], includeDrafts: boolean): number {
  const ownNotesCount = includeDrafts ? subject.notes.length : subject.notes.filter((note) => !note.draft).length;
  const childSubjects = subjects.filter((item) => item.parentSlug === subject.slug);
  const childNotesCount = childSubjects.reduce(
    (total, childSubject) => total + getSubjectNotesCount(childSubject, subjects, includeDrafts),
    0
  );

  return ownNotesCount + childNotesCount;
}
