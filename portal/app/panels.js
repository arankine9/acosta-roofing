// The side panel (a bottom sheet on phones): "This page" (search title and
// description), "Business info" (site.json) and "History" (earlier
// published versions).

import { model } from "./model.js";
import { api } from "./api.js";
import { h, formatDate } from "./ui.js";
import { plain } from "./render.js";

// ---------------------------------------------------------------------------
// Business info validation, shared with the save checks.

export const phoneOk = (v) => {
  const digits = String(v || "").replace(/\D/g, "");
  return /^[\d\s().+-]+$/.test(String(v || "").trim()) && (digits.length === 10 || (digits.length === 11 && digits[0] === "1"));
};
export const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(v || "").trim());

export function businessProblems(site) {
  if (!site) return [];
  const out = [];
  if (!String(site.name || "").trim()) out.push({ field: "name", text: "The business name can't be empty." });
  if (!phoneOk(site.phone)) out.push({ field: "phone", text: "The phone number doesn't look right. Use the 10-digit number, like (971) 280-9253." });
  if (!emailOk(site.email)) out.push({ field: "email", text: "The email address doesn't look right. It should look like name@example.com." });
  if (!String(site.ccb || "").trim()) out.push({ field: "ccb", text: "The CCB license number is required. Oregon requires it on the website." });
  return out;
}

// ---------------------------------------------------------------------------

