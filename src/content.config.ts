import { defineCollection, z } from "astro:content";

const subjects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    description: z.string().optional(),
    draft: z.boolean().optional(),
    sourcePath: z.string().optional()
  })
});

const notes = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    date: z.coerce.date().optional(),
    draft: z.boolean().optional(),
    subject: z.string().optional(),
    subjectSlug: z.string().optional(),
    parentSlug: z.string().optional(),
    sourcePath: z.string().optional()
  })
});

export const collections = { subjects, notes };
