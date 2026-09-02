import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CTA_ICONS, CTA_TYPES, SOCIAL_PLATFORMS } from "../src/lib/cta.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(repoRoot, "public/admin/config.yml");

// ── Minimal YAML section extractor ───────────────────────────────────────
// Walks nested keys by scanning for /^<indent><key>:$/ patterns.
// Returns lines collected from the found section.

function yamlSection(text, ...keys) {
  const lines = text.split("\n");

  let startIdx = 0;
  let targetIndent = -1;

  for (const key of keys) {
    let found = false;
    for (let i = startIdx; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trimEnd();
      if (trimmed === "" || trimmed.startsWith("#")) continue;

      const content = trimmed.trim();
      // Match key: at start of line with possible indent
      const match = content.match(new RegExp(`^${escapeRegex(key)}:$`));
      if (!match) continue;

      const indent = trimmed.length - trimmed.trimStart().length;
      if (indent <= targetIndent && i > startIdx) break;

      startIdx = i + 1;
      targetIndent = indent + 2;
      found = true;
      break;
    }
    if (!found) return [];
  }

  const result = [];
  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimEnd();
    if (trimmed === "") continue;
    const indent = trimmed.length - trimmed.trimStart().length;
    if (indent < targetIndent) break;
    if (trimmed.trim() === "---") break;
    result.push(trimmed);
  }
  return result;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Parse a flat block of key: value lines into an object (handles indented keys).
function yamlFlatMap(lines) {
  const obj = {};
  for (const line of lines) {
    const match = line.match(/^\s*([\w_]+)\s*:\s*(.*\S)?\s*$/);
    if (match) {
      obj[match[1]] = match[2] ?? "";
    }
  }
  return obj;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Decap CMS vendor setup", () => {
  // ── Public directory structure ───────────────────────────────────────

  it("should have a public/admin/ directory", () => {
    const dir = resolve(repoRoot, "public/admin");
    assert.ok(existsSync(dir), "public/admin/ must exist");
  });

  it("should have public/admin/index.html", () => {
    const file = resolve(repoRoot, "public/admin/index.html");
    assert.ok(existsSync(file), "public/admin/index.html must exist");
  });

  it("should not reference any external CDN URLs in index.html", () => {
    const html = readFileSync(resolve(repoRoot, "public/admin/index.html"), "utf-8");
    const hasHttp = /https?:\/\//.test(html);
    assert.ok(!hasHttp, "index.html must not contain any http:// or https:// URLs");
  });

  it("should load decap-cms.js from a relative path using ./decap-cms.js", () => {
    const html = readFileSync(resolve(repoRoot, "public/admin/index.html"), "utf-8");
    assert.ok(
      html.includes('src="./decap-cms.js"'),
      'script tag must use src="./decap-cms.js" (relative, no CDN)',
    );
  });

  // ── package.json ─────────────────────────────────────────────────────

  it("should have decap-cms as a dependency in package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));
    assert.ok(pkg.dependencies, "package.json must have a dependencies field");
    assert.ok(
      pkg.dependencies["decap-cms"],
      "decap-cms must be listed in dependencies",
    );
  });

  it("should pin decap-cms to an exact version", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));
    // Exact, not a range: the CMS is vendored into public/admin at build time,
    // so a floating version would change what ships without changing the repo.
    assert.match(
      pkg.dependencies["decap-cms"],
      /^\d+\.\d+\.\d+$/,
      "decap-cms must be pinned to an exact version, not a range",
    );
  });

  it("should vendor the bundle with the script rather than a list of filenames", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));
    assert.ok(pkg.scripts, "package.json must have a scripts field");
    assert.ok(pkg.scripts.prebuild, "package.json must define a prebuild script");
    // This was three `cp` commands naming the entry, one lazy chunk and the
    // stylesheet. 3.16.0 ships about a hundred chunks with different numbers,
    // so a hand-written list is wrong on the next upgrade and fails silently:
    // a missing lazy chunk only surfaces when an editor opens the widget that
    // needs it. The script derives the list from the installed bundle.
    assert.ok(
      pkg.scripts.prebuild.includes("scripts/vendor-decap.mjs"),
      "prebuild must run scripts/vendor-decap.mjs",
    );
    assert.ok(
      existsSync(resolve(repoRoot, "scripts/vendor-decap.mjs")),
      "scripts/vendor-decap.mjs must exist",
    );
    assert.ok(
      !/\d+\.decap-cms\.js/.test(pkg.scripts.prebuild),
      "prebuild must not name a chunk by number - they change every release",
    );
  });

  // The CMS is styled by emotion, which generates `css-<hash>-<Label>` class
  // names. An override naming the hash breaks on any release that changes the
  // declarations, which is exactly what 3.11 -> 3.16 did. Nothing else catches
  // it: the class names belong to a third party and the CMS is behind a login
  // the a11y run never reaches.
  it("should not couple the contrast override to an emotion hash", () => {
    const html = readFileSync(resolve(repoRoot, "public/admin/index.html"), "utf-8");
    // Only the rules, not the comment above them, which names the old class to
    // explain why it went.
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
    assert.ok(
      styles.includes('[class*="-ButtonText"]'),
      "the contrast override must match the emotion label, not a hashed class",
    );
    assert.ok(
      !/css-[a-z0-9]{5,8}-/.test(styles),
      "index.html must not name a generated emotion class - the hash moves on upgrade",
    );
  });

  // ── .gitignore ───────────────────────────────────────────────────────

  // Everything the vendor script writes has to be ignored, or an upgrade turns
  // into a hundred-file diff. Checking the actual vendored files against the
  // patterns catches the case the old test could not: a new kind of chunk
  // (3.16.0 added .wasm) that nothing in .gitignore covers.
  it("should ignore every file the vendor script writes into public/admin", () => {
    const patterns = readFileSync(resolve(repoRoot, ".gitignore"), "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("public/admin/"))
      .map((l) => new RegExp(`^${l.replace(/[.]/g, "\\.").replace(/\*/g, ".*")}$`));

    const vendored = readdirSync(resolve(repoRoot, "public/admin")).filter(
      (name) =>
        name === "cms.css" ||
        name === "decap-cms.js" ||
        name.endsWith(".wasm") ||
        /^\d+\.decap-cms\.js$/.test(name),
    );

    assert.ok(vendored.length > 0, "public/admin must hold a vendored bundle - run pnpm build");
    for (const name of vendored) {
      assert.ok(
        patterns.some((p) => p.test(`public/admin/${name}`)),
        `.gitignore has no pattern covering public/admin/${name}`,
      );
    }
  });
});

