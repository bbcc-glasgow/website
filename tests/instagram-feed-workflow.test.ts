import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = resolve(repoRoot, ".github/workflows/instagram-feed.yml");
const ciPath = resolve(repoRoot, ".github/workflows/ci.yml");
const readmePath = resolve(repoRoot, "README.md");
const scriptPath = resolve(repoRoot, "scripts/fetch-instagram.mjs");

function readWorkflow(): string {
  return readFileSync(workflowPath, "utf-8");
}

describe("instagram-feed workflow — scheduled trigger", () => {
  it("should exist at .github/workflows/instagram-feed.yml", () => {
    assert.ok(existsSync(workflowPath), "instagram-feed.yml must exist");
  });

  it("should trigger on a daily schedule", () => {
    const content = readWorkflow();
    assert.ok(content.includes("schedule:"), "should have a schedule trigger");
    assert.ok(
      /cron:\s*"([^"]+)"/.test(content),
      "should define a cron expression",
    );
  });

  it("should trigger on workflow_dispatch with no required inputs", () => {
    const content = readWorkflow();
    assert.ok(
      content.includes("workflow_dispatch:"),
      "should support manual dispatch",
    );
    // No inputs block: dispatch runs with defaults.
    assert.ok(
      !/inputs:\s*\n/.test(content),
      "must not declare workflow_dispatch inputs",
    );
  });

  it("should call the Graph API via scripts/fetch-instagram.mjs", () => {
    const content = readWorkflow();
    assert.ok(
      content.includes("node scripts/fetch-instagram.mjs"),
      "fetch step must run the fetch script",
    );
  });

  it("should pass IG_ACCESS_TOKEN to the fetch step", () => {
    const content = readWorkflow();
    assert.ok(
      content.includes("IG_ACCESS_TOKEN"),
      "should reference the IG_ACCESS_TOKEN secret",
    );
  });

  it("should detect changes with git diff --quiet (or equivalent)", () => {
    const content = readWorkflow();
    const hasDiff =
      content.includes("git diff --quiet") ||
      content.includes("git status --porcelain");
    assert.ok(hasDiff, "should run git diff --quiet or an equivalent check");
    assert.ok(
      content.includes("src/data/instagram/posts.json") &&
        content.includes("src/assets/instagram/"),
      "change detection must cover posts.json and the assets directory",
    );
  });

  it("should log 'Feed unchanged, skipping commit' and commit only on change", () => {
    const content = readWorkflow();
    assert.ok(
      content.includes("Feed unchanged, skipping commit"),
      "should log the skip message on an unchanged feed",
    );
    assert.ok(
      /git\s+commit\s+-m\s+"chore\(instagram\):\s*update feed \[skip ci\]"/.test(
        content,
      ),
      "commit message must be 'chore(instagram): update feed [skip ci]'",
    );
    assert.ok(
      content.includes("if: steps.feed.outputs.changed == 'true'"),
      "commit step must run only when the feed changed",
    );
  });

  it("should push the feed commit to main", () => {
    const content = readWorkflow();
    assert.ok(
      /git\s+push[^\n]*main/.test(content),
      "should push to main",
    );
  });

  it("should author commits as the github-actions bot", () => {
    const content = readWorkflow();
    assert.ok(
      content.includes("github-actions[bot]"),
      "commit author must be github-actions[bot]",
    );
    assert.ok(
      content.includes("41898282+github-actions[bot]@users.noreply.github.com"),
      "commit author email must be the bot noreply address",
    );
  });

  it("should use SECRETS_WRITE_PAT for the push", () => {
    const content = readWorkflow();
    assert.ok(
      content.includes("SECRETS_WRITE_PAT"),
      "should reference the SECRETS_WRITE_PAT secret",
    );
  });

  it("should request only read contents permission from the default token", () => {
    const content = readWorkflow();
    const permissionBlock = content.slice(content.indexOf("permissions:"));
    assert.ok(
      /contents:\s*read/.test(permissionBlock),
      "should grant the default GITHUB_TOKEN read-only contents (push uses the PAT)",
    );
  });
});

describe("instagram-feed workflow — failure and secret-absent handling", () => {
  it("should fail the run (non-zero) when the fetch script exits 1", () => {
    const content = readWorkflow();
    // No continue-on-error or || true around the fetch step: a fetch failure
    // must mark the run failed.
    const fetchStep = content.slice(content.indexOf("Fetch Instagram feed"));
    assert.ok(
      !/continue-on-error/.test(fetchStep),
      "fetch step must not be allowed to fail silently",
    );
    assert.ok(
      !/\|\|\s*(true|exit\s+0)/.test(fetchStep),
      "fetch step must not swallow failures",
    );
  });

  it("should keep the feed commit structure so a later step failure cannot roll it back", () => {
    const content = readWorkflow();
    // The commit/push must be its own step that completes before any later
    // token-refresh step (slice 5); there must be no cleanup that reverts it.
    assert.ok(
      content.includes("git push"),
      "commit step must push before any subsequent steps run",
    );
    assert.ok(
      !content.includes("git reset") && !content.includes("git revert"),
      "must not roll back a successful feed commit",
    );
  });

  it("should not require secrets to run on forks (script exits 0 when token absent)", () => {
    assert.ok(
      existsSync(scriptPath),
      "fetch script must exist",
    );
    const script = readFileSync(scriptPath, "utf-8");
    assert.ok(
      script.includes("IG_ACCESS_TOKEN not set - skipping feed fetch"),
      "script must log a clear message when the token is absent",
    );
    assert.ok(
      /process\.exit\(0\)/.test(script),
      "script must exit 0 when the token is absent",
    );
  });
});

describe("instagram-feed workflow — actionlint in CI", () => {
  it("should add an actionlint step to ci.yml", () => {
    const ci = readFileSync(ciPath, "utf-8");
    assert.ok(
      /actionlint/i.test(ci),
      "ci.yml must lint workflow files with actionlint",
    );
  });
});

describe("README — Feed bot setup", () => {
  it("should document the required secrets under a Feed bot setup heading", () => {
    const readme = readFileSync(readmePath, "utf-8");
    const section = readme.slice(readme.indexOf("## Feed bot setup"));
    assert.ok(
      section.startsWith("## Feed bot setup"),
      "README must have a 'Feed bot setup' heading",
    );
    assert.ok(
      section.includes("IG_ACCESS_TOKEN"),
      "section must document IG_ACCESS_TOKEN",
    );
    assert.ok(
      section.includes("SECRETS_WRITE_PAT"),
      "section must document SECRETS_WRITE_PAT",
    );
  });
});
