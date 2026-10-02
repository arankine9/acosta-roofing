// Photos: the panel that opens when a photo on the page is clicked. Replace
// it (file picker, or the camera on a phone), crop to the shape the page
// shows it at, and describe it. The new photo is shrunk to 2000px on its
// long side, saved as a JPEG, and uploaded with the next save.

import { model } from "./model.js";
import { h, dialog, ICONS, esc } from "./ui.js";
import { snippet } from "./render.js";

const MAX = 2000;
const QUALITY = 0.82;

export function slugify(s, max = 40) {
  let slug = String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > max) slug = slug.slice(0, max).replace(/-[^-]*$/, "") || slug.slice(0, max);
  return slug.replace(/-+$/, "");
}

/* A name from the file if it says something, else from the description. */
export function nameFor(fileName, alt) {
  const base = String(fileName || "").replace(/\.[a-z0-9]+$/i, "");
  const camera = /^(img|image|dsc|dscn|pxl|photo|screenshot|screen shot|whatsapp image|mvimg|p)[\s_-]*[\d_ -]*$/i;
  const fromFile = !camera.test(base) && /[a-z].*[a-z].*[a-z]/i.test(base) ? slugify(base) : "";
  return fromFile || slugify(alt) || "photo";
}

const hex6 = () => [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, "0")).join("");

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file couldn't be opened as a photo. Try a JPEG or PNG."));
    img.src = src;
  });

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));