describe("Decap CMS config.yml", () => {
  // ── File existence ─────────────────────────────────────────────────

  it("should have a public/admin/config.yml file", () => {
    assert.ok(existsSync(configPath), "public/admin/config.yml must exist");
  });

  // ── Backend configuration ─────────────────────────────────────────

  it("should use git-gateway backend", () => {
    const lines = yamlSection(getConfig(), "backend");
    const map = yamlFlatMap(lines);
    assert.strictEqual(map.name, "git-gateway");
  });

  it("should set repo to bbcc-glasgow/website", () => {
    const lines = yamlSection(getConfig(), "backend");
    const map = yamlFlatMap(lines);
    assert.strictEqual(map.repo, "bbcc-glasgow/website");
  });

  it("should set branch to main", () => {
    const lines = yamlSection(getConfig(), "backend");
    const map = yamlFlatMap(lines);
    assert.strictEqual(map.branch, "main");
  });

  it("should set auth_type to pkce", () => {
    const lines = yamlSection(getConfig(), "backend");
    const map = yamlFlatMap(lines);
    assert.strictEqual(map.auth_type, "pkce");
  });

  it("should set base_url to https://auth.decapbridge.com", () => {
    const lines = yamlSection(getConfig(), "backend");
    const map = yamlFlatMap(lines);
    assert.strictEqual(map.base_url, "https://auth.decapbridge.com");
  });

  it("should set auth_endpoint with the DecapBridge site ID", () => {
    const lines = yamlSection(getConfig(), "backend");
    const map = yamlFlatMap(lines);
    assert.ok(
      map.auth_endpoint?.includes("648cbae2-8402-4cde-ade9-014199b3e953"),
      "auth_endpoint must contain the DecapBridge site ID",
    );
    assert.ok(
      map.auth_endpoint?.startsWith("/sites/"),
      "auth_endpoint must start with /sites/",
    );
  });

  it("should set auth_token_endpoint with the DecapBridge site ID", () => {
    const lines = yamlSection(getConfig(), "backend");
    const map = yamlFlatMap(lines);
    assert.ok(
      map.auth_token_endpoint?.includes("648cbae2-8402-4cde-ade9-014199b3e953"),
      "auth_token_endpoint must contain the DecapBridge site ID",
    );
    assert.ok(
      map.auth_token_endpoint?.startsWith("/sites/"),
      "auth_token_endpoint must start with /sites/",
    );
  });

  it("should set gateway_url to https://gateway.decapbridge.com", () => {
    const lines = yamlSection(getConfig(), "backend");
    const map = yamlFlatMap(lines);
    assert.strictEqual(map.gateway_url, "https://gateway.decapbridge.com");
  });

  it("should not contain PLACEHOLDER_SITE_ID (site is already registered)", () => {
    const text = getConfig();
    assert.ok(
      !text.includes("PLACEHOLDER_SITE_ID"),
      "config.yml must not contain PLACEHOLDER_SITE_ID after site registration",
    );
  });

  it("should include commit_messages section in backend", () => {
    const text = getConfig();
    const lines = yamlSection(text, "backend");
    const hasCommitMessages = lines.some((l) => l.trim() === "commit_messages:");
    assert.ok(hasCommitMessages, "backend must have a commit_messages section");
  });

  // ── Auth section ─────────────────────────────────────────────────

  it("should have an auth section", () => {
    const lines = yamlSection(getConfig(), "auth");
    assert.ok(lines.length > 0, "config.yml must have an auth section");
  });

  it("should set email_claim in auth section", () => {
    const lines = yamlSection(getConfig(), "auth");
    const map = yamlFlatMap(lines);
    assert.strictEqual(map.email_claim, "email");
  });

  it("should set first_name_claim in auth section", () => {
    const lines = yamlSection(getConfig(), "auth");
    const map = yamlFlatMap(lines);
    assert.strictEqual(map.first_name_claim, "first_name");
  });

  it("should set last_name_claim in auth section", () => {
    const lines = yamlSection(getConfig(), "auth");
    const map = yamlFlatMap(lines);
    assert.strictEqual(map.last_name_claim, "last_name");
  });

  it("should set avatar_url_claim in auth section", () => {
    const lines = yamlSection(getConfig(), "auth");
    const map = yamlFlatMap(lines);
    assert.strictEqual(map.avatar_url_claim, "avatar_url");
  });

  // ── Logo and site URL ────────────────────────────────────────────

  it("should set logo_url to the DecapBridge logo", () => {
    const text = getConfig();
    assert.ok(
      /logo_url:\s*https:\/\/decapbridge\.com\/decapcms-with-bridge\.svg/.test(text),
      "logo_url must point to DecapBridge logo SVG",
    );
  });

  it("should set site_url to https://bbcc.scot", () => {
    const text = getConfig();
    assert.ok(
      /site_url:\s*https:\/\/bbcc\.scot/.test(text),
      "site_url must be https://bbcc.scot",
    );
  });

  // ── Publish mode ──────────────────────────────────────────────────

  it("should set publish_mode to editorial_workflow", () => {
    const text = getConfig();
    assert.ok(
      /publish_mode:\s*editorial_workflow/.test(text),
      "publish_mode must be editorial_workflow",
    );
  });

  // ── Media folders ─────────────────────────────────────────────────

  it("should set media_folder to public/images", () => {
    const text = getConfig();
    assert.ok(
      /media_folder:\s*public\/images/.test(text),
      "media_folder must be set to public/images",
    );
  });

  it("should set public_folder to /images", () => {
    const text = getConfig();
    assert.ok(
      /public_folder:\s*\/images/.test(text),
      "public_folder must be set to /images",
    );
  });

  // ── Collections: projects ─────────────────────────────────────────

  it("should have a projects collection with folder at src/content/projects", () => {
    const text = getConfig();
    // Find the projects collection block
    const projBlock = extractCollectionBlock(text, "projects");
    assert.ok(projBlock, "projects collection must exist in config.yml");

    // Verify folder path
    assert.ok(
      /folder\s*:\s*src\/content\/projects/.test(projBlock),
      "projects collection must set folder to src/content/projects",
    );
    // Verify extension and format
    assert.ok(
      /extension\s*:\s*\.?json/.test(projBlock),
      "projects collection must use .json extension",
    );
    assert.ok(
      /format\s*:\s*json/.test(projBlock),
      "projects collection must use json format",
    );
  });

  it("should have a projects collection with fields matching the variant + ctas schema", () => {
    const text = getConfig();
    const projBlock = extractCollectionBlock(text, "projects");
    assert.ok(projBlock, "projects collection must exist");

    const fieldNames = extractFieldNames(projBlock);
    // All required fields must be present
    const required = ["tag", "variant", "title", "summary", "order", "ctas"];
    for (const field of required) {
      assert.ok(
        fieldNames.includes(field),
        `projects collection must have a '${field}' field`,
      );
    }

    // No extra fields at the collection root level
    const extra = fieldNames.filter((f) => !required.includes(f));
    assert.strictEqual(
      extra.length, 0,
      `projects collection must not have extra fields beyond the schema: ${extra.join(", ")}`,
    );
  });

  it("should replace the free-text colour fields with a variant select", () => {
    const projBlock = extractCollectionBlock(getConfig(), "projects");
    assert.ok(projBlock, "projects collection must exist");

    // No free-text colour fields remain
    assert.ok(!/name\s*:\s*tagColour\b/.test(projBlock), "tagColour must be removed");
    assert.ok(!/name\s*:\s*tagBgColour\b/.test(projBlock), "tagBgColour must be removed");
    assert.ok(!/name\s*:\s*borderColour\b/.test(projBlock), "borderColour must be removed");

    // variant is a select widget with the named options
    const variantField = projBlock.split(/name\s*:\s*variant\b/)[1] ?? "";
    assert.match(variantField, /widget\s*:\s*select/, "variant must use the select widget");
    for (const option of ["teal", "pink", "amber"]) {
      assert.ok(variantField.includes(`"${option}"`), `variant select must offer '${option}'`);
    }
  });

  // ── Collections: site ─────────────────────────────────────────────

  it("should have a site collection with file at src/content/site/index.json", () => {
    const text = getConfig();
    const siteBlock = extractCollectionBlock(text, "site");
    assert.ok(siteBlock, "site collection must exist in config.yml");

    // Verify it contains a file entry pointing to index.json
    assert.ok(
      /file\s*:\s*src\/content\/site\/index\.json/.test(siteBlock),
      "site collection must reference src/content/site/index.json",
    );
  });

  it("should have a site collection whose fields match the content schema", () => {
    const text = getConfig();
    const siteBlock = extractCollectionBlock(text, "site");
    assert.ok(siteBlock, "site collection must exist");

    // Extract top-level field names from the file entry's fields section.
    // Strategy: find the `fields:` line inside the file entry (after `- file:`),
    // then collect `name:` values from subsequent lines at indent >= file-entry fields indent + 2,
    // stopping when we encounter a line at the same indent as `fields:` itself.
    //
    // The list below is the site collection's root schema in
    // src/content.config.ts. Anything editable in the CMS must be in the
    // schema and vice versa, so an editor can never be shown a field the
    // build ignores, and a fact the page needs is never uneditable.
    const siteFields = extractSiteFieldNames(siteBlock);
    const required = [
      "stats",
      "boundaryDescription",
      "contactEmail",
      // Civic fact set (#37) - drives the visible prose, the JSON-LD and llms.txt
      "legalName",
      "description",
      "venue",
      "meetingCalendar",
      "meetingDetails",
      "areaPartnership",
      "officeBearers",
      "socialProfiles",
      "predecessorSite",
    ];

    for (const field of required) {
      assert.ok(
        siteFields.includes(field),
        `site collection must have a '${field}' field`,
      );
    }

    const extra = siteFields.filter((f) => !required.includes(f));
    assert.strictEqual(
      extra.length, 0,
      `site collection must not have fields absent from the content schema: ${extra.join(", ")}`,
    );
  });

  it("should label the site collection Site Settings", () => {
    const text = getConfig();
    const siteBlock = extractCollectionBlock(text, "site");
    assert.ok(siteBlock, "site collection must exist");
    assert.match(
      siteBlock,
      /label\s*:\s*Site Settings/,
      "site collection must be labelled Site Settings",
    );
  });

  // ── Collections: pages ─────────────────────────────────────────────

  it("should have a pages collection with file at src/content/pages/index.json", () => {
    const text = getConfig();
    const pagesBlock = extractCollectionBlock(text, "pages");
    assert.ok(pagesBlock, "pages collection must exist in config.yml");
    assert.ok(
      /file\s*:\s*src\/content\/pages\/index\.json/.test(pagesBlock),
      "pages collection must reference src/content/pages/index.json",
    );
  });

  it("should have a Homepage entry with one object per section in page order", () => {
    const pagesBlock = extractCollectionBlock(getConfig(), "pages");
    assert.ok(pagesBlock, "pages collection must exist");

    const sectionNames = extractSiteFieldNames(pagesBlock);
    assert.deepStrictEqual(sectionNames, [
      "hero",
      "ourArea",
      "ourProjects",
      "jag",
      "getInvolved",
      "meetings",
      "newsletter",
      "instagram",
    ]);
  });

  it("should define each section as a collapsible object widget", () => {
    const pagesBlock = extractCollectionBlock(getConfig(), "pages");
    assert.ok(pagesBlock, "pages collection must exist");

    const sections = ["hero", "ourArea", "ourProjects", "jag", "getInvolved", "meetings", "newsletter", "instagram"];
    for (const section of sections) {
      const afterName = pagesBlock.split(new RegExp(`name\\s*:\\s*${section}\\b`))[1] ?? "";
      assert.match(
        afterName,
        /widget\s*:\s*object/,
        `${section} must be defined as an object widget`,
      );
      assert.match(
        afterName,
        /collapsed\s*:\s*true/,
        `${section} must be a collapsible (collapsed) object widget`,
      );
    }
  });

  it("should not model meeting event data fields in the meetings section", () => {
    const pagesBlock = extractCollectionBlock(getConfig(), "pages");
    assert.ok(pagesBlock, "pages collection must exist");

    const meetingsSection = pagesBlock.split(/name\s*:\s*meetings\b/)[1] ?? "";
    assert.ok(
      !/name\s*:\s*date\b/.test(meetingsSection),
      "meetings must not expose a date field (events come from Google Calendar later)",
    );
    assert.ok(
      !/name\s*:\s*time\b/.test(meetingsSection),
      "meetings must not expose a time field",
    );
    assert.ok(
      !/name\s*:\s*location\b/.test(meetingsSection),
      "meetings must not expose a location field",
    );
  });

  it("should have a Holding Page file entry at src/content/pages/holding.json", () => {
    const text = getConfig();
    const pagesBlock = extractCollectionBlock(text, "pages");
    assert.ok(pagesBlock, "pages collection must exist");
    assert.ok(
      /file\s*:\s*src\/content\/pages\/holding\.json/.test(pagesBlock),
      "pages collection must reference src/content/pages/holding.json",
    );
  });

  it("should label the Homepage and Holding Page file entries in the pages collection", () => {
    const pagesBlock = extractCollectionBlock(getConfig(), "pages");
    assert.ok(pagesBlock, "pages collection must exist");
    assert.match(
      pagesBlock,
      /label\s*:\s*Homepage/,
      "pages collection must label the Homepage file entry",
    );
    assert.match(
      pagesBlock,
      /label\s*:\s*Holding Page/,
      "pages collection must label the Holding Page file entry",
    );
  });

  it("should give the Holding Page file entry exactly the holding page fields", () => {
    const pagesBlock = extractCollectionBlock(getConfig(), "pages");
    assert.ok(pagesBlock, "pages collection must exist");
    const holdingFields = extractFileEntryFields(
      pagesBlock,
      "src/content/pages/holding.json",
    );
    assert.deepStrictEqual(
      holdingFields,
      ["eyebrow", "heading", "body", "ctas"],
    );
  });

  // ── Instagram section ──────────────────────────────────────────────

  it("should define an instagram section on the Homepage entry", () => {
    const pagesBlock = extractCollectionBlock(getConfig(), "pages");
    assert.ok(pagesBlock, "pages collection must exist");
    assert.ok(
      /name\s*:\s*instagram\b/.test(pagesBlock),
      "pages collection must define an instagram section",
    );
  });

  it("should give the instagram section exactly its four fields", () => {
    const pagesBlock = extractCollectionBlock(getConfig(), "pages");
    assert.ok(pagesBlock, "pages collection must exist");

    const instagramSection =
      pagesBlock.split(/name\s*:\s*instagram\b/)[1] ?? "";
    assert.match(
      instagramSection,
      /widget\s*:\s*object/,
      "instagram must be defined as an object widget",
    );
    assert.match(
      instagramSection,
      /collapsed\s*:\s*true/,
      "instagram must be a collapsible (collapsed) object widget",
    );

    const fields = extractFieldNames(instagramSection);
    assert.deepStrictEqual(fields, ["eyebrow", "heading", "body", "ctas"]);
  });

  it("should give every instagram copy field a string-type widget", () => {
    const pagesBlock = extractCollectionBlock(getConfig(), "pages");
    assert.ok(pagesBlock, "pages collection must exist");

    const instagramSection =
      pagesBlock.split(/name\s*:\s*instagram\b/)[1] ?? "";
    for (const field of ["eyebrow", "heading", "body"]) {
      const fieldBlock =
        instagramSection.split(
          new RegExp(`name\\s*:\\s*${field}\\b`),
        )[1] ?? "";
      assert.match(
        fieldBlock,
        /widget\s*:\s*(string|text)\b/,
        `instagram.${field} must use a string or text widget`,
      );
    }
  });

  it("must not expose feed data (posts.json, images) in the instagram section", () => {
    const pagesBlock = extractCollectionBlock(getConfig(), "pages");
    assert.ok(pagesBlock, "pages collection must exist");

    const instagramSection =
      pagesBlock.split(/name\s*:\s*instagram\b/)[1] ?? "";
    assert.ok(
      !/posts\.json/.test(instagramSection),
      "instagram section must not reference posts.json feed data",
    );
    assert.ok(
      !/feed/i.test(instagramSection),
      "instagram section must not expose a feed widget or feed data",
    );
    // media_folder appears inside the CTA block, where it names where an
    // uploaded document goes. What must not appear is the photo feed: the
    // tiles come from the fetch workflow, not from an editor.
    assert.ok(
      !/assets\/instagram|public\/images/.test(instagramSection),
      "instagram section must not reference the feed's images",
    );
  });
});

