import { defineCollection, z } from "astro:content";

const projects = defineCollection({
  type: "data",
  schema: z.object({
    tag: z.string(),
    tagColour: z.string(),
    title: z.string(),
    summary: z.string(),
    details: z.string(),
  }),
});

const site = defineCollection({
  type: "data",
  schema: z.object({
    stats: z.array(
      z.object({
        value: z.string(),
        label: z.string(),
      }),
    ),
    boundaryDescription: z.string(),
    contactEmail: z.string().email(),
  }),
});

export const collections = { projects, site };