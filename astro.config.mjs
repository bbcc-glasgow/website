// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// TODO: replace with the real domain once BBCC settles one (drives canonical URLs).
export default defineConfig({
  site: "https://bbcc-website.workers.dev",
  vite: {
    plugins: [tailwindcss()],
  },
});
