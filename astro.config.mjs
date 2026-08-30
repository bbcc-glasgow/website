// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://bbcc.scot",
  integrations: [
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
