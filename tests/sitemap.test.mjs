import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// ── Admin index.html noindex meta tag ─────────────────────────────────

describe("public/admin/index.html - robots meta tag", () => {
  const adminHtmlPath = path.resolve(rootDir, "public", "admin", "index.html");

  it("should contain a noindex robots meta tag in the head", () => {
    const html = fs.readFileSync(adminHtmlPath, "utf-8");
    const match = html.match(
      /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']\s*\/?>/i,
    );
    assert.ok(
      match,
      `Expected <meta name="robots" content="...noindex..."> in ${adminHtmlPath}`,
    );
  });

  it("should not contain a standalone 'index' value in the robots meta tag", () => {
    const html = fs.readFileSync(adminHtmlPath, "utf-8");
    // Match when "index" appears as a whole word, not as part of "noindex"
    const match = html.match(
      /<meta\s+name=["']robots["']\s+content=["'][^"']*(?<!\w)index(?!\w)[^"']*["']\s*\/?>/i,
    );
    assert.ok(
      !match,
      `Unexpected robots meta tag allowing indexing in ${adminHtmlPath}`,
    );
  });
});

// ── Sitemap exclusion of /admin ────────────────────────────────────────

describe("Sitemap - /admin exclusion", () => {
  const distDir = path.resolve(rootDir, "dist");

  it("sitemap-index.xml should exist after build", () => {
    const sitemapIndex = path.resolve(distDir, "sitemap-index.xml");
    assert.ok(
      fs.existsSync(sitemapIndex),
      `${sitemapIndex} not found - run 'pnpm build' first`,
    );
  });

  it("sitemap-0.xml should exist after build", () => {
    const sitemap0 = path.resolve(distDir, "sitemap-0.xml");
    assert.ok(
      fs.existsSync(sitemap0),
      `${sitemap0} not found - run 'pnpm build' first`,
    );
  });

  it("should list no URL starting with /admin in sitemap-0.xml", () => {
    const xml = fs.readFileSync(
      path.resolve(distDir, "sitemap-0.xml"),
      "utf-8",
    );
    const adminUrls = xml.match(/<loc>[^<]*\/admin[^<]*<\/loc>/gi);
    assert.ok(
      !adminUrls || adminUrls.length === 0,
      adminUrls
        ? `Found /admin URLs in sitemap: ${adminUrls.join(", ")}`
        : "Expected no /admin URLs in sitemap",
    );
  });

  it("should list no URL starting with /admin in sitemap-index.xml", () => {
    const xml = fs.readFileSync(
      path.resolve(distDir, "sitemap-index.xml"),
      "utf-8",
    );
    const adminUrls = xml.match(/<loc>[^<]*\/admin[^<]*<\/loc>/gi);
    assert.ok(
      !adminUrls || adminUrls.length === 0,
      adminUrls
        ? `Found /admin URLs in sitemap index: ${adminUrls.join(", ")}`
        : "Expected no /admin URLs in sitemap index",
    );
  });
});
