import { page } from "../lib/url";
import { get, plain } from "../lib/cms";
import { residentialHref, servicesByGroup, getService } from "./services";

// The site's page map, read by the nav and the footer so both stay in step.
export const pages = {
  services: page("/services/"),
  residential: residentialHref,
  materials: page("/materials/"),
  serviceArea: page("/service-area/"),
  about: page("/about/"),
  faq: page("/faq/"),
  contact: page("/contact/"),
  privacy: page("/privacy/"),
  photoCredits: page("/photo-credits/"),
} as const;

// Where every "Free Estimate" button goes.
export const estimateHref = pages.contact;

// The labels are in src/content/shared.json under `nav`. Each entry carries
// its content key as `k`, so the nav can mark the label editable, and the
// label itself (tokens filled in) for anything that just wants the words.
const label = (k: string) => ({ k, label: plain(get<string>(k)) });

// Top-level links. Services carries the drop-down menu below.
export const primaryLinks = [
  { href: pages.services, ...label("shared:nav.links.services"), menu: true },
  { href: pages.materials, ...label("shared:nav.links.materials") },
  { href: pages.serviceArea, ...label("shared:nav.links.serviceArea") },
  { href: pages.about, ...label("shared:nav.links.about") },
  { href: pages.faq, ...label("shared:nav.links.faq") },
];

// The Services menu: residential work in one column, commercial and
// multi-unit in the next, each service with its card photo and tagline from
// the registry. `k` is the column's key prefix (its `heading` and `link`).
const column = (k: string) => ({
  k,
  heading: plain(get<string>(`${k}.heading`)),
  hrefLabel: plain(get<string>(`${k}.link`)),
});

export const serviceMenu = [
  {
    ...column("shared:nav.menu.residential"),
    href: pages.residential,
    items: servicesByGroup("residential"),
  },
  {
    ...column("shared:nav.menu.commercial"),
    href: pages.services,
    items: [getService("commercial"), getService("multi-unit")],
  },
];

// Short links under the commercial column: the pages people read while
// deciding, rather than services.
export const planningLinks = [
  { href: pages.materials, ...label("shared:nav.menu.planning.links.materials") },
  { href: pages.serviceArea, ...label("shared:nav.menu.planning.links.serviceArea") },
  { href: pages.faq, ...label("shared:nav.menu.planning.links.faq") },
];
