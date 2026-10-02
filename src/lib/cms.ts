// The content layer. Every word the owner can change lives in a JSON file
// under src/content/, and the pages read it through here rather than holding
// the copy themselves. The portal (portal/) edits those files and commits
// them; the site never changes shape because of an edit, only its words.
//
// A field is addressed by a key: the file's id (its path under src/content/
// without ".json"), a colon, then a dotted path into the JSON, with numbers
// for array positions:
//
//   "pages/about:hero.title"     src/content/pages/about.json → hero.title
//   "pages/faq:topics.2.items.0.a"
//   "site:tagline"               src/content/site.json → tagline
//
// Three kinds of text field, which decide both how a value is rendered and
// which tools the portal's editor offers on it:
//
//   text   plain words. Headings, labels, button-sized copy.
//   rich   one paragraph's worth of inline markup: <strong>, <em>, <a>, <br>
//          and <span class="whitespace-nowrap">.
//   block  a run of prose: rich plus <p>, <h2>, <h3>, <ul>, <ol>, <li>.
//          Render it as the container itself (the .prose-page div), so the
//          owner can add a paragraph by pressing Enter.
//
// Any of them may carry {{tokens}} for business facts kept in site.json, so
// "call {{phone}}" follows the number when it changes. See `tokens` below.
// In a link's href they are filled in as plain values: href="tel:{{phone}}".
//
// A build with CMS_EDIT=1 (the portal's copy of the site) marks every field
// with data-cms attributes so the editor can find, edit and save it. A normal
// build emits none of them, so the public site's HTML is unaffected.
import { site, counties } from "../data/site";
import { serviceMap } from "../data/service-map";
import { page } from "./url";

export const EDIT = process.env.CMS_EDIT === "1";

export type FieldType = "text" | "rich" | "block";

const files = import.meta.glob<unknown>("../content/**/*.json", { eager: true, import: "default" });

/* The parsed JSON of one content file, by id ("pages/about", "site"). */
export function file<T = any>(id: string): T {
  const data = files[`../content/${id}.json`];
  if (data === undefined) throw new Error(`No content file src/content/${id}.json`);
  return data as T;
}

/* The raw value at a key. Throws on a key that doesn't resolve, so a typo
   fails the build instead of rendering an empty heading. */
export function get<T = any>(key: string): T {
  const [id, path] = splitKey(key);
  let value: any = file(id);
  for (const part of path ? path.split(".") : []) {
    if (value == null || typeof value !== "object" || !(part in value)) {
      throw new Error(`Content key "${key}" does not resolve (stuck at "${part}")`);
    }
    value = value[part];
  }
  return value as T;
}

/* Like get(), but undefined (not an error) when the key isn't there. For
   optional fields such as a hero without a lead. */
export function maybe<T = any>(key: string): T | undefined {
  try {
    return get<T>(key);
  } catch {
    return undefined;
  }
}

function splitKey(key: string): [string, string] {
  const at = key.indexOf(":");
  return at === -1 ? [key, ""] : [key.slice(0, at), key.slice(at + 1)];
}

// ---------------------------------------------------------------------------
// Tokens: business facts that appear inside running copy.

export const tokens: Record<string, string> = {
  name: site.name,
  legalName: site.legalName,
  phone: site.phone,
  email: site.email,
  city: site.address.city,
  state: site.address.state,
  serviceArea: site.serviceArea,
  ccb: site.ccb,
  countyCount: String(counties.length),
  // From the drive-time map: changes only when the map is rebuilt.
  driveMinutes: String(serviceMap.drive.minutes),
};

const TOKEN = /\{\{\s*(\w+)\s*\}\}/g;

function tokenValue(name: string): string {
  if (!(name in tokens)) throw new Error(`Unknown content token {{${name}}}`);
  return tokens[name];
}

/* Tokens filled in, nothing escaped: for attributes (alt, meta description,
   <title>) where Astro does the escaping. */
export const plain = (value: string) => value.replace(TOKEN, (_, name) => tokenValue(name));

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* A token as HTML. In the editor it is a locked chip, so the owner can move
   or delete it but not type inside it. */
const tokenHtml = (name: string) =>
  EDIT
    ? `<span data-cms-token="${name}" contenteditable="false">${escape(tokenValue(name))}</span>`
    : escape(tokenValue(name));

