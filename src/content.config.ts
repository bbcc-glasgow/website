import { defineCollection, z } from "astro:content";
import {
  DEFAULT_PROJECT_VARIANT,
  PROJECT_CTA_ICONS,
  PROJECT_VARIANTS,
} from "./lib/projectVariants";

const projects = defineCollection({
  type: "data",
  schema: z.object({
    tag: z.string(),
    // Named colour preset. `.catch` coerces a missing or unknown variant to
    // the default instead of failing the build, so a bad value can never
    // produce a card with broken styling.
    variant: z.enum(PROJECT_VARIANTS).catch(DEFAULT_PROJECT_VARIANT),
    title: z.string(),
    summary: z.string(),
    order: z.number(),
    ctas: z
      .array(
        z.object({
          label: z.string(),
          url: z.string(),
          icon: z.enum(PROJECT_CTA_ICONS).optional(),
        }),
      )
      .optional(),
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