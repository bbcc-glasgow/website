import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "module";

// Zod is a transitive dependency of Astro — resolve it via Astro's module path.
const astroUrl = import.meta.resolve("astro");
const require = createRequire(astroUrl);
const { z } = require("zod");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pagesFile = resolve(repoRoot, "src/content/pages/index.json");

// ── Pages schema (mirror src/content.config.ts) ─────────────────────────

const pagesSchema = z.object({
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

const SECTION_ORDER = [
  "hero",
  "ourArea",
  "ourProjects",
  "jag",
  "getInvolved",
  "meetings",
  "newsletter",
];

function readPages() {
  return JSON.parse(readFileSync(pagesFile, "utf-8"));
}

// ── Pages content file tests ────────────────────────────────────────────

describe("pages content file", () => {
  it("should exist at src/content/pages/index.json", () => {
    assert.ok(
      existsSync(pagesFile),
      "src/content/pages/index.json must exist",
    );
  });

  it("should validate against the pages schema", () => {
    const result = pagesSchema.safeParse(readPages());
    assert.ok(
      result.success,
      result.success ? undefined : result.error.message,
    );
  });

  it("should list one object per section, in page order", () => {
    assert.deepStrictEqual(Object.keys(readPages()), SECTION_ORDER);
  });

  it("should have non-empty prose for every section field", () => {
    const data = readPages();
    const sections = Object.values(data);
    for (const section of sections) {
      const visit = (value: unknown, path: string) => {
        if (typeof value === "string") {
          assert.ok(
            value.trim().length > 0,
            `${path} must not be empty`,
          );
        } else if (Array.isArray(value)) {
          value.forEach((item, i) => visit(item, `${path}[${i}]`));
        } else if (value && typeof value === "object") {
          for (const [k, v] of Object.entries(value)) {
            visit(v, `${path}.${k}`);
          }
        }
      };
      visit(section, "");
    }
  });

  it("should not model meeting event data (date, time, location)", () => {
    const data = readPages();
    assert.ok(
      !("date" in data.meetings),
      "meetings must not contain a date field (Google Calendar will supply events)",
    );
    assert.ok(
      !("time" in data.meetings),
      "meetings must not contain a time field",
    );
    assert.ok(
      !("location" in data.meetings),
      "meetings must not contain a location field",
    );
  });

  it("should keep the hero heading with its line break", () => {
    assert.strictEqual(
      readPages().hero.heading,
      "Your City,<br />Our City.",
    );
  });
});

// ── Homepage copy source tests ──────────────────────────────────────────

describe("homepage copy source", () => {
  const indexAstro = readFileSync(
    resolve(repoRoot, "src/pages/index.astro"),
    "utf-8",
  );

  it("should read the pages content entry", () => {
    assert.ok(
      indexAstro.includes('getEntry("pages", "index")'),
      "index.astro must load the pages content entry",
    );
  });

  it("should render each section's copy from the pages content", () => {
    const fieldRefs = [
      "hero.eyebrow",
      "ourArea.heading",
      "ourProjects.heading",
      "jag.heading",
      "getInvolved.heading",
      "meetings.heading",
      "newsletter.heading",
    ];
    for (const ref of fieldRefs) {
      assert.ok(
        indexAstro.includes(ref),
        `index.astro must render ${ref} from the pages content entry`,
      );
    }
  });
});
