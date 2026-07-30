// Site-mode gate in front of the static assets (run_worker_first).
//
// SITE_MODE (wrangler.jsonc `vars`, overridable in the Cloudflare dashboard):
//   "live"    — pass every request through to the built site.
//   "holding" — serve the holding page for every route, so nothing under
//               development is publicly reachable. Hashed build assets and
//               images stay served (the holding page needs its own CSS/logo;
//               everything under /_astro/ is content-hashed and unguessable).
//
// The worker runs on every request, so flipping SITE_MODE takes effect
// immediately — no rebuild, no cache purge. Note that a dashboard edit is
// temporary: the next deploy resets SITE_MODE to the value in wrangler.jsonc,
// which is the source of truth.

export default {
  async fetch(request, env) {
    if (env.SITE_MODE === "live") {
      return env.ASSETS.fetch(request);
    }

    const url = new URL(request.url);
    const passthrough =
      url.pathname.startsWith("/_astro/") ||
      url.pathname.startsWith("/images/") ||
      url.pathname.startsWith("/admin");
    if (passthrough) {
      return env.ASSETS.fetch(request);
    }

    const holding = await env.ASSETS.fetch(new URL("/holding/", url));
    // Serve at the requested URL (no redirect), correct status for robots.
    return new Response(holding.body, {
      status: url.pathname === "/" ? 200 : 503,
      headers: holding.headers,
    });
  },
};
