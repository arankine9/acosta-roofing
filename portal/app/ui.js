// Small UI helpers: element builder, dialogs, toasts.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/* A modal dialog. Resolves with the clicked action's value, or `cancel`'s
   value (default null) when closed with Esc or the close button. */
export function dialog({ title, body, actions = [{ label: "OK", value: true, kind: "primary" }], cancel = null, wide = false, onOpen }) {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: "dlg" + (wide ? " dlg-wide" : "") });
    const close = (value) => {
      dlg.close();
      dlg.remove();
      resolve(value);
    };
    const content = typeof body === "string" ? h("div", { class: "dlg-body", html: body }) : h("div", { class: "dlg-body" }, body);
    dlg.append(
      h(
        "div",
        { class: "dlg-head" },
        h("h2", { class: "dlg-title", text: title }),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Close", onclick: () => close(cancel), html: ICONS.close }),
      ),
      content,
      actions.length
        ? h(
            "div",
            { class: "dlg-actions" },
            actions.map((a) =>
              h("button", {
                type: "button",
                class: "btn " + (a.kind === "primary" ? "btn-primary" : a.kind === "danger" ? "btn-danger" : "btn-plain"),
                text: a.label,
                onclick: () => {
                  if (a.validate && !a.validate()) return;
                  close(typeof a.value === "function" ? a.value() : a.value);
                },
              }),
            ),
          )
        : null,
    );
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(cancel);
    });
    document.body.append(dlg);
    dlg.showModal();
    onOpen?.(dlg, close);
  });
}

export const confirm = (title, body, yes = "OK", { danger = false, no = "Cancel" } = {}) =>
  dialog({
    title,
    body,
    actions: [
      { label: no, value: false },
      { label: yes, value: true, kind: danger ? "danger" : "primary" },
    ],
    cancel: false,
  });

export const alert = (title, body) => dialog({ title, body, actions: [{ label: "OK", value: true, kind: "primary" }] });

let toastTimer;
/* A short message at the bottom of the screen, with an optional action
   (e.g. Undo). */
export function toast(message, { action, onAction, duration = 5000 } = {}) {
  let box = document.getElementById("toast");
  if (!box) {
    box = h("div", { id: "toast", role: "status", "aria-live": "polite" });
    document.body.append(box);
  }
  box.replaceChildren(h("span", { text: message }));
  if (action) {
    box.append(
      h("button", {
        type: "button",
        class: "toast-action",
        text: action,
        onclick: () => {
          box.classList.remove("show");
          onAction?.();
        },
      }),
    );
  }
  box.classList.add("show");
  clearTimeout(toastTimer);
  const hide = () => box.classList.remove("show");
  toastTimer = setTimeout(hide, duration);
  // Stay put while the pointer is on it (time to reach Undo).
  box.onmouseenter = () => clearTimeout(toastTimer);
  box.onmouseleave = () => (toastTimer = setTimeout(hide, 2500));
}

export const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export const ICONS = {
  close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  ul: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/></svg>',
  ol: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 4.5h1.5V9M4 9h3M3.8 14.2c.4-.6 2.7-.8 2.7.6 0 1.2-2.7 2-2.7 3.2h2.9" stroke-width="1.3"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="3" width="10" height="18" rx="1.5"/><path d="M11 18h2"/></svg>',
  desktop: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="12" rx="1"/><path d="M9 20h6M12 16v4"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  external: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
  camera: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};
