// Tests for scripts/refresh-ig-token.mjs, run against a local mock Graph API
// server and a fake `gh` binary so no external network is used. Every test
// writes only into a directory it creates with fs.mkdtempSync.
import { describe, it } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = resolve(repoRoot, "scripts/refresh-ig-token.mjs");

// ── Helpers ──────────────────────────────────────────────────────────────

function runScript(env) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

// Start a mock Graph API server for the ig_exchange_token refresh endpoint.
// Requests are recorded so tests can assert on the query string.
function startMockGraph({ status = 200, body } = {}) {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://mock");
    requests.push(Object.fromEntries(url.searchParams));
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body ?? { access_token: "NEW_TOKEN_ABC" }));
  });
  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolvePromise({
        url: `http://127.0.0.1:${port}/oauth/access_token`,
        requests,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// Create a fake `gh` executable in dir that records its args, stdin and
// GH_TOKEN, then exits with exitCode. The refresh script must be pointed at it
// via GH_BIN.
function makeFakeGh(dir, { exitCode = 0 } = {}) {
  const bin = join(dir, "gh");
  const argsFile = join(dir, "gh-args.txt");
  const stdinFile = join(dir, "gh-stdin.txt");
  const envFile = join(dir, "gh-env.txt");
  writeFileSync(
    bin,
    `#!/bin/sh
: > "\${FAKE_GH_ARGS_FILE}"
for a in "$@"; do printf '%s\\n' "$a" >> "\${FAKE_GH_ARGS_FILE}"; done
cat > "\${FAKE_GH_STDIN_FILE}"
printf '%s' "$GH_TOKEN" > "\${FAKE_GH_ENV_FILE}"
exit "\${FAKE_GH_EXIT:-0}"
`,
  );
  chmodSync(bin, 0o755);
  return { bin, argsFile, stdinFile, envFile };
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), "ig-refresh-"));
}

function fakeGhEnv(dir) {
  const fake = makeFakeGh(dir);
  return {
    GH_BIN: fake.bin,
    FAKE_GH_ARGS_FILE: fake.argsFile,
    FAKE_GH_STDIN_FILE: fake.stdinFile,
    FAKE_GH_ENV_FILE: fake.envFile,
    FAKE_GH_EXIT: "0",
    fake,
  };
}

const baseEnv = {
  IG_ACCESS_TOKEN: "OLD_TOKEN_123",
  SECRETS_WRITE_PAT: "PAT_456",
  GITHUB_REPOSITORY: "bbcc-glasgow/website",
};

// ── Token absent (fork / preview without secrets) ────────────────────────

describe("refresh-ig-token: token absent", () => {
  it("logs a skip message and exits 0 without calling the refresh API or gh", async () => {
    const dir = tempDir();
    const fake = makeFakeGh(dir);
    const { code, stdout } = await runScript({
      GH_BIN: fake.bin,
      FAKE_GH_ARGS_FILE: fake.argsFile,
      FAKE_GH_STDIN_FILE: fake.stdinFile,
      FAKE_GH_ENV_FILE: fake.envFile,
      // No IG_ACCESS_TOKEN on purpose.
    });
    assert.strictEqual(code, 0, "missing token must not fail the run");
    assert.ok(
      stdout.includes("IG_ACCESS_TOKEN not set - skipping token refresh"),
      `expected skip log line, got stdout: ${stdout}`,
    );
    assert.ok(
      !existsSync(fake.argsFile),
      "gh must not be invoked when the token is absent",
    );
  });
});

// ── Happy path ───────────────────────────────────────────────────────────

describe("refresh-ig-token: happy path", () => {
  it("exchanges the token, updates the secret via gh, logs success, and never logs the token", async () => {
    const dir = tempDir();
    const { fake, ...ghEnv } = fakeGhEnv(dir);
    const graph = await startMockGraph();
    try {
      const { code, stdout, stderr } = await runScript({
        ...baseEnv,
        ...ghEnv,
        IGRAPH_REFRESH_URL: graph.url,
      });
      assert.strictEqual(code, 0, stderr);
      assert.ok(
        stdout.includes("Token refreshed successfully"),
        `expected success log line, got stdout: ${stdout}`,
      );

      // The refresh endpoint was called with the exchange grant type and the
      // current (old) token.
      assert.strictEqual(graph.requests.length, 1, "must call the refresh API");
      assert.strictEqual(
        graph.requests[0].grant_type,
        "ig_exchange_token",
        "must use the ig_exchange_token grant type",
      );
      assert.strictEqual(
        graph.requests[0].access_token,
        "OLD_TOKEN_123",
        "must send the current token",
      );

      // gh was invoked to update the secret: args, the new token on stdin, and
      // the SECRETS_WRITE_PAT as GH_TOKEN.
      const args = readFileSync(fake.argsFile, "utf-8").trim().split("\n");
      assert.deepStrictEqual(args, [
        "secret",
        "set",
        "IG_ACCESS_TOKEN",
        "--repo",
        "bbcc-glasgow/website",
      ]);
      assert.strictEqual(
        readFileSync(fake.stdinFile, "utf-8"),
        "NEW_TOKEN_ABC",
        "gh must receive the new token on stdin",
      );
      assert.strictEqual(
        readFileSync(fake.envFile, "utf-8"),
        "PAT_456",
        "gh must be authenticated with SECRETS_WRITE_PAT",
      );

      // The raw token string must not appear in either log stream.
      assert.ok(
        !stdout.includes("NEW_TOKEN_ABC") && !stderr.includes("NEW_TOKEN_ABC"),
        "the new token value must never be logged",
      );
    } finally {
      await graph.close();
    }
  });
});

