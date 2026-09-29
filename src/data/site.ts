// Single source of truth for business facts. Everything here comes from the
// Acosta Roofing brand board or was supplied by the business (phone, email,
// CCB number). Nothing in this file is inherited from any other contractor:
// if a detail is not confirmed, it is empty rather than guessed.
export const site = {
  name: "Acosta Roofing",
  legalName: "Acosta Roofing LLC",
  tagline: "Built to protect. Built to last.",
  description:
    "Residential and commercial roofing in Beaverton, Oregon. Roof installation, repairs, maintenance and gutter systems from a licensed, bonded and insured contractor.",

  // Drives the nav, the hero sign, the CTA strip, the footer and the JSON-LD.
  phone: "(971) 280-9253",
  phoneHref: "tel:+19712809253",

  email: "Christian@acostaroofingpnw.com",
  domain: "acostaroofingpnw.com",

  // TODO: street address not on the brand board. It renders only when set, so
  // the site shows "Beaverton, OR" until it is confirmed.
  address: {
    street: "",
    city: "Beaverton",
    state: "OR",
    zip: "",
  },

  // Oregon CCB licence number. State law requires it in contractor
  // advertising, including the website; it prints on the hero sign and in
  // the footer.
  ccb: "263343",

  serviceArea: "the Portland metro",

  // TODO: placeholder hours. Confirm before launch.
  hours: [
    { days: "Monday – Friday", time: "7:00 AM – 6:00 PM" },
    { days: "Saturday", time: "By appointment" },
    { days: "Sunday", time: "Closed" },
  ],
} as const;

/*
  Counties the service area reaches, north to south.

  The service area is a drive time -- anywhere in Oregon within 75 minutes'
  drive of the Beaverton shop, off-peak (see scripts/build-drive-area.mjs) --
  so most of these counties are reached only in part. This list is written
  from the coverage report scripts/build-service-map.mjs prints: every
  county with a town inside the line, and only the towns that are. Tillamook
  and Clatsop are left off; the line crosses into each only over forest,
  with no town on the near side of it.

  This is the single list behind the county list beside the map, the
  footer's service-area column, the counties figure in the hero and the
  JSON-LD `areaServed`. Re-run the map script after changing it: it flags a
  listed county the area barely reaches and a well-covered one left out.
*/
export const counties = [
  {
    name: "Columbia",
    towns: "St. Helens, Scappoose, Rainier, Vernonia",
    note: "Most of the county",
  },
  {
    name: "Washington",
    towns: "Beaverton, Hillsboro, Tigard, Tualatin, Sherwood, Forest Grove, Banks, Gaston",
    note: "Home county",
  },
  {
    name: "Multnomah",
    towns: "Portland, Gresham, Troutdale, Corbett",
    note: "Most of the county",
  },
  {
    name: "Hood River",
    towns: "Cascade Locks, Hood River",
    note: "Gorge towns",
  },
  {
    name: "Yamhill",
    towns: "Newberg, Dundee, Carlton, McMinnville, Sheridan, Willamina",
    note: "Most of the county",
  },
  {
    name: "Clackamas",
    towns: "Lake Oswego, West Linn, Oregon City, Wilsonville, Canby, Molalla, Sandy, Estacada, Welches",
    note: "West & central",
  },
  {
    name: "Polk",
    towns: "Dallas, Independence, Monmouth",
    note: "Valley towns",
  },
  {
    name: "Marion",
    towns: "Salem, Keizer, Woodburn, Mt. Angel, Silverton, Stayton, Aumsville",
    note: "Valley towns",
  },
  {
    name: "Linn",
    towns: "Albany, Jefferson",
    note: "North edge",
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
