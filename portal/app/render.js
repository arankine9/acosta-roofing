// Rendering and sanitizing, ported from src/lib/cms.ts so a field looks the
// same in the editor as it will once the site is rebuilt.
//
//   render(value, type, tokens)  stored string -> HTML for the preview
//   serialize(el, type)          edited element -> stored string
//   cleanPaste(html, type)       clipboard HTML -> allowlisted HTML
//
// Stored values keep internal links root-relative ("/about/"); the preview
// lives under BASE ("/site/about/"), so render adds it and serialize strips it.

export const BASE = "/site";
export const TOKEN = /\{\{\s*(\w+)\s*\}\}/g;
export const INLINE = new Set(["strong", "em", "a", "br", "span"]);
export const BLOCK = new Set([...INLINE, "p", "h2", "h3", "ul", "ol", "li"]);
const BLOCK_LEVEL = new Set(["p", "h2", "h3", "ul", "ol", "li", "div", "h1", "h4", "h5", "h6", "blockquote", "pre", "section", "article", "header", "footer", "table", "tr"]);
const DROP = new Set(["script", "style", "template", "noscript", "iframe", "object", "embed", "svg", "math", "head", "title", "meta", "link", "img", "video", "audio", "canvas", "input", "textarea", "select", "button"]);
const ATTRS = { a: new Set(["href", "class", "target", "rel"]) };
const allowedAttr = (tag, attr) => attr === "class" || !!ATTRS[tag]?.has(attr);
// Web, mail and phone links, site paths and #anchors only, as in cms.ts.
export const safeHref = (href) => /^(?:https?:|mailto:|tel:|\/|#)/i.test(href);

export const escape = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escapeText = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const withBase = (href) => (href.startsWith("/") && !href.startsWith("//") && !href.startsWith(BASE + "/") && href !== BASE ? BASE + href : href);
export function stripBase(href) {
  if (href === BASE) return "/";
  if (href.startsWith(BASE + "/") || href.startsWith(BASE + "#") || href.startsWith(BASE + "?")) {
    const rest = href.slice(BASE.length);
    return rest.startsWith("/") ? rest : "/" + rest;
  }
  // A full URL to this portal (the browser sometimes resolves links).
  try {
    const url = new URL(href, location.origin);
    if (url.origin === location.origin && /^https?:/.test(href)) return stripBase(url.pathname + url.search + url.hash);
  } catch {}
  return href;
}

const tokenHtml = (name, tokens) =>
  name in tokens
    ? `<span data-cms-token="${name}" contenteditable="false">${escape(tokens[name])}</span>`
    : escape(`{{${name}}}`);

export const plain = (value, tokens) =>
  String(value ?? "").replace(TOKEN, (m, name) => (name in tokens ? tokens[name] : m));

export const text = (value, tokens) =>
  String(value ?? "")
    .split(TOKEN)
    .map((part, i) => (i % 2 ? tokenHtml(part, tokens) : escape(part)))
    .join("");

// The same regex sanitizer as cms.ts, run on stored values before rendering.
function sanitizeString(html, allowed) {
  return html.replace(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g, (_, close, tag, rest) => {
    const name = tag.toLowerCase();
    if (!allowed.has(name)) return "";
    if (close) return `</${name}>`;
    const kept = [];
    for (const [, attr, , v1, v2] of rest.matchAll(/([\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const value = v1 ?? v2 ?? "";
      if (!allowedAttr(name, attr)) continue;
      if (attr === "href" && !safeHref(value)) continue;
      const out = attr === "href" ? withBase(value) : value;
      // Tokens in an attribute (href="mailto:{{email}}") stay as written,
      // braces encoded so the chip pass below leaves them alone.
      kept.push(`${attr}="${out.replace(/"/g, "&quot;").replace(/[{}]/g, (b) => (b === "{" ? "&#123;" : "&#125;"))}"`);
    }
    return `<${name}${kept.length ? " " + kept.join(" ") : ""}>`;
  });
}

const markup = (value, allowed, tokens) =>
  sanitizeString(String(value ?? ""), allowed)
    .split(TOKEN)
    .map((part, i) => (i % 2 ? tokenHtml(part, tokens) : part))
    .join("");

export function render(value, type, tokens) {
  if (type === "rich") return markup(value, INLINE, tokens);
  if (type === "block") return markup(value, BLOCK, tokens);
  return text(value, tokens);
}

// ---------------------------------------------------------------------------
// DOM -> stored string.

function serializeText(el) {
  let out = "";
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += child.data;
      else if (child.nodeType === 1) {
        if (child.dataset?.cmsToken) out += `{{${child.dataset.cmsToken}}}`;
        else if (child.tagName === "BR") out += " ";
        else if (!DROP.has(child.tagName.toLowerCase())) walk(child);
      }
    }
  };
  walk(el);
  return out.replace(/[\s ]+/g, " ").trim();
}

/* Walk a DOM subtree and write it out keeping only allowlisted tags and
   attributes. Disallowed tags are unwrapped (their words kept), like the
   regex sanitizer; scripts and the like are dropped whole. */
function sanitizeNode(root, allowed, opts = {}) {
  const { keepClass = true, rich = false } = opts;
  const walk = (node, depth) => {
    let out = "";
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        out += escapeText(child.data.replace(/ /g, opts.keepNbsp ? " " : " "));
        continue;
      }
      if (child.nodeType !== 1) continue;
      if (child.dataset?.cmsToken) {
        out += `{{${child.dataset.cmsToken}}}`;
        continue;
      }
      let tag = child.tagName.toLowerCase();
      if (DROP.has(tag)) continue;
      if (child.dataset?.cmsUi !== undefined) continue;
      if (tag === "b") tag = "strong";
      if (tag === "i") tag = "em";
      if (tag === "div" && allowed.has("p")) tag = depth === 0 ? "p" : "div";
      if (["h1", "h4", "h5", "h6"].includes(tag) && allowed.has("h3")) tag = tag === "h1" ? "h2" : "h3";
      // Style-only spans (what Chrome leaves after some edits) carry nothing.
      const cls = keepClass ? (child.getAttribute("class") || "").trim() : "";
      if (tag === "span" && !cls) {
        out += walk(child, depth);
        continue;
      }
      if (!allowed.has(tag)) {
        const inner = walk(child, depth);
        // Keep words apart when a paragraph is flattened into one line.
        out += rich && BLOCK_LEVEL.has(tag) && out && inner ? " " + inner : inner;
        continue;
      }
      const attrs = [];
      if (cls) attrs.push(`class="${escape(cls)}"`);
      if (tag === "a") {
        let href = child.getAttribute("href") || "";
        if (/^\s*javascript:/i.test(href)) href = "";
        href = opts.siteOrigins ? localize(href, opts.siteOrigins) : stripBase(href);
        if (href) attrs.unshift(`href="${escape(href)}"`);
        for (const name of ["target", "rel"]) {
          const v = child.getAttribute(name);
          if (v) attrs.push(`${name}="${escape(v)}"`);
        }
      }
      const open = `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>`;
      if (tag === "br") {
        out += open;
        continue;
      }
      let inner = walk(child, depth + 1);
      if (["p", "h2", "h3", "li"].includes(tag)) inner = inner.replace(/(<br>)+$/, "");
      if (["strong", "em", "span"].includes(tag) && !inner.trim()) {
        out += inner;
        continue;
      }
      if (tag === "a" && !inner) continue;
      out += open + inner + `</${tag}>`;
    }
    return out;
  };
  return walk(root, 0);
}

