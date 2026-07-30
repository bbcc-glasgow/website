import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = resolve(repoRoot, ".github/workflows/preview.yml");

describe("preview deploy workflow", () => {
  it("should exist at .github/workflows/preview.yml", () => {
    assert.ok(
      existsSync(workflowPath),
      "preview.yml must exist for per-PR preview deploys",
    );
  });

  it("should trigger on pull_request against main", () => {
    const content = readFileSync(workflowPath, "utf-8");
    // Must trigger on pull_request (not push to main, not tags)
    assert.ok(
      content.includes("pull_request:"),
      "should trigger on pull_request",
    );
    // Must target main branch only
    assert.ok(
      content.includes("branches: [main]") ||
        content.includes('branches: ["main"]') ||
        content.includes("branches: main") ||
        content.includes("branches:\n        - main"),
      "should target the main branch",
    );
  });

  it("should NOT use wrangler deploy (preserve the release boundary)", () => {
    const content = readFileSync(workflowPath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip YAML comments (which may explain why we don't use wrangler deploy)
      if (trimmed.startsWith("#")) continue;
      // Skip YAML keys that merely reference the word (e.g. "name: preview-deploy")
      if (trimmed.startsWith("name:")) continue;
      // Check if any command or key contains the actual "wrangler deploy" command
      assert.ok(
        !trimmed.match(/wrangler\s+deploy\b/i),
        `actual wrangler deploy command found: "${trimmed}"`,
      );
    }
  });

  it("should use wrangler versions upload (or equivalent non-deploy command)", () => {
    const content = readFileSync(workflowPath, "utf-8");
    const usesVersionsUpload =
      content.match(/wrangler.*versions.*upload/gi) ||
      content.match(/versions.*upload/gi);
    assert.ok(
      usesVersionsUpload,
      "should use wrangler versions upload for preview deploys",
    );
  });

  it("should override SITE_MODE to live for preview versions", () => {
    const content = readFileSync(workflowPath, "utf-8");
    // Must set SITE_MODE=live so the preview shows the real site, not the holding page
    const hasLiveOverride =
      content.includes("SITE_MODE:live") ||
      content.includes("SITE_MODE=live") ||
      content.includes("SITE_MODE: live") ||
      content.includes('"SITE_MODE"') ||
      content.includes('SITE_MODE":"live"');
    assert.ok(hasLiveOverride, "must override SITE_MODE to live for previews");
  });

  it("should post a PR comment with the preview URL", () => {
    const content = readFileSync(workflowPath, "utf-8");
    // Must use gh CLI to create or update PR comments
    const hasCommentCommand =
      content.match(/gh\s+api.*issues.*comments/gi) ||
      content.match(/gh\s+pr\s+comment/gi) ||
      content.match(/create-or-update-comment/gi) ||
      content.match(/find-comment/gi);
    assert.ok(
      hasCommentCommand,
      "should post or update a PR comment with the preview URL",
    );
  });

  it("should use the existing CLOUDFLARE_API_TOKEN secret", () => {
    const content = readFileSync(workflowPath, "utf-8");
    assert.ok(
      content.includes("CLOUDFLARE_API_TOKEN"),
      "should reference the existing CLOUDFLARE_API_TOKEN secret",
    );
  });

  it("should use the existing CLOUDFLARE_ACCOUNT_ID variable", () => {
    const content = readFileSync(workflowPath, "utf-8");
    assert.ok(
      content.includes("CLOUDFLARE_ACCOUNT_ID"),
      "should reference the existing CLOUDFLARE_ACCOUNT_ID variable",
    );
  });

  it("should not modify the committed wrangler.jsonc config", () => {
    const content = readFileSync(workflowPath, "utf-8");
    // Should use --var or equivalent inline override, not sed or similar to
    // modify wrangler.jsonc in place
    const hasFileEdit =
      content.match(/sed\s+/i) ||
      content.match(/wrangler\.jsonc/i) ||
      content.match(/--var/);
    // --var is the expected approach (inline override), sed/wrangler.jsonc
    // reference would be the wrong approach
    assert.ok(
      !content.match(/sed.*wrangler\.jsonc/i),
      "should not modify wrangler.jsonc with sed",
    );
  });

  it("should update the PR comment in-place on subsequent pushes", () => {
    const content = readFileSync(workflowPath, "utf-8");
    // Must have logic to find and update an existing comment, not just create
    // new ones unconditionally
    const updatesInPlace =
      content.match(/update/i) ||
      content.match(/PATCH/i) ||
      content.match(/edit-mode.*replace/i) ||
      content.match(/existing/i);
    assert.ok(
      updatesInPlace,
      "should update the preview comment in-place rather than duplicating",
    );
  });

  it("should not duplicate the gate/ci pipeline (additive workflow)", () => {
    const content = readFileSync(workflowPath, "utf-8");
    // This workflow should not contain the gate job check steps (no a11y,
    // lighthouse, etc.) - it delegates those to the existing CI
    const hasGateSteps =
      content.includes("test:a11y") || content.includes("test:lighthouse");
    assert.ok(
      !hasGateSteps,
      "should not duplicate CI gate checks (preview is additive)",
    );
  });

  it("should NOT query the Cloudflare API for subdomain (use wrangler's own output)", () => {
    const content = readFileSync(workflowPath, "utf-8");
    // The issue steer says: "use Cloudflare's built-in Versioned Preview URLs,
    // don't hand-roll the URL" -- so we must NOT query the Cloudflare API.
    assert.ok(
      !content.includes("cloudflare.com/client/v4/accounts"),
      "should not reconstruct the URL via the Cloudflare API",
    );
  });

  it("should have a stale-comment job that runs on PR close", () => {
    const content = readFileSync(workflowPath, "utf-8");
    assert.ok(
      content.includes("stale-comment:"),
      "should have a stale-comment job for PR close handling",
    );
    assert.ok(
      content.includes("github.event.action == 'closed'"),
      "stale-comment job should only run when the PR is closed",
    );
  });

  it("should update the existing comment body to mark it stale on PR close", () => {
    const content = readFileSync(workflowPath, "utf-8");
    const hasStaleFlag =
      content.toLowerCase().includes("stale") &&
      content.includes("Preview deployment (stale)");
    assert.ok(
      hasStaleFlag,
      "should mark the preview comment as stale on PR close",
    );
  });
});
