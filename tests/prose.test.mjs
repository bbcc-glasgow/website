// Paragraphs in CMS prose fields.
//
// Every prose field in Decap is a `text` widget, and a text widget is a plain
// textarea: it keeps the newlines an editor types. Until src/lib/prose.ts
// nothing downstream did anything with them, so a field printed straight into
// one `<p>` collapsed a blank line to a space and turned two paragraphs into a
// run-on. Nothing failed and nothing showed it in the CMS, which is why the one
// place anyone noticed grew a second field (Body Paragraph 1 / 2) instead.
//
// Two things are tested, and they cover different failures. The unit tests pin
// what counts as a paragraph break, because the rule is a judgement call about
// what an editor means by a newline. The source test pins that render sites
// actually go through the component, because the old markup still works, still
// looks right in review, and silently loses paragraphs.

import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paragraphs } from "../src/lib/prose.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

describe("paragraphs()", () => {
  it("returns a single-paragraph field unchanged", () => {
    const text = "Community Councils only work when the community shows up.";
    assert.deepEqual(paragraphs(text), [text]);
  });

  it("splits on a blank line", () => {
    assert.deepEqual(paragraphs("First para.\n\nSecond para."), [
      "First para.",
      "Second para.",
    ]);
  });

  it("keeps a single newline inside its paragraph", () => {
    // An editor wrapping a line in the textarea means nothing by it, and HTML
    // collapses the newline to a space, which is what they see and expect.
    assert.deepEqual(paragraphs("A sentence\nwrapped by the editor."), [
      "A sentence\nwrapped by the editor.",
    ]);
  });

  it("treats several blank lines as one break", () => {
    // Two blank lines and three look identical in a textarea, so they cannot
    // mean different things.
    assert.deepEqual(paragraphs("First.\n\n\n\nSecond."), ["First.", "Second."]);
  });

  it("ignores whitespace left on an otherwise blank line", () => {
    assert.deepEqual(paragraphs("First.\n   \nSecond."), ["First.", "Second."]);
  });

  it("handles Windows line endings", () => {
    // Decap posts what the browser submits, and a textarea in a form normalises
    // to CRLF. Nothing in the pipeline promises to strip it.
    assert.deepEqual(paragraphs("First.\r\n\r\nSecond."), ["First.", "Second."]);
  });

  it("drops leading, trailing and empty content", () => {
    assert.deepEqual(paragraphs("\n\n  First.  \n\n\n"), ["First."]);
    assert.deepEqual(paragraphs(""), []);
    assert.deepEqual(paragraphs("\n \n"), []);
  });
});

describe("prose render sites", () => {
  // A `<p>` whose entire content is one `{...body}` or `{...summary}`
  // expression is the markup this component replaces: it prints a CMS prose
  // field as a block, and a blank line in that field disappears. Fields
  // composed into a sentence alongside other text are a different thing and do
  // not match, which is deliberate: `boundaryDescription`, `accessNote` and
  // `attendanceNote` are used mid-sentence and must stay single-valued.
  const SINGLE_EXPRESSION_PARAGRAPH = /<p\b[^>]*>\s*\{[^{}]*\b(?:body|summary)\b[^{}]*\}\s*<\/p>/g;

  const sources = ["src/pages", "src/components", "src/layouts"]
    .flatMap((dir) => {
      const abs = path.resolve(rootDir, dir);
      return fs.existsSync(abs)
        ? fs.readdirSync(abs).map((name) => path.join(dir, name))
        : [];
    })
    .filter((file) => file.endsWith(".astro"))
    // The component itself, whose doc comment quotes the markup it replaces.
    .filter((file) => path.basename(file) !== "Prose.astro");

  it("finds the .astro sources it means to check", () => {
    assert.ok(sources.length > 5, "expected to be reading the site's components");
  });

  it("prints no prose field as a bare paragraph", () => {
    for (const file of sources) {
      const source = fs.readFileSync(path.resolve(rootDir, file), "utf8");
      const found = source.match(SINGLE_EXPRESSION_PARAGRAPH) ?? [];
      assert.deepEqual(
        found,
        [],
        `${file} prints a prose field into one <p>, which loses paragraphs: ` +
          `${found.join(", ")}. Use <Prose text={...} /> instead.`,
      );
    }
  });
});
