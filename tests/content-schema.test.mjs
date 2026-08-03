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

// ── Holding schema tests ──────────────────────────────────────────────

describe("Holding schema", () => {
  const validHolding = {
    eyebrow: "Glasgow's City Centre Community Council",
    heading: "Your City,<br />Our City.",
    body: "Blythswood & Broomielaw Community Council gives residents and workers a democratic voice in shaping the heart of Glasgow. Our website is under construction — in the meantime, we'd love to hear from you.",
    ctaLabel: "Email us",
  };

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