// ── Call-to-action buttons ────────────────────────────────────────────────
//
// Eight sections offer CTA buttons, and the config spells the block out eight
// times rather than aliasing it, so that the CMS shows an editor the same eight
// choices wherever they are. Nothing but a test keeps those copies identical,
// and nothing but a test keeps them in step with src/lib/cta.ts, which is what
// actually validates the content they produce.

describe("Decap CMS call-to-action fields", () => {
  /** Every `- name: ctas` block in the config, with its own indented body. */
  function ctaBlocks(text: string): string[] {
    const lines = text.split("\n");
    const blocks: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(\s*)- name:\s*ctas\s*$/);
      if (!match) continue;

      const indent = match[1].length;
      const body = [lines[i]];
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim() === "") {
          body.push(line);
          continue;
        }
        if (line.length - line.trimStart().length <= indent) break;
        body.push(line);
      }
      blocks.push(body.join("\n"));
    }
    return blocks;
  }

  /** The body of one variable type inside a ctas block. */
  function typeBlock(block: string, name: string): string {
    const lines = block.split("\n");
    const start = lines.findIndex((l) => new RegExp(`^\\s*- name:\\s*${name}\\s*$`).test(l));
    if (start === -1) return "";
    const indent = lines[start].length - lines[start].trimStart().length;
    const body = [lines[start]];
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim() === "") continue;
      if (lines[i].length - lines[i].trimStart().length <= indent) break;
      body.push(lines[i]);
    }
    return body.join("\n");
  }

  it("should offer a ctas list in every section that renders buttons", () => {
    // hero, ourProjects.ideaCard, getInvolved cards, meetings, newsletter,
    // instagram, the holding page, and project cards.
    assert.strictEqual(ctaBlocks(getConfig()).length, 8);
  });

  it("should make every ctas field a variable-type list", () => {
    for (const block of ctaBlocks(getConfig())) {
      assert.match(block, /widget:\s*list/, "ctas must use the list widget");
      assert.match(block, /^\s*types:\s*$/m, "ctas must offer variable types, not fixed fields");
      assert.ok(
        !/^\s*fields:\s*$/m.test(block.split(/^\s*types:\s*$/m)[0]),
        "a ctas list must not carry its own fields alongside its types",
      );
    }
  });

  it("should offer exactly the four types the content schema accepts", () => {
    for (const block of ctaBlocks(getConfig())) {
      const types = [...block.matchAll(/^\s*- name:\s*(\w+)\s*$/gm)]
        .map((m) => m[1])
        .filter((name) => name !== "ctas" && name !== "file");
      assert.deepStrictEqual(
        types,
        [...CTA_TYPES],
        "every ctas list must offer the same four types, in the same order",
      );
    }
  });

  it("should give each type only the fields its own shape needs", () => {
    const expected = {
      link: ["label", "url", "newTab", "icon"],
      document: ["label", "file", "newTab", "icon"],
      contact: ["label", "subject", "newTab", "icon"],
      social: ["label", "platform", "newTab", "icon"],
    };

    for (const block of ctaBlocks(getConfig())) {
      for (const [type, fields] of Object.entries(expected)) {
        const body = typeBlock(block, type);
        assert.ok(body, `every ctas list must offer the '${type}' type`);
        const names = [...body.matchAll(/name:\s*([A-Za-z]+)/g)]
          .map((m) => m[1])
          .filter((name) => name !== type);
        assert.deepStrictEqual(names, fields, `the '${type}' type's fields`);
      }
    }
  });

  it("should send an uploaded document to public/documents and link it as /documents", () => {
    for (const block of ctaBlocks(getConfig())) {
      const file = typeBlock(block, "document");
      assert.match(file, /widget:\s*file/, "a document cta must use the file widget");
      assert.match(
        file,
        /media_folder:\s*\/public\/documents/,
        "uploads must land in public/documents, not the image library",
      );
      assert.match(
        file,
        /public_folder:\s*\/documents/,
        "the stored path must be the one the browser asks for",
      );
    }
  });

  it("should let an editor choose whether any button opens a new tab", () => {
    for (const block of ctaBlocks(getConfig())) {
      const toggles = [...block.matchAll(/name:\s*newTab[^}]*\}/g)].map((m) => m[0]);
      assert.strictEqual(toggles.length, CTA_TYPES.length, "one toggle per type");
      for (const toggle of toggles) {
        assert.match(toggle, /widget:\s*boolean/);
        assert.match(toggle, /required:\s*false/);
        assert.match(toggle, /default:\s*(true|false)/, "the toggle must show its default");
      }
    }
  });

  it("should restrict the icon choice to the set the renderer has artwork for", () => {
    for (const block of ctaBlocks(getConfig())) {
      const icons = [...block.matchAll(/name:\s*icon[^}]*\}/g)].map((m) => m[0]);
      assert.strictEqual(icons.length, CTA_TYPES.length, "one icon select per type");
      for (const icon of icons) {
        assert.match(icon, /widget:\s*select/, "icon must use the select widget");
        for (const option of CTA_ICONS) {
          assert.ok(icon.includes(`"${option}"`), `icon select must offer '${option}'`);
        }
        const offered = [...icon.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
        assert.deepStrictEqual(offered, [...CTA_ICONS], "no icon the renderer cannot draw");
      }
    }
  });

  it("should restrict a social button to the platforms the site has profiles for", () => {
    for (const block of ctaBlocks(getConfig())) {
      const platform = typeBlock(block, "social").match(/name:\s*platform[^}]*\}/)?.[0] ?? "";
      assert.match(platform, /widget:\s*select/);
      const offered = [...platform.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
      assert.deepStrictEqual(offered, [...SOCIAL_PLATFORMS]);
    }
  });

  // The contact address and the profile URLs are facts in the site collection.
  // If the CMS offers an address box beside them, an editor will eventually
  // fill it in, and then there are two answers to the same question.
  it("should give an editor nowhere to retype the contact address", () => {
    for (const block of ctaBlocks(getConfig())) {
      const contact = typeBlock(block, "contact");
      assert.ok(!/name:\s*(url|email|address)\b/.test(contact));
      const social = typeBlock(block, "social");
      assert.ok(!/name:\s*url\b/.test(social));
    }
  });
});

