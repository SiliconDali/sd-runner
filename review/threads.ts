import { z } from "zod";

const Comment = z.object({
  id: z.number().int().positive(),
  author: z.string().optional(),
  body: z.string(),
});

const Thread = z.object({
  path: z.string().optional(),
  line: z.number().int().nullable().optional(),
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

/** Parse the threads file; throws on malformed JSON or shape. */
export function parseThreads(text: string): Threads {
  return Threads.parse(JSON.parse(text));
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
