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

describe("instagram-feed workflow - token refresh step", () => {
  it("should run the token-refresh script as its own step", () => {
    const content = readWorkflow();
    assert.ok(
      content.includes("Refresh Instagram token"),
      "should have a 'Refresh Instagram token' step",
    );
    assert.ok(
      content.includes("node scripts/refresh-ig-token.mjs"),
      "refresh step must run the refresh script",
    );
  });

  it("should place the refresh step after the commit/push step", () => {
    const content = readWorkflow();
    const commitIndex = content.indexOf("Commit and push feed update");
    const refreshIndex = content.indexOf("Refresh Instagram token");
    assert.ok(commitIndex !== -1, "commit step must exist");
    assert.ok(refreshIndex !== -1, "refresh step must exist");
    assert.ok(
      refreshIndex > commitIndex,
      "refresh step must come after the commit step so a refresh failure cannot roll the feed commit back",
    );
  });

  it("should reference IG_ACCESS_TOKEN only as a masked step env var, never in a run statement", () => {
    const content = readWorkflow();
    const envValue =
      /^\s*[A-Za-z_][A-Za-z0-9_]*:\s*\$\{\{\s*secrets\.IG_ACCESS_TOKEN\s*\}\}\s*$/;
    const offending = content
      .split("\n")
      .filter(
        (line) => line.includes("secrets.IG_ACCESS_TOKEN") && !envValue.test(line),
      );
    assert.deepStrictEqual(
      offending,
      [],
      "IG_ACCESS_TOKEN must only appear as a step env value, never inside a run command",
    );
  });

  it("should pass SECRETS_WRITE_PAT to the refresh step via env", () => {
    const content = readWorkflow();
    const step = content.slice(content.indexOf("Refresh Instagram token"));
    assert.ok(
      step.includes("SECRETS_WRITE_PAT: ${{ secrets.SECRETS_WRITE_PAT }}"),
      "refresh step must receive SECRETS_WRITE_PAT as a masked env var",
    );
    const run = step.slice(step.indexOf("run:"));
    assert.ok(
      !run.includes("${{ secrets."),
      "secrets must not be interpolated inside the refresh step's run block",
    );
  });

  it("should fail the run when the refresh script fails (no continue-on-error)", () => {
    const content = readWorkflow();
    const step = content.slice(content.indexOf("Refresh Instagram token"));
    assert.ok(
      !/continue-on-error/.test(step),
      "refresh step must not be allowed to fail silently",
    );
  });

  it("should never log the token value in the refresh script", () => {
    const script = readFileSync(
      resolve(repoRoot, "scripts/refresh-ig-token.mjs"),
      "utf-8",
    );
    assert.ok(script.includes("Token refreshed successfully"));
    assert.ok(
      script.includes("Token refresh failed - MANUAL INTERVENTION REQUIRED"),
      "must log the required failure message",
    );
    assert.ok(
      script.includes("IG_ACCESS_TOKEN not set - skipping token refresh"),
      "must keep the fork/preview skip path",
    );
    assert.ok(
      script.includes("input: newToken"),
      "the new token must be piped to gh on stdin, not logged",
    );
    assert.ok(
      !/console\.(log|error)\(.*newToken/.test(script),
      "the new token value must never be passed to a logger",
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

  it("should install actionlint via a resolvable reference, not the broken @v1 tag", () => {
    const ci = readFileSync(ciPath, "utf-8");
    // rhysd/actionlint publishes no plain 'v1' major-version tag, so
    // `uses: rhysd/actionlint@v1` cannot be resolved by GitHub Actions (the
    // round-1 gate failed with "unable to find version v1"). The step must
    // install the binary via the official download script instead.
    assert.ok(
      !/rhysd\/actionlint@v1/.test(ci),
      "must not reference rhysd/actionlint@v1 (tag does not exist upstream)",
    );
    assert.ok(
      ci.includes("download-actionlint.bash"),
      "actionlint step must install the binary via the official download script",
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

  it("should document how to generate a long-lived token, its ~60-day expiry, and the auto-refresh", () => {
    const readme = readFileSync(readmePath, "utf-8");
    const section = readme.slice(readme.indexOf("## Feed bot setup"));
    assert.ok(
      section.includes("ig_exchange_token"),
      "must document the long-lived token exchange endpoint",
    );
    assert.ok(
      /60\s*days|60-day/.test(section),
      "must document the ~60-day expiry",
    );
    assert.ok(
      /auto-refresh|refreshes/.test(section),
      "must document that the workflow auto-refreshes the token",
    );
  });

  it("should document SECRETS_WRITE_PAT scopes: contents write and secrets write", () => {
    const readme = readFileSync(readmePath, "utf-8");
    const section = readme.slice(readme.indexOf("## Feed bot setup"));
    assert.ok(
      section.includes("contents: write"),
      "must document the contents: write scope (feed commit push)",
    );
    assert.ok(
      section.includes("secrets: write"),
      "must document the secrets: write scope (token refresh)",
    );
    assert.ok(
      /this repository only|scoped to this repository/.test(section),
      "must state the PAT is scoped to this repository only",
    );
  });

  it("should document what to do when the refresh step fails", () => {
    const readme = readFileSync(readmePath, "utf-8");
    const section = readme.slice(readme.indexOf("## Feed bot setup"));
    assert.ok(
      section.includes("Token refresh failed - MANUAL INTERVENTION REQUIRED"),
      "must name the failure log line",
    );
    assert.ok(
      section.includes("Update the `IG_ACCESS_TOKEN` secret"),
      "must instruct regenerating and updating the token",
    );
  });
});