// ── Helper functions ──────────────────────────────────────────────────────

function getConfig() {
  return readFileSync(configPath, "utf-8");
}

/**
 * Find all collection blocks under `collections:`, keyed by their name.
 * Each block includes the `- name: <name>` line and all its children.
 */
function allCollectionBlocks(text) {
  const lines = text.split("\n");
  const collections = {};
  let inCollections = false;
  let collIndent = -1;
  let currentName = null;
  let currentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimEnd();

    if (!inCollections) {
      if (trimmed.trim() === "collections:" && /^\s*collections:$/.test(trimmed)) {
        inCollections = true;
        collIndent = trimmed.length - trimmed.trimStart().length + 2;
      }
      continue;
    }

    const indent = trimmed.length - trimmed.trimStart().length;
    // Skip blank and comment-only lines
    if (trimmed === "" || trimmed.trimStart().startsWith("#")) continue;
    if (indent < collIndent) break; // out of collections section

    const content = trimmed.trim();

    // Only detect `- name:` at the collections root indent level (collIndent).
    // Deeper `- name:` entries (e.g., fields inside a collection) are
    // NOT new collections.
    if (indent === collIndent && content.startsWith("- name: ")) {
      // Save the previous collection block
      if (currentName) {
        collections[currentName] = lines.slice(currentStart, i).join("\n");
      }
      currentName = content.slice(8).trim();
      currentStart = i;
    }
  }

  // Save the last collection block
  if (currentName && currentStart >= 0) {
    collections[currentName] = lines.slice(currentStart).join("\n");
    // Truncate trailing lines that belong to a new top-level YAML key
    const linesArr = collections[currentName].split("\n");
    const result = [];
    for (const l of linesArr) {
      const trimmedLine = l.trimEnd();
      const indent = trimmedLine.length - trimmedLine.trimStart().length;
      if (indent < collIndent && trimmedLine !== "" && !trimmedLine.trimStart().startsWith("#")) {
        if (trimmedLine.trim().includes(":")) break;
      }
      result.push(l);
    }
    collections[currentName] = result.join("\n");
  }

  return collections;
}

