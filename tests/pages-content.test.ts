import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "module";
import { ctaSchema } from "../src/lib/cta.ts";

// Zod is a transitive dependency of Astro — resolve it via Astro's module path.
const astroUrl = import.meta.resolve("astro");
const require = createRequire(astroUrl);
const { z } = require("zod");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pagesFile = resolve(repoRoot, "src/content/pages/index.json");

// ── Pages schema (mirror src/content.config.ts) ─────────────────────────

// Imported, not mirrored: see the note in tests/content-schema.test.mjs.
const cta = ctaSchema(z);

const pagesSchema = z.object({
  hero: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
    ctas: z.array(cta),
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
      ctas: z.array(cta),
    }),
  }),
  jag: z.object({
    eyebrow: z.string(),
    heading: z.string(),
    body: z.string(),
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

const SECTION_ORDER = [
  "hero",
  "ourArea",
  "ourProjects",
  "jag",
  "getInvolved",
  "meetings",
  "newsletter",
  "instagram",
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

// ── Instagram section tests ───────────────────────────────────────────────

describe("instagram section", () => {
  it("should exist as a top-level section of the homepage content", () => {
    assert.ok(
      "instagram" in readPages(),
      "homepage content must have an instagram section",
    );
  });

  it("should expose exactly the four instagram fields", () => {
    const instagram = readPages().instagram as Record<string, unknown>;
    assert.deepStrictEqual(Object.keys(instagram), ["eyebrow", "heading", "body", "ctas"]);
    for (const key of ["eyebrow", "heading", "body"]) {
      const value = instagram[key];
      assert.ok(
        typeof value === "string" && value.trim().length > 0,
        `instagram.${key} must be a non-empty string`,
      );
    }
  });

  // The two follow buttons name a platform rather than a URL, so the profile
  // addresses stay a single fact in the site collection.
  it("should point its follow buttons at the site's own social profiles", () => {
    const ctas = readPages().instagram.ctas as Array<Record<string, unknown>>;
    assert.strictEqual(ctas.length, 2);
    assert.deepStrictEqual(
      ctas.map((c) => c.platform),
      ["instagram", "facebook"],
    );
    for (const c of ctas) {
      assert.strictEqual(c.type, "social");
      assert.ok(!("url" in c), "a social cta must not carry an address of its own");
    }
  });

  it("must not hide any feed data (posts, images) behind the instagram section", () => {
    const instagram = readPages().instagram as Record<string, unknown>;
    for (const [key, value] of Object.entries(instagram)) {
      if (key === "ctas") continue;
      assert.ok(
        typeof value === "string",
        `instagram.${key} must be a plain string, not a nested feed/list/object`,
      );
    }
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

// ── Holding page content file tests ──────────────────────────────────────

describe("holding page content file", () => {
  const holdingFile = resolve(repoRoot, "src/content/pages/holding.json");

  it("should exist at src/content/pages/holding.json", () => {
    assert.ok(
      existsSync(holdingFile),
      "src/content/pages/holding.json must exist",
    );
  });

  it("should hold exactly the holding page fields, all non-empty", () => {
    const data = JSON.parse(readFileSync(holdingFile, "utf-8"));
    assert.deepStrictEqual(
      Object.keys(data),
      ["eyebrow", "heading", "body", "ctas"],
    );
    for (const key of ["eyebrow", "heading", "body"]) {
      assert.ok(
        typeof data[key] === "string" && data[key].trim().length > 0,
        `${key} must be a non-empty string`,
      );
    }
    assert.ok(Array.isArray(data.ctas) && data.ctas.length > 0, "ctas must not be empty");
  });

  it("should keep the holding page copy unchanged from the original entry", () => {
    const data = JSON.parse(readFileSync(holdingFile, "utf-8"));
    assert.strictEqual(data.eyebrow, "Glasgow's City Centre Community Council");
    assert.strictEqual(data.heading, "Your City,<br />Our City.");
    assert.strictEqual(
      data.body,
      "Blythswood & Broomielaw Community Council gives residents and workers a democratic voice in shaping the heart of Glasgow. Our website is under construction. In the meantime, we'd love to hear from you.",
    );
    assert.deepStrictEqual(data.ctas, [{ type: "contact", label: "Email us" }]);
  });
});

// ── Holding page copy source tests ───────────────────────────────────────

describe("holding page copy source", () => {
  const holdingAstro = readFileSync(
    resolve(repoRoot, "src/pages/holding.astro"),
    "utf-8",
  );

  it("should read the holding page entry from the pages collection", () => {
    assert.ok(
      holdingAstro.includes('getEntry("pages", "holding")'),
      "holding.astro must load the holding entry from the pages content collection",
    );
  });

  it("should render each field from the pages content entry", () => {
    for (const ref of ["eyebrow", "heading", "body", "ctas"]) {
      assert.ok(
        holdingAstro.includes(ref),
        `holding.astro must render ${ref} from the pages content entry`,
      );
    }
  });
});