function drawCover(source, sx, sy, sw, sh, w, hgt) {
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(hgt);
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/* Crop step: a frame of the page's shape over the photo, which is dragged
   and zoomed underneath it. Resolves to { sx, sy, sw, sh } in the photo's
   own pixels, or null. */
function cropDialog(img, aspect) {
  const stage = h("div", { class: "crop-stage" });
  const photo = h("img", { class: "crop-img", src: img.src, alt: "", draggable: "false" });
  const frameEl = h("div", { class: "crop-frame" });
  stage.append(photo, frameEl);
  const zoom = h("input", { type: "range", min: "1", max: "4", step: "0.01", value: "1", "aria-label": "Zoom" });
  const body = h(
    "div",
    {},
    h("p", { class: "muted", text: "Drag the photo to choose what shows. Use the slider (or pinch) to zoom in. The frame matches the shape of the photo on the page." }),
    stage,
    h("label", { class: "zoom" }, h("span", { text: "Zoom" }), zoom),
  );

  let W = 0, H = 0, s = 1, min = 1, x = 0, y = 0;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  const layout = () => {
    const avail = Math.min(stage.parentElement.clientWidth || 520, 640);
    W = avail;
    H = W / aspect;
    const maxH = Math.min(window.innerHeight * 0.5, 460);
    if (H > maxH) {
      H = maxH;
      W = H * aspect;
    }
    stage.style.width = W + "px";
    stage.style.height = H + "px";
    min = Math.max(W / nw, H / nh);
    s = min * Number(zoom.value);
    x = (W - nw * s) / 2;
    y = (H - nh * s) / 2;
    draw();
  };
  const clamp = () => {
    x = Math.min(0, Math.max(W - nw * s, x));
    y = Math.min(0, Math.max(H - nh * s, y));
  };
  const draw = () => {
    clamp();
    photo.style.width = nw * s + "px";
    photo.style.height = nh * s + "px";
    photo.style.transform = `translate(${x}px, ${y}px)`;
  };
  const zoomTo = (z, cx = W / 2, cy = H / 2) => {
    z = Math.max(1, Math.min(4, z));
    const ns = min * z;
    x = cx - ((cx - x) * ns) / s;
    y = cy - ((cy - y) * ns) / s;
    s = ns;
    zoom.value = String(z);
    draw();
  };
  zoom.addEventListener("input", () => zoomTo(Number(zoom.value)));

  const pointers = new Map();
  let pinch = null;
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: Number(zoom.value) };
    }
  });
  stage.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 2 && pinch) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pointers.values()];
      const r = stage.getBoundingClientRect();
      zoomTo((pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    x += e.clientX - p.x;
    y += e.clientY - p.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    draw();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomTo(Number(zoom.value) * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );

  return dialog({
    title: "Crop the new photo",
    body,
    wide: true,
    actions: [
      { label: "Back", value: null },
      { label: "Use this photo", value: () => ({ sx: -x / s, sy: -y / s, sw: W / s, sh: H / s }), kind: "primary" },
    ],
    onOpen: () => requestAnimationFrame(layout),
  });
}

/* Crop, shrink and encode. Returns { blob, thumbBlob? }. */
async function process(img, crop, wantThumb) {
  const long = Math.max(crop.sw, crop.sh);
  const f = Math.min(1, MAX / long);
  const canvas = drawCover(img, crop.sx, crop.sy, crop.sw, crop.sh, crop.sw * f, crop.sh * f);
  const blob = await toBlob(canvas);
  let thumbBlob = null;
  if (wantThumb) {
    const tw = 160, th = 120;
    const sc = Math.max(tw / canvas.width, th / canvas.height);
    const sw = tw / sc, sh = th / sc;
    thumbBlob = await toBlob(drawCover(canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh, tw, th));
  }
  return { blob, thumbBlob };
}

export function openImagePanel(imgEl, frame) {
  const key = imgEl.dataset.cmsImage;
  const value = () => model.get(key) || {};
  const rect = imgEl.getBoundingClientRect();
  const aspect = rect.width > 10 && rect.height > 10 ? rect.width / rect.height : imgEl.naturalWidth / imgEl.naturalHeight || 4 / 3;

  const preview = h("img", { class: "photo-preview", src: imgEl.currentSrc || imgEl.src, alt: "" });
  preview.style.aspectRatio = String(aspect);
  const file = h("input", { type: "file", accept: "image/*", class: "visually-hidden", "aria-label": "Choose a photo" });
  const status = h("p", { class: "muted small", role: "status" });
  const alt = h("textarea", { id: "photo-alt", rows: "3" });
  alt.value = value().alt || "";
  const altHint = h("p", { class: "help", text: "Say what's in the photo in a sentence, for example “New charcoal shingle roof on a two-story house in Beaverton.” Search engines read this too." });
  const credit = value().credit
    ? h("p", { class: "help credit-note", html: `Credit shown under this photo: <em>${esc(snippet(value().credit, frame.tokens(), 200))}</em>. It belongs to this photo, so it's removed when you replace it.` })
    : null;

  alt.addEventListener("input", () => {
    model.set(key, { ...value(), alt: alt.value }, "image");
  });

  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    let url;
    try {
      url = URL.createObjectURL(f);
      const img = await loadImage(url);
      const crop = await cropDialog(img, aspect);
      if (!crop) return;
      status.textContent = "Preparing the photo…";
      const current = value();
      const hasThumb = "thumb" in current;
      const { blob, thumbBlob } = await process(img, crop, hasThumb);
      const name = `${nameFor(f.name, current.alt)}-${hex6()}.jpg`;
      const path = `public/images/uploads/${name}`;
      model.addUpload(path, blob);
      const next = { ...current, src: `/images/uploads/${name}` };
      delete next.credit;
      if (hasThumb && thumbBlob) {
        const tpath = `public/images/thumbs/${name}`;
        model.addUpload(tpath, thumbBlob);
        next.thumb = `/images/thumbs/${name}`;
      }
      model.set(key, next, "image");
      preview.src = model.display.get(next.src);
      credit?.remove();
      status.textContent = `New photo ready (${Math.round(blob.size / 1024)} KB). It goes up with your next save.`;
      alt.focus();
      alt.select();
      altHint.textContent = "Now describe the new photo: what's in it, in a sentence. Search engines read this too.";
      altHint.classList.add("attention");
    } catch (err) {
      status.textContent = err.message || "That photo couldn't be used.";
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  });

  const body = h(
    "div",
    { class: "photo-panel" },
    preview,
    h(
      "div",
      { class: "photo-actions" },
      h("button", { type: "button", class: "btn btn-primary", onclick: () => file.click(), html: `${ICONS.camera}<span>Replace photo</span>` }),
      file,
    ),
    status,
    h("label", { class: "field-label", for: "photo-alt", text: "Describe the photo for people who can't see it" }),
    alt,
    altHint,
    credit,
  );

  return dialog({
    title: "Photo",
    body,
    actions: [{ label: "Done", value: true, kind: "primary" }],
    cancel: true,
  });
}
