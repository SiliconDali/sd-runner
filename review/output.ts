import { z } from "zod";

/** An inline comment the agent wants on the pull request, before anchor validation. */
export const ReviewComment = z.strictObject({
  path: z.string().min(1),
  line: z.number().int().positive(),
  side: z.enum(["LEFT", "RIGHT"]).optional(),
  body: z.string().min(1),
});

/** A reply to an existing review thread, by the id of any comment in it. */
export const ThreadReply = z.strictObject({
  comment_id: z.number().int().positive(),
  body: z.string().min(1),
});

/** What the review extraction prompt must emit. */
export const ReviewOutput = z.strictObject({
  summary: z.string().min(1),
  comments: z.array(ReviewComment).default([]),
  replies: z.array(ThreadReply).default([]),
});

export type ReviewComment = z.infer<typeof ReviewComment>;
export type ThreadReply = z.infer<typeof ThreadReply>;
export type ReviewOutput = z.infer<typeof ReviewOutput>;
