import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe(".gitignore sandcastle configuration", () => {
  it("should list .sandcastle/ in .gitignore", () => {
    const gitignore = readFileSync(resolve(repoRoot, ".gitignore"), "utf-8");
    const lines = gitignore.split("\n").map((l) => l.trim());

    const hasSandcastleRoot = lines.some((l) => l === ".sandcastle/" || l === ".sandcastle");
    const hasRoundLogs = lines.some((l) => l === ".sandcastle/round-logs/");

    assert.ok(
      hasSandcastleRoot || hasRoundLogs,
      ".gitignore must contain .sandcastle/ or .sandcastle/round-logs/",
    );
  });

  it("should have no tracked files under .sandcastle/", () => {
    const tracked = execSync("git ls-files --cached .sandcastle/", {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();
    assert.strictEqual(tracked, "");
  });

  it("should keep .sandcastle/round-logs/ files on disk", () => {
    const dir = resolve(repoRoot, ".sandcastle/round-logs");
    assert.ok(
      existsSync(dir),
      ".sandcastle/round-logs/ must still exist on disk after untracking",
    );
  });
});
