// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import sitemap from "@astrojs/sitemap";

// `site` drives canonical URLs, the sitemap and the Open Graph tags in
// Base.astro.
//
// GH_PAGES=1 builds for the GitHub Pages project site, which lives under a
// /acosta-roofing/ subpath. Asset paths go through src/lib/url.ts so they
// follow `base` in both modes.
const ghPages = process.env.GH_PAGES === "1";

export default defineConfig({
  site: ghPages ? "https://arankine9.github.io" : "https://acostaroofingpnw.com",
  base: ghPages ? "/acosta-roofing" : undefined,
  integrations: [icon(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});