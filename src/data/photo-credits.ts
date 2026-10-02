import { page } from "../lib/url";

// Every sourced photograph on the site, grouped by the page it appears on,
// with the photographer, where it came from and the licence it is used
// under. /photo-credits/ renders this list.
//
// It is a record, not a courtesy: the Creative Commons BY and BY-SA licences
// require visible credit, and this page is where that credit lives for any
// photo whose caption doesn't already carry it. Unsplash and Pexels photos
// need no credit but are listed anyway, so the licence of every image on
// the site can be checked from one place.
//
// Add a line here whenever a photo is added. Photos Acosta shoots of its
// own jobs don't need an entry.
//
// Only photos still on the site are listed (see `onSite` below): most photos
// are image fields in src/content/, which the owner can replace from the
// portal, and when he swaps a stock photo for his own its credit drops off
// the page with it. An entry for a photo that's gone can stay here; it just
// isn't shown.

const licenses = {
  unsplash: { name: "Unsplash License", url: "https://unsplash.com/license" },
  pexels: { name: "Pexels License", url: "https://www.pexels.com/license/" },
  "by-2.0": { name: "CC BY 2.0", url: "https://creativecommons.org/licenses/by/2.0/" },
  "by-sa-2.0": { name: "CC BY-SA 2.0", url: "https://creativecommons.org/licenses/by-sa/2.0/" },
  "by-sa-3.0": { name: "CC BY-SA 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/" },
  "by-sa-4.0": { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
} as const;

type LicenseKey = keyof typeof licenses;

export interface Credit {
  /* Path under public/. */
  file: string;
  /* What the photo shows, in a few words. */
  subject: string;
  author: string;
  /* The photo's own page. Empty when it wasn't recorded at download. */
  source: string;
  license: LicenseKey;
  /* Resized and recompressed only, unless noted here. */
  changes?: string;
}

export interface CreditGroup {
  page: string;
  href: string;
  credits: Credit[];
}

export const licenseInfo = (key: LicenseKey) => licenses[key];

// Where photos are used. An image field in content is an object with a
// `src`; a template or data file names its photo as a quoted path
// (asset("/images/..."), src: "/images/..."). This file is left out of the
// search, since it names every photo.
const content = import.meta.glob<unknown>("../content/**/*.json", { eager: true, import: "default" });
const sources = import.meta.glob<string>(["../**/*.astro", "../**/*.ts"], {
  eager: true,
  query: "?raw",
  import: "default",
});

const contentImages = new Set<string>();
const collect = (value: unknown): void => {
  if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === "object") {
    const src = (value as { src?: unknown }).src;
    if (typeof src === "string") contentImages.add(src);
    Object.values(value).forEach(collect);
  }
};
Object.values(content).forEach(collect);

const templates = Object.entries(sources)
  .filter(([path]) => !path.endsWith("/photo-credits.ts"))
  .map(([, source]) => source);

/* True while the photo is on the site: an image `src` in content, or still
   named in a template. */
export const onSite = (file: string) =>
  contentImages.has(file) ||
  templates.some((source) => ['"', "'", "`"].some((q) => source.includes(`${q}${file}${q}`)));

