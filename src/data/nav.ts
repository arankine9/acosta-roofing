import { page } from "../lib/url";
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

// Top-level links. Services carries the drop-down menu below.
export const primaryLinks = [
  { href: pages.services, label: "Services", menu: true },
  { href: pages.materials, label: "Materials" },
  { href: pages.serviceArea, label: "Service Area" },
  { href: pages.about, label: "About" },
  { href: pages.faq, label: "FAQ" },
];

// The Services menu: residential work in one column, commercial and
// multi-unit in the next, each service with its card photo and tagline from
// the registry.
export const serviceMenu = [
  {
    heading: "Residential",
    href: pages.residential,
    hrefLabel: "Overview",
    items: servicesByGroup("residential"),
  },
  {
    heading: "Commercial & multi-unit",
    href: pages.services,
    hrefLabel: "All services",
    items: [getService("commercial"), getService("multi-unit")],
  },
];

// Short links under the commercial column: the pages people read while
// deciding, rather than services.
export const planningLinks = [
  { href: pages.materials, label: "Roofing materials" },
  { href: pages.serviceArea, label: "Service area" },
  { href: pages.faq, label: "Questions & answers" },
];
