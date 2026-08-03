import { describe, it } from "node:test";
import assert from "node:assert";
import { createRequire } from "module";

// Zod is a transitive dependency of Astro — resolve it via Astro's module path.
const astroUrl = import.meta.resolve("astro");
const require = createRequire(astroUrl);
const { z } = require("zod");

// ── Schemas (mirror src/content.config.ts) ──────────────────────────────

const projectVariants = ["teal", "pink", "amber"];
const projectCtaIcons = [
  "arrow-right",
  "external",
  "mail",
  "calendar",
  "map-pin",
  "download",
];

const projectSchema = z.object({
  tag: z.string(),
  variant: z.enum(projectVariants).catch("teal"),
  title: z.string(),
  summary: z.string(),
  order: z.number(),
  ctas: z
    .array(
      z.object({
        label: z.string(),
        url: z.string(),
        icon: z.enum(projectCtaIcons).optional(),
      }),
    )
    .optional(),
});

const siteSchema = z.object({
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
});

// ── Project schema tests ───────────────────────────────────────────────

describe("Project schema", () => {
  const validProject = {
    tag: "Strategy",
    variant: "pink",
    title: "Local Place Plan",
    summary: "A community-led spatial vision.",
    order: 1,
    ctas: [{ label: "Contact us", url: "mailto:info@bbcc.scot", icon: "mail" }],
  };

  it("should accept a complete project object", () => {
    const result = projectSchema.safeParse(validProject);
    assert.ok(result.success);
  });

  it("should accept a project with no ctas", () => {
    const { ctas: _, ...rest } = validProject;
    const result = projectSchema.safeParse(rest);
    assert.ok(result.success);
  });

  it("should accept a project with an empty ctas array", () => {
    const result = projectSchema.safeParse({ ...validProject, ctas: [] });
    assert.ok(result.success);
  });

  it("should accept a cta with no icon", () => {
    const { icon: _, ...ctaNoIcon } = validProject.ctas[0];
    const result = projectSchema.safeParse({ ...validProject, ctas: [ctaNoIcon] });
    assert.ok(result.success);
  });

  it("should default a missing variant to teal", () => {
    const { variant: _, ...rest } = validProject;
    const result = projectSchema.parse(rest);
    assert.strictEqual(result.variant, "teal");
  });

  it("should fall back to teal for an invalid variant", () => {
    const result = projectSchema.parse({ ...validProject, variant: "purple" });
    assert.strictEqual(result.variant, "teal");
  });

  it("should reject missing tag", () => {
    const { tag: _, ...rest } = validProject;
    const result = projectSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject missing title", () => {
    const { title: _, ...rest } = validProject;
    const result = projectSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject missing summary", () => {
    const { summary: _, ...rest } = validProject;
    const result = projectSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject missing order", () => {
    const { order: _, ...rest } = validProject;
    const result = projectSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject non-string title", () => {
    const result = projectSchema.safeParse({ ...validProject, title: 42 });
    assert.ok(!result.success);
  });

  it("should reject non-numeric order", () => {
    const result = projectSchema.safeParse({ ...validProject, order: "first" });
    assert.ok(!result.success);
  });

  it("should reject a cta missing label", () => {
    const { label: _, ...ctaNoLabel } = validProject.ctas[0];
    const result = projectSchema.safeParse({ ...validProject, ctas: [ctaNoLabel] });
    assert.ok(!result.success);
  });

  it("should reject a cta missing url", () => {
    const { url: _, ...ctaNoUrl } = validProject.ctas[0];
    const result = projectSchema.safeParse({ ...validProject, ctas: [ctaNoUrl] });
    assert.ok(!result.success);
  });

  it("should reject a cta with an invalid icon", () => {
    const result = projectSchema.safeParse({
      ...validProject,
      ctas: [{ label: "Contact us", url: "mailto:info@bbcc.scot", icon: "sparkles" }],
    });
    assert.ok(!result.success);
  });

  it("should reject ctas that is not an array", () => {
    const result = projectSchema.safeParse({ ...validProject, ctas: "none" });
    assert.ok(!result.success);
  });
});

const holdingSchema = z.object({
  eyebrow: z.string(),
  heading: z.string(),
  body: z.string(),
  ctaLabel: z.string(),
});

// The Holding Page is the second file entry in the pages collection. Its
// shape is distinct from the Homepage entry, so the two are combined into the
// pages schema via a union below.
const validHolding = {
  eyebrow: "Glasgow's City Centre Community Council",
  heading: "Your City,<br />Our City.",
  body: "Blythswood & Broomielaw Community Council gives residents and workers a democratic voice in shaping the heart of Glasgow. Our website is under construction — in the meantime, we'd love to hear from you.",
  ctaLabel: "Email us",
};

// ── Holding Page entry schema tests ───────────────────────────────────

