import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("preview.yml — PR preview workflow", () => {
  const workflow = readFileSync(
    resolve(repoRoot, ".github/workflows/preview.yml"),
    "utf-8",
  );

  it("should trigger on pull_request opened and synchronize", () => {
    assert.ok(workflow.includes("opened"), "Trigger on opened");
    assert.ok(workflow.includes("synchronize"), "Trigger on synchronize");
  });

  it("should also trigger on pull_request closed", () => {
    assert.ok(workflow.includes("closed"), "Trigger on closed");
  });

  it("should grant pull-requests: write permission", () => {
    assert.ok(workflow.includes("pull-requests: write"), "Needs write permission for comments");
  });

  it("should build the site", () => {
    assert.ok(workflow.includes("pnpm build"), "Should build the Astro site");
  });

  it("should use wrangler versions upload, never wrangler deploy", () => {
    assert.ok(
      workflow.includes("versions upload"),
      "Should use wrangler versions upload",
    );
    assert.ok(
      !workflow.includes("wrangler deploy"),
      "Must not use wrangler deploy (production deploys via deploy.yml; previews never touch it)",
    );
  });

  it("should override SITE_MODE to live for the preview version", () => {
    assert.ok(
      workflow.includes("SITE_MODE") && workflow.includes("live"),
      "Should set SITE_MODE=live for the preview",
    );
  });

  it("should read preview URL from wrangler output, not the Cloudflare API", () => {
    assert.ok(
      !workflow.includes("cloudflare.com/client/v4/accounts"),
      "Must not query the Cloudflare API for subdomain",
    );
    assert.ok(
      workflow.includes("Preview") && workflow.includes("https"),
      "Should extract preview URL from wrangler output",
    );
  });

  it("should post or update a PR comment with the preview URL", () => {
    assert.ok(
      workflow.includes("## Preview deployment"),
      "Comment body should be a preview deployment section",
    );
    assert.ok(
      workflow.includes("X PATCH"),
      "Should update existing comment via PATCH (update-in-place)",
    );
    assert.ok(
      workflow.includes("X POST"),
      "Should create new comment via POST (no existing comment)",
    );
  });

  it("should pass the comment body via gh's -F field with =@file syntax, not the broken key@file form", () => {
    // gh api -f "body@<file>" parses the arg as a key with no "=" separator and
    // fails with `invalid key`; -f "body=<file>" (raw-field) sends the literal
    // string instead of reading the file. Only -F "body=@<file>" reads the file
    // content into the field. The preview comment step hit the invalid-key error
    // on every PR, so the comment never posted.
    assert.ok(
      workflow.includes('-F "body=@/tmp/preview-comment.md"'),
      "preview comment must be passed as -F body=@<file> so gh reads the file",
    );
    assert.ok(
      workflow.includes('-F "body=@/tmp/stale-comment.md"'),
      "stale comment must use the same -F body=@<file> syntax",
    );
    assert.ok(
      !workflow.includes('"body@/'),
      "must not use the broken key@file form without an = separator",
    );
  });

  it("should use the existing CLOUDFLARE_API_TOKEN secret", () => {
    assert.ok(
      workflow.includes("CLOUDFLARE_API_TOKEN"),
      "Should reference CLOUDFLARE_API_TOKEN",
    );
  });

  it("should use the existing CLOUDFLARE_ACCOUNT_ID variable", () => {
    assert.ok(
      workflow.includes("CLOUDFLARE_ACCOUNT_ID"),
      "Should reference CLOUDFLARE_ACCOUNT_ID",
    );
  });

  it("should mark the comment stale on PR close", () => {
    const hasStaleFlag =
      workflow.toLowerCase().includes("stale") ||
      workflow.includes("is now closed") ||
      workflow.includes("has been closed");
    assert.ok(hasStaleFlag, "Should indicate the preview is stale after close");
  });
});

describe("wrangler.jsonc — preview URL configuration", () => {
  const wrangler = readFileSync(resolve(repoRoot, "wrangler.jsonc"), "utf-8");

  it("should have preview_urls set to true", () => {
    assert.ok(
      /"preview_urls":\s*true/.test(wrangler),
      'wrangler.jsonc must have "preview_urls": true',
    );
  });
});
