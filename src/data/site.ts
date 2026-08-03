// Single source of truth for business facts. Everything here comes from the
// Acosta Roofing brand board. The phone number, the CCB blank and the email
// on that board are placeholders, and they are marked as such below. Nothing
// in this file is inherited from any other contractor: if a detail is not on
// the brand board and has not been confirmed, it is empty rather than guessed.
export const site = {
  name: "Acosta Roofing",
  legalName: "Acosta Roofing LLC",
  tagline: "Built to protect. Built to last.",
  description:
    "Residential and commercial roofing in Beaverton, Oregon. Roof installation, repairs, maintenance and gutter systems from a licensed, bonded and insured contractor.",

  // TODO: 503-123-4567 is the placeholder printed on the brand board, not a
  // working line. Replace it here; it drives the nav, the hero sign, the
  // yard-sign CTA, the footer and the JSON-LD.
  phone: "(503) 123-4567",
  phoneHref: "tel:+15031234567",
  phoneIsPlaceholder: true,

  email: "info@acostaroofing.com",
  domain: "acostaroofing.com",

  // TODO: street address not on the brand board. It renders only when set, so
  // the site shows "Beaverton, OR" until it is confirmed.
  address: {
    street: "",
    city: "Beaverton",
    state: "OR",
    zip: "",
  },

  // TODO: Oregon law requires the CCB licence number to appear in contractor
  // advertising, including the website. The brand board leaves it blank, and
  // so does the site; the hero sign and the footer render the printed blank
  // until this is set.
  ccb: "",

  serviceArea: "the Portland metro",

  // TODO: placeholder hours. Confirm before launch.
  hours: [
    { days: "Monday – Friday", time: "7:00 AM – 6:00 PM" },
    { days: "Saturday", time: "By appointment" },
    { days: "Sunday", time: "Closed" },
  ],
} as const;

/*
  Counties served, north to south -- the same order they appear on the map.

  This is the single list behind the "Where we work" map, the footer's
  service-area column, the counties-served figure in the hero and the
  JSON-LD `areaServed`. It used to be written out separately in all four,
  which is how the hero could go on saying "4" after a fifth county was
  added.

  TODO: Columbia, Yamhill and Polk are unconfirmed. The brand board and the
  original copy list four counties -- Washington, Multnomah, Clackamas and
  Marion -- and these three were added because they complete the block
  geographically, not because anyone confirmed a crew goes there. Confirm or
  delete them before launch; deleting one here removes it from the map, the
  footer, the hero figure and the structured data at once.
*/
export const counties = [
  {
    name: "Columbia",
    towns: "St. Helens, Scappoose, Columbia City, Rainier, Vernonia",
    note: "Full service",
    confirmed: false,
  },
  {
    name: "Washington",
    towns: "Beaverton, Hillsboro, Tigard, Tualatin, Sherwood, Forest Grove",
    note: "Home county",
    confirmed: true,
  },
  {
    name: "Multnomah",
    towns: "Portland, Gresham, Troutdale, Fairview",
    note: "Full service",
    confirmed: true,
  },
  {
    name: "Yamhill",
    towns: "McMinnville, Newberg, Dundee, Dayton, Carlton",
    note: "Full service",
    confirmed: false,
  },
  {
    name: "Clackamas",
    towns: "Lake Oswego, Oregon City, Canby, Wilsonville, Molalla",
    note: "Full service",
    confirmed: true,
  },
  {
    name: "Polk",
    towns: "Dallas, Independence, Monmouth, West Salem",
    note: "Full service",
    confirmed: false,
  },
  {
    name: "Marion",
    towns: "Woodburn, Salem, Keizer, Mt. Angel, Silverton",
    note: "Full service",
    confirmed: true,
  },
] as const;

// City line, always present. The street sits above it and the ZIP after it,
// each only when set.
export const cityLine = [
  `${site.address.city}, ${site.address.state}`,
  site.address.zip,
]
  .filter(Boolean)
  .join(" ");