describe("Holding Page entry schema", () => {
  it("should accept a complete holding object", () => {
    const result = holdingSchema.safeParse(validHolding);
    assert.ok(result.success);
  });

  it("should reject missing eyebrow", () => {
    const { eyebrow: _, ...rest } = validHolding;
    const result = holdingSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject missing heading", () => {
    const { heading: _, ...rest } = validHolding;
    const result = holdingSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject missing body", () => {
    const { body: _, ...rest } = validHolding;
    const result = holdingSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject missing ctaLabel", () => {
    const { ctaLabel: _, ...rest } = validHolding;
    const result = holdingSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject non-string eyebrow", () => {
    const result = holdingSchema.safeParse({ ...validHolding, eyebrow: 42 });
    assert.ok(!result.success);
  });

  it("should reject non-string heading", () => {
    const result = holdingSchema.safeParse({ ...validHolding, heading: false });
    assert.ok(!result.success);
  });

  it("should accept heading with embedded <br /> tag", () => {
    const result = holdingSchema.safeParse(validHolding);
    assert.ok(result.success);
  });
});

// ── Site schema tests ──────────────────────────────────────────────────

describe("Site schema", () => {
  const validSite = {
    stats: [{ value: "200,000+", label: "Daily Visitors", desc: "to city centre businesses" }],
    boundaryDescription: "North: Sauchiehall Street",
    contactEmail: "info@bbcc.scot",
  };

  it("should accept a complete site object", () => {
    const result = siteSchema.safeParse(validSite);
    assert.ok(result.success);
  });

  it("should accept site object with optional animation fields", () => {
    const result = siteSchema.safeParse({
      ...validSite,
      stats: [{ value: "200,000+", label: "Daily Visitors", desc: "to city centre businesses", countValue: 200000, suffix: "+" }],
    });
    assert.ok(result.success);
  });

  it("should reject missing stats", () => {
    const { stats: _, ...rest } = validSite;
    const result = siteSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject missing boundaryDescription", () => {
    const { boundaryDescription: _, ...rest } = validSite;
    const result = siteSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject missing contactEmail", () => {
    const { contactEmail: _, ...rest } = validSite;
    const result = siteSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject invalid email format", () => {
    const result = siteSchema.safeParse({
      ...validSite,
      contactEmail: "not-an-email",
    });
    assert.ok(!result.success);
  });

  it("should reject non-array stats", () => {
    const result = siteSchema.safeParse({
      ...validSite,
      stats: "not-an-array",
    });
    assert.ok(!result.success);
  });

  it("should reject stat object missing value", () => {
    const result = siteSchema.safeParse({
      ...validSite,
      stats: [{ label: "Daily Visitors" }],
    });
    assert.ok(!result.success);
  });

  it("should reject stat object missing label", () => {
    const result = siteSchema.safeParse({
      ...validSite,
      stats: [{ value: "200,000+" }],
    });
    assert.ok(!result.success);
  });

  it("should reject stat object missing desc", () => {
    const result = siteSchema.safeParse({
      ...validSite,
      stats: [{ value: "200,000+", label: "Daily Visitors" }],
    });
    assert.ok(!result.success);
  });
});

// ── Pages schema ─────────────────────────────────────────────────────────
//
// The pages collection holds two file entries: the Homepage (one object per
// section, in page order) and the Holding Page (eyebrow/heading/body/ctaLabel).
// A union lets both files validate against the same collection schema.

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
});

const pagesSchema = z.union([homepageSchema, holdingSchema]);

