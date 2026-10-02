// Binds the site preview (the edit build in an iframe) to the content model:
// lays the working content over what was built, makes every field editable
// in place, and writes each edit back to the model.

import { model, splitKey } from "./model.js";
import { BASE, render, serialize, plain, cleanPaste, snippet, isEmptyValue, withBase } from "./render.js";
import { fileUrl } from "./api.js";
import { createToolbar } from "./toolbar.js";
import { createListControls, reconcileLists } from "./lists.js";

const SITE_TOKEN_KEYS = ["name", "legalName", "phone", "email", "city", "state", "serviceArea", "ccb"];

export const frame = {
  iframe: null,
  doc: null,
  win: null,
  cmsFile: null,
  pageTokens: {},
  active: null, // the field being edited
  origs: new WeakMap(), // field element -> its value when the page loaded
  builtCredit: new WeakMap(), // img -> credit line still showing beside it
  ctx: null,
  toolbar: null,
  lists: null,
  plaintext: "true",

  init(iframe, ctx) {
    this.iframe = iframe;
    this.ctx = ctx;
    iframe.addEventListener("load", () => this.setup());
    model.on((e) => this.onModel(e));
  },

  /* Token values for this page: what it was built with, overridden by the
     business facts being edited. */
  tokens() {
    const t = { ...this.pageTokens };
    const s = model.working.site;
    if (s) {
      const from = { ...s, city: s.address?.city, state: s.address?.state };
      for (const k of SITE_TOKEN_KEYS) if (typeof from[k] === "string") t[k] = from[k];
    }
    return t;
  },

  setup() {
    let doc;
    try {
      doc = this.iframe.contentDocument;
    } catch {
      doc = null;
    }
    this.active = null;
    if (!doc || !doc.location.pathname.startsWith(BASE)) {
      // Somewhere that isn't the site: go back to it.
      if (doc?.location.href !== "about:blank") this.iframe.src = `${BASE}/`;
      return;
    }
    this.doc = doc;
    this.win = this.iframe.contentWindow;
    this.cmsFile = doc.querySelector('meta[name="cms-file"]')?.content || null;
    try {
      this.pageTokens = JSON.parse(doc.getElementById("cms-tokens")?.textContent || "{}");
    } catch {
      this.pageTokens = {};
    }
    // Page-specific tokens ({{photoCount}}) aren't in #cms-tokens: take their
    // values from the chips as built, so they render and save unchanged.
    for (const chip of doc.querySelectorAll("[data-cms-token]")) {
      const name = chip.dataset.cmsToken;
      if (!(name in this.pageTokens)) this.pageTokens[name] = chip.textContent;
    }
    const probe = doc.createElement("div");
    probe.contentEditable = "plaintext-only";
    this.plaintext = probe.contentEditable === "plaintext-only" ? "plaintext-only" : "true";
    try {
      doc.execCommand("defaultParagraphSeparator", false, "p");
    } catch {}

    injectStyles(doc);
    const host = doc.createElement("div");
    host.setAttribute("data-cms-ui", "");
    host.style.cssText = "position:fixed;inset:0 auto auto 0;width:0;height:0;z-index:2147483000;";
    doc.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    this.toolbar = createToolbar(shadow, this);
    this.lists = createListControls(shadow, this);

    this.refresh();
    this.bindEvents(doc);
    this.ctx.onPageLoad?.({ path: doc.location.pathname, cmsFile: this.cmsFile, title: doc.title });
  },

  /* Bring the whole page in line with the working content. */
  refresh() {
    if (!this.doc) return;
    reconcileLists(this);
    for (const el of this.doc.querySelectorAll("[data-cms]")) this.bindField(el);
    this.applyAll();
  },

  bindField(el) {
    const key = el.dataset.cms;
    const value = model.get(key);
    if (typeof value !== "string") {
      el.setAttribute("data-cms-locked", "");
      el.removeAttribute("contenteditable");
      return;
    }
    el.removeAttribute("data-cms-locked");
    const type = el.dataset.cmsType || "text";
    const want = type === "text" ? this.plaintext : "true";
    if (el.getAttribute("contenteditable") !== want) el.setAttribute("contenteditable", want);
    el.spellcheck = true;
    if (!this.origs.has(el)) {
      const orig = model.getOriginal(key);
      this.origs.set(el, typeof orig === "string" ? orig : value);
    }
  },

  applyAll() {
    if (!this.doc) return;
    const tokens = this.tokens();
    for (const el of this.doc.querySelectorAll("[data-cms]")) {
      if (el !== this.active) this.applyField(el, tokens);
    }
    for (const img of this.doc.querySelectorAll("img[data-cms-image]")) this.applyImage(img, tokens);
    for (const el of this.doc.querySelectorAll("[data-cms-attrs]")) this.applyAttrs(el, tokens);
    this.refreshTokens(tokens);
  },

  /* Words kept in attributes: data-cms-attrs='{"placeholder":"<key>"}'. */
  applyAttrs(el, tokens = this.tokens()) {
    let map;
    try {
      map = JSON.parse(el.getAttribute("data-cms-attrs"));
    } catch {
      return;
    }
    for (const [attr, key] of Object.entries(map)) {
      const value = model.get(key);
      if (typeof value !== "string") continue;
      const want = plain(value, tokens);
      if (el.getAttribute(attr) !== want) el.setAttribute(attr, want);
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.readOnly = true;
  },

  applyField(el, tokens = this.tokens()) {
    const value = model.get(el.dataset.cms);
    if (typeof value !== "string") return;
    const html = render(value, el.dataset.cmsType || "text", tokens);
    const tmp = this.doc.createElement("div");
    tmp.innerHTML = html;
    if (tmp.innerHTML !== el.innerHTML) el.innerHTML = html;
  },

  applyImage(img, tokens = this.tokens()) {
    const value = model.get(img.dataset.cmsImage);
    if (!value || typeof value !== "object" || !value.src) return;
    const alt = plain(value.alt || "", tokens);
    if (img.getAttribute("alt") !== alt) img.setAttribute("alt", alt);
    const first = img.dataset.cmsSrc === undefined;
    if (first) this.builtCredit.set(img, model.getOriginal(img.dataset.cmsImage)?.credit);
    if (!value.credit && this.builtCredit.get(img)) {
      this.hideCredit(img, this.builtCredit.get(img));
      this.builtCredit.delete(img);
    }
    if (first && !value.credit && img.getAttribute("src") !== withBase(value.src)) {
      // Built with a different (credited) photo than the draft has: whatever
      // non-editable words sit in its caption are that photo's credit.
      const cap = img.closest("figure")?.querySelector("figcaption");
      for (const n of [...(cap?.childNodes || [])]) {
        if (n.nodeType === 1 && (n.matches("[data-cms]") || n.querySelector("[data-cms]"))) continue;
        if (n.nodeType === 3 && !n.data.trim()) continue;
        n.remove();
      }
    }
    if (img.dataset.cmsSrc === value.src) return;
    img.dataset.cmsSrc = value.src;
    const want = model.display.get(value.src) || withBase(value.src);
    if (first && img.getAttribute("src") === want) return;
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    if (/^\/images\/(uploads|thumbs)\//.test(value.src) && !model.display.has(value.src)) {
      // Not in the built copy of the site yet: ask the server for it.
      img.addEventListener("error", function fallback() {
        img.removeEventListener("error", fallback);
        img.src = fileUrl("public" + value.src);
      });
    }
    img.src = want;
  },

  /* A replaced photo's old credit line is still in the built page next to
     it. Find its words near the photo and take them out of the preview. */
  hideCredit(img, credit) {
    if (!credit) return;
    const words = snippet(credit, this.tokens(), 1e4);
    if (!words) return;
    const box = img.closest("figure") || img.parentElement?.parentElement?.parentElement;
    if (!box) return;
    const walker = this.doc.createTreeWalker(box, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest("[data-cms],[data-cms-ui]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    let all = "";
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push({ n, start: all.length });
      all += n.data;
    }
    const at = all.indexOf(words);
    if (at < 0) return;
    const end = at + words.length;
    const find = (pos) => {
      for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].start <= pos) return { node: nodes[i].n, offset: pos - nodes[i].start };
    };
    const a = find(at);
    const b = find(end);
    const range = this.doc.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, Math.min(b.offset, b.node.data.length));
    range.deleteContents();
  },

  refreshTokens(tokens = this.tokens()) {
    for (const chip of this.doc.querySelectorAll("[data-cms-token]")) {
      const v = tokens[chip.dataset.cmsToken];
      if (v !== undefined && chip.textContent !== v) chip.textContent = v;
    }
  },

  onModel(e) {
    if (!this.doc) return;
    if (e.type === "set") {
      if (e.source && e.source.ownerDocument === this.doc) return; // our own edit
      if (e.source === "list") return;
      if (e.id === "site") this.refreshTokens();
      if (e.source === "image") {
        for (const img of this.doc.querySelectorAll("img[data-cms-image]")) this.applyImage(img);
        return;
      }
      this.applyAll();
    } else if (e.type === "load" || e.type === "restore") {
      this.refresh();
    }
  },

  // -------------------------------------------------------------------------
  // Editing.

  fieldOf(node) {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const field = el?.closest?.("[data-cms]");
    return field && field.isContentEditable && !field.hasAttribute("data-cms-locked") ? field : null;
  },

  onInput(el) {
    const key = el.dataset.cms;
    const type = el.dataset.cmsType || "text";
    const value = serialize(el, type);
    model.set(key, value, el);
    for (const other of this.doc.querySelectorAll(`[data-cms="${CSS.escape(key)}"]`)) {
      if (other !== el) this.applyField(other);
    }
    this.checkField(el, value);
  },

  /* Guardrails while typing: an emptied field, a heading grown too long. */
  checkField(el, value = serialize(el, el.dataset.cmsType || "text")) {
    const orig = this.origs.get(el) ?? "";
    let hint = null;
    if (isEmptyValue(value) && !isEmptyValue(orig)) {
      hint = { kind: "error", text: "This can't be left empty. Type something, or press Undo to bring the old words back." };
      el.setAttribute("data-cms-empty", "");
    } else {
      el.removeAttribute("data-cms-empty");
      const len = snippet(value, this.tokens(), 1e4).length;
      const origLen = snippet(orig, this.tokens(), 1e4).length;
      if (/^H[1-6]$/.test(el.tagName) && len > 60 && len > origLen * 1.5) {
        hint = { kind: "warn", text: "This heading is a lot longer than before, so it may wrap onto extra lines, especially on phones. Shorter headings read better." };
      }
    }
    this.toolbar.setHint(hint);
  },

  bindEvents(doc) {
    const win = doc.defaultView;
    doc.addEventListener("input", (e) => {
      const el = this.fieldOf(e.target);
      if (el) this.onInput(el);
    });

    doc.addEventListener("focusin", (e) => {
      const el = this.fieldOf(e.target);
      if (!el) return;
      this.active = el;
      this.toolbar.show(el);
      this.lists.showFor(e.target);
      this.checkField(el);
    });
    doc.addEventListener("focusout", (e) => {
      const el = this.fieldOf(e.target);
      if (!el) return;
      setTimeout(() => {
        if (doc.activeElement === el) return;
        if (this.active === el) this.active = null;
        this.toolbar.hide();
        // Tidy up what the browser left behind (stray <br>, empty tags).
        const value = model.get(el.dataset.cms);
        if (typeof value === "string" && el.isConnected) this.applyField(el);
      }, 0);
    });

    doc.addEventListener("keydown", (e) => {
      const el = this.fieldOf(e.target);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        this.ctx.save?.();
        return;
      }
      if (!el) return;
      const type = el.dataset.cmsType || "text";
      if (e.key === "Enter") {
        if (type === "block") return;
        e.preventDefault();
        if (type === "rich" && e.shiftKey) doc.execCommand("insertLineBreak");
        return;
      }
      if (e.key === "Escape") {
        el.blur();
        return;
      }
      if (mod && type === "text" && ["b", "i", "u"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      }
      if (mod && e.key.toLowerCase() === "u") {
        e.preventDefault();
        return;
      }
      if (mod && e.key.toLowerCase() === "k" && type !== "text") {
        e.preventDefault();
        this.toolbar.editLink();
        return;
      }
      // A space inside a link, button or summary would click it.
      if (e.key === " " && el.closest("a,button,summary,label")) {
        e.preventDefault();
        doc.execCommand("insertText", false, " ");
      }
    });

    doc.addEventListener("beforeinput", (e) => {
      const el = this.fieldOf(e.target);
      if (!el) return;
      const type = el.dataset.cmsType || "text";
      if (type === "text" && /^format/.test(e.inputType)) e.preventDefault();
      if (type !== "block" && (e.inputType === "insertParagraph" || (type === "text" && e.inputType === "insertLineBreak"))) e.preventDefault();
    });

    doc.addEventListener("paste", (e) => {
      const el = this.fieldOf(e.target);
      if (!el) return;
      e.preventDefault();
      const type = el.dataset.cmsType || "text";
      const html = e.clipboardData.getData("text/html");
      const txt = e.clipboardData.getData("text/plain");
      if (type === "text" || !html) {
        if (type === "block" && /\n\s*\n/.test(txt)) {
          const paras = txt.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
          doc.execCommand("insertHTML", false, paras.map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join(""));
        } else {
          doc.execCommand("insertText", false, txt.replace(/\s+/g, " "));
        }
      } else {
        const cleaned = cleanPaste(html, type, ["https://acostaroofingpnw.com", "https://www.acostaroofingpnw.com"]);
        const withPreviewLinks = cleaned.replace(/href="([^"]*)"/g, (m, href) => `href="${withBase(href)}"`);
        doc.execCommand("insertHTML", false, withPreviewLinks);
      }
      this.onInput(el);
    });

    for (const type of ["drop", "dragover"]) {
      doc.addEventListener(type, (e) => {
        if (this.fieldOf(e.target) || e.dataTransfer?.types?.includes("Files")) e.preventDefault();
      });
    }

    doc.addEventListener("submit", (e) => {
      e.preventDefault();
      this.ctx.toast?.("Forms don't send from the editor. They work on the real website.");
    }, true);

    doc.addEventListener("click", (e) => this.onClick(e), true);

    doc.addEventListener("mouseover", (e) => this.lists.showFor(e.target));
    doc.addEventListener("selectionchange", () => this.toolbar.update());
    win.addEventListener("scroll", () => {
      this.toolbar.position();
      this.lists.position();
    }, { passive: true });
    win.addEventListener("resize", () => {
      this.toolbar.position();
      this.lists.position();
    });
  },

  onClick(e) {
    const t = e.target;
    if (t.closest?.("[data-cms-ui]")) return;
    const img = t.closest?.("img[data-cms-image]");
    if (img && model.get(img.dataset.cmsImage)) {
      e.preventDefault();
      e.stopPropagation();
      this.ctx.openImage?.(img);
      return;
    }
    const attrs = t.closest?.("[data-cms-attrs]");
    if (attrs && !this.fieldOf(t)) {
      e.preventDefault();
      e.stopPropagation();
      this.ctx.openAttrs?.(attrs);
      return;
    }
    const field = this.fieldOf(t);
    const a = t.closest?.("a[href]");
    if (field) {
      // Clicking words to edit them never follows the link they sit in.
      if (a || t.closest("summary,button,label")) {
        e.preventDefault();
        e.stopPropagation();
      }
      // A question that is its own <summary>: clicking it opens the answer
      // (but never closes it while editing).
      const details = t.closest("summary")?.parentElement;
      if (details?.tagName === "DETAILS" && !details.open) details.open = true;
      return;
    }
    if (!a) return;
    const url = new URL(a.getAttribute("href"), this.doc.baseURI);
    if (url.origin === location.origin && url.pathname.startsWith(BASE)) {
      if (a.target === "_blank") {
        e.preventDefault();
        this.navigate(url.pathname + url.hash);
      }
      return;
    }
    e.preventDefault();
    if (/^https?:$/.test(url.protocol)) window.open(url.href, "_blank", "noopener");
    else this.ctx.toast?.("Phone and email links work on the real website, not in the editor.");
  },

  navigate(path) {
    if (!this.iframe) return;
    const target = path.startsWith(BASE) ? path : withBase(path);
    try {
      if (this.win && this.doc?.location.pathname === target.split("#")[0]) return;
      this.iframe.contentWindow.location.href = target;
    } catch {
      this.iframe.src = target;
    }
  },

  reload() {
    try {
      this.iframe.contentWindow.location.reload();
    } catch {
      this.iframe.src = this.iframe.src;
    }
  },

  /* Scroll to a field and put the cursor in it, with a brief highlight. */
  focusKey(key) {
    if (!this.doc) return false;
    const el = this.doc.querySelector(`[data-cms="${CSS.escape(key)}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
    el.setAttribute("data-cms-flash", "");
    setTimeout(() => el.removeAttribute("data-cms-flash"), 1600);
    return true;
  },

  hasKey(key) {
    return !!this.doc?.querySelector(`[data-cms="${CSS.escape(key)}"]`);
  },
};

export const fileOfKey = (key) => splitKey(key)[0];

function injectStyles(doc) {
  const style = doc.createElement("style");
  style.setAttribute("data-cms-ui", "");
  style.textContent = `
    [data-cms][contenteditable] { cursor: text; outline: 1px dashed transparent; outline-offset: 3px; transition: outline-color .12s; border-radius: 1px; }
    [data-cms][contenteditable]:hover { outline-color: #c98f1c; }
    [data-cms][contenteditable]:focus { outline: 2px solid #d29b2a; outline-offset: 3px; box-shadow: 0 0 0 3px rgba(255,255,255,.35); }
    [data-cms][contenteditable]:empty { display: inline-block; min-width: 3ch; min-height: 1em; }
    [data-cms][data-cms-empty], [data-cms][contenteditable]:empty { outline: 2px dashed #b3261e !important; }
    [data-cms][data-cms-flash] { outline: 3px solid #d29b2a !important; outline-offset: 4px; }
    [data-cms-token] { background: rgba(210,155,42,.16); box-shadow: 0 0 0 1px rgba(210,155,42,.45); border-radius: 2px; cursor: default; }
    [data-cms-attrs] { cursor: pointer !important; }
    [data-cms-attrs]:hover { outline: 2px dashed #c98f1c; outline-offset: 2px; }
    img[data-cms-image] { cursor: pointer; transition: outline-color .12s, filter .12s; outline: 2px solid transparent; outline-offset: -2px; }
    img[data-cms-image]:hover { outline: 3px solid #d29b2a; outline-offset: -3px; filter: brightness(.92); }
    [data-cms-list] > [data-cms-item][data-cms-hover] { outline: 1px solid rgba(201,143,28,.6); outline-offset: 2px; }
    [data-cms-item][data-cms-moved] { animation: cms-moved 1s ease-out; }
    @keyframes cms-moved { from { background-color: rgba(210,155,42,.28); } to { background-color: transparent; } }
  `;
  doc.head.append(style);
}
