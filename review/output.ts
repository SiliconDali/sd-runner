import { z } from "zod";
import { Side } from "./diff";

/** An inline comment the agent wants on the pull request, before anchor validation. */
export const ReviewComment = z.strictObject({
  path: z.string().min(1),
  line: z.number().int().positive(),
  side: Side.optional(),
  body: z.string().min(1),
});

/** A reply to an existing review thread, by the id of any comment in it. */
export const ThreadReply = z.strictObject({
  comment_id: z.number().int().positive(),
  body: z.string().min(1),
});

/**
 * What the review extraction prompt must emit: a body and the threads to
 * open. No replies: a point an open thread covers is skipped, and verifying a
 * fix is the confirmation's job.
 */
export const ReviewOutput = z.strictObject({
  summary: z.string().min(1),
  comments: z.array(ReviewComment).default([]),
});

/** The confirmation's judgement of one thread, by the id of any comment in it. */
export const Verdict = z.strictObject({
  comment_id: z.number().int().positive(),
  verified: z.boolean(),
  reason: z.string().default(""),
});

/**
 * What the confirm extraction prompt must emit: a body, the threads to open
 * on faults in the fix commits, and one verdict per thread it was given.
 */
export const ConfirmOutput = z.strictObject({
  summary: z.string().min(1),
  comments: z.array(ReviewComment).default([]),
  verdicts: z.array(Verdict).default([]),
});

export type ReviewComment = z.infer<typeof ReviewComment>;
export type ThreadReply = z.infer<typeof ThreadReply>;
export type ReviewOutput = z.infer<typeof ReviewOutput>;
export type Verdict = z.infer<typeof Verdict>;
export type ConfirmOutput = z.infer<typeof ConfirmOutput>;
