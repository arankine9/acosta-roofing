// Prefix a root-relative public path with the configured base path, so the
// same source works at the site root (production domain) and under a
// subpath (GitHub Pages project site at /acosta-roofing/).
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const asset = (path: string) => `${base}${path}`;
export const home = base || "/";
