import { page } from "../lib/url";

// Registry of the service pages. The nav's Services menu, the footer, the
// /services/ index and each page's "related services" row all read from
// here, so a service is renamed or re-pictured in one place. The long-form
// content lives in the page itself under src/pages/services/.
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

export const services: Service[] = [
  {
    slug: "roof-replacement",
    title: "Roof replacement",
    group: "residential",
    summary:
      "Tear-off to deck, new underlayment, flashing and ventilation, and a shingle roof built for a wet Oregon winter.",
    tagline: "Tear-off to the deck, built new",
    image: "/images/roof-replacement/shingles-over-underlayment.jpg",
    alt: "Roofer nailing new architectural shingles over synthetic underlayment",
  },
  {
    slug: "roof-repair",
    title: "Roof repair",
    group: "residential",
    summary:
      "Leaks, lifted or missing shingles, failed flashing and storm damage, found at the source and fixed to match.",
    tagline: "Leaks, flashing, missing shingles",
    image: "/images/roof-repair/opened-roof-section.jpg",
    alt: "Roofer standing on a section of roof opened up for repair",
  },
  {
    slug: "roof-maintenance",
    title: "Roof maintenance",
    group: "residential",
    summary:
      "Moss treatment, debris clearing and a close inspection, so small problems are caught before they reach the ceiling.",
    tagline: "Moss, debris and inspections",
    image: "/images/roof-maintenance/moss-shingle-roof-skylight.jpg",
    alt: "Moss growing along the courses of a shingle roof around a skylight",
  },
  {
    slug: "gutters",
    title: "Gutter systems",
    group: "residential",
    summary:
      "Seamless gutters and downspouts sized for Northwest rain, pitched to drain and hung to carry the load.",
    tagline: "Seamless gutters and downspouts",
    image: "/images/gutters/gutter-outlet-and-downspout.jpg",
    alt: "Seamless aluminum gutter with its outlet, elbows and downspout",
  },
  {
    slug: "commercial",
    title: "Commercial roofing",
    group: "commercial",
    summary:
      "Single-ply and low-slope systems for shops, warehouses and light-industrial buildings, detailed at every curb and drain.",
    tagline: "TPO, PVC and low-slope systems",
    image: "/images/commercial/white-membrane-rooftop-units.jpg",
    alt: "White membrane roof with rooftop units on a commercial building",
  },
  {
    slug: "multi-unit",
    title: "Multi-unit roofing",
    group: "multi-unit",
    summary:
      "Apartments, condos and townhome rows, planned building by building around the people living underneath.",
    tagline: "Apartments, condos, townhomes",
    image: "/images/multi-unit.jpg",
    alt: "Aerial view of rows of townhomes with gray shingle roofs",
  },
];

export const serviceHref = (slug: string) => page(`/services/${slug}/`);

// 160x120 crop of `image` for the nav menu, so the menu doesn't pull six
// full-size photos. Regenerate it when a service's `image` changes:
//   sips -c <4:3 crop> <image> --out public/images/thumbs/<slug>.jpg
//   sips -z 120 160 public/images/thumbs/<slug>.jpg
export const serviceThumb = (slug: string) => `/images/thumbs/${slug}.jpg`;

export const residentialHref = page("/services/residential/");

export const servicesByGroup = (group: ServiceGroup) =>
  services.filter((service) => service.group === group);

export const getService = (slug: string) => {
  const service = services.find((entry) => entry.slug === slug);
  if (!service) throw new Error(`Unknown service: ${slug}`);
  return service;
};
