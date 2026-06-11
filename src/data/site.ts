// Single source of truth for business facts. Everything here comes from the
// Acosta Roofing brand board — the phone number, the CCB blank and the email
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
  // working line. Replace it here — it drives the nav, the hero sign, the
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
  // so does the site — the hero sign and the footer render the printed blank
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

// City line, always present. The street sits above it and the ZIP after it,
// each only when set.
export const cityLine = [
  `${site.address.city}, ${site.address.state}`,
  site.address.zip,
]
  .filter(Boolean)
  .join(" ");
