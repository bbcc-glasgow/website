// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";

export default defineConfig({
  site: "https://bbcc.scot",
  integrations: [
    // Icons come from Heroicons v2 (MIT) rather than path data pasted into the
    // markup. astro-icon inlines the SVG at build time, so this costs no runtime
    // request and no client JavaScript — a CDN would be slower, adding a DNS
    // lookup and a connection to the critical path for artwork that is already
    // in the HTML.
    //
    // `include` names every icon the site uses, so the build never bundles the
    // whole 1,288-icon set, and this list doubles as the inventory: an icon
    // that is not here is not on the site (#37).
    icon({
      include: {
        heroicons: [
          "arrow-down-tray",
          "arrow-right",
          "arrow-top-right-on-square",
          "bars-3",
          "calendar-days",
          "clock",
          "document-text",
          "envelope",
          "map-pin",
          "puzzle-piece",
          "share",
          "x-mark",
        ],
        // Heroicons has no brand marks, and the social links need the real
        // ones: a generic glyph is not recognisable as Instagram at 20px in a
        // navbar. Simple Icons is CC0; the marks themselves are Meta's, used
        // here to point at the council's own profiles.
        "simple-icons": ["facebook", "instagram"],
      },
    }),
    sitemap({
      // /admin is the CMS. /holding is served at `/` by the worker while the
      // site is in holding mode, so the URL a crawler should know is `/`, not
      // the route it happens to be built from; listing both would offer two
      // URLs for one page (#37).
      filter: (page) =>
        !page.startsWith("https://bbcc.scot/admin") &&
        !page.startsWith("https://bbcc.scot/holding"),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
