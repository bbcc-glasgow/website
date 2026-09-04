// Tests for scripts/fetch-instagram.mjs, run against a local mock Graph API
// server so no external network is used. Every test writes only into a
// directory it creates with fs.mkdtempSync.
import { describe, it } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = resolve(repoRoot, "scripts/fetch-instagram.mjs");

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

// Start a mock Graph API + image server. makePosts(base) is called after the
// port is known so post media_url/thumbnail_url values can point at the mock.
function startMockFeed({ makePosts, graphStatus = 200, graphBody, missingImages = [] } = {}) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://mock");
    if (url.pathname === "/graph") {
      res.writeHead(graphStatus, { "content-type": "application/json" });
      res.end(
        JSON.stringify(graphBody ?? { data: posts }),
      );
      return;
    }
    if (url.pathname.startsWith("/img/") && !missingImages.includes(url.pathname)) {
      res.writeHead(200, { "content-type": "image/jpeg" });
      res.end(`JPEG:${url.pathname}`);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  let posts = [];
  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const base = `http://127.0.0.1:${port}`;
      if (makePosts) posts = makePosts(base);
      resolvePromise({
        base,
        graphUrl: `${base}/graph`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "ig-fetch-"));
  const assetsDir = join(dir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  return { dir, assetsDir };
}

function readFeed(file) {
  return JSON.parse(readFileSync(file, "utf-8"));
}

// ── Token absent (fresh fork / PR preview) ───────────────────────────────

describe("fetch-instagram: token absent", () => {
  it("logs a clear message and exits 0 without writing anything", async () => {
    const { dir, assetsDir } = tempDir();
    writeFileSync(join(assetsDir, "existing.jpg"), "old");
    const { code, stdout } = await runScript({
      FEED_FILE: join(dir, "posts.json"),
      ASSETS_DIR: assetsDir,
      // No IG_ACCESS_TOKEN on purpose.
    });
    assert.strictEqual(code, 0, "missing token must not fail the run");
    assert.ok(
      stdout.includes("IG_ACCESS_TOKEN not set - skipping feed fetch"),
      `expected log line, got stdout: ${stdout}`,
    );
    assert.ok(!existsSync(join(dir, "posts.json")), "must not write posts.json");
    assert.strictEqual(
      readdirSync(assetsDir).sort().join(","),
      "existing.jpg",
      "must not touch existing assets",
    );
  });
});

// ── Happy path ───────────────────────────────────────────────────────────

describe("fetch-instagram: happy path", () => {
  const longCaption = "x".repeat(130);
  const postFixtures = (base) => [
    {
      id: "VID1",
      permalink: "https://instagram.com/p/VID1",
      media_type: "VIDEO",
      thumbnail_url: `${base}/img/VID1.jpg`,
      caption: "Video post",
      timestamp: "2024-01-10T10:00:00+0000",
    },
    {
      id: "IMG1",
      permalink: "https://instagram.com/p/IMG1",
      media_type: "IMAGE",
      media_url: `${base}/img/IMG1.jpg`,
      caption: longCaption,
      timestamp: "2024-01-05T09:30:00+0000",
    },
    {
      id: "CAR1",
      permalink: "https://instagram.com/p/CAR1",
      media_type: "CAROUSEL_ALBUM",
      children: {
        data: [
          { media_url: `${base}/img/CAR1-a.jpg` },
          { media_url: `${base}/img/CAR1-b.jpg` },
        ],
      },
      // No caption: caption and alt must be empty strings.
      timestamp: "2024-01-01T08:00:00+0000",
    },
    {
      id: "IMG2",
      permalink: "https://instagram.com/p/IMG2",
      media_type: "IMAGE",
      media_url: `${base}/img/IMG2.jpg`,
      caption: "Fourth",
      timestamp: "2023-12-20T10:00:00+0000",
    },
    {
      id: "IMG3",
      permalink: "https://instagram.com/p/IMG3",
      media_type: "IMAGE",
      media_url: `${base}/img/IMG3.jpg`,
      caption: "Fifth",
      timestamp: "2023-12-10T10:00:00+0000",
    },
    {
      id: "IMG4",
      permalink: "https://instagram.com/p/IMG4",
      media_type: "IMAGE",
      media_url: `${base}/img/IMG4.jpg`,
      caption: "Sixth",
      timestamp: "2023-12-01T10:00:00+0000",
    },
    // Older than the six above: must be excluded and not downloaded.
    {
      id: "OLD1",
      permalink: "https://instagram.com/p/OLD1",
      media_type: "IMAGE",
      media_url: `${base}/img/OLD1.jpg`,
      caption: "Seventh",
      timestamp: "2023-11-01T10:00:00+0000",
    },
  ];

  it("writes the feed newest-first, downloads images, and prunes stale ones", async () => {
    const { dir, assetsDir } = tempDir();
    // Stale image and a non-jpg file that must survive the prune.
    writeFileSync(join(assetsDir, "OLD1.jpg"), "stale");
    writeFileSync(join(assetsDir, "note.txt"), "keep me");

    const server = await startMockFeed({ makePosts: postFixtures });
    try {
      const { code, stderr } = await runScript({
        IGRAPH_API_URL: server.graphUrl,
        IG_ACCESS_TOKEN: "test-token",
        FEED_FILE: join(dir, "posts.json"),
        ASSETS_DIR: assetsDir,
      });
      assert.strictEqual(code, 0, stderr);

      const feed = readFeed(join(dir, "posts.json"));
      assert.strictEqual(feed.account, "glasgowbbcc");
      assert.deepStrictEqual(
        feed.posts.map((p) => p.id),
        ["VID1", "IMG1", "CAR1", "IMG2", "IMG3", "IMG4"],
        "posts must be ordered newest-first and limited to six",
      );

      // Post object shape, exactly as the feed contract requires.
      assert.deepStrictEqual(feed.posts[1], {
        id: "IMG1",
        permalink: "https://instagram.com/p/IMG1",
        image: "instagram/IMG1.jpg",
        caption: longCaption,
        alt: longCaption.slice(0, 120),
        timestamp: "2024-01-05T09:30:00.000Z",
      });

      // Video uses thumbnail_url; carousel uses the first child's media_url.
      assert.ok(existsSync(join(assetsDir, "VID1.jpg")));
      assert.ok(existsSync(join(assetsDir, "CAR1.jpg")));
      assert.ok(!existsSync(join(assetsDir, "CAR1-a.jpg")));
      assert.ok(!existsSync(join(assetsDir, "CAR1-b.jpg")));

      // Empty caption becomes empty caption + alt.
      const carousel = feed.posts.find((p) => p.id === "CAR1");
      assert.strictEqual(carousel.caption, "");
      assert.strictEqual(carousel.alt, "");
      assert.strictEqual(carousel.image, "instagram/CAR1.jpg");

      // Oldest post beyond the limit is neither in the feed nor downloaded.
      assert.ok(!feed.posts.some((p) => p.id === "OLD1"));
      assert.ok(!existsSync(join(assetsDir, "OLD1.jpg")), "stale image pruned");
      assert.ok(existsSync(join(assetsDir, "note.txt")), "non-jpg files kept");

      // Every remaining .jpg matches a post ID in the feed.
      const jpgs = readdirSync(assetsDir).filter((f) => f.endsWith(".jpg"));
      const ids = new Set(feed.posts.map((p) => p.id));
      for (const jpg of jpgs) {
        assert.ok(
          ids.has(jpg.slice(0, -4)),
          `${jpg} must match a post ID in the feed`,
        );
      }
    } finally {
      await server.close();
    }
  });
});

// ── Failure cases ────────────────────────────────────────────────────────

describe("fetch-instagram: failures leave no files written or modified", () => {
  it("exits 1 when the Graph API returns a non-2xx status", async () => {
    const { dir, assetsDir } = tempDir();
    writeFileSync(join(assetsDir, "existing.jpg"), "old");
    const server = await startMockFeed({
      makePosts: () => [],
      graphStatus: 500,
      graphBody: { error: { message: "boom" } },
    });
    try {
      const { code } = await runScript({
        IGRAPH_API_URL: server.graphUrl,
        IG_ACCESS_TOKEN: "test-token",
        FEED_FILE: join(dir, "posts.json"),
        ASSETS_DIR: assetsDir,
      });
      assert.strictEqual(code, 1);
      assert.ok(!existsSync(join(dir, "posts.json")), "must not write posts.json");
      assert.strictEqual(
        readdirSync(assetsDir).join(","),
        "existing.jpg",
        "must not modify existing assets",
      );
    } finally {
      await server.close();
    }
  });

  it("exits 1 when the Graph API returns an error body with HTTP 200", async () => {
    const { dir, assetsDir } = tempDir();
    writeFileSync(join(assetsDir, "existing.jpg"), "old");
    const server = await startMockFeed({
      graphBody: { error: { message: "token invalid" } },
    });
    try {
      const { code } = await runScript({
        IGRAPH_API_URL: server.graphUrl,
        IG_ACCESS_TOKEN: "test-token",
        FEED_FILE: join(dir, "posts.json"),
        ASSETS_DIR: assetsDir,
      });
      assert.strictEqual(code, 1);
      assert.ok(!existsSync(join(dir, "posts.json")));
      assert.strictEqual(readdirSync(assetsDir).join(","), "existing.jpg");
    } finally {
      await server.close();
    }
  });

  it("exits 1 on a network error and writes nothing", async () => {
    const { dir, assetsDir } = tempDir();
    writeFileSync(join(assetsDir, "existing.jpg"), "old");
    // Port 1 is closed: connection refused.
    const { code } = await runScript({
      IGRAPH_API_URL: "http://127.0.0.1:1/graph",
      IG_ACCESS_TOKEN: "test-token",
      FEED_FILE: join(dir, "posts.json"),
      ASSETS_DIR: assetsDir,
    });
    assert.strictEqual(code, 1);
    assert.ok(!existsSync(join(dir, "posts.json")));
    assert.strictEqual(readdirSync(assetsDir).join(","), "existing.jpg");
  });

  it("exits 1 when an image download fails and leaves no files written", async () => {
    const { dir, assetsDir } = tempDir();
    writeFileSync(join(assetsDir, "existing.jpg"), "old");
    const server = await startMockFeed({
      makePosts: (base) => [
        {
          id: "OK1",
          permalink: "https://instagram.com/p/OK1",
          media_type: "IMAGE",
          media_url: `${base}/img/OK1.jpg`,
          caption: "ok",
          timestamp: "2024-01-10T10:00:00+0000",
        },
        {
          id: "BAD1",
          permalink: "https://instagram.com/p/BAD1",
          media_type: "IMAGE",
          media_url: `${base}/img/BAD1.jpg`,
          caption: "bad",
          timestamp: "2024-01-09T10:00:00+0000",
        },
      ],
      missingImages: ["/img/BAD1.jpg"],
    });
    try {
      const { code } = await runScript({
        IGRAPH_API_URL: server.graphUrl,
        IG_ACCESS_TOKEN: "test-token",
        FEED_FILE: join(dir, "posts.json"),
        ASSETS_DIR: assetsDir,
      });
      assert.strictEqual(code, 1);
      assert.ok(!existsSync(join(dir, "posts.json")), "must not write posts.json");
      assert.strictEqual(
        readdirSync(assetsDir).join(","),
        "existing.jpg",
        "must not write the successful image either (all-or-nothing)",
      );
    } finally {
      await server.close();
    }
  });
});

// ── Image hygiene on a real change ───────────────────────────────────────

describe("fetch-instagram: image hygiene", () => {
  it("keeps only .jpg files whose IDs are in the new feed", async () => {
    const { dir, assetsDir } = tempDir();
    writeFileSync(join(assetsDir, "GONE.jpg"), "old");
    writeFileSync(join(assetsDir, "KEEP.jpg"), "old");
    writeFileSync(join(assetsDir, ".gitkeep"), "");
    const server = await startMockFeed({
      makePosts: (base) => [
        {
          id: "KEEP",
          permalink: "https://instagram.com/p/KEEP",
          media_type: "IMAGE",
          media_url: `${base}/img/KEEP.jpg`,
          caption: "kept",
          timestamp: "2024-01-10T10:00:00+0000",
        },
      ],
    });
    try {
      const { code } = await runScript({
        IGRAPH_API_URL: server.graphUrl,
        IG_ACCESS_TOKEN: "test-token",
        FEED_FILE: join(dir, "posts.json"),
        ASSETS_DIR: assetsDir,
      });
      assert.strictEqual(code, 0);
      assert.ok(!existsSync(join(assetsDir, "GONE.jpg")), "stale jpg deleted");
      assert.ok(existsSync(join(assetsDir, "KEEP.jpg")), "kept jpg present");
      assert.ok(existsSync(join(assetsDir, ".gitkeep")), ".gitkeep preserved");
      const feed = readFeed(join(dir, "posts.json"));
      assert.deepStrictEqual(feed.posts.map((p) => p.id), ["KEEP"]);
    } finally {
      await server.close();
    }
  });
});
