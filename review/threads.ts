import { z } from "zod";

const Comment = z.object({
  id: z.number().int().positive(),
  author: z.string().optional(),
  body: z.string(),
});

const Thread = z.object({
  // Context for the agent only, never read here, so any shape the host sends passes.
  path: z.unknown().optional(),
  line: z.unknown().optional(),
  comments: z.array(Comment).min(1),
});

/**
 * The pull request's existing discussion, fetched by the host before the run:
 * unresolved review threads (first comment first) and conversation comments.
 * Extra fields the host includes are ignored.
 */
export const Threads = z.object({
  threads: z.array(Thread).default([]),
  comments: z.array(Comment).default([]),
});

export type Threads = z.infer<typeof Threads>;
export type Thread = z.infer<typeof Thread>;

/** Parse the threads file; throws on malformed JSON or shape. */
export function parseThreads(text: string): Threads {
  return Threads.parse(JSON.parse(text));
}

/**
 * The words a thread opens with and the words a bot replies with. Every stage
 * reads them the same way, and so can the developer: a thread's first words
 * say who acts on it next, and a reply's first words say what the bot did.
 */
export const OPENERS = {
  /** A review thread a bot acts on this run: a correctness or standards finding. */
  fixRequired: "Fix required:",
  /**
   * A thread written to the developer: a spec gap, a spec/ticket conflict, or a
   * fault the confirmation found. It waits on their answer in the thread; once
   * answered, it is the fixer's work like any other.
   */
  decisionRequired: "Decision required:",
  /** The fixer's reply when it changed the code, followed by the commit's short SHA. */
  fixedIn: "Fixed in",
  /** The fixer's reply when it declined, followed by the reason. */
  notChanged: "Not changed:",
  /** The confirmation's reply when the fix holds on HEAD. */
  fixVerified: "Fix verified.",
  /** The confirmation's reply when a claimed fix does not hold, followed by the reason. */
  fixNotVerified: "Fix not verified:",
} as const;

const opens = (body: string, opener: string) => body.trimStart().startsWith(opener);
const firstBody = (thread: Thread) => thread.comments[0]!.body;
const lastBody = (thread: Thread) => thread.comments[thread.comments.length - 1]!.body;

/** True when the thread is addressed to a human: no bot acts on it. */
export function forDecision(thread: Thread): boolean {
  return opens(firstBody(thread), OPENERS.decisionRequired);
}

/** True when the thread is a decision nobody has answered yet: its opener is still its last word. */
export function awaitingDecision(thread: Thread): boolean {
  return opens(lastBody(thread), OPENERS.decisionRequired);
}

/**
 * True when the thread is the fixer's work: its last word is not a bot's. A
 * decision awaiting the developer, a fix, a decline and a verdict each close
 * it; the developer's answer to a decision, a human reply after a decline, or
 * a `Fix not verified:` verdict opens it again.
 */
export function fixerWork(thread: Thread): boolean {
  if (awaitingDecision(thread)) return false;
  const last = lastBody(thread);
  return ![OPENERS.fixedIn, OPENERS.notChanged, OPENERS.fixVerified].some((o) => opens(last, o));
}

/**
 * True when the thread is the confirmation's to judge on HEAD: not addressed
 * to a human, not declined by the fixer's last word, and not verified already.
 */
export function confirmScope(thread: Thread): boolean {
  if (forDecision(thread)) return false;
  const last = lastBody(thread);
  return ![OPENERS.notChanged, OPENERS.fixVerified].some((o) => opens(last, o));
}

/** True when a reply in the thread claims a fix (`Fixed in`). */
export function claimed(thread: Thread): boolean {
  return thread.comments.some((c) => opens(c.body, OPENERS.fixedIn));
}

/** The threads that pass `keep`, with the conversation comments untouched. */
export function selectThreads(threads: Threads, keep: (thread: Thread) => boolean): Threads {
  return { threads: threads.threads.filter(keep), comments: threads.comments };
}

/**
 * Map every review-thread comment id to its thread's first comment id, the
 * id the replies endpoint wants. Conversation comments are left out: they
 * have no thread to reply in, so the summary is where they get answered.
 */
export function threadRoots(threads: Threads): Map<number, number> {
  const roots = new Map<number, number>();
  for (const thread of threads.threads) {
    const root = thread.comments[0]!.id;
    for (const comment of thread.comments) roots.set(comment.id, root);
  }
  return roots;
}