function extractCollectionBlock(text, collectionName) {
  const all = allCollectionBlocks(text);
  return all[collectionName] || null;
}

/**
 * Extract field names from a collection block.
 * Handles both inline format `- { name: foo, ... }` and
 * multi-line format `- name: foo`.
 */
function extractFieldNames(collectionBlock) {
  const lines = collectionBlock.split("\n");
  const fields = [];

  let inFields = false;
  let fieldsIndent = -1;
  let currentItem = null;

  for (const raw of lines) {
    const trimmed = raw.trimEnd();
    if (!inFields) {
      if (trimmed.trim() === "fields:" && /^\s*fields:$/.test(trimmed)) {
        inFields = true;
        fieldsIndent = trimmed.length - trimmed.trimStart().length + 2;
      }
      continue;
    }

    const indent = trimmed.length - trimmed.trimStart().length;
    if (indent < fieldsIndent) {
      // Check if this is a new nested section (like a list field's sub-fields)
      // Only stop if we're back to collection-level indent
      if (indent < fieldsIndent - 2) break;
      continue; // still in fields at same level
    }

    // Skip deeper-indented items (sub-fields of a list widget such as ctas),
    // so only the collection's own root-level fields are collected.
    if (indent > fieldsIndent) continue;

    // Inline format: `- { name: foo, ... }`
    const inlineMatch = trimmed.match(/-\s*\{\s*name\s*:\s*([^,}\s]+)/);
    if (inlineMatch) {
      fields.push(inlineMatch[1]);
      continue;
    }

    // Multi-line format: `- name: foo`
    const multiMatch = trimmed.match(/-\s*name\s*:\s*(.+)/);
    if (multiMatch) {
      fields.push(multiMatch[1].trim());
    }
  }

  return fields;
}

