import { defineCollection, z } from "astro:content";
import { DEFAULT_PROJECT_VARIANT, PROJECT_VARIANTS } from "./lib/projectVariants";
import { ctaSchema } from "./lib/cta";

// One CTA shape for the whole site. Defined in src/lib/cta.ts so the tests
// validate against the same object rather than a hand-copy of it.
const cta = ctaSchema(z);

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
    ctas: z.array(cta).optional(),
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
    // Where the meeting dates come from. Not dates, and no longer a rule
    // either: `src/lib/gcal.ts` reads the council's Google Calendar at build
    // time and `src/lib/meetings.ts` derives the standing pattern from what it
    // finds, so cancelling a meeting in Google is the whole job.
    meetingCalendar: z.object({
      /**
       * The calendar's public iCal address, from Google Calendar settings under
       * "Integrate calendar". Must be the public address, not the secret one:
       * this file is in a public repo, and the secret address is a credential.
       */
      icsUrl: z.string().url(),
    }),
    // The two facts about the meetings that a calendar entry cannot hold.
    meetingDetails: z.object({
      /** Google has one start time per event; "doors at 7 for 7.30" is two. */
      doorsOpen: z.string(),
      attendanceNote: z.string(),
    }),
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
// section, in page order) and the Holding Page (eyebrow/heading/body/ctas).
// A union lets both files validate against the same collection schema; each
// entry matches exactly one member.
const homepageSchema = z.object({
  hero: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    ctas: z.array(cta),
  }),
  ourArea: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    // One field, not the body1/body2 it replaces: paragraphs now come from
    // blank lines in the text, so how many there are is the editor's business
    // rather than something the schema pins at exactly two.
    body: z.string(),
    boundaryLabel: z.string(),
    pillars: z.array(z.object({ heading: z.string(), body: z.string() })),
  }),
  ourProjects: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    ideaCard: z.object({
      heading: z.string(),
      body: z.string(),
      ctas: z.array(cta),
    }),
  }),
  jag: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    // A name, and a link only once somebody has confirmed the council's own
    // page. The names are the fact; a compass direction and a sentence about
    // what each neighbour cares about would be us making it up.
    cards: z.array(
      z.object({
        name: z.string(),
        url: z.string().url().optional(),
      }),
    ),
  }),
  getInvolved: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    // Plural, because "follow us" is two buttons and one card should not have
    // to become two to say so.
    cards: z.array(
      z.object({
        heading: z.string(),
        body: z.string(),
        ctas: z.array(cta).min(1),
      }),
    ),
  }),
  meetings: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    ctas: z.array(cta),
  }),
  newsletter: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    ctas: z.array(cta),
    subtext: z.string(),
  }),
  instagram: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    ctas: z.array(cta),
  }),
});

const holdingSchema = z.object({
  eyebrow: z.string(),
  heading: z.string(),
  body: z.string(),
  ctas: z.array(cta),
});

const pages = defineCollection({
  type: "data",
  schema: z.union([homepageSchema, holdingSchema]),
});

export const collections = { projects, site, pages };