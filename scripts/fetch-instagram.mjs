#!/usr/bin/env node
// Daily Instagram feed fetch.
//
// Calls the Instagram Graph API for the six most recent posts on BBCC's
// account, downloads each post image into src/assets/instagram/, writes the
// feed data to src/data/instagram/posts.json, and prunes images whose post ID
// is no longer in the latest six.
//
// Exit codes (used by .github/workflows/instagram-feed.yml):
//   0 - feed fetched and written, OR IG_ACCESS_TOKEN absent (forks/previews
//       skip the fetch without failing the run)
//   1 - Graph API call failed, an image download failed, or writing failed;
//       no files are written or modified on this path
//
// Output paths and the API base URL are overridable via env so tests can run
// the script against a mock server and a throwaway directory.
import { mkdirSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const feedFile =
  process.env.FEED_FILE ||
  resolve(repoRoot, "src/data/instagram/posts.json");
const assetsDir =
  process.env.ASSETS_DIR || resolve(repoRoot, "src/assets/instagram");

const API_BASE =
  process.env.IGRAPH_API_URL ||
  "https://graph.facebook.com/v19.0/me/media";
const API_FIELDS =
  "id,permalink,media_type,media_url,thumbnail_url,children{media_url},caption,timestamp";
const MAX_POSTS = 6;
const ALT_MAX_LENGTH = 120;
const ACCOUNT = "glasgowbbcc";

// Resolve the image download URL for a post, or undefined when the media type
// has no downloadable image (the post is then excluded from the feed).
export function postImageUrl(post) {
  if (post.media_type === "IMAGE") return post.media_url;
  if (post.media_type === "VIDEO") return post.thumbnail_url;
  if (post.media_type === "CAROUSEL_ALBUM") {
    return post.children?.data?.[0]?.media_url;
  }
  return undefined;
}

// Build the feed post object. alt is the caption truncated to ALT_MAX_LENGTH
// code points (empty string when there is no caption), timestamp is normalised
// to ISO 8601 UTC.
export function buildPost(post) {
  const caption = post.caption || "";
  const alt = caption
    ? Array.from(caption).slice(0, ALT_MAX_LENGTH).join("")
    : "";
  return {
    id: post.id,
    permalink: post.permalink,
    image: `instagram/${post.id}.jpg`,
    caption,
    alt,
    timestamp: new Date(post.timestamp).toISOString(),
  };
}

// Select the six most recent posts, ordered by timestamp descending. Posts
// missing a required field (id, permalink, timestamp) are dropped.
export function selectPosts(entries, max = MAX_POSTS) {
  return entries
    .filter((post) => post.id && post.permalink && post.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, max);
}

async function fetchFeed(token) {
  const url = new URL(API_BASE);
  url.searchParams.set("fields", API_FIELDS);
  url.searchParams.set("limit", String(MAX_POSTS));
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Graph API returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }
  const body = await res.json();
  if (body.error) {
    throw new Error(`Graph API error: ${body.error.message}`);
  }
  return body.data || [];
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`empty body for ${url}`);
  }
  return buffer;
}

async function main() {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) {
    console.log("IG_ACCESS_TOKEN not set - skipping feed fetch");
    process.exit(0);
  }

  let entries;
  try {
    entries = await fetchFeed(token);
  } catch (err) {
    console.error(`Instagram feed fetch failed: ${err.message}`);
    process.exit(1);
  }

  // Download every selected image into memory first; only when all downloads
  // succeed do we touch the filesystem, so a mid-run failure leaves the
  // previous feed and images untouched.
  const selected = selectPosts(entries);
  const downloads = [];
  const feedPosts = [];
  for (const post of selected) {
    const url = postImageUrl(post);
    if (!url) {
      console.warn(
        `Skipping post ${post.id}: no image URL for media_type ${post.media_type || "unknown"}`,
      );
      continue;
    }
    let buffer;
    try {
      buffer = await downloadImage(url);
    } catch (err) {
      console.error(`Image download failed for post ${post.id}: ${err.message}`);
      process.exit(1);
    }
    downloads.push({ id: post.id, buffer });
    feedPosts.push(buildPost(post));
  }

  // Write new images, prune stale ones, then the feed file.
  mkdirSync(assetsDir, { recursive: true });
  for (const { id, buffer } of downloads) {
    writeFileSync(join(assetsDir, `${id}.jpg`), buffer);
  }

  const keep = new Set(feedPosts.map((post) => post.id));
  for (const entry of readdirSync(assetsDir)) {
    if (!entry.endsWith(".jpg")) continue;
    const id = entry.slice(0, -".jpg".length);
    if (!keep.has(id)) {
      unlinkSync(join(assetsDir, entry));
      console.log(`Removed stale image ${entry}`);
    }
  }

  const feed = { account: ACCOUNT, posts: feedPosts };
  writeFileSync(feedFile, `${JSON.stringify(feed, null, 2)}\n`);
  console.log(`Wrote ${feedPosts.length} posts to ${feedFile}`);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
