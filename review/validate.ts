import type { DiffIndex, Side } from "./diff";
import type { ReviewComment, ReviewOutput, ThreadReply } from "./output";
import { threadRoots, type Threads } from "./threads";

export interface AnchoredComment {
  readonly path: string;
  readonly line: number;
  readonly side: Side;
  readonly body: string;
}

export type Dropped =
  | { readonly kind: "comment"; readonly reason: string; readonly item: ReviewComment }
  | { readonly kind: "reply"; readonly reason: string; readonly item: ThreadReply };

export interface ValidatedReview {
  readonly summary: string;
  readonly comments: AnchoredComment[];
  readonly replies: ThreadReply[];
  readonly dropped: Dropped[];
}

/**
 * Keep only what the host can post: inline comments anchored to a line the
 * diff shows on their side (RIGHT unless stated), and replies to a comment in
 * one of the fetched review threads, retargeted at the thread's first comment.
 * Everything else is returned in `dropped` with the reason.
 */
export function validateReview(
  output: ReviewOutput,
  diff: DiffIndex,
  threads: Threads
): ValidatedReview {
  const dropped: Dropped[] = [];
  const known = new Set(diff.paths());

  const comments: AnchoredComment[] = [];
  for (const item of output.comments) {
    const side = item.side ?? "RIGHT";
    if (!known.has(item.path)) {
      dropped.push({ kind: "comment", reason: `${item.path} is not in the diff`, item });
    } else if (!diff.has(item.path, item.line, side)) {
      dropped.push({
        kind: "comment",
        reason: `${item.path}:${item.line} (${side}) is not a line in the diff`,
        item,
      });
    } else {
      comments.push({ path: item.path, line: item.line, side, body: item.body });
    }
  }

  const roots = threadRoots(threads);
  const replies: ThreadReply[] = [];
  for (const item of output.replies) {
    const root = roots.get(item.comment_id);
    if (root === undefined) {
      dropped.push({
        kind: "reply",
        reason: `comment ${item.comment_id} is not in an open review thread`,
        item,
      });
    } else {
      replies.push({ comment_id: root, body: item.body });
    }
  }

  return { summary: output.summary, comments, replies, dropped };
}
