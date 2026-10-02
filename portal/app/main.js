// The editor: top bar, page picker, save / preview / publish / discard, and
// the wiring between the content model, the site preview and the panels.

import { api, ApiError, blobToBase64 } from "./api.js";
import { model, autosave, splitKey } from "./model.js";
import { frame } from "./frame.js";
import { createPanels, businessProblems } from "./panels.js";
import { openImagePanel } from "./images.js";
import { linkDialog, describeLink, attrsDialog } from "./dialogs.js";
import { discoverPages, fileLabel } from "./pages.js";
import { BASE, isEmptyValue, snippet } from "./render.js";
import { h, dialog, confirm, alert, toast, esc, formatDate, ICONS } from "./ui.js";

const $ = (s) => document.querySelector(s);
const UPLOAD_COUNT = 20;
const UPLOAD_BYTES = 36 * 1024 * 1024; // base64 grows it by a third; the cap is 40 MB
const state = { pages: [], busy: null, path: null, pendingFocus: null, me: null };

const ctx = {
  toast,
  tokens: () => frame.tokens(),
  currentPath: () => (state.path || "/").replace(BASE, "") || "/",
  openImage: (img) => openImagePanel(img, frame),
  openAttrs: (el) => attrsDialog(el),
  linkDialog: (info) => linkDialog(info, state.pages),
  describeLink: (href) => describeLink(href, state.pages),
  save: () => save(),
  restore: (commit) => restoreVersion(commit),
  onPageLoad({ path, cmsFile, title }) {
    state.path = path;
    const picker = $("#page-picker");
    if (![...picker.options].some((o) => o.value === path)) {
      picker.append(h("option", { value: path, text: (title || path).replace(/ \| Acosta Roofing$/, "") }));
    }
    picker.value = path;
    const hash = "#" + (path.replace(BASE, "") || "/");
    if (location.hash !== hash) history.replaceState(null, "", hash);
    panels.setPage(cmsFile);
    if (state.pendingFocus) {
      const key = state.pendingFocus;
      state.pendingFocus = null;
      setTimeout(() => frame.focusKey(key), 250);
    }
  },
};

const panels = createPanels($("#panel"), {
  tokens: () => frame.tokens(),
  currentPath: () => ctx.currentPath(),
  restore: (c) => restoreVersion(c),
  onTab: () => document.body.classList.add("sheet-open"),
});

// ---------------------------------------------------------------------------
// Status.

function updateStatus() {
  const el = $("#status");
  const dirty = model.isDirty();
  let text, kind;
  if (state.busy) {
    text = state.busy;
    kind = "busy";
  } else if (dirty) {
    text = "Unsaved changes";
    kind = "dirty";
  } else if (model.draft.exists && model.draft.conflicts?.length) {
    text = "Draft can't be published";
    kind = "dirty";
  } else if (model.draft.exists) {
    text = "Draft not published";
    kind = "draft";
  } else {
    text = "All changes saved";
    kind = "clean";
  }
  el.querySelector(".status-text").textContent = text;
  el.dataset.kind = kind;
  el.title = model.draft.exists && model.draft.updatedAt ? `Draft last saved ${formatDate(model.draft.updatedAt)}${model.draft.updatedBy ? " by " + model.draft.updatedBy : ""}` : "";
  $("#btn-save").disabled = !!state.busy || !dirty;
  $("#btn-publish").disabled = !!state.busy || (!dirty && !model.draft.exists);
  $("#btn-discard").disabled = !!state.busy || (!dirty && !model.draft.exists);
}
model.on(() => updateStatus());

function setBusy(text) {
  state.busy = text;
  document.body.classList.toggle("busy", !!text);
  updateStatus();
}

const labelOf = (id) => fileLabel(id, state.pages);

// ---------------------------------------------------------------------------
// Checks before saving: business info, and fields that had words and are now
// empty (on any page, not only this one).

