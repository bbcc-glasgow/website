import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

  it("should have decap-cms-app as a dependency in package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));
    assert.ok(pkg.dependencies, "package.json must have a dependencies field");
    assert.ok(
      pkg.dependencies["decap-cms-app"],
      "decap-cms-app must be listed in dependencies",
    );
  });

  it("should pin decap-cms-app at version 3.11.0", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));
    assert.strictEqual(
      pkg.dependencies["decap-cms-app"],
      "3.11.0",
      "decap-cms-app must be pinned at 3.11.0",
    );
  });

  it("should have a prebuild script in package.json that vendors decap-cms.js", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));
    assert.ok(pkg.scripts, "package.json must have a scripts field");
    assert.ok(pkg.scripts.prebuild, "package.json must define a prebuild script");
    assert.ok(
      pkg.scripts.prebuild.includes("decap-cms.js"),
      "prebuild script must reference decap-cms.js",
    );
    assert.ok(
      pkg.scripts.prebuild.startsWith("cp "),
      "prebuild script must use cp to copy the pre-built bundle",
    );
    assert.ok(
      pkg.scripts.prebuild.includes("node_modules/decap-cms-app/dist/decap-cms-app.js"),
      "prebuild script must copy from the npm package dist",
    );
    assert.ok(
      pkg.scripts.prebuild.includes("public/admin/decap-cms.js"),
      "prebuild script must output to public/admin/decap-cms.js",
    );
  });

  // ── .gitignore ───────────────────────────────────────────────────────

  it("should have public/admin/decap-cms.js listed in .gitignore", () => {
    const gitignore = readFileSync(resolve(repoRoot, ".gitignore"), "utf-8");
    const lines = gitignore.split("\n").map((l) => l.trim());
    assert.ok(
      lines.some((l) => l === "public/admin/decap-cms.js"),
      ".gitignore must contain 'public/admin/decap-cms.js'",
    );
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

  it("should set identity_url with PLACEHOLDER_SITE_ID", () => {
    const text = getConfig();
    const lines = yamlSection(text, "backend");
    const map = yamlFlatMap(lines);
    assert.ok(
      map.identity_url?.includes("PLACEHOLDER_SITE_ID"),
      "identity_url must contain PLACEHOLDER_SITE_ID",
    );
    assert.ok(
      map.identity_url?.startsWith("https://auth.decapbridge.com/sites/"),
      "identity_url must start with https://auth.decapbridge.com/sites/",
    );
  });

  it("should set gateway_url to https://gateway.decapbridge.com", () => {
    const lines = yamlSection(getConfig(), "backend");
    const map = yamlFlatMap(lines);
    assert.strictEqual(map.gateway_url, "https://gateway.decapbridge.com");
  });

  it("should have a comment explaining the PLACEHOLDER_SITE_ID substitution", () => {
    const text = getConfig();
    const lines = text.split("\n");
    const hasComment = lines.some(
      (l) => l.trim().startsWith("#") && l.includes("PLACEHOLDER_SITE_ID"),
    );
    const hasPlaceholder = text.includes("PLACEHOLDER_SITE_ID");
    assert.ok(hasPlaceholder, "config.yml must contain PLACEHOLDER_SITE_ID");
    assert.ok(
      hasComment,
      "config.yml must have at least one comment line mentioning PLACEHOLDER_SITE_ID",
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

  it("should have a projects collection with fields matching the #4 schema", () => {
    const text = getConfig();
    const projBlock = extractCollectionBlock(text, "projects");
    assert.ok(projBlock, "projects collection must exist");

    const fieldNames = extractFieldNames(projBlock);
    // All required fields from #4 schema must be present
    const required = ["tag", "tagColour", "tagBgColour", "borderColour", "title", "summary", "details", "order"];
    for (const field of required) {
      assert.ok(
        fieldNames.includes(field),
        `projects collection must have a '${field}' field`,
      );
    }

    // No extra fields beyond #4 schema at the collection root level
    const extra = fieldNames.filter((f) => !required.includes(f));
    assert.strictEqual(
      extra.length, 0,
      `projects collection must not have extra fields beyond #4 schema: ${extra.join(", ")}`,
    );
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

  it("should have a site collection with fields matching the #4 schema", () => {
    const text = getConfig();
    const siteBlock = extractCollectionBlock(text, "site");
    assert.ok(siteBlock, "site collection must exist");

    // Extract top-level field names from the file entry's fields section.
    // Strategy: find the `fields:` line inside the file entry (after `- file:`),
    // then collect `name:` values from subsequent lines at indent >= file-entry fields indent + 2,
    // stopping when we encounter a line at the same indent as `fields:` itself.
    const siteFields = extractSiteFieldNames(siteBlock);
    const required = ["stats", "boundaryDescription", "contactEmail"];

    for (const field of required) {
      assert.ok(
        siteFields.includes(field),
        `site collection must have a '${field}' field`,
      );
    }

    // No extra root-level fields beyond #4 schema
    const extra = siteFields.filter((f) => !required.includes(f));
    assert.strictEqual(
      extra.length, 0,
      `site collection must not have extra fields beyond #4 schema: ${extra.join(", ")}`,
    );
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
