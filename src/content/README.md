# Content

Every word the owner can change lives in the JSON files in this folder. The
pages read it through `src/lib/cms.ts`; the portal (`portal/`) edits it and
commits it back. Layout, classes, icons and links stay in the `.astro` files.

| File | What's in it |
| --- | --- |
| `site.json` | Business facts: name, phone, email, address, CCB number, hours. Edited from the portal's Business info form. |
| `shared.json` | Copy that appears on more than one page: footer, nav labels, CTA bands, contact block, leak call. |
| `services.json` | The service registry: title, summary, tagline and card photo of each service. |
| `pages/<page>.json` | One page's words. Service pages are `pages/services-<slug>.json`; the home page is `pages/home.json`. |

## Keys

A field is addressed as `<file id>:<dotted path>`, with numbers for array
positions: `pages/about:process.steps.2.title`, `site:tagline`.

## Field kinds

- **text**: plain words. Headings, labels, button text.
- **rich**: one paragraph with inline markup: `<strong>`, `<em>`,
  `<a href>`, `<br>`, `<span class="whitespace-nowrap">`. Any tag may carry a
  `class`.
- **block**: a run of prose. Rich plus `<p>`, `<h2>`, `<h3>`, `<ul>`, `<ol>`,
  `<li>`. Rendered as the container itself (usually the `.prose-page` div).

Internal links are written root-relative (`/about/`, `/contact/#estimate`);
the base path is added at build time.

## Tokens

Business facts inside running copy are written as tokens so they follow
`site.json`: `{{name}}`, `{{legalName}}`, `{{phone}}`, `{{email}}`,
`{{city}}`, `{{state}}`, `{{serviceArea}}`, `{{ccb}}`, `{{countyCount}}`.

## Images

An image field is an object: `{ "src": "/images/...", "alt": "...",
"credit": "Photo: ..." }`. `credit` is the attribution line a sourced photo
needs (rich); it belongs to that photo, so the portal removes it when the
image is replaced. `thumb` (services only) is the path of the 160×120 nav
thumbnail the portal regenerates with the image.

## Every page file has

```json
"seo": { "title": "About", "description": "..." }
```

`title` is the page's own name; the layout appends " | Acosta Roofing".

## In the templates

```astro
---
import Text from "../components/Text.astro";
import Img from "../components/Img.astro";
import { file, list, item, credit } from "../lib/cms";
const k = "pages/about";
const c = file(k);
---
<Page k={k} crumbs={crumbs}>
  <PageHero k={`${k}:hero`} crumbs={crumbs} />
  <Text k={`${k}:intro.title`} as="h2" class="t-display-lg" />
  <Text k={`${k}:intro.body`} type="block" as="div" class="prose-page" />
  <ol {...list(`${k}:steps`)}>
    {c.steps.map((_, i) => (
      <li {...item(i)}><Text k={`${k}:steps.${i}.title`} as="h3" /></li>
    ))}
  </ol>
  <Img k={`${k}:photo`} loading="lazy" class="aspect-[4/3]" />
</Page>
```

`list()` marks a list the owner may add to, remove from and reorder. Mark a
list only where that can't break the layout (FAQ entries, steps, bullets),
not fixed grids such as a three-up stat row.

`npm run build` is the public site; `CMS_EDIT=1 npm run build` is the
portal's copy, with `data-cms` markers on every field and the site under
`/site/`.