// ── Failure cases ────────────────────────────────────────────────────────

describe("refresh-ig-token: failure cases", () => {
  it("exits 1 and logs the required message when the refresh API returns a non-2xx status", async () => {
    const graph = await startMockGraph({
      status: 500,
      body: { error: { message: "boom" } },
    });
    try {
      const { code, stderr } = await runScript({
        ...baseEnv,
        IGRAPH_REFRESH_URL: graph.url,
        GH_BIN: "/nonexistent/gh", // must not be reached
      });
      assert.strictEqual(code, 1);
      assert.ok(
        stderr.includes("Token refresh failed - MANUAL INTERVENTION REQUIRED"),
        `expected failure log line, got stderr: ${stderr}`,
      );
      assert.ok(
        !stderr.includes("OLD_TOKEN_123"),
        "the current token must not be logged either",
      );
    } finally {
      await graph.close();
    }
  });

  it("exits 1 on a network error to the refresh endpoint", async () => {
    const { code, stderr } = await runScript({
      ...baseEnv,
      // Port 1 is closed: connection refused.
      IGRAPH_REFRESH_URL: "http://127.0.0.1:1/oauth/access_token",
    });
    assert.strictEqual(code, 1);
    assert.ok(
      stderr.includes("Token refresh failed - MANUAL INTERVENTION REQUIRED"),
      `expected failure log line, got stderr: ${stderr}`,
    );
  });

  it("exits 1 when the refresh response has no access_token", async () => {
    const graph = await startMockGraph({ body: { data: [] } });
    try {
      const { code, stderr } = await runScript({
        ...baseEnv,
        IGRAPH_REFRESH_URL: graph.url,
        GH_BIN: "/nonexistent/gh", // must not be reached
      });
      assert.strictEqual(code, 1);
      assert.ok(
        stderr.includes("Token refresh failed - MANUAL INTERVENTION REQUIRED"),
        `expected failure log line, got stderr: ${stderr}`,
      );
    } finally {
      await graph.close();
    }
  });

  it("exits 1 when gh secret set fails, without touching the refresh result", async () => {
    const dir = tempDir();
    const fake = makeFakeGh(dir, { exitCode: 1 });
    const graph = await startMockGraph();
    try {
      const { code, stderr } = await runScript({
        ...baseEnv,
        IGRAPH_REFRESH_URL: graph.url,
        GH_BIN: fake.bin,
        FAKE_GH_ARGS_FILE: fake.argsFile,
        FAKE_GH_STDIN_FILE: fake.stdinFile,
        FAKE_GH_ENV_FILE: fake.envFile,
        FAKE_GH_EXIT: "1",
      });
      assert.strictEqual(code, 1);
      assert.ok(
        stderr.includes("Token refresh failed - MANUAL INTERVENTION REQUIRED"),
        `expected failure log line, got stderr: ${stderr}`,
      );
      assert.ok(
        existsSync(fake.argsFile),
        "gh must have been invoked before the failure",
      );
    } finally {
      await graph.close();
    }
  });

  it("exits 1 without calling the refresh API when SECRETS_WRITE_PAT is missing", async () => {
    const graph = await startMockGraph();
    try {
      const { code, stderr } = await runScript({
        IG_ACCESS_TOKEN: "OLD_TOKEN_123",
        GITHUB_REPOSITORY: "bbcc-glasgow/website",
        IGRAPH_REFRESH_URL: graph.url,
      });
      assert.strictEqual(code, 1);
      assert.ok(
        stderr.includes("Token refresh failed - MANUAL INTERVENTION REQUIRED"),
        `expected failure log line, got stderr: ${stderr}`,
      );
      assert.strictEqual(
        graph.requests.length,
        0,
        "must fail before calling the refresh API when the PAT is missing",
      );
    } finally {
      await graph.close();
    }
  });
});
