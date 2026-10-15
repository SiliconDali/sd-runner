import { z } from "zod";
import { ThreadReply } from "../review/output";

/**
 * What the address-review extraction prompt must emit: a summary for the run
 * log, and one reply per thread the agent addressed.
 * No inline comments and no review body: the fixer posts no review.
 */
export const AddressReviewOutput = z.strictObject({
  summary: z.string().min(1),
  replies: z.array(ThreadReply).default([]),
});

export type AddressReviewOutput = z.infer<typeof AddressReviewOutput>;
