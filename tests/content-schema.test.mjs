import { describe, it } from "node:test";
import assert from "node:assert";
import { createRequire } from "module";

// Zod is a transitive dependency of Astro — resolve it via Astro's module path.
const astroUrl = import.meta.resolve("astro");
const require = createRequire(astroUrl);
const { z } = require("zod");

// ── Schemas (mirror src/content.config.ts) ──────────────────────────────

const projectSchema = z.object({
  tag: z.string(),
  tagColour: z.string(),
  title: z.string(),
  summary: z.string(),
  details: z.string(),
});

const siteSchema = z.object({
  stats: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
    }),
  ),
  boundaryDescription: z.string(),
  contactEmail: z.string().email(),
});

// ── Project schema tests ───────────────────────────────────────────────

describe("Project schema", () => {
  const validProject = {
    tag: "Strategy",
    tagColour: "var(--pink)",
    title: "Local Place Plan",
    summary: "A community-led spatial vision.",
    details: "Full details here.",
  };

  it("should accept a complete project object", () => {
    const result = projectSchema.safeParse(validProject);
    assert.ok(result.success);
  });

  it("should reject missing tag", () => {
    const { tag: _, ...rest } = validProject;
    const result = projectSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject missing tagColour", () => {
    const { tagColour: _, ...rest } = validProject;
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

  it("should reject missing details", () => {
    const { details: _, ...rest } = validProject;
    const result = projectSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it("should reject non-string title", () => {
    const result = projectSchema.safeParse({ ...validProject, title: 42 });
    assert.ok(!result.success);
  });
});

// ── Site schema tests ──────────────────────────────────────────────────

describe("Site schema", () => {
  const validSite = {
    stats: [{ value: "200,000+", label: "Daily Visitors" }],
    boundaryDescription: "North: Sauchiehall Street",
    contactEmail: "info@bbcc.scot",
  };

  it("should accept a complete site object", () => {
    const result = siteSchema.safeParse(validSite);
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
});