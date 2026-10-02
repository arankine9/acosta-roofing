// The site's pages, discovered from the edit build's sitemap, each labelled
// by its <title> and tied to its content file (<meta name="cms-file">).

import { BASE } from "./render.js";

const SUFFIX = / \| Acosta Roofing$/;

export const FILE_LABELS = {
  site: "Business info",
  shared: "Text on every page",
  services: "Services list",
};

async function sitemapPaths() {
  const parse = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  try {
    const index = await fetch(`${BASE}/sitemap-index.xml`).then((r) => (r.ok ? r.text() : ""));
    let locs = parse(index);
    const maps = locs.filter((l) => l.endsWith(".xml"));
    if (maps.length) {
      locs = [];
      for (const m of maps) {
        const xml = await fetch(`${BASE}/${new URL(m).pathname.split("/").pop()}`).then((r) => (r.ok ? r.text() : ""));
        locs.push(...parse(xml));
      }
    }
    const paths = locs.map((l) => new URL(l).pathname).filter((p) => p.startsWith(BASE + "/"));
    if (paths.length) return paths;
  } catch {}
  return null;
}

async function navPaths() {
  const html = await fetch(`${BASE}/`).then((r) => r.text());
  const doc = new DOMParser().parseFromString(html, "text/html");
  const set = new Set([`${BASE}/`]);
  for (const a of doc.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (href.startsWith(BASE + "/") && !href.includes("#")) set.add(href.endsWith("/") ? href : href + "/");
  }
  return [...set];
}

export const labelFromTitle = (title, path) => {
  if (path === `${BASE}/`) return "Home";
  return (title || "").replace(SUFFIX, "").trim() || path.replace(BASE, "").replace(/\//g, " ").trim();
};

/* Resolves to [{ path, label, file }] in sitemap order, Home first. The
   labels arrive as each page is fetched; `onUpdate` is called as they do. */
export async function discoverPages(onUpdate) {
  const paths = (await sitemapPaths()) || (await navPaths());
  const pages = paths.map((path) => ({
    path,
    label: path === `${BASE}/` ? "Home" : path.replace(BASE, "").replace(/^\/|\/$/g, "").split("/").pop().replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
    file: null,
  }));
  pages.sort((a, b) => (a.path === `${BASE}/` ? -1 : b.path === `${BASE}/` ? 1 : 0));
  onUpdate?.(pages);
  let i = 0;
  const worker = async () => {
    while (i < pages.length) {
      const p = pages[i++];
      try {
        const html = await fetch(p.path).then((r) => r.text());
        const doc = new DOMParser().parseFromString(html, "text/html");
        p.label = labelFromTitle(doc.querySelector("title")?.textContent, p.path);
        p.file = doc.querySelector('meta[name="cms-file"]')?.content || null;
        p.keys = new Set([...doc.querySelectorAll("[data-cms]")].map((e) => e.getAttribute("data-cms")));
      } catch {}
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  onUpdate?.(pages);
  return pages;
}

/* A plain name for a content file: the page it belongs to, or what it is. */
export function fileLabel(id, pages) {
  if (FILE_LABELS[id]) return FILE_LABELS[id];
  const page = pages?.find((p) => p.file === id);
  if (page) return page.label;
  const name = id.replace(/^pages\//, "").replace(/^services-/, "").replace(/-/g, " ");
  return name.replace(/^./, (c) => c.toUpperCase());
}
