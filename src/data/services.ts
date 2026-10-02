import { page } from "../lib/url";
import registry from "../content/services.json";

// Registry of the service pages. The nav's Services menu, the footer, the
// /services/ index and each page's "related services" row all read from
// here, so a service is renamed or re-pictured in one place. The long-form
// content lives in the page itself under src/pages/services/.
//
// The words and photos are in src/content/services.json, which the owner
// edits from the portal (services can't be added or removed there; each has
// its own page). This module flattens each entry into the shape the site
// has always used. Where a template renders a registry value, it marks it
// with the entry's key (serviceKey below), so editing it edits the registry.
//
// `image` is the card photo used when another page links to this one; it is
// a path under public/, and its credit is in src/data/photo-credits.ts.
export type ServiceGroup = "residential" | "commercial" | "multi-unit";

export interface Service {
  slug: string;
  title: string;
  group: ServiceGroup;
  summary: string;
  /* A few words for the nav menu, where the summary is too long. */
  tagline: string;
  image: string;
  alt: string;
}

export const services: Service[] = registry.map(({ image, ...entry }) => ({
  slug: entry.slug,
  title: entry.title,
  group: entry.group as ServiceGroup,
  summary: entry.summary,
  tagline: entry.tagline,
  image: image.src,
  alt: image.alt,
}));

const indexOf = (slug: string) => {
  const index = registry.findIndex((entry) => entry.slug === slug);
  if (index === -1) throw new Error(`Unknown service: ${slug}`);
  return index;
};

/* Content key of a service's registry entry, e.g. "services:3": append
   ".title", ".summary", ".tagline" or ".image" for one of its fields. */
export const serviceKey = (slug: string) => `services:${indexOf(slug)}`;

export const serviceHref = (slug: string) => page(`/services/${slug}/`);

// 160x120 crop of `image` for the nav menu, so the menu doesn't pull six
// full-size photos. Its path is the entry's `image.thumb`, which the portal
// rewrites when it replaces the photo; by hand, regenerate it with
//   sips -c <4:3 crop> <image> --out public/images/thumbs/<slug>.jpg
//   sips -z 120 160 public/images/thumbs/<slug>.jpg
export const serviceThumb = (slug: string) => registry[indexOf(slug)].image.thumb;

export const residentialHref = page("/services/residential/");

export const servicesByGroup = (group: ServiceGroup) =>
  services.filter((service) => service.group === group);

export const getService = (slug: string) => {
  const service = services.find((entry) => entry.slug === slug);
  if (!service) throw new Error(`Unknown service: ${slug}`);
  return service;
};
