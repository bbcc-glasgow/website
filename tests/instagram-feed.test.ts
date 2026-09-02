import { describe, it } from "node:test";
import assert from "node:assert";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  readFileSync,
  copyFileSync,
  rmSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Section copy mirrors the instagram.* fields in src/content/pages/index.json.
const FIXTURE_COPY = {
  eyebrow: "Social",
  heading: "Find Us on Instagram",
  body: "Follow us on Instagram @bbccglasgow for updates from the heart of Glasgow city centre.",
  instagramCtaLabel: "Follow on Instagram",
  facebookCtaLabel: "Follow on Facebook",
};

// The feed contract written by scripts/fetch-instagram.mjs: one {id}.jpg per
// post in src/assets/instagram/. Fixture posts carry the same caption and
// timestamp fields the workflow emits, so the test can prove those never leak
// into the rendered HTML.
const ACCOUNT_URL = "https://www.instagram.com/bbccglasgow/";

// Deliberately not the council's real profiles. The component takes these as
// props, so a fixture URL proves the plumbing without this test doubling as a
// second, drifting copy of what the live site links to (#37).
const FIXTURE_INSTAGRAM_URL = "https://www.instagram.com/fixture-account";
const FIXTURE_FACEBOOK_URL = "https://www.facebook.com/fixture-page";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fixturePosts(count, { emptyAltAt } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      id: `fixture-${n}`,
      permalink: ACCOUNT_URL,
      image: `instagram/fixture-${n}.jpg`,
      caption: `Fixture caption ${n}`,
      alt: n === emptyAltAt ? "" : `Fixture post ${n} image`,
      timestamp: new Date(Date.UTC(2026, 0, n)).toISOString(),
    };
  });
}

async function fixtureImageBuffer() {
  return sharp({
    create: {
      width: 600,
      height: 600,
      channels: 3,
      background: { r: 150, g: 90, b: 170 },
    },
  })
    .jpeg()
    .toBuffer();
}

