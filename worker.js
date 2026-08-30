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

// The apex is canonical. www is a separate Workers custom domain pointing at
// the same script, so without this the site answers on two hostnames and every
// signal splits between them; the canonical link tag mitigates that but does
// not fix it (#37).
const CANONICAL_HOST = "bbcc.scot";

// Crawler-facing files that must resolve even in holding mode. A robots.txt or
// sitemap behind a 503 is the same as no robots.txt or sitemap: the policy this
// site publishes about itself only counts if it can be fetched now, while the
// holding page is what accrues the signals.
const CRAWLER_PATHS = new Set([
  "/robots.txt",
  "/sitemap-index.xml",
  "/sitemap-0.xml",
  "/llms.txt",
  "/favicon.ico",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    if (env.SITE_MODE === "live") {
      return env.ASSETS.fetch(request);
    }

    const passthrough =
      url.pathname.startsWith("/_astro/") ||
      url.pathname.startsWith("/images/") ||
      url.pathname.startsWith("/admin") ||
      CRAWLER_PATHS.has(url.pathname);
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
