import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const indexPath = path.resolve(rootDir, "dist", "index.html");
const astroPath = path.resolve(rootDir, "src", "pages", "index.astro");
const cssPath = path.resolve(rootDir, "src", "styles", "global.css");
const assetsDir = path.resolve(rootDir, "src", "assets");

// Image files that were referenced ONLY by the removed gallery section.
// central-aerial.jpg (hero) and blythswood-square.jpg (Our Area) are shared
// and must be kept; squinty-bridge.jpg was already unused and is untouched.
const galleryOnlyAssets = [
  "bagpiper.jpg",
  "clyde-bridge.jpg",
  "people-make-glasgow.jpg",
  "rainy-street.jpg",
  "rooftops.jpg",
];
const sharedAssets = ["central-aerial.jpg", "blythswood-square.jpg"];

function readHomepageHtml() {
  assert.ok(
    fs.existsSync(indexPath),
    `${indexPath} not found - run 'pnpm build' first`,
  );
  return fs.readFileSync(indexPath, "utf-8");
}

describe("Gallery section removed from homepage (#41)", () => {
  // ── Rendered homepage ──────────────────────────────────────────────

  it("should not render a #gallery section", () => {
    const html = readHomepageHtml();
    assert.ok(!html.includes('id="gallery"'), "homepage must not have a #gallery section");
    assert.ok(!html.includes("The City We Call Home"), "gallery heading must be gone");
    assert.ok(!html.includes("gallery-grid"), "gallery grid must be gone");
    assert.ok(!html.includes("gallery-item"), "gallery items must be gone");
  });

  it("should flow directly from the projects section to the JAG section", () => {
    const html = readHomepageHtml();
    const projectsIdx = html.indexOf('id="our-projects"');
    const jagIdx = html.indexOf('id="jag"');
    assert.ok(projectsIdx !== -1, "projects section must still exist");
    assert.ok(jagIdx !== -1, "JAG section must still exist");
    assert.ok(
      projectsIdx < jagIdx,
      "projects section must precede the JAG section",
    );
    const between = html.slice(projectsIdx, jagIdx);
    assert.ok(
      !between.includes("gallery"),
      "no gallery content may sit between the projects and JAG sections",
    );
  });

  // ── Source imports and markup ──────────────────────────────────────

  it("should no longer import the gallery-only images in index.astro", () => {
    const astro = fs.readFileSync(astroPath, "utf-8");
    for (const file of galleryOnlyAssets) {
      assert.ok(
        !astro.includes(file),
        `index.astro must not import ${file}`,
      );
    }
    assert.ok(
      !astro.includes("gallerySizes"),
      "index.astro must not define gallerySizes",
    );
    assert.ok(
      !astro.includes('id="gallery"'),
      "index.astro must not contain the gallery section markup",
    );
  });

  // ── Asset files ────────────────────────────────────────────────────

  it("should delete gallery-only image assets but keep shared ones", () => {
    for (const file of galleryOnlyAssets) {
      assert.ok(
        !fs.existsSync(path.join(assetsDir, file)),
        `${file} should have been removed from src/assets`,
      );
    }
    for (const file of sharedAssets) {
      assert.ok(
        fs.existsSync(path.join(assetsDir, file)),
        `${file} is still used elsewhere and must remain in src/assets`,
      );
    }
  });

  // ── Gallery-specific CSS ───────────────────────────────────────────

  it("should leave no unused gallery-specific CSS in global.css", () => {
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.ok(!css.includes("#gallery"), "global.css must not define #gallery");
    assert.ok(!css.includes(".gallery-grid"), "global.css must not define .gallery-grid");
    assert.ok(!css.includes(".gallery-item"), "global.css must not define .gallery-item");
    assert.ok(!css.includes("pink-frame"), "global.css must not define .pink-frame");
    assert.ok(!css.includes("teal-frame"), "global.css must not define .teal-frame");
  });
});
