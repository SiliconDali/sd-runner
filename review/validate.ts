import type { DiffIndex, Side } from "./diff";
import type { ReviewComment, ThreadReply, Verdict } from "./output";
import { claimed, OPENERS, threadRoots, type Threads } from "./threads";

/** A comment that passed anchor validation, its side made explicit. */
export type AnchoredComment = Readonly<Omit<ReviewComment, "side"> & { side: Side }>;

export type Dropped =
  | { readonly kind: "comment"; readonly reason: string; readonly item: ReviewComment }
  | { readonly kind: "reply"; readonly reason: string; readonly item: ThreadReply }
  | { readonly kind: "verdict"; readonly reason: string; readonly item: Verdict };

export interface ValidatedComments {
  readonly comments: AnchoredComment[];
  readonly dropped: Dropped[];
}

/**
 * Keep only inline comments the host can post: anchored to a line the diff
 * shows on their side (RIGHT unless stated). Each body opens with one of
 * `openers`; one that opens with none gets `fallback` put in front, so every
 * thread the bot opens says who acts on it next. The rest are returned in
 * `dropped` with the reason.
 */
export function validateComments(
  items: readonly ReviewComment[],
  diff: DiffIndex,
  openers: readonly string[],
  fallback: string
): ValidatedComments {
  const dropped: Dropped[] = [];
  const known = new Set(diff.paths());
  const comments: AnchoredComment[] = [];
  for (const item of items) {
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
      const body = item.body.trimStart();
      const opened = openers.some((o) => body.startsWith(o)) ? body : `${fallback} ${body}`;
      comments.push({ path: item.path, line: item.line, side, body: opened });
    }
  }
  return { comments, dropped };
}

export interface ValidatedReplies {
  readonly replies: ThreadReply[];
  readonly dropped: Dropped[];
}

/**
 * Keep only replies to a comment in one of the fetched review threads,
 * retargeted at the thread's first comment, the id a replies endpoint wants.
 * Replies that land on the same thread are joined into one, in order; the
 * rest are returned in `dropped` with the reason.
 */
export function validateReplies(items: readonly ThreadReply[], threads: Threads): ValidatedReplies {
  const dropped: Dropped[] = [];
  const roots = threadRoots(threads);
  const replies = new Map<number, string>();
  for (const item of items) {
    const root = roots.get(item.comment_id);
    if (root === undefined) {
      dropped.push({
        kind: "reply",
        reason: `comment ${item.comment_id} is not in an open review thread`,
        item,
      });
    } else {
      const earlier = replies.get(root);
      replies.set(root, earlier === undefined ? item.body : `${earlier}\n\n${item.body}`);
    }
  }
  return { replies: [...replies].map(([comment_id, body]) => ({ comment_id, body })), dropped };
}

/** A verdict the host posts as a reply, and resolves when `verified` and the thread is the bot's own. */
export interface PostedVerdict {
  readonly comment_id: number;
  readonly verified: boolean;
  readonly body: string;
}

export interface ValidatedVerdicts {
  readonly verdicts: PostedVerdict[];
  readonly dropped: Dropped[];
  /** Threads the agent was given and gave no verdict on. */
  readonly unjudged: number[];
}

/**
 * Keep one verdict per thread the confirmation was given, at the thread's
 * first comment, its body composed from the opener and the reason. A failed
 * verdict on a thread nobody claimed fixed is dropped: silence is what an
 * untouched thread gets. The first verdict on a thread wins.
 */
export function validateVerdicts(items: readonly Verdict[], threads: Threads): ValidatedVerdicts {
  const dropped: Dropped[] = [];
  const roots = threadRoots(threads);
  const byRoot = new Map(threads.threads.map((t) => [t.comments[0]!.id, t]));
  const verdicts = new Map<number, PostedVerdict>();
  for (const item of items) {
    const root = roots.get(item.comment_id);
    if (root === undefined) {
      dropped.push({ kind: "verdict", reason: `comment ${item.comment_id} is not in a thread under confirmation`, item });
      continue;
    }
    if (verdicts.has(root)) {
      dropped.push({ kind: "verdict", reason: `thread at comment ${root} already has a verdict`, item });
      continue;
    }
    const reason = item.reason.trim();
    if (item.verified) {
      verdicts.set(root, { comment_id: root, verified: true, body: reason ? `${OPENERS.fixVerified} ${reason}` : OPENERS.fixVerified });
    } else if (!claimed(byRoot.get(root)!)) {
      dropped.push({ kind: "verdict", reason: `thread at comment ${root} claims no fix, so an unverified verdict stays unsaid`, item });
    } else {
      verdicts.set(root, { comment_id: root, verified: false, body: `${OPENERS.fixNotVerified} ${reason || "the fix does not hold on HEAD."}` });
    }
  }
  const unjudged = [...byRoot.keys()].filter((root) => !verdicts.has(root));
  return { verdicts: [...verdicts.values()], dropped, unjudged };
}