// Same-site absolute links in pasted copy become root-relative.
function localize(href, origins) {
  try {
    const url = new URL(href, location.origin);
    if (origins.includes(url.origin)) return stripBase(url.pathname + url.search + url.hash);
  } catch {}
  return href;
}

/* In a block, any words sitting outside a paragraph next to other blocks get
   wrapped in one, so the stored HTML is always well formed prose. */
function wrapLooseRuns(html, doc) {
  const box = doc.createElement("div");
  box.innerHTML = html;
  const nodes = [...box.childNodes];
  const isBlock = (n) => n.nodeType === 1 && BLOCK_LEVEL.has(n.tagName.toLowerCase());
  if (!nodes.some(isBlock)) return html;
  let run = null;
  for (const n of nodes) {
    if (isBlock(n)) {
      run = null;
      continue;
    }
    if (n.nodeType === 3 && !n.data.trim()) {
      if (!run) n.remove();
      else run.appendChild(n);
      continue;
    }
    if (n.nodeType === 1 && n.tagName === "BR" && !run) {
      n.remove();
      continue;
    }
    if (!run) {
      run = doc.createElement("p");
      box.insertBefore(run, n);
    }
    run.appendChild(n);
  }
  return box.innerHTML;
}

export function serialize(el, type) {
  if (type === "text") return serializeText(el);
  const allowed = type === "rich" ? INLINE : BLOCK;
  let html = sanitizeNode(el, allowed, { rich: type === "rich" }).trim();
  if (type === "block") {
    html = wrapLooseRuns(html, el.ownerDocument);
    html = html.replace(/<p>(\s|<br>)*<\/p>/g, "");
  } else {
    html = html.replace(/(<br>)+$/, "");
  }
  return html.trim();
}

/* Clipboard HTML reduced to what a field may hold. Classes from other
   documents mean nothing here, so they go. */
export function cleanPaste(html, type, siteOrigins = []) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const allowed = type === "rich" ? INLINE : BLOCK;
  let out = sanitizeNode(doc.body, allowed, { keepClass: false, rich: type === "rich", siteOrigins: [location.origin, ...siteOrigins] });
  out = out.replace(/\s+/g, " ").trim();
  if (type === "block") out = wrapLooseRuns(out, document).replace(/<p>\s*<\/p>/g, "");
  return out;
}

/* True when a stored rich/block/text value has no words in it. */
export function isEmptyValue(value) {
  if (typeof value !== "string") return false;
  return !value.replace(/<[^>]*>/g, "").replace(/&nbsp;| /g, " ").trim();
}

/* Visible words of a stored value, tokens filled in: for messages. */
export function snippet(value, tokens = {}, max = 60) {
  const words = plain(String(value ?? ""), tokens)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return words.length > max ? words.slice(0, max - 1).trimEnd() + "…" : words;
}