// Build a throwaway Astro project in a temp dir that renders the real
// InstagramFeed component against the given feed state, and return the built
// HTML (plus the bundled CSS when global.css is included). The component
// source is copied verbatim so the test exercises the committed component;
// node_modules is symlinked from the repo so `astro build` resolves without a
// second install. Everything written lands inside the temp dir the test owns.
async function buildFixture(
  t: { after: (fn: () => void) => void },
  opts: {
    postsFile: object | null;
    imageIds?: string[];
    includeGlobalCss?: boolean;
    // Omit a key to render the fixture without that follow button.
    socialUrls?: { instagramUrl?: string; facebookUrl?: string };
  },
) {
  const dir = mkdtempSync(join(tmpdir(), "bbcc-insta-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  for (const p of [
    "src/pages",
    "src/components",
    "src/data/instagram",
    "src/assets/instagram",
    "src/styles",
  ]) {
    mkdirSync(join(dir, p), { recursive: true });
  }
  copyFileSync(
    join(repoRoot, "src/components/InstagramFeed.astro"),
    join(dir, "src/components/InstagramFeed.astro"),
  );

  if (opts.postsFile) {
    writeFileSync(
      join(dir, "src/data/instagram/posts.json"),
      JSON.stringify(opts.postsFile, null, 2),
    );
  }
  for (const id of opts.imageIds ?? []) {
    writeFileSync(join(dir, `src/assets/instagram/${id}.jpg`), await fixtureImageBuffer());
  }

  const stylesImport = opts.includeGlobalCss ? 'import "../styles/global.css";\n' : "";
  if (opts.includeGlobalCss) {
    copyFileSync(join(repoRoot, "src/styles/global.css"), join(dir, "src/styles/global.css"));
  }
  const socialUrls = opts.socialUrls ?? {
    instagramUrl: FIXTURE_INSTAGRAM_URL,
    facebookUrl: FIXTURE_FACEBOOK_URL,
  };
  writeFileSync(
    join(dir, "src/pages/index.astro"),
    `---
${stylesImport}import InstagramFeed from "../components/InstagramFeed.astro";
const copy = ${JSON.stringify(FIXTURE_COPY)};
const social = ${JSON.stringify(socialUrls)};
---
<InstagramFeed copy={copy} instagramUrl={social.instagramUrl} facebookUrl={social.facebookUrl} />
`,
  );

  const vitePlugin = opts.includeGlobalCss
    ? 'import tailwindcss from "@tailwindcss/vite";\nexport default defineConfig({ site: "https://bbcc.scot", vite: { plugins: [tailwindcss()] } });'
    : 'export default defineConfig({ site: "https://bbcc.scot" });';
  writeFileSync(
    join(dir, "astro.config.mjs"),
    `import { defineConfig } from "astro/config";\n${vitePlugin}\n`,
  );
  writeFileSync(
    join(dir, "package.json"),
    '{ "name": "bbcc-insta-fixture", "type": "module", "private": true }\n',
  );
  symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"), "dir");

  try {
    execFileSync(process.execPath, ["node_modules/astro/astro.js", "build"], {
      cwd: dir,
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch (err: any) {
    throw new Error(`fixture astro build failed:\n${err.stdout}\n${err.stderr}`);
  }

  const html = readFileSync(join(dir, "dist/index.html"), "utf-8");
  const cssDir = join(dir, "dist/_astro");
  let css = "";
  if (existsSync(cssDir)) {
    for (const entry of readdirSync(cssDir)) {
      if (entry.endsWith(".css")) css += readFileSync(join(cssDir, entry), "utf-8");
    }
  }
  return { html, css };
}

// ── Populated feed (six posts committed) ─────────────────────────────────

describe("InstagramFeed populated feed", () => {
  it("renders six tiles with permalink links, local webp images, alt text and the View post overlay, plus both follow buttons", async (t) => {
    const { html } = await buildFixture(t, {
      postsFile: {
        account: "bbccglasgow",
        posts: fixturePosts(6, { emptyAltAt: 3 }),
      },
      imageIds: [
        "fixture-1",
        "fixture-2",
        "fixture-3",
        "fixture-4",
        "fixture-5",
        "fixture-6",
      ],
    });

    assert.match(html, /<section id="instagram"/, "section id=instagram");
    assert.match(
      html,
      /aria-labelledby="instagram-heading"/,
      "section landmark has an accessible name",
    );
    assert.match(html, /id="instagram-heading"/, "heading id matches aria-labelledby");

    const tiles = [...html.matchAll(/<a href="([^"]+)" class="insta-tile"([^>]*)>/g)];
    assert.strictEqual(tiles.length, 6, "exactly six tiles");
    for (const [, href, attrs] of tiles) {
      assert.strictEqual(href, ACCOUNT_URL, "tile href is the post permalink");
      assert.match(attrs, /target="_blank"/, "opens in a new tab");
      assert.match(attrs, /rel="noopener noreferrer"/, "noopener noreferrer");
    }

    assert.strictEqual((html.match(/<img /g) || []).length, 6, "six images");
    assert.strictEqual(
      (html.match(/class="insta-overlay"/g) || []).length,
      6,
      "every tile carries the View post overlay",
    );
    assert.match(html, /View post ↗/, "overlay copy renders");
    assert.ok(
      !/src="https?:\/\//.test(html),
      "all image sources are local, never external",
    );

    assert.match(html, /alt="Fixture post 1 image"/, "alt text comes from the post");
    assert.match(
      html,
      /aria-label="View post on Instagram"/,
      "empty alt falls back to an aria-label on the link",
    );
    assert.strictEqual(
      (html.match(/loading="lazy"/g) || []).length,
      6,
      "every tile image is lazy-loaded",
    );

    // The URLs come from props now, not from inside the component, so what
    // belongs here is that each button pairs its CMS label with the URL it was
    // given. Which URLs the live site actually publishes is pinned against the
    // committed site content in tests/seo.test.mjs (#37).
    assert.match(
      html,
      new RegExp(
        `href="${escapeRegex(FIXTURE_INSTAGRAM_URL)}"[^>]*>\\s*Follow on Instagram\\s*</a>`,
      ),
      "pink follow button uses the CMS label and the URL it was passed",
    );
    assert.match(
      html,
      new RegExp(
        `href="${escapeRegex(FIXTURE_FACEBOOK_URL)}"[^>]*>\\s*Follow on Facebook\\s*</a>`,
      ),
      "ink follow button uses the CMS label and the URL it was passed",
    );
  });

  it("omits a follow button whose URL is absent rather than linking nowhere", async (t) => {
    const { html } = await buildFixture(t, {
      postsFile: { posts: fixturePosts(6) },
      imageIds: Array.from({ length: 6 }, (_, i) => `fixture-${i + 1}`),
      socialUrls: { instagramUrl: FIXTURE_INSTAGRAM_URL },
    });

    assert.match(html, />\s*Follow on Instagram\s*<\/a>/, "Instagram button still renders");
    assert.doesNotMatch(
      html,
      />\s*Follow on Facebook\s*<\/a>/,
      "Facebook button is dropped when no Facebook URL is configured",
    );
  });

  it("never renders like counts, captions or fetched-at timestamps", async (t) => {
    const { html } = await buildFixture(t, {
      postsFile: {
        account: "bbccglasgow",
        posts: fixturePosts(6),
      },
      imageIds: ["fixture-1", "fixture-2", "fixture-3", "fixture-4", "fixture-5", "fixture-6"],
    });

    assert.ok(!html.includes("Fixture caption"), "captions never leak into the DOM");
    assert.ok(!html.includes("2026-01-"), "fetched-at timestamps never render");
    assert.ok(!/like/i.test(html), "no like counts or like copy");
  });

  it("extends the existing #instagram/.insta-tile CSS without duplicate rule blocks", async (t) => {
    const { css } = await buildFixture(t, {
      postsFile: {
        account: "bbccglasgow",
        posts: fixturePosts(6),
      },
      imageIds: ["fixture-1", "fixture-2", "fixture-3", "fixture-4", "fixture-5", "fixture-6"],
      includeGlobalCss: true,
    });

    const threeColGridRules =
      css.match(/\.insta-grid\{[^}]*repeat\(3,1fr\)[^}]*\}/g) ?? [];
    assert.strictEqual(
      threeColGridRules.length,
      1,
      "the .insta-grid base rule is defined exactly once",
    );
    const gridRule = threeColGridRules[0] ?? "";
    assert.ok(gridRule.includes("grid-template-columns:repeat(3,1fr)"), "three columns");
    assert.ok(gridRule.includes("gap:3px"), "3px gaps");
    assert.ok(gridRule.includes("display:grid"), "grid display");

    const overlayRule = css.match(/\.insta-overlay\{[^}]*\}/)?.[0] ?? "";
    assert.ok(overlayRule.includes("position:absolute"), "overlay covers the tile");
    assert.ok(overlayRule.includes("opacity:0"), "overlay hidden by default");
    assert.match(
      css,
      /\.insta-tile:hover \.insta-overlay,\.insta-tile:focus-visible \.insta-overlay\{[^}]*opacity:1/,
      "hover and keyboard focus both show the overlay",
    );
    assert.match(
      css,
      /@media\s*\(max-width:640px\)[^{]*\{[^}]*\.insta-grid\{grid-template-columns:1fr\}/,
      "grid collapses to a single column at 640px and below",
    );
  });

  it("drops posts whose downloaded image is missing instead of rendering broken tiles", async (t) => {
    const { html } = await buildFixture(t, {
      postsFile: {
        account: "bbccglasgow",
        posts: fixturePosts(6),
      },
      imageIds: ["fixture-1", "fixture-3", "fixture-5"],
    });

    assert.strictEqual((html.match(/class="insta-tile"/g) || []).length, 3);
    assert.strictEqual((html.match(/<img /g) || []).length, 3);
  });
});

// ── Empty feed ────────────────────────────────────────────────────────────

describe("InstagramFeed empty feed", () => {
  it("renders the section shell with both follow buttons and no tile grid in the DOM", async (t) => {
    const { html } = await buildFixture(t, {
      postsFile: { account: "bbccglasgow", posts: [] },
    });

    assert.match(html, /<section id="instagram"/);
    assert.match(html, />\s*Social\s*<\/p>/, "eyebrow renders");
    assert.match(html, />\s*Find Us on Instagram\s*<\/h2>/, "heading renders");
    assert.match(
      html,
      />\s*Follow us on Instagram @bbccglasgow for updates from the heart of Glasgow city centre\.\s*<\/p>/,
      "intro line renders",
    );
    assert.match(html, />\s*Follow on Instagram\s*<\/a>/, "Instagram follow button renders");
    assert.match(html, />\s*Follow on Facebook\s*<\/a>/, "Facebook follow button renders");
    assert.ok(!html.includes("insta-grid"), "no tile grid element in the DOM");
    assert.ok(!html.includes("insta-tile"), "no tile anchors in the DOM");
    assert.ok(!html.includes("squinty-bridge"), "no placeholder tile image");
  });
});

// ── Missing posts.json ────────────────────────────────────────────────────

describe("InstagramFeed missing posts.json", () => {
  it("builds successfully and renders the same section shell as the empty feed", async (t) => {
    const { html } = await buildFixture(t, { postsFile: null });

    assert.match(html, /<section id="instagram"/);
    assert.match(html, />\s*Find Us on Instagram\s*<\/h2>/, "heading renders");
    assert.match(html, />\s*Follow on Instagram\s*<\/a>/, "Instagram follow button renders");
    assert.match(html, />\s*Follow on Facebook\s*<\/a>/, "Facebook follow button renders");
    assert.ok(!html.includes("insta-grid"), "no tile grid element in the DOM");
  });
});

// ── Homepage placement ────────────────────────────────────────────────────

describe("InstagramFeed homepage wiring", () => {
  it("sits between the projects section and the JAG section in src/pages/index.astro", () => {
    const source = readFileSync(resolve(repoRoot, "src/pages/index.astro"), "utf-8");
    const projectsIdx = source.indexOf('id="our-projects"');
    const feedIdx = source.indexOf("<InstagramFeed");
    const jagIdx = source.indexOf('id="jag"');
    assert.ok(projectsIdx !== -1, "projects section present");
    assert.ok(feedIdx !== -1, "InstagramFeed present");
    assert.ok(jagIdx !== -1, "JAG section present");
    assert.ok(
      projectsIdx < feedIdx && feedIdx < jagIdx,
      "InstagramFeed must be placed between the projects section and the JAG section",
    );
  });
});
