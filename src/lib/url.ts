// Prefix a root-relative public path with the configured base path, so the
// same source works at the site root (production domain) and under a
// subpath (GitHub Pages project site at /acosta-roofing/).
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const asset = (path: string) => `${base}${path}`;
export const home = base || "/";

// Internal page links go through the same prefix. Pass the trailing slash
// ("/services/roof-repair/"), which is the form Astro builds and the sitemap
// lists. A hash can ride along: page("/contact/#estimate").
export const page = (path: string) => `${base}${path}`;

// True when `href` (a page() result) is the current page or one of its
// children. Used by the nav to mark the active section.
export const isCurrent = (pathname: string, href: string, exact = false) => {
  const trim = (p: string) => p.replace(/\/+$/, "") || "/";
  const here = trim(pathname);
  const target = trim(href.split("#")[0]);
  return exact || target === trim(home) ? here === target : here === target || here.startsWith(`${target}/`);
};
