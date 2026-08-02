// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";

// TODO: confirm the domain is registered: it drives canonical URLs, the
// sitemap and the Open Graph tags in Base.astro.
export default defineConfig({
  site: "https://acostaroofing.com",
  integrations: [icon()],
  vite: {
    plugins: [tailwindcss()],
  },
});
