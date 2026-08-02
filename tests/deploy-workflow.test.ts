import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deployWorkflowPath = resolve(repoRoot, ".github/workflows/deploy.yml");
const previewWorkflowPath = resolve(repoRoot, ".github/workflows/preview.yml");
const readmePath = resolve(repoRoot, "README.md");

function readDeployWorkflow(): string {
  return readFileSync(deployWorkflowPath, "utf-8");
}

describe("deploy workflow — continuous deploy on push to main", () => {
  it("should exist at .github/workflows/deploy.yml", () => {
    assert.ok(existsSync(deployWorkflowPath), "deploy.yml must exist");
  });

  it("should trigger on push to main", () => {
    const content = readDeployWorkflow();
    assert.ok(/^\s*push:\s*$/m.test(content), "should have a push trigger");
    assert.ok(
      content.includes("branches: [main]") ||
        content.includes("branches:\n      - main") ||
        content.includes('branches: ["main"]'),
      "push trigger must target the main branch",
    );
  });

  it("should keep workflow_dispatch as a manual redeploy path", () => {
    const content = readDeployWorkflow();
    assert.ok(
      content.includes("workflow_dispatch:"),
      "should keep workflow_dispatch as a manual fallback",
    );
  });

  it("should NOT trigger on v* tags", () => {
    const content = readDeployWorkflow();
    assert.ok(
      !/^\s*tags:/m.test(content),
      "deploy workflow must not trigger on tags",
    );
    assert.ok(
      !/tags:\s*\[["']v\*["']\]/.test(content),
      "v* tag trigger must be removed",
    );
  });

  it("should define a concurrency group so back-to-back merges cannot race", () => {
    const content = readDeployWorkflow();
    assert.ok(content.includes("concurrency:"), "should define a concurrency group");
    assert.ok(
      /group:\s*\S+/.test(content),
      "concurrency group must have a group name",
    );
    assert.ok(
      content.includes("cancel-in-progress: true"),
      "should cancel an older in-flight deploy so the newest commit wins",
    );
  });

  it("should describe continuous deploy (deploy on merge) in its comment", () => {
    const content = readDeployWorkflow();
    assert.ok(
      !/do\s+not\s+publish/i.test(content),
      "must not claim merges do not publish",
    );
    assert.ok(
      /every\s+push\s+to\s+main/i.test(content),
      "comment should describe deploy-on-merge semantics",
    );
  });
});

describe("README release boundary", () => {
  it("should describe continuous deploy (every push to main deploys)", () => {
    const readme = readFileSync(readmePath, "utf-8");
    const releaseSection = readme.slice(readme.indexOf("## Release boundary"));
    assert.ok(
      /every\s+push\s+to\s+`?main`?/i.test(releaseSection),
      "Release boundary section should state every push to main deploys",
    );
  });

  it("should describe manual dispatch as a redeploy fallback", () => {
    const readme = readFileSync(readmePath, "utf-8");
    const releaseSection = readme.slice(readme.indexOf("## Release boundary"));
    assert.ok(
      /dispatch/i.test(releaseSection),
      "Release boundary section should mention dispatch as a manual redeploy path",
    );
  });

  it("should have no remaining text claiming merges do not publish", () => {
    const readme = readFileSync(readmePath, "utf-8");
    assert.ok(
      !/do\s+(\*\*)?not(\*\*)?\s+publish/i.test(readme),
      "README must not claim merges do not publish",
    );
    assert.ok(
      !/tag\s*\/\s*dispatch\s+a\s+deploy/i.test(readme) &&
        !/tagging\s+a\s+release/i.test(readme) &&
        !/first\s+`?v\*`?\s*tag/i.test(readme),
      "README must not instruct tagging a release to deploy",
    );
  });
});

describe("per-PR preview deploys remain unchanged", () => {
  it("preview.yml should still trigger on pull_request against main", () => {
    const content = readFileSync(previewWorkflowPath, "utf-8");
    assert.ok(
      content.includes("pull_request:"),
      "preview must still trigger on pull_request",
    );
    assert.ok(
      content.includes("branches: [main]") ||
        content.includes("branches:\n    - main"),
      "preview must still target main",
    );
  });

  it("preview.yml should still use wrangler versions upload, never deploy", () => {
    const content = readFileSync(previewWorkflowPath, "utf-8");
    assert.ok(
      /versions\s+upload/.test(content),
      "preview must still use wrangler versions upload",
    );
    assert.ok(
      !/wrangler\s+deploy\b/i.test(content),
      "preview must not use wrangler deploy",
    );
  });
});
