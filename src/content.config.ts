import { defineCollection, z } from "astro:content";

const topics = defineCollection({
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
    topic: z.string().optional(),
    topicSlug: z.string().optional(),
    parentSlug: z.string().optional(),
    sourcePath: z.string().optional()
  })
});

export const collections = { topics, notes };
