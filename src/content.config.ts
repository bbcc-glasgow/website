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

// The pages collection holds two file entries: the Homepage (one object per
// section, in page order) and the Holding Page (eyebrow/heading/body/ctaLabel).
// A union lets both files validate against the same collection schema; each
// entry matches exactly one member.
const homepageSchema = z.object({
  hero: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    ctas: z.array(z.object({ label: z.string(), url: z.string() })),
  }),
  ourArea: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body1: z.string(),
    body2: z.string(),
    boundaryLabel: z.string(),
    pillars: z.array(z.object({ heading: z.string(), body: z.string() })),
  }),
  ourProjects: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    ideaCard: z.object({
      heading: z.string(),
      body: z.string(),
      cta: z.object({ label: z.string(), url: z.string() }),
    }),
  }),
  jag: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    cards: z.array(
      z.object({
        eyebrow: z.string(),
        heading: z.string(),
        body: z.string(),
        ctaLabel: z.string(),
      }),
    ),
  }),
  getInvolved: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    cards: z.array(
      z.object({
        heading: z.string(),
        body: z.string(),
        cta: z.object({ label: z.string(), url: z.string() }),
      }),
    ),
  }),
  meetings: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    cta: z.object({ label: z.string(), url: z.string() }),
  }),
  newsletter: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    ctaLabel: z.string(),
    subtext: z.string(),
  }),
  instagram: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    instagramCtaLabel: z.string(),
    facebookCtaLabel: z.string(),
  }),
});

const holdingSchema = z.object({
  eyebrow: z.string(),
  heading: z.string(),
  body: z.string(),
  ctaLabel: z.string(),
});

const pages = defineCollection({
  type: "data",
  schema: z.union([homepageSchema, holdingSchema]),
});

export const collections = { projects, site, pages };