/* A text field as HTML: escaped, tokens filled in. */
export const text = (value: string) =>
  value
    .split(TOKEN)
    .map((part, i) => (i % 2 ? tokenHtml(part) : escape(part)))
    .join("");

// ---------------------------------------------------------------------------
// Rich and block fields: an allowlist of tags and attributes. The portal
// sanitizes the same way before it saves; this is the second line.

const INLINE = new Set(["strong", "em", "a", "br", "span"]);
const BLOCK = new Set([...INLINE, "p", "h2", "h3", "ul", "ol", "li"]);
// `class` is kept on every allowed tag, so copy can carry the same type
// classes the templates use; links also keep where they point.
const ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "class", "target", "rel"]),
};
const allowedAttr = (tag: string, attr: string) => attr === "class" || !!ATTRS[tag]?.has(attr);

function sanitize(html: string, allowed: Set<string>): string {
  return html.replace(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g, (_, close: string, tag: string, rest: string) => {
    const name = tag.toLowerCase();
    if (!allowed.has(name)) return "";
    if (close) return `</${name}>`;
    const kept: string[] = [];
    for (const [, attr, , v1, v2] of rest.matchAll(/([\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const value = v1 ?? v2 ?? "";
      if (!allowedAttr(name, attr)) continue;
      if (attr === "href" && /^\s*javascript:/i.test(value)) continue;
      // Internal links are written root-relative ("/about/") and pick up the
      // base path here, so they work under the portal's /site/ prefix too.
      const out = attr === "href" && value.startsWith("/") && !value.startsWith("//") ? page(value) : value;
      kept.push(`${attr}="${attrTokens(out).replace(/"/g, "&quot;")}"`);
    }
    return `<${name}${kept.length ? " " + kept.join(" ") : ""}>`;
  });
}

// Tokens inside an attribute (href="mailto:{{email}}") are filled in as
// plain values, and a tel: link gets the dialable number rather than the
// display one. The edit build keeps them as written, braces encoded so the
// chip pass below leaves them alone, and the editor saves them back as is.
const attrTokens = (value: string) =>
  EDIT
    ? value.replace(/[{}]/g, (brace) => (brace === "{" ? "&#123;" : "&#125;"))
    : value.replace(/^tel:\{\{\s*phone\s*\}\}$/, site.phoneHref).replace(TOKEN, (_, name) => tokenValue(name));

const markup = (value: string, allowed: Set<string>) =>
  sanitize(value, allowed)
    .split(TOKEN)
    .map((part, i) => (i % 2 ? tokenHtml(part) : part))
    .join("");

export const rich = (value: string) => markup(value, INLINE);
export const block = (value: string) => markup(value, BLOCK);

/* Render any field by type. */
export const html = (value: string, type: FieldType = "text") =>
  type === "text" ? text(value) : type === "rich" ? rich(value) : block(value);

// ---------------------------------------------------------------------------
// Editor markers. All return {} outside an edit build, so spreading them is
// free on the public site.

/* An editable text field. Spread onto the element whose whole content is the
   field: <h2 {...field(k)} set:html={text(get(k))} />. Prefer <Text>. */
export const field = (key: string, type: FieldType = "text") =>
  EDIT ? { "data-cms": key, "data-cms-type": type } : {};

/* A list the owner may add to, remove from and reorder (FAQ entries, process
   steps, bullet lists). Goes on the element whose direct children are the
   items; each item carries item(i) with its index in the JSON array. Mark a
   list only where adding or removing an entry can't break the layout. */
export const list = (key: string) => (EDIT ? { "data-cms-list": key } : {});
export const item = (index: number) => (EDIT ? { "data-cms-item": String(index) } : {});

/* A replaceable image whose value is { src, alt, credit? }. Prefer <Img>.
   `credit` is the photographer/licence line (rich) for a sourced photo; it
   belongs to that photo, so the portal drops it when the owner swaps the
   image for his own. Render it with credit(). */
export const image = (key: string) => (EDIT ? { "data-cms-image": key } : {});

/* The credit line of an image field as HTML, or "" when it has none. Not
   marked editable: it changes only with the photo. */
export const credit = (key: string) => {
  const value = maybe<string>(`${key}.credit`);
  return value ? rich(value) : "";
};