function emptyFields() {
  const out = [];
  const wild = (path) => path.replace(/\.\d+(?=\.|$)/g, ".*");
  for (const id of model.dirtyIds()) {
    const required = new Map();
    const walk = (v, path, fn) => {
      if (typeof v === "string") fn(path, v);
      else if (v && typeof v === "object") for (const [k, c] of Object.entries(v)) walk(c, path ? `${path}.${k}` : k, fn);
    };
    walk(model.original[id], "", (path, v) => {
      if (!isEmptyValue(v) && !required.has(wild(path))) required.set(wild(path), v);
    });
    walk(model.working[id], "", (path, v) => {
      if (/(^|\.)(credit|thumb)$/.test(path)) return;
      if (isEmptyValue(v) && required.has(wild(path))) {
        out.push({ key: `${id}:${path}`, was: model.getOriginal(`${id}:${path}`) || required.get(wild(path)) });
      }
    });
  }
  return out;
}

async function checkBeforeSave() {
  const biz = model.dirtyIds().includes("site") ? businessProblems(model.working.site) : [];
  if (biz.length) {
    const go = await dialog({
      title: "Check the business info",
      body: h("div", {}, h("p", { text: "Some business details need fixing before you can save:" }), h("ul", {}, biz.map((p) => h("li", { text: p.text })))),
      actions: [{ label: "Show me", value: true, kind: "primary" }],
      cancel: true,
    });
    if (go) panels.focusBusiness(biz[0].field);
    return false;
  }
  const empty = emptyFields().filter((p) => !(splitKey(p.key)[0] === "site" && ["name", "phone", "email", "ccb"].includes(splitKey(p.key)[1])));
  if (empty.length) {
    const items = empty.slice(0, 5).map((p) => {
      const [id] = splitKey(p.key);
      const was = snippet(p.was, frame.tokens(), 70);
      return h("li", {}, `On ${labelOf(id)}: the text that said “${was}” is empty.`);
    });
    const go = await dialog({
      title: "Some text is empty",
      body: h(
        "div",
        {},
        h("p", { text: "Every place that had words needs some, or the page will have a gap. Type something there, or use Undo to bring the old words back." }),
        h("ul", {}, items),
        empty.length > 5 ? h("p", { class: "muted", text: `And ${empty.length - 5} more.` }) : null,
      ),
      actions: [{ label: "Show me", value: true, kind: "primary" }],
      cancel: false,
    });
    if (go) locate(empty[0].key);
    return false;
  }
  return true;
}

/* Bring a field into view: in the panel, on this page, or on its page. */
function locate(key) {
  const [id, path] = splitKey(key);
  if (id === "site") return panels.focusBusiness(path);
  if (path.startsWith("seo.")) {
    const page = state.pages.find((p) => p.file === id);
    if (page && page.path !== state.path) frame.navigate(page.path);
    return panels.focusSeo();
  }
  if (frame.focusKey(key)) return;
  const page =
    state.pages.find((p) => p.keys?.has(key)) ||
    state.pages.find((p) => p.file === id) ||
    state.pages.find((p) => [...(p.keys || [])].some((k) => k.startsWith(id + ":")));
  if (page) {
    state.pendingFocus = key;
    frame.navigate(page.path);
  } else {
    toast("That text isn't on any page we could find.");
  }
}

// ---------------------------------------------------------------------------
// Save, publish, discard, restore.

async function save() {
  if (state.busy) return false;
  autosave.write();
  const ids = model.dirtyIds();
  const ups = model.referencedUploads();
  if (!ids.length && !ups.length) {
    toast("Nothing new to save.");
    return true;
  }
  if (!(await checkBeforeSave())) return false;
  setBusy("Saving…");
  try {
    const files = {};
    for (const id of ids) files[id] = structuredClone(model.working[id]);
    const names = ids.map(labelOf);
    const message = names.length ? `Edit ${names.join(", ")}` : "Add photos";
    const oldHead = model.draft.exists ? model.draft.head : null;
    // The server takes at most 20 uploads and 40 MB per save: send photos in
    // batches, the words with the first one.
    const batches = [[]];
    let size = 0;
    for (const path of ups) {
      const blob = model.uploads.get(path);
      const cur = batches[batches.length - 1];
      if (cur.length && (cur.length >= UPLOAD_COUNT || size + blob.size > UPLOAD_BYTES)) {
        batches.push([]);
        size = 0;
      }
      batches[batches.length - 1].push(path);
      size += blob.size;
    }
    let head = oldHead;
    let res;
    for (let b = 0; b < batches.length; b++) {
      const uploads = [];
      for (const path of batches[b]) uploads.push({ path, base64: await blobToBase64(model.uploads.get(path)) });
      if (batches.length > 1) setBusy(`Saving… (${b + 1} of ${batches.length})`);
      res = await api.save({ draftHead: head, files: b === 0 ? files : {}, uploads, message: b === 0 ? message : `${message} (more photos)` });
      head = res.draft?.head ?? head;
      model.dropUploads(batches[b]);
    }
    autosave.clear(oldHead ?? "none");
    model.saved(res, files);
    autosave.write();
    toast("Draft saved. Nothing on the website changes until you publish.");
    return true;
  } catch (err) {
    await showError(err, "save");
    return false;
  } finally {
    setBusy(null);
  }
}