describe("Pages schema", () => {
  const validPages = {
    hero: {
      eyebrow: "Glasgow's City Centre Community Council",
      heading: "Your City,<br />Our City.",
      body: "Blythswood & Broomielaw Community Council gives residents and workers a democratic voice.",
      ctas: [
        { label: "Get Involved", url: "#get-involved" },
        { label: "Our Area", url: "#our-area" },
      ],
    },
    ourArea: {
      eyebrow: "Our Patch",
      heading: "The Commercial Heart of Glasgow",
      body1: "We cover the dense, layered area between the M8 and Renfield Street.",
      body2: "As a statutory Community Council, we have a right to be consulted.",
      boundaryLabel: "Boundary",
      pillars: [
        { heading: "Planning & Licensing", body: "Statutory consultee on applications." },
        { heading: "Public Realm", body: "Greening lanes, improving footpaths." },
      ],
    },
    ourProjects: {
      eyebrow: "Active Work",
      heading: "What We're Working On",
      ideaCard: {
        heading: "Have an idea?",
        body: "Tell us about issues in your neighbourhood.",
        cta: { label: "Contact us", url: "#get-involved" },
      },
    },
    jag: {
      eyebrow: "Joint Action Group",
      heading: "Working Together Across Glasgow",
      body: "Through the Joint Action Group (JAG), we team up with neighbouring councils.",
      cards: [
        { eyebrow: "East", heading: "Merchant City & Trongate", body: "Our immediate neighbours.", ctaLabel: "Visit council →" },
      ],
    },
    getInvolved: {
      eyebrow: "Participate",
      heading: "Your City. Your Say.",
      body: "Community Councils only work when the community shows up.",
      cards: [
        { heading: "Attend a Meeting", body: "Our public meetings are open to all.", cta: { label: "See dates", url: "#meetings" } },
      ],
    },
    meetings: {
      eyebrow: "Open Meetings",
      heading: "Coming to a Meeting",
      body: "All meetings are held in public.",
      cta: { label: "Get notified by email", url: "#newsletter" },
    },
    newsletter: {
      eyebrow: "Stay Informed",
      heading: "Stay in the Loop",
      body: "For occasional updates on meetings, consultations, and planning decisions.",
      ctaLabel: "Email us to subscribe",
      subtext: "No spam. Unsubscribe any time.",
    },
  };

  it("should accept a complete pages object", () => {
    const result = pagesSchema.safeParse(validPages);
    assert.ok(result.success);
  });

  it("should reject a pages object missing a section", () => {
    for (const key of ["hero", "ourArea", "ourProjects", "jag", "getInvolved", "meetings", "newsletter"]) {
      const { [key]: _removed, ...rest } = validPages;
      const result = pagesSchema.safeParse(rest);
      assert.ok(!result.success, `must reject when ${key} is missing`);
    }
  });

  it("should reject hero missing eyebrow", () => {
    const { hero, ...rest } = validPages;
    const { eyebrow: _removed, ...heroRest } = hero;
    const result = pagesSchema.safeParse({ ...rest, hero: heroRest });
    assert.ok(!result.success);
  });

  it("should reject hero with a cta missing url", () => {
    const { hero, ...rest } = validPages;
    const [first, ...others] = hero.ctas;
    const { url: _removed, ...ctaRest } = first;
    const result = pagesSchema.safeParse({
      ...rest,
      hero: { ...hero, ctas: [ctaRest, ...others] },
    });
    assert.ok(!result.success);
  });

  it("should reject ourArea missing pillars", () => {
    const { ourArea, ...rest } = validPages;
    const { pillars: _removed, ...ourAreaRest } = ourArea;
    const result = pagesSchema.safeParse({ ...rest, ourArea: ourAreaRest });
    assert.ok(!result.success);
  });

  it("should reject a pillar missing heading", () => {
    const { ourArea, ...rest } = validPages;
    const [first, ...others] = ourArea.pillars;
    const { heading: _removed, ...pillarRest } = first;
    const result = pagesSchema.safeParse({
      ...rest,
      ourArea: { ...ourArea, pillars: [pillarRest, ...others] },
    });
    assert.ok(!result.success);
  });

  it("should reject a jag card missing ctaLabel", () => {
    const { jag, ...rest } = validPages;
    const [first, ...others] = jag.cards;
    const { ctaLabel: _removed, ...cardRest } = first;
    const result = pagesSchema.safeParse({
      ...rest,
      jag: { ...jag, cards: [cardRest, ...others] },
    });
    assert.ok(!result.success);
  });

  it("should reject getInvolved with a card missing cta", () => {
    const { getInvolved, ...rest } = validPages;
    const [first, ...others] = getInvolved.cards;
    const { cta: _removed, ...cardRest } = first;
    const result = pagesSchema.safeParse({
      ...rest,
      getInvolved: { ...getInvolved, cards: [cardRest, ...others] },
    });
    assert.ok(!result.success);
  });

  it("should reject newsletter missing subtext", () => {
    const { newsletter, ...rest } = validPages;
    const { subtext: _removed, ...newsletterRest } = newsletter;
    const result = pagesSchema.safeParse({ ...rest, newsletter: newsletterRest });
    assert.ok(!result.success);
  });

  it("should reject meetings with a non-string heading", () => {
    const result = pagesSchema.safeParse({
      ...validPages,
      meetings: { ...validPages.meetings, heading: 42 },
    });
    assert.ok(!result.success);
  });

  it("should accept a hero heading with an embedded <br /> tag", () => {
    const result = pagesSchema.safeParse(validPages);
    assert.ok(result.success);
  });

  it("should accept a holding page entry as the Holding Page file of the pages collection", () => {
    const result = pagesSchema.safeParse(validHolding);
    assert.ok(result.success);
  });

  it("should reject an entry that matches neither the homepage nor the holding page shape", () => {
    const result = pagesSchema.safeParse({ heading: "Just a heading" });
    assert.ok(!result.success);
  });

  it("should reject a holding page entry missing a required field", () => {
    const { ctaLabel: _removed, ...holdingWithoutCta } = validHolding;
    const result = pagesSchema.safeParse(holdingWithoutCta);
    assert.ok(!result.success);
  });
});