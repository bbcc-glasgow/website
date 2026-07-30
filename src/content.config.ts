import { defineCollection, z } from "astro:content";

const projects = defineCollection({
  type: "data",
  schema: z.object({
    tag: z.string(),
    tagColour: z.string(),
    tagBgColour: z.string(),
    borderColour: z.string(),
    title: z.string(),
    summary: z.string(),
    details: z.string(),
    order: z.number(),
  }),
});

const site = defineCollection({
  type: "data",
  schema: z.object({
    stats: z.array(
      z.object({
        value: z.string(),
        label: z.string(),
        desc: z.string(),
        countValue: z.number().optional(),
        prefix: z.string().optional(),
        suffix: z.string().optional(),
        valueStyle: z.string().optional(),
        duration: z.number().optional(),
      }),
    ),
    boundaryDescription: z.string(),
    contactEmail: z.string().email(),
  }),
});

const holding = defineCollection({
  type: "data",
  schema: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    ctaLabel: z.string(),
  }),
});

export const collections = { projects, site, holding };