async function showError(err, what) {
  if (err instanceof ApiError && err.code === "stale") {
    const reload = await dialog({
      title: "This draft changed somewhere else",
      body: `<p>Your draft was saved from another tab or device since you opened it here, so saving now could undo those changes.</p><p>Reload to get the newest version. Your unsaved changes here are kept in this browser, and you'll be offered them again after reloading.</p>`,
      actions: [
        { label: "Not now", value: false },
        { label: "Reload", value: true, kind: "primary" },
      ],
      cancel: false,
    });
    if (reload) {
      autosave.write();
      window.removeEventListener("beforeunload", beforeUnload);
      location.reload();
    }
    return;
  }
  if (err instanceof ApiError && err.code === "conflict") {
    const files = (err.data.files || []).map((f) => labelOf(String(f).replace(/^src\/content\//, "").replace(/\.json$/, "")));
    if (!model.isDirty()) api.content().then((c) => model.load(c)).catch(() => {});
    const go = await dialog({
      title: "Can't publish this draft",
      body: `<p>While your draft was waiting, ${files.length ? `<strong>${files.map(esc).join(", ")}</strong> ${files.length > 1 ? "were" : "was"}` : "some of the same pages were"} also changed on the website from somewhere else (probably by your web developer).</p>
       <p>Publishing would overwrite those changes, so it was stopped. Nothing on the website has changed, and your draft is still saved.</p>
       <p>To go on, discard your draft and make your changes again on top of the new version. (Or ask your web developer to combine the two.)</p>`,
      actions: [
        { label: "Keep my draft for now", value: false },
        { label: "Discard draft…", value: true, kind: "danger" },
      ],
      cancel: false,
    });
    if (go) await discard();
    return;
  }
  if (err instanceof ApiError && err.code === "live_changed") {
    await alert("The website just changed", "<p>Something else was published to the website a moment ago. Your draft is safe. Try publishing again.</p>");
    return;
  }
  if (err instanceof ApiError && err.code === "no_draft") {
    await alert("No draft", "<p>There's no saved draft any more (it may have been published or discarded from another tab or device). Reload the page to see the latest.</p>");
    return;
  }
  const signin = err instanceof ApiError && (err.status === 0 || err.status === 401 || err.status === 403);
  await alert(
    what === "publish" ? "Couldn't publish" : what === "save" ? "Couldn't save" : "Something went wrong",
    `<p>${esc(err.message)}</p>${signin ? "" : "<p>Your changes are still here. Try again in a moment.</p>"}`,
  );
}

async function publish() {
  if (state.busy) return;
  if (model.isDirty()) {
    const ok = await confirm("Save and publish?", "<p>You have unsaved changes. They'll be saved to your draft first, then you can publish.</p>", "Save and continue");
    if (!ok || !(await save())) return;
  }
  if (!model.draft.exists) {
    await alert("Nothing to publish", "<p>The website already has all your changes.</p>");
    return;
  }
  const conflicts = model.draft.conflicts || [];
  if (conflicts.length) {
    const names = conflicts.map(labelOf);
    const go = await dialog({
      title: "This draft can't be published",
      body: `<p>Since you started this draft, <strong>${names.map(esc).join(", ")}</strong> ${names.length > 1 ? "were" : "was"} also changed on the website from somewhere else (probably by your web developer). Publishing would overwrite those changes, so it isn't allowed.</p>
        <p>The way forward is to discard your draft and make your changes again on top of the new version. (Or ask your web developer to combine the two.)</p>`,
      actions: [
        { label: "Keep my draft for now", value: false },
        { label: "Discard draft…", value: true, kind: "danger" },
      ],
      cancel: false,
    });
    if (go) await discard();
    return;
  }
  const changed = (model.draft.changed || []).map(labelOf);
  const photos = (model.draft.uploads || []).filter((p) => p.includes("/uploads/")).length;
  const ok = await dialog({
    title: "Publish to the website?",
    body: h(
      "div",
      {},
      h("p", { text: "These parts of the website will change:" }),
      h("ul", { class: "changed-list" }, changed.map((c) => h("li", { text: c })), photos ? h("li", { text: `${photos} new photo${photos > 1 ? "s" : ""}` }) : null),
      h("p", { class: "muted", text: "Everyone will see the changes about a minute after you publish." }),
    ),
    actions: [
      { label: "Not yet", value: false },
      { label: "Publish to website", value: true, kind: "primary" },
    ],
    cancel: false,
  });
  if (!ok) return;
  setBusy("Publishing…");
  try {
    const head = model.draft.head;
    await api.publish({ draftHead: head, message: changed.length ? `Publish: ${changed.join(", ")}` : undefined });
    autosave.clear(head);
    const content = await api.content();
    model.load(content);
    setBusy(null);
    await alert("Published", "<p>Published. The live site updates in about a minute.</p>");
  } catch (err) {
    setBusy(null);
    await showError(err, "publish");
  } finally {
    setBusy(null);
  }
}

async function discard() {
  if (state.busy) return;
  const ok = await confirm(
    "Discard your draft?",
    "<p>This throws away every change that hasn't been published, saved or not, and puts the editor back to what's on the website now.</p><p>The live website isn't affected.</p>",
    "Discard draft",
    { danger: true, no: "Keep my changes" },
  );
  if (!ok) return;
  setBusy("Discarding…");
  try {
    const head = model.draft.exists ? model.draft.head : null;
    if (model.draft.exists) await api.discard({ draftHead: head });
    autosave.clear(head ?? "none");
    model.dropUploads([...model.uploads.keys()]);
    model.load(await api.content());
    frame.reload();
    toast("Draft discarded.");
  } catch (err) {
    await showError(err, "discard");
  } finally {
    setBusy(null);
  }
}

async function restoreVersion(commit) {
  if (state.busy) return;
  const parts = [`<p>The website's words and photos as they were on <strong>${esc(formatDate(commit.date))}</strong> will become your draft.</p>`];
  if (model.draft.exists) parts.push("<p>This replaces your current draft.</p>");
  if (model.isDirty()) parts.push("<p>Your unsaved changes will be lost.</p>");
  parts.push("<p>Nothing changes on the live website until you publish.</p>");
  const ok = await confirm("Bring back this version?", parts.join(""), "Bring it back");
  if (!ok) return;
  setBusy("Bringing back…");
  try {
    const head = model.draft.exists ? model.draft.head : null;
    const res = await api.restore({ sha: commit.sha, draftHead: head });
    autosave.clear(head ?? "none");
    model.dropUploads([...model.uploads.keys()]);
    model.load(res);
    frame.reload();
    toast("That version is now your draft. Look it over, then publish it to put it on the website.", { duration: 8000 });
  } catch (err) {
    await showError(err, "restore");
  } finally {
    setBusy(null);
  }
}

function preview() {
  if (!model.draft.exists) {
    toast(model.isDirty() ? "Save your draft first, then you can preview it." : "There's no draft to preview. The website already shows everything.");
    return;
  }
  if (!model.draft.previewUrl) {
    toast("The preview isn't set up for this website yet. Ask your web developer.");
    return;
  }
  window.open(model.draft.previewUrl, "_blank", "noopener");
  toast(
    model.isDirty()
      ? "Opened the preview. It doesn't have your unsaved changes: save first, then give it a minute or two."
      : "Opened the preview in a new tab. After a save it takes a minute or two to update.",
    { duration: 8000 },
  );
}

// ---------------------------------------------------------------------------
// Boot.

function beforeUnload(e) {
  autosave.write();
  if (model.isDirty()) {
    e.preventDefault();
    e.returnValue = "";
  }
}

async function offerRestore() {
  const rec = autosave.find();
  if (!rec) return;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ids = Object.keys(rec.files || {}).filter((id) => id in model.working && !same(model.working[id], rec.files[id]));
  if (!ids.length) {
    autosave.forget(rec);
    return;
  }
  const yes = await dialog({
    title: "Pick up where you left off?",
    body: h(
      "div",
      {},
      h("p", { text: `You have changes from ${formatDate(rec.savedAt)} that weren't saved:` }),
      h("ul", {}, ids.map((id) => h("li", { text: labelOf(id) }))),
      rec.older ? h("p", { class: "muted", text: "Your draft has been saved from somewhere else since then. Restoring puts your version of these parts back over it." }) : null,
    ),
    actions: [
      { label: "Throw them away", value: false },
      { label: "Restore my changes", value: true, kind: "primary" },
    ],
    cancel: null,
  });
  if (yes) {
    await autosave.apply(rec);
    toast("Your changes are back. Save when you're ready.");
  } else if (yes === false) autosave.forgetAll();
}

function setupTopBar() {
  document.querySelector('[data-width="desktop"]').innerHTML = ICONS.desktop;
  document.querySelector('[data-width="phone"]').innerHTML = ICONS.phone;
  $("#btn-more").innerHTML = ICONS.more;
  $("#btn-save").addEventListener("click", () => save());
  $("#btn-publish").addEventListener("click", () => publish());
  $("#btn-preview").addEventListener("click", () => preview());
  $("#btn-preview-menu").addEventListener("click", () => {
    $("#more-menu").hidden = true;
    preview();
  });
  $("#btn-discard").addEventListener("click", () => {
    $("#more-menu").hidden = true;
    discard();
  });
  $("#page-picker").addEventListener("change", (e) => frame.navigate(e.target.value));
  for (const b of document.querySelectorAll("[data-width]")) {
    b.addEventListener("click", () => {
      const phone = b.dataset.width === "phone";
      $("#canvas").classList.toggle("phone", phone);
      for (const o of document.querySelectorAll("[data-width]")) o.setAttribute("aria-pressed", String(o === b));
      try {
        localStorage.setItem("acosta-editor:width", b.dataset.width);
      } catch {}
    });
  }
  try {
    if (localStorage.getItem("acosta-editor:width") === "phone") document.querySelector('[data-width="phone"]').click();
  } catch {}
  const more = $("#more-menu");
  $("#btn-more").addEventListener("click", (e) => {
    e.stopPropagation();
    more.hidden = !more.hidden;
  });
  document.addEventListener("click", (e) => {
    if (!more.hidden && !more.contains(e.target)) more.hidden = true;
  });
  $("#btn-sheet").addEventListener("click", () => document.body.classList.toggle("sheet-open"));
  $("#sheet-close").addEventListener("click", () => document.body.classList.toggle("sheet-open"));
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    }
  });
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide", () => autosave.write());

  const tip = $("#tip");
  try {
    if (localStorage.getItem("acosta-editor:tip") === "done") tip.hidden = true;
  } catch {}
  $("#tip-close").addEventListener("click", () => {
    tip.hidden = true;
    try {
      localStorage.setItem("acosta-editor:tip", "done");
    } catch {}
  });
}