export function createPanels(root, ctx) {
  const tabs = root.querySelectorAll("[data-tab]");
  const sections = root.querySelectorAll("[data-section]");
  const show = (name) => {
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.tab === name));
    for (const s of sections) s.hidden = s.dataset.section !== name;
    if (name === "history") loadHistory();
    ctx.onTab?.(name);
  };
  for (const t of tabs) t.addEventListener("click", () => show(t.dataset.tab));

  // --- This page -----------------------------------------------------------
  const pageBox = root.querySelector('[data-section="page"] .page-body');
  let cmsFile = null;

  function counter(input, kind) {
    const out = h("p", { class: "count" });
    const update = () => {
      const n = plain(input.value, ctx.tokens()).length;
      let note;
      if (kind === "title") {
        note = n === 0 ? "Needs a title." : n <= 45 ? "Good length." : n <= 55 ? "A bit long: Google may cut off the end." : "Too long: Google will cut it off.";
      } else {
        note = n === 0 ? "Needs a description." : n < 70 ? "Short: say a little more about the page." : n <= 160 ? "Good length." : "Long: Google will likely cut it off around 160 characters.";
      }
      out.textContent = `${n} characters. ${note}`;
      out.classList.toggle("warn", !/Good/.test(note));
    };
    input.addEventListener("input", update);
    update();
    return { el: out, update };
  }

  function renderPage() {
    pageBox.replaceChildren();
    const seo = cmsFile ? model.get(`${cmsFile}:seo`) : null;
    if (!seo || typeof seo !== "object") {
      pageBox.append(h("p", { class: "muted", text: "This page has no search settings of its own to change. Its words are still editable on the page." }));
      return;
    }
    const title = h("input", { type: "text", id: "seo-title", value: seo.title || "" });
    const desc = h("textarea", { id: "seo-desc", rows: "4" });
    desc.value = seo.description || "";
    const prevTitle = h("div", { class: "serp-title" });
    const prevDesc = h("div", { class: "serp-desc" });
    const prevUrl = h("div", { class: "serp-url", text: "acostaroofingpnw.com" + (ctx.currentPath() || "/") });
    const updatePreview = () => {
      const t = plain(title.value, ctx.tokens());
      prevTitle.textContent = cmsFile === "pages/home" ? t : `${t} | Acosta Roofing`;
      const d = plain(desc.value, ctx.tokens());
      prevDesc.textContent = d.length > 160 ? d.slice(0, 157).trimEnd() + "…" : d;
    };
    const tc = counter(title, "title");
    const dc = counter(desc, "desc");
    title.addEventListener("input", () => {
      model.set(`${cmsFile}:seo.title`, title.value, "panel");
      updatePreview();
    });
    desc.addEventListener("input", () => {
      model.set(`${cmsFile}:seo.description`, desc.value, "panel");
      updatePreview();
    });
    updatePreview();
    pageBox.append(
      h("p", { class: "muted", text: "How this page shows up in Google and in the browser tab. These words don't appear on the page itself." }),
      h("label", { class: "field-label", for: "seo-title", text: "Search title" }),
      title,
      tc.el,
      h("p", { class: "help", text: cmsFile === "pages/home" ? "The page's name in Google results." : "The page's name. “ | Acosta Roofing” is added after it, so keep it to about 45 characters." }),
      h("label", { class: "field-label", for: "seo-desc", text: "Search description" }),
      desc,
      dc.el,
      h("p", { class: "help", text: "One or two sentences on what someone will find here. Google shows about 160 characters." }),
      h("p", { class: "field-label", text: "Preview in Google" }),
      h("div", { class: "serp" }, prevUrl, prevTitle, prevDesc),
    );
  }

  // --- Business info -------------------------------------------------------
  const bizBox = root.querySelector('[data-section="business"] .biz-body');
  const FIELDS = [
    ["name", "Business name", "As customers know it."],
    ["legalName", "Legal name", "As registered with the state, e.g. “Acosta Roofing LLC”."],
    ["tagline", "Tagline", ""],
    ["description", "Short description", "Used by Google and when the site is shared in a message.", "textarea"],
    ["phone", "Phone number", "", "tel"],
    ["email", "Email address", "", "email"],
    ["address.street", "Street address", "Leave empty to keep it off the website."],
    ["address.city", "City", ""],
    ["address.state", "State", ""],
    ["address.zip", "ZIP code", "", "text"],
    ["ccb", "Oregon CCB license number", "Required. Oregon requires it on the website."],
    ["serviceArea", "Service area", "As it reads in a sentence: “Free estimates across ___”, e.g. “the Portland metro”."],
  ];
  const inputs = {};
  const errors = {};

  function renderBiz() {
    bizBox.replaceChildren();
    const site = model.working.site;
    if (!site) {
      bizBox.append(h("p", { class: "muted", text: "Business info isn't available." }));
      return;
    }
    bizBox.append(h("p", { class: "muted", text: "These details appear across the website: in the header and footer, on the contact page, and wherever the text mentions them." }));
    for (const [path, label, help, kind] of FIELDS) {
      const value = model.get(`site:${path}`);
      if (value === undefined) continue;
      const id = "biz-" + path.replace(/\./g, "-");
      const input =
        kind === "textarea"
          ? h("textarea", { id, rows: "3" })
          : h("input", { id, type: kind === "tel" ? "tel" : kind === "email" ? "email" : "text", autocomplete: "off", inputmode: path === "address.zip" || path === "ccb" ? "numeric" : null });
      input.value = value ?? "";
      inputs[path] = input;
      errors[path] = h("p", { class: "error-text", role: "alert" });
      input.addEventListener("input", () => {
        model.set(`site:${path}`, input.value, "panel");
        validate(false);
      });
      input.addEventListener("blur", () => validate(true));
      bizBox.append(h("div", { class: "form-row" + (path.startsWith("address.") ? " half" : ""), "data-field": path }, h("label", { class: "field-label", for: id, text: label }), input, errors[path], help ? h("p", { class: "help", text: help }) : null));
    }
    // Hours.
    const hours = Array.isArray(site.hours) ? site.hours : null;
    if (hours) {
      const box = h("div", { class: "hours" });
      const draw = () => {
        box.replaceChildren();
        model.get("site:hours").forEach((row, i) => {
          const days = h("input", { type: "text", value: row.days || "", "aria-label": `Days, row ${i + 1}`, placeholder: "Monday – Friday" });
          const time = h("input", { type: "text", value: row.time || "", "aria-label": `Hours, row ${i + 1}`, placeholder: "7:00 AM – 6:00 PM" });
          const upd = () => {
            const next = structuredClone(model.get("site:hours"));
            next[i] = { ...next[i], days: days.value, time: time.value };
            model.set("site:hours", next, "panel");
          };
          days.addEventListener("input", upd);
          time.addEventListener("input", upd);
          box.append(
            h(
              "div",
              { class: "hours-row" },
              days,
              time,
              h("button", {
                type: "button",
                class: "icon-btn",
                title: "Remove this row",
                "aria-label": `Remove row ${i + 1}`,
                html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg>',
                onclick: () => {
                  const next = structuredClone(model.get("site:hours"));
                  next.splice(i, 1);
                  model.set("site:hours", next, "panel");
                  draw();
                },
              }),
            ),
          );
        });
        box.append(
          h("button", {
            type: "button",
            class: "btn btn-plain btn-small",
            text: "+ Add a row",
            onclick: () => {
              model.set("site:hours", [...structuredClone(model.get("site:hours")), { days: "", time: "" }], "panel");
              draw();
              box.querySelectorAll(".hours-row input")[box.querySelectorAll(".hours-row input").length - 2]?.focus();
            },
          }),
        );
      };
      draw();
      bizBox.append(h("div", { class: "form-row", "data-field": "hours" }, h("p", { class: "field-label", text: "Opening hours" }), box));
    }
  }

  function validate(showAll) {
    const problems = businessProblems(model.working.site);
    for (const path of Object.keys(errors)) {
      const p = problems.find((x) => x.field === path);
      const input = inputs[path];
      const touched = showAll || errors[path].textContent;
      errors[path].textContent = p && touched ? p.text : "";
      input.toggleAttribute("aria-invalid", !!(p && touched));
    }
    return problems;
  }

  // --- History -------------------------------------------------------------
  const histBox = root.querySelector('[data-section="history"] .history-body');
  async function loadHistory() {
    histBox.replaceChildren(h("p", { class: "muted", text: "Loading…" }));
    try {
      const { commits } = await api.history();
      histBox.replaceChildren(
        h("p", { class: "muted", text: "Each time the website changes, a copy is kept. You can bring back an earlier version: it becomes your draft, so you can look it over before you publish it. Nothing changes on the website until you do." }),
      );
      if (!commits?.length) {
        histBox.append(h("p", { class: "muted", text: "No earlier versions yet." }));
        return;
      }
      const list = h("ol", { class: "history" });
      commits.forEach((c, i) => {
        list.append(
          h(
            "li",
            {},
            h("div", { class: "h-msg", text: c.message.split("\n")[0] }),
            h("div", { class: "h-meta", text: `${formatDate(c.date)} · ${c.author || c.email || ""}` }),
            i === 0
              ? h("div", { class: "h-current", text: "The website now" })
              : h("button", { type: "button", class: "btn btn-plain btn-small", text: "Bring back this version", onclick: () => ctx.restore(c) }),
          ),
        );
      });
      histBox.append(list);
    } catch (err) {
      histBox.replaceChildren(h("p", { class: "error-text", text: err.message }));
    }
  }

  model.on((e) => {
    if (e.type === "set" && e.source === "panel") return;
    if (e.type === "set" && !(e.id === "site" || (cmsFile && e.id === cmsFile && e.path.startsWith("seo")))) return;
    const active = document.activeElement;
    if (active && root.contains(active) && e.type !== "load" && e.type !== "restore") return;
    renderBiz();
    renderPage();
  });

  return {
    show,
    setPage(file) {
      cmsFile = file;
      renderPage();
    },
    refresh() {
      renderBiz();
      renderPage();
    },
    validate,
    focusBusiness(field) {
      show("business");
      validate(true);
      const input = inputs[field] || root.querySelector(`[data-field="${field}"] input`);
      input?.focus();
      input?.scrollIntoView({ block: "center" });
    },
    focusSeo() {
      show("page");
      root.querySelector("#seo-title")?.focus();
    },
    reloadHistory: loadHistory,
  };
}
