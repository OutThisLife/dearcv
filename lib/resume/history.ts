import { z } from "zod";
import { resumeDocSchema } from "@/lib/resume/schema";

/** Plenty to wander back through, without holding every draft of a long session. */
export const HISTORY_LIMIT = 100;

/** One step of a resume's history. What each field is for: lib/store/history.ts. */
export const revisionSchema = z.object({
  doc: resumeDocSchema,
  touched: z.boolean(),
  label: z.string(),
  changes: z.array(z.string()),
  request: z.string().optional(),
});

/**
 * A thread's history as it is kept with it, so a reload can still step back
 * through what was asked, and lands on the step they were looking at.
 */
export const historySchema = z
  .object({
    revisions: z.array(revisionSchema).max(HISTORY_LIMIT),
    at: z.number().int().nonnegative(),
  })
  .refine(({ revisions, at }) => at < Math.max(revisions.length, 1), "Step out of range.");

export type StoredHistory = z.infer<typeof historySchema>;
