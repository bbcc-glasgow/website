#!/usr/bin/env node
// Long-lived Instagram token refresh.
//
// The IG_ACCESS_TOKEN used by scripts/fetch-instagram.mjs is a long-lived Graph
// API token that expires after roughly 60 days. After each successful feed-fetch
// run, this script exchanges the current token for a fresh one at the
// ig_exchange_token endpoint and writes the new value back to the IG_ACCESS_TOKEN
// repository secret via the GitHub Secrets API
// (PUT /repos/{owner}/{repo}/actions/secrets/IG_ACCESS_TOKEN), using the `gh` CLI
// authenticated with SECRETS_WRITE_PAT. The new token is piped to gh on stdin and
// is never written to a log.
//
// Exit codes (used by .github/workflows/instagram-feed.yml):
//   0 - token refreshed and the secret updated, OR IG_ACCESS_TOKEN absent (forks
//       and previews skip the refresh without failing the run)
//   1 - the refresh API call failed (non-2xx or network error), the response had
//       no access_token, or the secret update failed; the feed commit from the
//       fetch step is NOT rolled back
//
// The refresh endpoint and the gh binary are overridable via env so tests can run
// the script against a mock server and a fake gh.
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REFRESH_BASE =
  process.env.IGRAPH_REFRESH_URL ||
  "https://graph.facebook.com/v19.0/oauth/access_token";
const GH_BIN = process.env.GH_BIN || "gh";
const SECRET_NAME = "IG_ACCESS_TOKEN";

async function refreshToken(token) {
  const url = new URL(REFRESH_BASE);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("access_token", token);
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Token refresh API call failed: ${err.message}`);
  }
  if (!res.ok) {
    // The status only: the body and URL are never logged, so the current token
    // value cannot leak into the workflow log.
    throw new Error(`Token refresh API returned HTTP ${res.status}`);
  }
  const body = await res.json().catch(() => null);
  const newToken = body && body.access_token;
  if (!newToken) {
    throw new Error("Token refresh API response did not contain access_token");
  }
  return newToken;
}

function updateSecret(newToken, pat, repo) {
  try {
    execFileSync(GH_BIN, ["secret", "set", SECRET_NAME, "--repo", repo], {
      input: newToken,
      env: { ...process.env, GH_TOKEN: pat },
      stdio: ["pipe", "inherit", "inherit"],
    });
  } catch (err) {
    throw new Error(`Failed to update the ${SECRET_NAME} secret: ${err.message}`);
  }
}

async function main() {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) {
    console.log("IG_ACCESS_TOKEN not set - skipping token refresh");
    process.exit(0);
  }

  const pat = process.env.SECRETS_WRITE_PAT;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!pat || !repo) {
    throw new Error(
      "IG_ACCESS_TOKEN is set but SECRETS_WRITE_PAT or GITHUB_REPOSITORY is missing",
    );
  }

  const newToken = await refreshToken(token);
  updateSecret(newToken, pat, repo);
  console.log("Token refreshed successfully");
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err.message);
    console.error("Token refresh failed - MANUAL INTERVENTION REQUIRED");
    process.exit(1);
  });
}
