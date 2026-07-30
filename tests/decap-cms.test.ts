import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
    // The script tag must only use a local relative path, never an absolute https:// URL
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
