// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// TODO: confirm the domain is registered — it drives canonical URLs, the
// sitemap and the Open Graph tags in Base.astro.
export default defineConfig({
  site: "https://acostaroofing.com",
  vite: {
    plugins: [tailwindcss()],
  },
});