function fillPicker(pages) {
  state.pages = pages;
  const picker = $("#page-picker");
  const cur = state.path || picker.value;
  picker.replaceChildren(...pages.map((p) => h("option", { value: p.path, text: p.label })));
  if (cur && ![...picker.options].some((o) => o.value === cur)) picker.append(h("option", { value: cur, text: cur }));
  if (cur) picker.value = cur;
}

async function boot() {
  setupTopBar();
  frame.init($("#site"), ctx);
  const pagesReady = discoverPages(fillPicker).catch(() => []);
  setBusy("Loading…");
  try {
    model.load(await api.content());
  } catch (err) {
    setBusy(null);
    $("#loading").replaceChildren(h("p", { text: err.message }), h("button", { class: "btn btn-primary", text: "Try again", onclick: () => location.reload() }));
    return;
  }
  setBusy(null);
  panels.refresh();
  panels.show("page");
  document.body.classList.remove("sheet-open");
  $("#loading").hidden = true;
  const start = location.hash.length > 1 ? BASE + location.hash.slice(1) : `${BASE}/`;
  $("#site").src = start.startsWith(BASE + "/") ? start : `${BASE}/`;
  await Promise.race([pagesReady, new Promise((r) => setTimeout(r, 1500))]);
  await offerRestore();
  api.me().then((me) => {
    state.me = me;
    $("#me").textContent = me?.email ? `Signed in as ${me.email}` : "";
  }).catch(() => {});
}

boot();