const allCredits: CreditGroup[] = [
  {
    page: "Home page",
    href: page("/"),
    credits: [
      {
        file: "/images/multi-unit.jpg",
        subject: "Aerial view of new townhouses with gray roofs",
        author: "Eric Dahm",
        source: "",
        license: "unsplash",
      },
    ],
  },
  {
    page: "Residential",
    href: page("/services/residential/"),
    credits: [
      {
        file: "/images/residential/portland-bungalow-winter.jpg",
        subject: "2442 NE 8th, Irvington, Portland",
        author: "Ian Poellet",
        source: "https://commons.wikimedia.org/wiki/File:2442_NE_8_-_Irvington_HD_-_Portland_Oregon.jpg",
        license: "by-sa-4.0",
      },
      {
        file: "/images/residential/bungalow-under-trees.jpg",
        subject: "3343 NE 11th, Irvington, Portland",
        author: "Ian Poellet",
        source: "https://commons.wikimedia.org/wiki/File:3343_NE_11_-_Irvington_HD_-_Portland_Oregon.jpg",
        license: "by-sa-4.0",
      },
      {
        file: "/images/residential/worn-out-shingles.jpg",
        subject: "Failure of asphalt shingles allowing roof leakage",
        author: "Dale Mahalko",
        source: "https://commons.wikimedia.org/wiki/File:Failure_of_asphalt_shingles_allowing_roof_leakage.JPG",
        license: "by-sa-3.0",
      },
    ],
  },
  {
    page: "Roof replacement",
    href: page("/services/roof-replacement/"),
    credits: [
      {
        file: "/images/roof-replacement/shingles-over-underlayment.jpg",
        subject: "Roofer installing shingles on a new roof",
        author: "Ryan Stephens",
        source: "https://www.pexels.com/photo/professional-roofer-installing-shingles-on-new-roof-33404248/",
        license: "pexels",
      },
      {
        file: "/images/roof-replacement/deck-and-underlayment.jpg",
        subject: "Historic home roof replacement",
        author: "Ryan Stephens",
        source: "https://www.pexels.com/photo/historic-home-roof-replacement-in-weatherford-33501308/",
        license: "pexels",
      },
      {
        file: "/images/roof-replacement/cracked-shingles.jpg",
        subject: "Asphalt shingles damage",
        author: "Samuel Bolton",
        source: "https://commons.wikimedia.org/wiki/File:Asphalt_shingles_damage.jpg",
        license: "by-sa-4.0",
      },
    ],
  },
  {
    page: "Roof repair",
    href: page("/services/roof-repair/"),
    credits: [
      {
        file: "/images/roof-repair/opened-roof-section.jpg",
        subject: "A man standing on the roof of a house",
        author: "Zohair Mirza",
        source: "https://unsplash.com/photos/-1l0iZaM8ms",
        license: "unsplash",
      },
      {
        file: "/images/roof-repair/failed-chimney-flashing.jpg",
        subject: "Bad chimney flashing",
        author: "Sandul1234",
        source: "https://commons.wikimedia.org/wiki/File:Bad_chimney_flashing.jpg",
        license: "by-sa-4.0",
      },
      {
        file: "/images/roof-repair/limb-through-shingles.jpg",
        subject: "Branch in a roof",
        author: "Sandul1234",
        source: "https://commons.wikimedia.org/wiki/File:Branch_in_a_roof.jpg",
        license: "by-sa-4.0",
      },
    ],
  },
  {
    page: "Roof maintenance",
    href: page("/services/roof-maintenance/"),
    credits: [
      {
        file: "/images/roof-maintenance/moss-shingle-roof-skylight.jpg",
        subject: "Moss on roof",
        author: "Jay Pscheidt, Oregon State University Extension Service",
        source: "https://www.flickr.com/photos/oregonstateuniversity/49527862622",
        license: "by-sa-2.0",
      },
      {
        file: "/images/roof-maintenance/moss-in-shingle-keyways.jpg",
        subject: "Roof before treatment",
        author: "Joey (jchaven)",
        source: "https://www.flickr.com/photos/88201963@N00/54048044054",
        license: "by-2.0",
      },
      {
        file: "/images/roof-maintenance/moss-on-shingles-close.jpg",
        subject: "Nature vs. Roof",
        author: "GollyGforce",
        source: "https://www.flickr.com/photos/20581458@N00/14654053753",
        license: "by-2.0",
      },
    ],
  },
  {
    page: "Gutter systems",
    href: page("/services/gutters/"),
    credits: [
      {
        file: "/images/gutters/gutter-running-full-in-rain.jpg",
        subject: "2015-365-185 Gutter Rain Dance",
        author: "Alan Levine",
        source: "https://www.flickr.com/photos/cogdogblog/19422570802",
        license: "by-2.0",
      },
      {
        file: "/images/gutters/seamless-gutter-machine.jpg",
        subject: "Seamless aluminum gutter making machine",
        author: "pointnshoot",
        source: "https://www.flickr.com/photos/18244673@N00/362243326",
        license: "by-2.0",
      },
      {
        file: "/images/gutters/gutter-outlet-and-downspout.jpg",
        subject: "Upstate New York seamless aluminum gutters",
        author: "Stilfehler",
        source: "https://commons.wikimedia.org/wiki/File:Upstate_New_York_Seamless_Aluminum_Gutters_02.jpg",
        license: "by-sa-4.0",
      },
      {
        file: "/images/gutters/standing-water-in-gutter.jpg",
        subject: "Gutter clog",
        author: "Eric Schmuttenmaer",
        source: "https://www.flickr.com/photos/88583398@N00/2529849524",
        license: "by-sa-2.0",
      },
    ],
  },
  {
    page: "Commercial roofing",
    href: page("/services/commercial/"),
    credits: [
      {
        file: "/images/commercial/white-membrane-rooftop-units.jpg",
        subject: "White membrane roof with rooftop units",
        author: "Toni Reed",
        source: "https://unsplash.com/photos/Ba_o2rvI5aY",
        license: "unsplash",
      },
      {
        file: "/images/commercial/light-industrial-low-slope.jpg",
        subject: "Light-industrial buildings from above",
        author: "Alex Reynolds",
        source: "https://unsplash.com/photos/rHvi-_-0jUU",
        license: "unsplash",
        changes: "Cropped",
      },
      {
        file: "/images/commercial/rooftop-unit-parapet-drain.jpg",
        subject: "Rooftop unit, parapet and drain",
        author: "Linus Belanger",
        source: "https://unsplash.com/photos/vvDUCfhiDpE",
        license: "unsplash",
        changes: "Cropped, saturation reduced",
      },
    ],
  },
  {
    page: "Multi-unit roofing",
    href: page("/services/multi-unit/"),
    credits: [
      {
        file: "/images/multi-unit/townhome-roofs-gutters.jpg",
        subject: "Townhome row",
        author: "Doctor Tinieblas",
        source: "https://unsplash.com/photos/y-hnPtZo0kk",
        license: "unsplash",
      },
      {
        file: "/images/multi-unit/townhome-row-driveways.jpg",
        subject: "Townhomes with garages and balconies",
        author: "Marcus Lenk",
        source: "https://unsplash.com/photos/wKO0rx50VWo",
        license: "unsplash",
      },
      {
        file: "/images/multi-unit/garden-apartments-trees.jpg",
        subject: "Garden apartments among trees",
        author: "Brevan Combs",
        source: "https://unsplash.com/photos/tPCPkHt-8GI",
        license: "unsplash",
        changes: "Cropped",
      },
    ],
  },
  {
    page: "Roofing materials",
    href: page("/materials/"),
    credits: [
      {
        file: "/images/materials/page/rain-on-shingles.jpg",
        subject: "Rain running off a shingle roof",
        author: "Luke Southern",
        source: "https://unsplash.com/photos/ZzZouwiQWV0",
        license: "unsplash",
      },
      {
        file: "/images/materials/page/architectural-shingle.jpg",
        subject: "Architectural shingle courses",
        author: "Hal Gatewood",
        source: "https://unsplash.com/photos/9u5r1XbtMJg",
        license: "unsplash",
      },
      {
        file: "/images/materials/page/white-single-ply-over-old-roof.jpg",
        subject: "Workers adding reflective roofing material",
        author: "Daniel X. O'Neil",
        source: "https://www.flickr.com/photos/juggernautco/3016888550",
        license: "by-2.0",
        changes: "Cropped",
      },
    ],
  },
  {
    page: "Service area",
    href: page("/service-area/"),
    credits: [
      {
        file: "/images/service-area/portland-street.jpg",
        subject: "Houses on a Portland street",
        author: "Brett Sayles",
        source: "https://www.pexels.com/photo/multi-colored-suburb-family-houses-17205886/",
        license: "pexels",
      },
      {
        file: "/images/service-area/columbia-gorge.jpg",
        subject: "Columbia River Gorge",
        author: "Michael McGarry",
        source: "https://www.pexels.com/photo/river-in-mountains-landscape-15283542/",
        license: "pexels",
      },
      {
        file: "/images/service-area/molalla-pasture.jpg",
        subject: "Pasture near Molalla",
        author: "Michael McGarry",
        source: "https://www.pexels.com/photo/livestock-and-trees-15606706/",
        license: "pexels",
      },
      {
        file: "/images/service-area/mount-hood-from-sandy.jpg",
        subject: "Mount Hood from Sandy",
        author: "Soly Moses",
        source: "https://www.pexels.com/photo/scenic-view-of-mount-hood-in-autumn-forest-29883927/",
        license: "pexels",
      },
    ],
  },
  {
    page: "About",
    href: page("/about/"),
    credits: [
      {
        file: "/images/about/crew-on-shingle-roof.jpg",
        subject: "Starting roof install",
        author: "Jon Callas",
        source: "https://www.flickr.com/photos/joncallas/5303968859",
        license: "by-2.0",
        changes: "Cropped",
      },
      {
        file: "/images/about/west-union-farmhouse.jpg",
        subject: "Farmhouse, West Union, Washington County",
        author: "M.O. Stevens",
        source: "https://commons.wikimedia.org/wiki/File:22097_West_Union_Road_-_West_Union,_Oregon.JPG",
        license: "by-sa-3.0",
        changes: "Cropped",
      },
    ],
  },
  {
    page: "Contact",
    href: page("/contact/"),
    credits: [
      {
        file: "/images/contact/ladder-at-the-ridge.jpg",
        subject: "A ladder on the roof of a house",
        author: "Martin Martz",
        source: "https://unsplash.com/photos/6uNBAv7_7Qc",
        license: "unsplash",
      },
    ],
  },
];

/* The credits for photos still on the site, by page; a page with none left
   is dropped. */
export const photoCredits: CreditGroup[] = allCredits
  .map((group) => ({ ...group, credits: group.credits.filter((credit) => onSite(credit.file)) }))
  .filter((group) => group.credits.length > 0);
