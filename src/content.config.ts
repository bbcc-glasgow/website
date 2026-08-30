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

    // ── Civic fact set (#37) ──────────────────────────────────────────
    // One source for the facts a reader or an answer engine asks for:
    // who we are, where we meet, when, and under whose partnership. The
    // same fields drive the visible prose, the JSON-LD and llms.txt, so
    // the three cannot drift apart.
    legalName: z.string(),
    description: z.string(),
    venue: z.object({
      name: z.string(),
      streetAddress: z.string(),
      addressLocality: z.string(),
      postalCode: z.string(),
      addressCountry: z.string(),
      accessNote: z.string(),
    }),
    // The rule, not a list of dates: `src/lib/meetings.ts` derives the
    // next few concrete meetings at build time, so nothing goes stale.
    meetingRule: z.object({
      weekOfMonth: z.number().int().min(1).max(5),
      weekday: z.enum([
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ]),
      exceptMonths: z.array(z.string()),
      doorsOpen: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      attendanceNote: z.string(),
    }),
    // One-off cancellations, as ISO yyyy-mm-dd dates that the rule would
    // otherwise produce. Defaulted rather than required: Decap drops an empty
    // list from the JSON entirely, and "no cancellations" is the normal state,
    // so an absent key must not fail the build.
    meetingExceptions: z.array(z.string()).default([]),
    areaPartnership: z.object({
      name: z.string(),
      parentBody: z.string(),
    }),
    // Roles only. Names are deliberately absent from structured data so a
    // post-election gap never asserts a wrong fact about a real person.
    officeBearers: z.array(z.object({ role: z.string(), name: z.string().optional() })),
    // Drives `sameAs`. Only profiles the council currently owns belong
    // here; the superseded X account is intentionally not listed.
    socialProfiles: z.array(z.string().url()),
    // The old site this one replaces. Named in llms.txt so a reader who
    // finds both knows which one is current; three sources claiming the
    // same name is the reason bbcc.scot is hard to identify at all.
    predecessorSite: z.string().url().optional(),
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