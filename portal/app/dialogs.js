// Dialogs used while editing the page: choosing where a link goes, and the
// words that live in attributes (the hint text inside a form box).

import { model } from "./model.js";
import { h, dialog } from "./ui.js";
import { BASE } from "./render.js";

/* What a stored href points at, in plain words. */
export function describeLink(href, pages) {
  if (!href) return "nowhere yet";
  if (href.startsWith("tel:")) return "a phone call";
  if (href.startsWith("mailto:")) return "an email";
  if (href.startsWith("#")) return "a spot on this page";
  if (href.startsWith("/") && !href.startsWith("//")) {
    const [path, hash] = href.split("#");
    const page = pages.find((p) => p.path === BASE + (path.endsWith("/") ? path : path + "/"));
    return (page ? `the ${page.label} page` : path) + (hash ? " (a section)" : "");
  }
  try {
    return new URL(href).host.replace(/^www\./, "");
  } catch {
    return href;
  }
}

/* A typed address made into a working link: a bare domain gets https://, an
   email gets mailto:, a phone number tel:. */
export function normalizeAddress(input) {
  const v = input.trim();
  if (!v) return "";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) return "mailto:" + v;
  if (/^[+()\d][\d\s().-]{6,}$/.test(v)) return "tel:+1" + v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return "https://" + v;
}

export function linkDialog({ href = "", hasLink = false, selected = "" }, pages) {
  const internal = href.startsWith("/") && !href.startsWith("//");
  const [path, hash] = internal ? href.split("#") : ["", ""];
  const pageSel = h(
    "select",
    { id: "link-page" },
    pages.map((p) => h("option", { value: p.path.slice(BASE.length) || "/", text: p.label })),
  );
  if (internal) {
    const want = path.endsWith("/") ? path : path + "/";
    if ([...pageSel.options].some((o) => o.value === want)) pageSel.value = want;
  }
  const web = h("input", { id: "link-web", type: "text", inputmode: "url", placeholder: "www.example.com", value: internal ? "" : href.replace(/^mailto:|^tel:/, "") });
  const words = h("input", { id: "link-words", type: "text", placeholder: "e.g. request an estimate" });
  const rPage = h("input", { type: "radio", name: "link-kind", value: "page", id: "lk-page", checked: internal || !href });
  const rWeb = h("input", { type: "radio", name: "link-kind", value: "web", id: "lk-web", checked: !!href && !internal });
  const err = h("p", { class: "error-text", role: "alert" });
  pageSel.addEventListener("change", () => (rPage.checked = true));
  web.addEventListener("input", () => (rWeb.checked = true));

  const body = h(
    "div",
    { class: "link-form" },
    h("div", { class: "choice" }, rPage, h("label", { for: "lk-page", text: "A page on this website" })),
    h("div", { class: "choice-body" }, pageSel),
    h("div", { class: "choice" }, rWeb, h("label", { for: "lk-web", text: "A web address, email or phone number" })),
    h("div", { class: "choice-body" }, web),
    !selected && !hasLink ? h("div", {}, h("label", { class: "field-label", for: "link-words", text: "Words to show" }), words) : null,
    err,
  );

  const result = () => {
    if (rPage.checked) {
      let target = pageSel.value;
      if (internal && hash && target === (path.endsWith("/") ? path : path + "/")) target += "#" + hash;
      return { href: target, text: words.value.trim() || pageSel.selectedOptions[0]?.textContent };
    }
    const addr = normalizeAddress(web.value);
    return { href: addr, text: words.value.trim() || web.value.trim() };
  };
  const actions = [];
  if (hasLink) actions.push({ label: "Remove link", value: { remove: true }, kind: "danger" });
  actions.push({ label: "Cancel", value: null });
  actions.push({
    label: hasLink ? "Save link" : "Add link",
    kind: "primary",
    value: result,
    validate: () => {
      if (rWeb.checked && !web.value.trim()) {
        err.textContent = "Type the address the link should go to.";
        web.focus();
        return false;
      }
      return true;
    },
  });
  return dialog({ title: hasLink ? "Change link" : "Add a link", body, actions });
}

const ATTR_LABELS = {
  placeholder: ["Hint text inside the empty box", "Shown in light grey until someone starts typing."],
  value: ["Text on the button", ""],
  "aria-label": ["Name read out to people using a screen reader", ""],
  title: ["Text shown when pointing at it", ""],
  alt: ["Description of the picture", ""],
};

/* Words that live in an element's attributes (data-cms-attrs), such as the
   hint text in a form box. Each change shows on the page as it's typed. */
export function attrsDialog(el, frame) {
  let map;
  try {
    map = JSON.parse(el.getAttribute("data-cms-attrs"));
  } catch {
    return;
  }
  const rows = Object.entries(map)
    .filter(([, key]) => typeof model.get(key) === "string")
    .map(([attr, key], i) => {
      const [label, help] = ATTR_LABELS[attr] || [attr, ""];
      const input = h("input", { type: "text", id: `attr-${i}`, value: model.get(key) });
      input.addEventListener("input", () => model.set(key, input.value, "attrs"));
      return h("div", { class: "form-row" }, h("label", { class: "field-label", for: `attr-${i}`, text: label }), input, help ? h("p", { class: "help", text: help }) : null);
    });
  if (!rows.length) return;
  return dialog({
    title: "Text in this box",
    body: h("div", {}, h("p", { class: "muted", text: "This text isn't typed straight onto the page, so change it here." }), rows),
    actions: [{ label: "Done", value: true, kind: "primary" }],
    cancel: true,
  });
}
