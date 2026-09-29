import { z } from "zod";

/** What the write-pr prompt must emit: a title and a Markdown description, nothing else. */
export const PrOutput = z.strictObject({
  prTitle: z.string().min(1).max(256),
  prDescription: z.string().min(1),
});

export type PrOutput = z.infer<typeof PrOutput>;
