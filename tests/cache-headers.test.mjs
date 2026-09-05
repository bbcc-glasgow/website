// The cache policy in public/_headers, and the property that makes it safe.
//
// Reads dist/, so it runs after `pnpm build` — which is also how it checks that
// Astro copies the file out of public/ at all, since a policy that never reaches
// the assets directory fails silently and looks exactly like no policy.
//
// Two halves. One asset path is served `immutable` for a year, and that is only
// sound while every file under it is content-hashed: an unhashed file there
// would be a stale copy with no URL change to shake it loose and no way to purge
// a browser, which is the one cache bug that cannot be fixed by deploying again.
// So the hashing is asserted rather than assumed. The other half is everything
// the policy deliberately leaves revalidating — CMS media, HTML, the calendar —
// pinned so that stays a decision rather than an omission somebody tidies up.

import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

const headersFile = path.join(distDir, "_headers");

/**
 * Parse `_headers` into `{ pattern, headers }` rules.
 *
 * A rule is an unindented path followed by indented `Name: value` lines.
 * Comments and blank lines are dropped.
 */
function parseHeaders(source) {
  const rules = [];
  for (const line of source.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) {
      const [name, ...rest] = line.trim().split(":");
      assert.ok(rules.length > 0, `header line before any path: ${line}`);
      rules.at(-1).headers[name.trim().toLowerCase()] = rest.join(":").trim();
    } else {
      rules.push({ pattern: line.trim(), headers: {} });
    }
  }
  return rules;
}

/**
 * Does a `_headers` pattern match this path?
 *
 * Only handles the trailing `*` this file uses. Cloudflare's matcher also does
 * `:placeholder` segments and splats mid-pattern; adding a form here that this
 * cannot represent would make the assertions below quietly weaker, so the
 * default is to fail rather than guess.
 */
function matches(pattern, urlPath) {
  assert.match(
    pattern,
    /^\/[^*:]*\*?$/,
    `${pattern} is a pattern shape this test cannot evaluate`,
  );
  return pattern.endsWith("*")
    ? urlPath.startsWith(pattern.slice(0, -1))
    : urlPath === pattern;
}

/** Every file under dist/, as site-absolute paths. */
function walk(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = `${prefix}/${entry.name}`;
    return entry.isDirectory() ? walk(path.join(dir, entry.name), child) : [child];
  });
}

describe("cache headers - the immutable path", () => {
  it("is copied into the build, so the policy actually ships", () => {
    assert.ok(
      fs.existsSync(headersFile),
      "dist/_headers is missing: public/_headers did not survive the build",
    );
  });

  it("caches /_astro/ for a year and tells the browser not to revalidate", () => {
    const rules = parseHeaders(fs.readFileSync(headersFile, "utf8"));
    const rule = rules.find((r) => r.pattern === "/_astro/*");
    assert.ok(rule, "no rule for /_astro/*");

    const value = rule.headers["cache-control"];
    assert.ok(value, "/_astro/* sets no Cache-Control");
    // Without `immutable` the browser still revalidates on reload, which is the
    // one round trip a content-hashed URL can never need.
    assert.match(value, /\bimmutable\b/, `/_astro/* is not immutable: ${value}`);
    const maxAge = Number(value.match(/\bmax-age=(\d+)/)?.[1]);
    assert.ok(
      maxAge >= 31536000,
      `/_astro/* should be cached for at least a year, got max-age=${maxAge}`,
    );
  });

  it("only covers files whose name changes with their contents", () => {
    // Astro emits `name.HASH.ext`, and processed images add a second segment:
    // `blythswood-square.CS0mgOCt_1wDebR.webp`. What is checked is the shape of
    // a base64url hash rather than a fixed length, so a longer hash after an
    // upgrade passes and a legible filename does not. Mixed case is the part
    // that separates the two: `holding.G-AW8Qq2.css` has it, a hand-written
    // `vendor-bundle.css` does not.
    const HASHED = /^(?=.*[a-z])(?=.*[A-Z])[A-Za-z0-9_-]{8,}$/;

    const assets = walk(path.join(distDir, "_astro"));
    assert.ok(assets.length > 0, "dist/_astro is empty, so this proves nothing");

    for (const asset of assets) {
      const segments = path.basename(asset).split(".");
      assert.ok(segments.length >= 3, `${asset} has no hash segment in its name`);
      assert.match(
        segments.at(-2),
        HASHED,
        `${asset} is served immutable for a year but its name is not content-hashed`,
      );
    }
  });
});

describe("cache headers - what keeps revalidating", () => {
  // Each of these has a URL that outlives its contents, so a cached copy is a
  // stale copy that a release cannot clear. They are listed by hand rather than
  // derived, because the point is to state the decision.
  const MUST_REVALIDATE = {
    "/": "the pointer to every hashed asset; stale here is stale everywhere",
    "/index.html": "as above, by its file name",
    "/404.html": "as above",
    "/images/bbcc-logo.svg": "Decap media: an editor can replace it in place",
    "/documents/blythswood_and_broomielaw_lpp.pdf": "Decap media, as above",
    "/meetings.ics": "the daily rebuild is the only thing that retires a cancelled meeting",
    "/admin/index.html": "Decap ships numbered chunks, not content-hashed ones",
  };

  it("leaves CMS media, HTML and the calendar on the default", () => {
    const rules = parseHeaders(fs.readFileSync(headersFile, "utf8"));

    for (const [urlPath, why] of Object.entries(MUST_REVALIDATE)) {
      const rule = rules.find(
        (r) => matches(r.pattern, urlPath) && "cache-control" in r.headers,
      );
      assert.ok(
        !rule,
        `${urlPath} is cached by ${rule?.pattern}: ${why}`,
      );
    }
  });

  it("names paths that exist, so the rule above is not passing on a typo", () => {
    for (const urlPath of Object.keys(MUST_REVALIDATE)) {
      const file = urlPath.endsWith("/") ? `${urlPath}index.html` : urlPath;
      assert.ok(
        fs.existsSync(path.join(distDir, file)),
        `${file} is not in the build; update this test's list or the site lost a file`,
      );
    }
  });
});
