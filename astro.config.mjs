// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import sitemap from "@astrojs/sitemap";

// `site` drives canonical URLs, the sitemap and the Open Graph tags in
// Base.astro.
//
// CMS_EDIT=1 builds the portal's copy of the site (see portal/README.md):
// served under /site/ on the portal, with every editable field marked for
// the editor. It is never deployed to the public domain. Asset and page
// paths go through src/lib/url.ts so they follow `base` in both builds.
const cmsEdit = process.env.CMS_EDIT === "1";

export default defineConfig({
  site: "https://acostaroofingpnw.com",
  base: cmsEdit ? "/site" : undefined,
  integrations: [icon(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});