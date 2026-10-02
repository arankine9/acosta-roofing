// The small floating toolbar shown over the field being edited: bold, italic
// and link for rich text; paragraph, heading and lists for longer text; and a
// line of guidance (an emptied field, a heading grown too long). It lives in
// a shadow root inside the preview so it scrolls with the page and keeps the
// selection when clicked.

import { ICONS } from "./ui.js";
import { BASE, stripBase, withBase } from "./render.js";

export function createToolbar(shadow, frame) {
  const style = document.createElement("style");
  style.textContent = `
    .tb { position: fixed; display: none; flex-direction: column; align-items: flex-start; gap: 4px; max-width: calc(100vw - 8px);
      font: 14px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #2b2b2b; z-index: 3; }
    .tb.on { display: flex; }
    .row { display: flex; flex-wrap: wrap; background: #fff; border: 1px solid #cfccc1; border-radius: 2px; box-shadow: 0 3px 14px rgba(0,0,0,.16); }
    .row[hidden], .hint[hidden], .linkinfo[hidden] { display: none; }
    button { all: unset; box-sizing: border-box; height: 36px; min-width: 36px; padding: 0 8px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      cursor: pointer; color: #2b2b2b; font: inherit; white-space: nowrap; }
    button[hidden] { display: none; }
    button:hover { background: #f5f4ef; color: #24503c; }
    button:focus-visible { outline: 2px solid #24503c; outline-offset: -2px; }
    button.on { background: #24503c; color: #f5f4ef; }
    .sep { width: 1px; background: #e2dfd5; margin: 6px 2px; }
    .b { font-weight: 700; font-family: Georgia, serif; font-size: 16px; }
    .i { font-style: italic; font-family: Georgia, serif; font-size: 16px; }
    .p { font-family: Georgia, serif; font-size: 16px; }
    .hh { font-weight: 700; font-size: 13px; letter-spacing: .02em; }
    svg { display: block; }
    .linkinfo { display: flex; align-items: center; gap: 2px; padding-left: 10px; font-size: 13px; background: #fff; border: 1px solid #cfccc1; border-radius: 2px; box-shadow: 0 3px 14px rgba(0,0,0,.16); max-width: 100%; }
    .linkinfo .where { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; color: #555; }
    .linkinfo button { height: 32px; font-size: 13px; color: #24503c; text-decoration: underline; text-underline-offset: 2px; }
    .hint { max-width: 340px; padding: 8px 10px; font-size: 13px; border-radius: 2px; box-shadow: 0 3px 14px rgba(0,0,0,.16); }
    .hint.warn { background: #fff7e0; border: 1px solid #e3c46f; color: #5b4300; }
    .hint.error { background: #fdecea; border: 1px solid #e5a29c; color: #8a1c14; }
  `;
  const tb = document.createElement("div");
  tb.className = "tb";
  tb.innerHTML = `
    <div class="row" role="toolbar" aria-label="Text style">
      <button type="button" class="b" data-cmd="bold" title="Bold" aria-label="Bold">B</button>
      <button type="button" class="i" data-cmd="italic" title="Italic" aria-label="Italic">I</button>
      <button type="button" data-cmd="link" title="Add or change a link" aria-label="Link">${ICONS.link}</button>
      <span class="sep blk"></span>
      <button type="button" class="p blk" data-block="p" title="Normal paragraph" aria-label="Paragraph">¶</button>
      <button type="button" class="hh blk" data-block="h3" title="Heading" aria-label="Heading">H</button>
      <button type="button" class="blk" data-block="ul" title="Bulleted list" aria-label="Bulleted list">${ICONS.ul}</button>
      <button type="button" class="blk" data-block="ol" title="Numbered list" aria-label="Numbered list">${ICONS.ol}</button>
    </div>
    <div class="linkinfo" hidden><span class="where"></span><button type="button" data-link="go">Go to page</button><button type="button" data-link="edit">Change</button><button type="button" data-link="remove">Remove</button></div>
    <div class="hint" hidden role="status"></div>`;
  shadow.append(style, tb);
  const row = tb.querySelector(".row");
  const linkinfo = tb.querySelector(".linkinfo");
  const hint = tb.querySelector(".hint");

  let el = null; // field being edited
  let range = null; // its last selection
  const doc = () => frame.doc;
  const type = () => el?.dataset.cmsType || "text";

  const selectionIn = () => {
    const sel = frame.win.getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    return el && el.contains(r.commonAncestorContainer) ? r : null;
  };
  const restore = (field = el, saved = range) => {
    field.focus({ preventScroll: true });
    if (saved) {
      const sel = frame.win.getSelection();
      sel.removeAllRanges();
      sel.addRange(saved);
      range = saved;
    }
  };
  const anchorAt = () => {
    const r = selectionIn() || range;
    if (!r) return null;
    const node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const a = node?.closest?.("a");
    return a && el.contains(a) ? a : null;
  };
  // A text field that is the label of a link (a button, a nav item).
  const outerLink = () => (el?.closest("a[href]") && !el.querySelector("a") ? el.closest("a[href]") : null);

  const api = {
    show(field) {
      el = field;
      range = null;
      api.update();
      tb.classList.add("on");
      api.position();
    },
    hide() {
      el = null;
      tb.classList.remove("on");
      hint.hidden = true;
    },
    setHint(h) {
      if (!h) hint.hidden = true;
      else {
        hint.hidden = false;
        hint.className = "hint " + h.kind;
        hint.textContent = h.text;
      }
      api.refreshVisibility();
      api.position();
    },
    refreshVisibility() {
      const hasRow = !row.hidden;
      const visible = hasRow || !linkinfo.hidden || !hint.hidden;
      tb.classList.toggle("on", !!el && visible);
    },
    update() {
      if (!el) return;
      const r = selectionIn();
      if (r) range = r.cloneRange();
      const t = type();
      row.hidden = t === "text";
      for (const b of row.querySelectorAll(".blk")) b.style.display = t === "block" ? "" : "none";
      if (t !== "text") {
        const d = doc();
        row.querySelector('[data-cmd="bold"]').classList.toggle("on", safeState(d, "bold"));
        row.querySelector('[data-cmd="italic"]').classList.toggle("on", safeState(d, "italic"));
        const blk = currentBlock();
        for (const b of row.querySelectorAll("[data-block]")) b.classList.toggle("on", b.dataset.block === blk);
      }
      // Link line: a link under the cursor, or the field is a link's label.
      const a = t !== "text" ? anchorAt() : null;
      const outer = outerLink();
      const link = a || outer;
      if (link) {
        const href = link.getAttribute("href") || "";
        linkinfo.hidden = false;
        linkinfo.querySelector(".where").textContent = "Link to " + frame.ctx.describeLink(stripBase(href));
        const internal = isInternal(href);
        linkinfo.querySelector('[data-link="go"]').textContent = internal ? "Go to page" : "Open";
        linkinfo.querySelector('[data-link="go"]').hidden = /^(tel|mailto):/.test(href);
        linkinfo.querySelector('[data-link="edit"]').hidden = !a;
        linkinfo.querySelector('[data-link="remove"]').hidden = !a;
        linkinfo.dataset.href = href;
      } else {
        linkinfo.hidden = true;
      }
      api.refreshVisibility();
      api.position();
    },
    position() {
      if (!el || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      const vh = frame.win.innerHeight;
      const vw = frame.win.innerWidth;
      const h = tb.offsetHeight || 40;
      const w = tb.offsetWidth || 200;
      let top = r.top - h - 10;
      if (top < 4) top = r.bottom < h + 60 ? r.bottom + 10 : 4;
      if (r.bottom < 0 || r.top > vh) top = -500;
      tb.style.top = Math.min(top, vh - h - 4) + "px";
      tb.style.left = Math.max(4, Math.min(r.left, vw - w - 4)) + "px";
    },
    async editLink() {
      if (!el || type() === "text") return;
      const field = el;
      const r = selectionIn() || range;
      const saved = r ? r.cloneRange() : null;
      range = saved;
      let a = anchorAt();
      const selected = saved ? saved.toString() : "";
      // The dialog takes focus away from the page; put it back afterwards.
      const res = await frame.ctx.linkDialog({ href: a ? stripBase(a.getAttribute("href") || "") : "", hasLink: !!a, selected });
      if (!field.isConnected) return;
      el = field;
      restore(field, saved);
      if (!res) return;
      a = a && a.isConnected ? a : null;
      const d = doc();
      if (res.remove) {
        if (a) a.replaceWith(...a.childNodes);
      } else {
        const href = withBase(res.href);
        const external = /^https?:/.test(res.href);
        const setTarget = (link) => {
          if (external) {
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener");
          } else {
            link.removeAttribute("target");
            link.removeAttribute("rel");
          }
        };
        const cls = el.querySelector("a[class]")?.getAttribute("class");
        if (a) {
          a.setAttribute("href", href);
          setTarget(a);
        } else if (!range || range.collapsed) {
          const link = d.createElement("a");
          link.setAttribute("href", href);
          if (cls) link.setAttribute("class", cls);
          setTarget(link);
          link.textContent = res.text || res.href;
          d.execCommand("insertHTML", false, link.outerHTML);
        } else {
          d.execCommand("createLink", false, href);
          for (const link of el.querySelectorAll("a")) {
            if (link.getAttribute("href") === href && !link.hasAttribute("data-cms-seen")) {
              if (cls && !link.getAttribute("class")) link.setAttribute("class", cls);
              setTarget(link);
            }
          }
        }
      }
      frame.onInput(el);
      api.update();
    },
  };

  function currentBlock() {
    const r = selectionIn() || range;
    if (!r) return null;
    let node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    while (node && node !== el) {
      const t = node.tagName?.toLowerCase();
      if (t === "li") return node.parentElement?.tagName.toLowerCase() === "ol" ? "ol" : "ul";
      if (["p", "h2", "h3"].includes(t)) return t === "h2" ? "h3" : t;
      node = node.parentElement;
    }
    return "p";
  }

  const isInternal = (href) => href.startsWith(BASE + "/") || href === BASE || (href.startsWith("/") && !href.startsWith("//"));

  // Clicking the toolbar must not take focus (and the selection) away.
  tb.addEventListener("mousedown", (e) => e.preventDefault());
  tb.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !el) return;
    const d = doc();
    if (btn.dataset.cmd === "link") return api.editLink();
    if (btn.dataset.link) {
      const href = linkinfo.dataset.href;
      if (btn.dataset.link === "go") {
        if (isInternal(href)) frame.navigate(href);
        else window.open(href, "_blank", "noopener");
      } else if (btn.dataset.link === "edit") api.editLink();
      else if (btn.dataset.link === "remove") {
        restore();
        const a = anchorAt();
        if (a) a.replaceWith(...a.childNodes);
        frame.onInput(el);
        api.update();
      }
      return;
    }
    restore();
    if (btn.dataset.cmd) {
      d.execCommand(btn.dataset.cmd);
    } else if (btn.dataset.block) {
      const want = btn.dataset.block;
      const cur = currentBlock();
      if (want === "ul" || want === "ol") {
        d.execCommand(want === "ul" ? "insertUnorderedList" : "insertOrderedList");
      } else {
        if (cur === "ul" || cur === "ol") d.execCommand(cur === "ul" ? "insertUnorderedList" : "insertOrderedList");
        d.execCommand("formatBlock", false, want);
      }
    }
    frame.onInput(el);
    api.update();
  });

  return api;
}

function safeState(doc, cmd) {
  try {
    return doc.queryCommandState(cmd);
  } catch {
    return false;
  }
}
