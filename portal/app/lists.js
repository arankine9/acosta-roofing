// Lists the owner may add to, remove from and reorder ([data-cms-list]).
//
// Each item's fields carry keys with the item's array index in them
// ("pages/about:process.steps.2.title"). After any change the items are
// renumbered by position: every key under an item is rewritten from its old
// index to its new one, and the JSON array is rebuilt from the old indexes,
// so DOM and content always agree. A list key can be rendered by more than
// one container (a phone list and a desktop table); every change is applied
// to all of them.

import { model } from "./model.js";
import { ICONS } from "./ui.js";

const KEY_ATTRS = ["data-cms", "data-cms-image", "data-cms-list"];

export const itemsOf = (list) => [...list.children].filter((c) => c.hasAttribute("data-cms-item"));
const containers = (doc, key) => [...doc.querySelectorAll("[data-cms-list]")].filter((l) => l.dataset.cmsList === key);

function rekey(item, listKey, to) {
  const from = item.dataset.cmsItem;
  if (String(from) === String(to)) return;
  const oldP = `${listKey}.${from}`;
  const newP = `${listKey}.${to}`;
  const fix = (v) => (v === oldP ? newP : v.startsWith(oldP + ".") ? newP + v.slice(oldP.length) : v);
  const els = [item, ...item.querySelectorAll("[data-cms],[data-cms-image],[data-cms-list],[data-cms-attrs]")];
  for (const el of els) {
    for (const a of KEY_ATTRS) if (el.hasAttribute(a)) el.setAttribute(a, fix(el.getAttribute(a)));
    if (el.hasAttribute("data-cms-attrs")) {
      try {
        const map = JSON.parse(el.getAttribute("data-cms-attrs"));
        for (const k of Object.keys(map)) map[k] = fix(map[k]);
        el.setAttribute("data-cms-attrs", JSON.stringify(map));
      } catch {}
    }
  }
  item.dataset.cmsItem = String(to);
}

function cloneItem(frame, src) {
  const copy = src.cloneNode(true);
  copy.removeAttribute("data-cms-hover");
  const a = [src, ...src.querySelectorAll("[data-cms]")];
  const b = [copy, ...copy.querySelectorAll("[data-cms]")];
  a.forEach((el, i) => {
    if (frame.origs.has(el) && b[i]) frame.origs.set(b[i], frame.origs.get(el));
  });
  return copy;
}

/* Lay `plan` over every container of `key`. A plan is the new order as
   [{ from: oldIndex } | { clone: oldIndex }]. Returns what was removed, per
   container, for undo. */
function applyPlan(frame, key, plan) {
  const old = model.get(key);
  const next = plan.map((p) => structuredClone(old[p.from ?? p.clone]));
  const removed = [];
  for (const list of containers(frame.doc, key)) {
    const items = itemsOf(list);
    if (!items.length) continue;
    const byIndex = new Map(items.map((el) => [el.dataset.cmsItem, el]));
    const tail = items[items.length - 1].nextSibling;
    const used = new Set();
    const seq = plan.map((p) => {
      if (p.from !== undefined) {
        const el = byIndex.get(String(p.from));
        used.add(el);
        return el;
      }
      return cloneItem(frame, byIndex.get(String(p.clone)));
    });
    for (const el of items) {
      if (!used.has(el)) {
        removed.push({ list, el, next: el.nextSibling });
        el.remove();
      }
    }
    for (const el of seq) if (el) list.insertBefore(el, tail && tail.parentNode === list ? tail : null);
    itemsOf(list).forEach((el, i) => rekey(el, key, i));
  }
  model.set(key, next, "list");
  for (const el of frame.doc.querySelectorAll("[data-cms]")) frame.bindField(el);
  frame.applyAll();
  return removed;
}

/* On page load: make every list match the working content's length. Items
   map to array entries by position; missing ones are cloned from the last
   item; extras are removed. */
