import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PROJECT_VARIANT,
  PROJECT_CTA_ICONS,
  PROJECT_VARIANTS,
  resolveProjectVariantColours,
} from "../src/lib/projectVariants.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectsDir = resolve(repoRoot, "src/content/projects");

function readProjects() {
  return readdirSync(projectsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({
      file: f,
      data: JSON.parse(readFileSync(join(projectsDir, f), "utf-8")),
    }));
}

// ── Variant resolver ────────────────────────────────────────────────────

describe("project variant resolver", () => {
  it("maps each named variant to the original colour combination", () => {
    assert.deepStrictEqual(resolveProjectVariantColours("teal"), {
      tagColour: "var(--teal-dark)",
      tagBgColour: "rgba(0,168,150,0.1)",
      borderColour: "var(--teal)",
    });
    assert.deepStrictEqual(resolveProjectVariantColours("pink"), {
      tagColour: "var(--pink)",
      tagBgColour: "rgba(220,26,132,0.1)",
      borderColour: "var(--pink)",
    });
    assert.deepStrictEqual(resolveProjectVariantColours("amber"), {
      tagColour: "#8a5f00",
      tagBgColour: "rgba(244,161,0,0.12)",
      borderColour: "var(--amber)",
    });
  });

  it("falls back to the default variant for an unknown variant", () => {
    assert.deepStrictEqual(
      resolveProjectVariantColours("purple"),
      resolveProjectVariantColours(DEFAULT_PROJECT_VARIANT),
    );
  });

  it("falls back to the default variant when variant is missing", () => {
    assert.deepStrictEqual(
      resolveProjectVariantColours(undefined),
      resolveProjectVariantColours(DEFAULT_PROJECT_VARIANT),
    );
  });
});

// ── Migrated project files ──────────────────────────────────────────────

describe("migrated project files", () => {
  const projects = readProjects();

  it("contains exactly the five expected projects", () => {
    assert.deepStrictEqual(
      projects.map((p) => p.file),
      [
        "backing-venues.json",
        "local-place-plan.json",
        "mapping-street-trees.json",
        "taking-back-our-lanes.json",
        "union-corner.json",
      ],
    );
  });

  it("has no free-text colour fields left behind", () => {
    for (const p of projects) {
      assert.ok(!("tagColour" in p.data), `${p.file} must not keep tagColour`);
      assert.ok(!("tagBgColour" in p.data), `${p.file} must not keep tagBgColour`);
      assert.ok(!("borderColour" in p.data), `${p.file} must not keep borderColour`);
    }
  });

  it("uses only known variants", () => {
    for (const p of projects) {
      assert.ok(
        (PROJECT_VARIANTS as readonly string[]).includes(p.data.variant),
        `${p.file} uses unknown variant '${p.data.variant}'`,
      );
    }
  });

  it("resolves to the same colours the project used before migration", () => {
    const expected = {
      "backing-venues.json": {
        tagColour: "var(--teal-dark)",
        tagBgColour: "rgba(0,168,150,0.1)",
        borderColour: "var(--teal)",
      },
      "local-place-plan.json": {
        tagColour: "var(--pink)",
        tagBgColour: "rgba(220,26,132,0.1)",
        borderColour: "var(--pink)",
      },
      "mapping-street-trees.json": {
        tagColour: "#8a5f00",
        tagBgColour: "rgba(244,161,0,0.12)",
        borderColour: "var(--amber)",
      },
      "taking-back-our-lanes.json": {
        tagColour: "var(--teal-dark)",
        tagBgColour: "rgba(0,168,150,0.1)",
        borderColour: "var(--teal)",
      },
      "union-corner.json": {
        tagColour: "var(--pink)",
        tagBgColour: "rgba(220,26,132,0.1)",
        borderColour: "var(--pink)",
      },
    };
    for (const p of projects) {
      assert.deepStrictEqual(
        resolveProjectVariantColours(p.data.variant),
        expected[p.file],
        `${p.file} colours must match the pre-migration schema`,
      );
    }
  });

  it("has valid ctas (label, url, known icon) when present", () => {
    for (const p of projects) {
      for (const cta of p.data.ctas ?? []) {
        assert.ok(
          typeof cta.label === "string" && cta.label.length > 0,
          `${p.file} has a cta without a label`,
        );
        assert.ok(
          typeof cta.url === "string" && cta.url.length > 0,
          `${p.file} has a cta without a url`,
        );
        if (cta.icon !== undefined) {
          assert.ok(
            (PROJECT_CTA_ICONS as readonly string[]).includes(cta.icon),
            `${p.file} uses unknown cta icon '${cta.icon}'`,
          );
        }
      }
    }
  });
});
