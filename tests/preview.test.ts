import { describe, it } from "node:test";
import assert from "node:assert";

// The regex used in preview.yml to extract the preview URL from wrangler output.
// Matches https://<uuid>.<worker>.<subdomain>.workers.dev
const PREVIEW_URL_RE = /https:\/\/[a-z0-9.-]+\.workers\.dev/;

/**
 * Parse the preview URL from wrangler versions upload output.
 * Returns the URL string, or null if not found.
 */
function extractPreviewUrl(wranglerOutput: string): string | null {
  const match = wranglerOutput.match(PREVIEW_URL_RE);
  return match ? match[0] : null;
}

describe("preview URL extraction", () => {
  it("extracts the preview URL from wrangler output with preview_urls: true", () => {
    const output = [
      "🌀 Building list of assets...",
      "✨ Read 58 files from the assets directory /home/runner/work/website/website/dist",
      "🌀 Starting asset upload...",
      "No updated asset files to upload. Proceeding with deployment...",
      "Total Upload: 0.66 KiB / gzip: 0.34 KiB",
      "Worker Startup Time: 0 ms",
      "Your Worker has access to the following bindings:",
      "Binding                         Resource",
      "env.ASSETS                      Assets",
      'env.SITE_MODE ("(hidden)")      Environment Variable',
      "",
      "Uploaded bbcc-website (2.42 sec)",
      "Worker Version ID: a222a564-fabd-4298-9a87-c088197b1a3c",
      "",
      "Preview URL: https://a222a564-fabd-4298-9a87-c088197b1a3c.bbcc-website.my-subdomain.workers.dev",
      "",
    ].join("\n");

    const url = extractPreviewUrl(output);
    assert.strictEqual(
      url,
      "https://a222a564-fabd-4298-9a87-c088197b1a3c.bbcc-website.my-subdomain.workers.dev",
    );
  });

  it("returns null when wrangler output has no preview URL (no workers.dev subdomain)", () => {
    const output = [
      "🌀 Building list of assets...",
      "✨ Read 58 files from the assets directory /home/runner/work/website/website/dist",
      "🌀 Starting asset upload...",
      "No updated asset files to upload. Proceeding with deployment...",
      "Total Upload: 0.66 KiB / gzip: 0.34 KiB",
      "Worker Startup Time: 0 ms",
      "Your Worker has access to the following bindings:",
      "Binding                         Resource",
      "env.ASSETS                      Assets",
      'env.SITE_MODE ("(hidden)")      Environment Variable',
      "",
      "Uploaded bbcc-website (2.42 sec)",
      "Worker Version ID: a222a564-fabd-4298-9a87-c088197b1a3c",
      "",
      "To deploy this version to production traffic use the command wrangler versions deploy",
      "",
      'Changes to non-versioned settings (config properties \'logpush\' or \'tail_consumers\')',
      "take effect after your next deployment using the command wrangler versions deploy",
      "",
      "Changes to triggers (routes, custom domains, cron schedules, etc) must be applied",
      "with the command wrangler triggers deploy",
    ].join("\n");

    const url = extractPreviewUrl(output);
    assert.strictEqual(url, null);
  });

  it("returns null on empty output", () => {
    assert.strictEqual(extractPreviewUrl(""), null);
  });

  it("extracts URL even when other https URLs are present in output", () => {
    const output = [
      "Some log with https://example.com/some-path that should not match",
      "",
      "Preview URL: https://abc123.bbcc-website.my-subdomain.workers.dev",
      "",
    ].join("\n");

    const url = extractPreviewUrl(output);
    // The regex should match the workers.dev URL, not the example.com URL
    assert.ok(url?.includes("workers.dev"), "URL must contain workers.dev");
    assert.strictEqual(
      url,
      "https://abc123.bbcc-website.my-subdomain.workers.dev",
    );
  });
});