export function reconcileLists(frame) {
  const doc = frame.doc;
  const done = new Set();
  for (;;) {
    const list = [...doc.querySelectorAll("[data-cms-list]")].find((l) => !done.has(l));
    if (!list) break;
    done.add(list);
    const key = list.dataset.cmsList;
    const arr = model.get(key);
    const items = itemsOf(list);
    if (!Array.isArray(arr) || !items.length) {
      list.setAttribute("data-cms-list-locked", "");
      continue;
    }
    list.removeAttribute("data-cms-list-locked");
    const tail = items[items.length - 1].nextSibling;
    for (let i = items.length; i < arr.length; i++) {
      const copy = cloneItem(frame, items[items.length - 1]);
      list.insertBefore(copy, tail && tail.parentNode === list ? tail : null);
    }
    for (let i = arr.length; i < items.length; i++) items[i].remove();
    itemsOf(list).forEach((el, i) => rekey(el, key, i));
  }
}

export function createListControls(shadow, frame) {
  const style = document.createElement("style");
  style.textContent = `
    .bar { position: fixed; display: none; gap: 1px; background: #d9d6cb; border: 1px solid #d9d6cb; border-radius: 2px;
      box-shadow: 0 2px 10px rgba(0,0,0,.14); font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; z-index: 2; }
    .bar.on { display: flex; }
    button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 5px; height: 32px; min-width: 32px; padding: 0 9px;
      background: #fff; color: #2b2b2b; cursor: pointer; justify-content: center; }
    button:hover { background: #f5f4ef; color: #24503c; }
    button:focus-visible { outline: 2px solid #24503c; outline-offset: -2px; }
    button[disabled] { color: #b8b6ae; cursor: default; background: #fff; }
    .del:hover { color: #b3261e; }
    .tag { display: inline-flex; align-items: center; padding: 0 9px; background: #24503c; color: #f5f4ef; font-size: 12px; letter-spacing: .02em; }
    svg { display: block; }
    @media (max-width: 480px) { .txt { display: none; } }
  `;
  const bar = document.createElement("div");
  bar.className = "bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "List item");
  bar.innerHTML = `
    <span class="tag"></span>
    <button type="button" data-op="up" title="Move up" aria-label="Move up">${ICONS.up}</button>
    <button type="button" data-op="down" title="Move down" aria-label="Move down">${ICONS.down}</button>
    <button type="button" data-op="add" title="Add a copy below, then change its words">${ICONS.plus}<span class="txt">Add</span></button>
    <button type="button" data-op="del" class="del" title="Remove">${ICONS.trash}<span class="txt">Remove</span></button>`;
  shadow.append(style, bar);

  let current = null; // the item the bar is for
  let hideTimer = null;
  const gen = new Map(); // list key -> change count, so a stale undo can't run
  // Any other change inside a list (a word typed in one of its items, a
  // nested list's add or delete) moves its count on too, so Undo can't lay
  // the old list back over it.
  model.on((e) => {
    if (e.type === "load" || e.type === "restore") return gen.clear();
    if (e.type !== "set") return;
    for (const [k, n] of gen) {
      if (e.key === k || e.key.startsWith(k + ".") || k.startsWith(e.key + ".")) gen.set(k, n + 1);
    }
  });

  const itemFor = (node) => {
    let el = node?.nodeType === 1 ? node : node?.parentElement;
    while (el) {
      const item = el.closest?.("[data-cms-item]");
      if (!item) return null;
      const list = item.parentElement;
      if (list?.hasAttribute("data-cms-list") && !list.hasAttribute("data-cms-list-locked")) return item;
      el = item.parentElement;
    }
    return null;
  };

  const api = {
    showFor(target) {
      if (target?.closest?.("[data-cms-ui]")) {
        clearTimeout(hideTimer);
        return;
      }
      const item = itemFor(target);
      if (!item) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => api.hide(), 350);
        return;
      }
      clearTimeout(hideTimer);
      if (item === current) return;
      current?.removeAttribute("data-cms-hover");
      current = item;
      item.setAttribute("data-cms-hover", "");
      bar.classList.add("on");
      api.position();
    },
    hide() {
      current?.removeAttribute("data-cms-hover");
      current = null;
      bar.classList.remove("on");
    },
    position() {
      if (!current || !current.isConnected) return api.hide();
      const r = current.getBoundingClientRect();
      const vh = frame.win.innerHeight;
      if (r.bottom < 0 || r.top > vh) {
        bar.style.top = "-100px";
        return;
      }
      const list = current.parentElement;
      const items = itemsOf(list);
      const i = items.indexOf(current);
      bar.querySelector(".tag").textContent = `${i + 1} of ${items.length}`;
      bar.querySelector('[data-op="up"]').disabled = i === 0;
      bar.querySelector('[data-op="down"]').disabled = i === items.length - 1;
      const bw = bar.offsetWidth || 220;
      const vw = frame.win.innerWidth;
      const left = Math.max(4, Math.min(r.right - bw, vw - bw - 4));
      const top = Math.max(4, Math.min(r.top - 16, vh - 40));
      bar.style.left = left + "px";
      bar.style.top = top + "px";
    },
  };

  bar.addEventListener("mousedown", (e) => e.preventDefault());
  bar.addEventListener("mouseleave", () => {
    hideTimer = setTimeout(() => api.hide(), 350);
  });
  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled || !current) return;
    const item = current;
    const list = item.parentElement;
    const key = list.dataset.cmsList;
    const arr = model.get(key);
    const items = itemsOf(list);
    const i = items.indexOf(item);
    const idx = items.map((el) => Number(el.dataset.cmsItem));
    const op = btn.dataset.op;
    let plan = idx.map((from) => ({ from }));
    let focusAt = i;
    if (op === "up" && i > 0) {
      [plan[i - 1], plan[i]] = [plan[i], plan[i - 1]];
      focusAt = i - 1;
    } else if (op === "down" && i < items.length - 1) {
      [plan[i + 1], plan[i]] = [plan[i], plan[i + 1]];
      focusAt = i + 1;
    } else if (op === "add") {
      plan.splice(i + 1, 0, { clone: idx[i] });
      focusAt = i + 1;
    } else if (op === "del") {
      if (items.length <= 1) {
        frame.ctx.toast?.("This list needs at least one entry. Change its words instead.");
        return;
      }
      plan.splice(i, 1);
      focusAt = Math.min(i, items.length - 2);
    } else return;

    const before = structuredClone(arr);
    const removed = applyPlan(frame, key, plan);
    const g = (gen.get(key) || 0) + 1;
    gen.set(key, g);
    const target = itemsOf(list)[focusAt];
    api.hide();
    if (target) {
      target.setAttribute("data-cms-moved", "");
      setTimeout(() => target.removeAttribute("data-cms-moved"), 1000);
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (op === "add") {
        const first = target.querySelector("[data-cms][contenteditable]") || (target.matches("[data-cms][contenteditable]") ? target : null);
        if (first) {
          first.focus();
          const sel = frame.win.getSelection();
          sel.selectAllChildren(first);
        }
        frame.ctx.toast?.("Added a copy. Now change its words.");
      } else {
        api.showFor(target);
      }
    }
    if (op === "del") {
      frame.ctx.toast?.("Removed.", {
        action: "Undo",
        duration: 12000,
        onAction: () => {
          if (gen.get(key) !== g || !list.isConnected) {
            frame.ctx.toast?.("That can't be undone any more.");
            return;
          }
          for (const { list: l, el, next } of removed) l.insertBefore(el, next && next.parentNode === l ? next : null);
          for (const l of containers(frame.doc, key)) itemsOf(l).forEach((el, n) => rekey(el, key, n));
          model.set(key, before, "list");
          gen.set(key, g + 1);
          frame.applyAll();
          frame.ctx.toast?.("Put back.");
        },
      });
    }
  });

  return api;
}
