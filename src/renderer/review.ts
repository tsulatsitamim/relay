import type { DiffComment } from "../shared/types.ts";

export function unsentComments(comments: DiffComment[]): DiffComment[] {
  return comments.filter((comment) => comment.sentAt == null);
}

function reference(comment: DiffComment): string {
  if (comment.endLine <= comment.startLine) {
    return `${comment.path}:${comment.startLine}`;
  }
  return `${comment.path}:${comment.startLine}-${comment.endLine}`;
}

export function composeReview(comments: DiffComment[]): string {
  const ordered = unsentComments(comments).sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.startLine - b.startLine,
  );
  return ordered
    .map((comment) => `> ${reference(comment)}\n${comment.body}`)
    .join("\n\n");
}
