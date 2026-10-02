// The content model: what the server last gave us ("original"), what the
// owner is editing ("working"), photos waiting to be uploaded, and a copy of
// unsaved work kept in this browser in case the tab closes.

import { idb } from "./idb.js";

const listeners = new Set();
const clone = (v) => (v === undefined ? undefined : structuredClone(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function splitKey(key) {
  const at = key.indexOf(":");
  return at === -1 ? [key, ""] : [key.slice(0, at), key.slice(at + 1)];
}
const parts = (path) => (path ? path.split(".") : []);

function getPath(obj, path) {
  let v = obj;
  for (const p of parts(path)) {
    if (v == null || typeof v !== "object" || !(p in v)) return undefined;
    v = v[p];
  }
  return v;
}
function setPath(obj, path, value) {
  const ps = parts(path);
  let v = obj;
  for (const p of ps.slice(0, -1)) {
    if (v[p] == null || typeof v[p] !== "object") v[p] = {};
    v = v[p];
  }
  v[ps[ps.length - 1]] = value;
}

export const model = {
  original: {}, // file id -> JSON, as on the server (live + draft)
  working: {}, // file id -> JSON, with the owner's edits
  draft: { exists: false },
  live: {},
  uploads: new Map(), // repo path -> Blob, not yet sent
  display: new Map(), // "/images/uploads/x.jpg" -> object URL for the preview

  load(content) {
    this.original = content.files || {};
    this.working = clone(this.original);
    this.draft = content.draft || { exists: false };
    this.live = content.live || {};
    emit({ type: "load" });
  },

  /* After a save: take the server's files, but keep anything typed while the
     save was in flight (files whose working copy moved on since `sent`). */
  saved(content, sent) {
    const prevWorking = this.working;
    this.original = content.files || {};
    this.working = clone(this.original);
    for (const id of Object.keys(prevWorking)) {
      if (sent[id] !== undefined && !same(prevWorking[id], sent[id])) this.working[id] = clone(prevWorking[id]);
    }
    this.draft = content.draft || { exists: false };
    this.live = content.live || this.live;
    emit({ type: "saved" });
  },

  get(key) {
    const [id, path] = splitKey(key);
    return getPath(this.working[id], path);
  },
  getOriginal(key) {
    const [id, path] = splitKey(key);
    return getPath(this.original[id], path);
  },
  has(key) {
    return this.get(key) !== undefined;
  },

  set(key, value, source) {
    const [id, path] = splitKey(key);
    if (!this.working[id]) return false;
    if (same(getPath(this.working[id], path), value)) return false;
    if (!path) this.working[id] = clone(value);
    else setPath(this.working[id], path, clone(value));
    emit({ type: "set", key, id, path, source });
    return true;
  },

  dirtyIds() {
    return Object.keys(this.working).filter((id) => !same(this.working[id], this.original[id]));
  },
  isDirty() {
    return this.dirtyIds().length > 0 || this.referencedUploads().length > 0;
  },

  /* Pending uploads the working content still points at. A photo replaced
     twice leaves its first upload unreferenced; that one is never sent. */
  referencedUploads() {
    if (!this.uploads.size) return [];
    const json = JSON.stringify(this.working);
    return [...this.uploads.keys()].filter((path) => json.includes(`"${path.replace(/^public/, "")}"`));
  },

  addUpload(path, blob) {
    this.uploads.set(path, blob);
    const url = URL.createObjectURL(blob);
    this.display.set(path.replace(/^public/, ""), url);
    idb.set("upload:" + path, blob).catch(() => {});
    return url;
  },

  dropUploads(paths) {
    for (const p of paths) {
      this.uploads.delete(p);
      idb.del("upload:" + p).catch(() => {});
    }
  },

  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function emit(event) {
  for (const fn of listeners) fn(event);
  if (event.type === "set") autosave.schedule();
}

// ---------------------------------------------------------------------------
// Unsaved work kept in this browser, keyed by the draft it was made on.

const PREFIX = "acosta-editor:unsaved:";
const headKey = () => PREFIX + (model.draft.exists ? model.draft.head : "none");

export const autosave = {
  timer: null,
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.write(), 400);
  },
  write() {
    clearTimeout(this.timer);
    try {
      const ids = model.dirtyIds();
      const uploads = model.referencedUploads();
      if (!ids.length && !uploads.length) {
        localStorage.removeItem(headKey());
        return;
      }
      const files = {};
      for (const id of ids) files[id] = model.working[id];
      localStorage.setItem(headKey(), JSON.stringify({ savedAt: new Date().toISOString(), files, uploads }));
    } catch {}
  },
  clear(head) {
    try {
      localStorage.removeItem(PREFIX + (head ?? (model.draft.exists ? model.draft.head : "none")));
    } catch {}
  },
  /* Unsaved work from an earlier visit: the one for this draft if there is
     one, else the newest from an older draft (flagged `older`). */
  find() {
    const found = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(PREFIX)) continue;
        try {
          const rec = JSON.parse(localStorage.getItem(k));
          found.push({ key: k, ...rec });
        } catch {}
      }
    } catch {}
    const mine = found.find((r) => r.key === headKey());
    if (mine) return { ...mine, older: false };
    found.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    return found[0] ? { ...found[0], older: true } : null;
  },
  /* Lay a found record over the working content. Returns how many files
     actually differ (0 means there was nothing worth restoring). */
  async apply(rec) {
    let n = 0;
    for (const [id, data] of Object.entries(rec.files || {})) {
      if (!(id in model.working)) continue;
      if (!same(model.working[id], data)) n++;
      model.working[id] = clone(data);
    }
    for (const path of rec.uploads || []) {
      try {
        const blob = await idb.get("upload:" + path);
        if (blob) model.addUpload(path, blob);
      } catch {}
    }
    try {
      if (rec.key !== headKey()) localStorage.removeItem(rec.key);
    } catch {}
    emit({ type: "restore" });
    this.write();
    return n;
  },
  forget(rec) {
    try {
      localStorage.removeItem(rec.key);
    } catch {}
  },
  /* Declining to restore throws away every older copy too. */
  forgetAll() {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    } catch {}
  },
};