/**
 * Extract top-level field names from the site collection's file entry.
 *
 * In the site block, the structure is:
 *   - name: site
 *     ... (indent +2)
 *     files:
 *       - file: ...index.json
 *         name: index
 *         label: ...
 *         fields:                <-- THE fields we want
 *           - name: stats       <-- top-level field
 *             ...
 *             fields:            <-- stats' sub-fields (skip)
 *               - { name: ...}
 *           - { name: boundaryDescription, ... }  <-- top-level field
 *           - { name: contactEmail, ... }          <-- top-level field
 *
 * We look for the `fields:` key that appears AFTER the `- file:` line
 * and collect `name:` values from list items at the same indent level.
 */
function extractSiteFieldNames(siteBlock) {
  const lines = siteBlock.split("\n");

  // Phase 1: Find the `- file:` line and determine the indent of the file entry
  const fileLine = lines.find((l) => l.trim().startsWith("- file:"));
  if (!fileLine) return [];

  const fileEntryIndent = fileLine.length - fileLine.trimStart().length;

  // The file entry's children (name, label, fields) are at fileEntryIndent + 2
  // But we can find "fields:" by scanning, then use its indent as reference
  let fieldsLine = null;
  let fieldsIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();
    // Match "fields:" (but not deeper indented ones; fields at fileEntryIndent+2)
    if (/^\s*fields:$/.test(trimmed)) {
      const indent = trimmed.length - trimmed.trimStart().length;
      // The file-entry fields should be at fileEntryIndent + 2
      if (indent === fileEntryIndent + 2) {
        fieldsLine = trimmed;
        fieldsIdx = i;
        break;
      }
    }
  }
  if (!fieldsLine || fieldsIdx < 0) return [];

  const fieldsIndent = fieldsLine.length - fieldsLine.trimStart().length + 2;

  // Phase 2: Parse lines after `fields:` to collect field names
  const result = [];
  for (let i = fieldsIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();
    const indent = trimmed.length - trimmed.trimStart().length;

    // Past the file entry? Check if indent falls back to file entry level
    if (indent < fieldsIndent) break;

    // Skip deeper indented items (sub-fields of list widgets)
    if (indent > fieldsIndent) continue;

    // Inline format: `- { name: foo, ... }`
    const inlineMatch = trimmed.match(/^\s*-\s*\{\s*name\s*:\s*([^,}\s]+)/);
    if (inlineMatch) {
      result.push(inlineMatch[1]);
      continue;
    }

    // Multi-line format: `- name: foo`
    const multiMatch = trimmed.match(/^\s*-\s*name\s*:\s*(.+)/);
    if (multiMatch) {
      result.push(multiMatch[1].trim());
    }
  }

  return result;
}

