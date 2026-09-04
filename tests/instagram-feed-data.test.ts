import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "module";

// Zod is a transitive dependency of Astro — resolve it via Astro's module path.
const astroUrl = import.meta.resolve("astro");
const require = createRequire(astroUrl);
const { z } = require("zod");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── Path decision ──────────────────────────────────────────────────────────
//
// The Instagram feed data lives at `src/data/instagram/posts.json`, NOT under
// `src/content/` and not as a content collection. The bot workflow (slices 4-5)
// writes this file directly on a schedule, whereas `src/content/` holds
// CMS-edited content with declared schemas in `src/content.config.ts`. Keeping
// bot-written feed data in `src/data/` keeps the two kinds of content apart and
// avoids treating a machine-written feed as a hand-edited collection.
// This path is held constant across all Instagram slices (data seed, component,
// workflow).
const feedFile = resolve(repoRoot, "src/data/instagram/posts.json");
const feedRelPath = "src/data/instagram/posts.json";
const assetsDir = resolve(repoRoot, "src/assets/instagram");
const assetsRelPath = "src/assets/instagram/";

// Contract for the seeded stub. Before the bot has ever run, the feed holds the
// council's Instagram account handle and an empty `posts` array. The post
// object shape is defined by the workflow slices (4-5), so the schema here only
// constrains what this slice guarantees: `account` is a string, `posts` is an
// array.
const instagramFeedSchema = z.object({
  account: z.string(),
  posts: z.array(z.any()),
});

function readFeed() {
  return JSON.parse(readFileSync(feedFile, "utf-8"));
}

// ── Seeded feed data file ─────────────────────────────────────────────────

describe("instagram feed data seed", () => {
  it(`should exist at ${feedRelPath}`, () => {
    assert.ok(
      existsSync(feedFile),
      `${feedRelPath} must exist (committed seed before the bot has run)`,
    );
  });

  it("should parse as valid JSON", () => {
    assert.doesNotThrow(() => readFeed(), "posts.json must be valid JSON");
  });

  it("should validate against the feed contract schema", () => {
    const result = instagramFeedSchema.safeParse(readFeed());
    assert.ok(
      result.success,
      result.success ? undefined : result.error.message,
    );
  });

  it("should carry the glasgowbbcc account handle", () => {
    assert.strictEqual(readFeed().account, "glasgowbbcc");
  });

  it("should start with an empty posts array", () => {
    const feed = readFeed();
    assert.ok(Array.isArray(feed.posts), "posts must be an array");
    assert.strictEqual(
      feed.posts.length,
      0,
      "posts must be empty before the bot has ever run",
    );
  });
});

// ── Feed contract schema (happy path and failure cases) ───────────────────

describe("instagram feed contract schema", () => {
  const validFeed = { account: "glasgowbbcc", posts: [] };

  it("should accept the seeded stub", () => {
    assert.ok(instagramFeedSchema.safeParse(validFeed).success);
  });

  it("should accept a populated posts array", () => {
    const result = instagramFeedSchema.safeParse({
      account: "glasgowbbcc",
      posts: [{ id: "post-1" }],
    });
    assert.ok(result.success);
  });

  it("should reject a feed missing account", () => {
    const { account: _removed, ...rest } = validFeed;
    assert.ok(!instagramFeedSchema.safeParse(rest).success);
  });

  it("should reject a feed with a non-string account", () => {
    assert.ok(
      !instagramFeedSchema.safeParse({ ...validFeed, account: 42 }).success,
    );
  });

  it("should reject a feed missing posts", () => {
    const { posts: _removed, ...rest } = validFeed;
    assert.ok(!instagramFeedSchema.safeParse(rest).success);
  });

  it("should reject a feed with non-array posts", () => {
    assert.ok(
      !instagramFeedSchema.safeParse({ ...validFeed, posts: "none" }).success,
    );
  });
});

// ── Instagram assets directory ────────────────────────────────────────────

describe("instagram assets directory", () => {
  it(`should exist at ${assetsRelPath}`, () => {
    assert.ok(
      existsSync(assetsDir),
      `${assetsRelPath} must exist (placeholder for feed images)`,
    );
  });

  it("should be tracked by git", () => {
    const tracked = execSync(`git ls-files ${assetsRelPath}`, {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();
    assert.ok(
      tracked.length > 0,
      `${assetsRelPath} must contain a git-tracked file`,
    );
  });
});