/**
 * Extract the top-level field names from a specific file entry within a
 * files collection block, identified by its `- file:` path. Used to verify
 * each file entry in the pages collection (Homepage, Holding Page) exposes
 * exactly the fields its content file requires.
 */
function extractFileEntryFields(collectionBlock, filePath) {
  const lines = collectionBlock.split("\n");

  const fileLineIdx = lines.findIndex(
    (l) => l.trim() === `- file: ${filePath}`,
  );
  if (fileLineIdx < 0) return [];
  const fileLine = lines[fileLineIdx];

  const fileEntryIndent = fileLine.length - fileLine.trimStart().length;

  // Search for the file entry's own `fields:` key only after its `- file:` line,
  // so an earlier file entry's fields are never picked up.
  let fieldsLine = null;
  let fieldsIdx = -1;
  for (let i = fileLineIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();
    if (/^\s*fields:$/.test(trimmed)) {
      const indent = trimmed.length - trimmed.trimStart().length;
      if (indent === fileEntryIndent + 2) {
        fieldsLine = trimmed;
        fieldsIdx = i;
        break;
      }
    }
  }
  if (!fieldsLine || fieldsIdx < 0) return [];

  const fieldsIndent = fieldsLine.length - fieldsLine.trimStart().length + 2;

  const result = [];
  for (let i = fieldsIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();
    const indent = trimmed.length - trimmed.trimStart().length;
    if (indent < fieldsIndent) break;
    if (indent > fieldsIndent) continue;

    const inlineMatch = trimmed.match(/^\s*-\s*\{\s*name\s*:\s*([^,}\s]+)/);
    if (inlineMatch) {
      result.push(inlineMatch[1]);
      continue;
    }

    const multiMatch = trimmed.match(/^\s*-\s*name\s*:\s*(.+)/);
    if (multiMatch) {
      result.push(multiMatch[1].trim());
    }
  }

  return result;
}
