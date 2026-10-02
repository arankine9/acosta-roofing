// POST /api/save { draftHead, files, uploads, message } → the GET /api/content
// shape. Commits whole content files and uploads to the draft branch as one
// commit, creating the branch from live's head if there's no draft yet.
import { json, readJson, route, fail } from "../_lib/http.js";
import { github } from "../_lib/github.js";
import { readState, overlay, contentResponse, checkDraftHead, commitToDraft, pathOf, isUploadPath } from "../_lib/repo.js";

const MAX_FILE = 1024 * 1024; // a content file, serialized
const MAX_UPLOAD = 8 * 1024 * 1024; // one upload, decoded
const MAX_UPLOADS = 20; // per save (each is a GitHub request)
const MAX_UPLOAD_TOTAL = 40 * 1024 * 1024; // per save, decoded

// First bytes of each accepted image type.
const MAGIC = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  webp: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};
MAGIC.jpeg = MAGIC.jpg;

function checkUploads(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) fail(400, "uploads must be an array.", "bad_request");
  if (list.length > MAX_UPLOADS) fail(413, `At most ${MAX_UPLOADS} uploads per save.`, "too_large");
  const seen = new Set();
  let total = 0;
  return list.map((u) => {
    if (!u || typeof u.path !== "string" || typeof u.base64 !== "string") {
      fail(400, "Each upload needs a path and base64.", "bad_request");
    }
    const { path } = u;
    if (!isUploadPath(path)) {
      fail(400, `${path} isn't an allowed upload path (public/images/uploads/<name>.jpg|jpeg|png|webp or public/images/thumbs/<name>.jpg).`, "bad_path");
    }
    if (seen.has(path)) fail(400, `${path} is uploaded twice.`, "bad_request");
    seen.add(path);
    const base64 = u.base64.replace(/^data:[^,]*,/, "");
    if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) fail(400, `${path} isn't valid base64.`, "bad_upload");
    const size = (base64.length / 4) * 3 - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
    if (size > MAX_UPLOAD) fail(413, `${path} is ${(size / 1048576).toFixed(1)} MB; the limit is 8 MB.`, "too_large");
    total += size;
    if (total > MAX_UPLOAD_TOTAL) fail(413, "Too much uploaded in one save; save fewer photos at a time.", "too_large");
    const head = Uint8Array.from(atob(base64.slice(0, 16)), (c) => c.charCodeAt(0));
    if (!MAGIC[path.split(".").pop()](head)) fail(400, `${path} doesn't contain the image type its name says.`, "bad_upload");
    return { path, base64 };
  });
}

export const onRequest = route({
  async POST({ request, env, data }) {
    const body = await readJson(request);
    const files = body.files ?? {};
    if (typeof files !== "object" || Array.isArray(files)) fail(400, "files must be an object of file id → content.", "bad_request");
    const uploads = checkUploads(body.uploads);
    const message = body.message == null ? "Edit content" : String(body.message).trim().slice(0, 2000) || "Edit content";

    const entries = [];
    for (const [id, value] of Object.entries(files)) {
      if (value === null || typeof value !== "object") fail(400, `${id} must be a JSON object or array.`, "bad_request");
      const text = JSON.stringify(value, null, 2) + "\n";
      if (new TextEncoder().encode(text).length > MAX_FILE) fail(413, `${id} is larger than 1 MB.`, "too_large");
      entries.push({ path: pathOf(id), mode: "100644", type: "blob", content: text, id });
    }
    if (!entries.length && !uploads.length) fail(400, "Nothing to save.", "empty");

    const gh = github(env);
    const state = await readState(gh, env);
    checkDraftHead(state, body.draftHead);
    const known = overlay(state);
    const unknown = entries.filter((e) => !known.has(e.path)).map((e) => e.id);
    if (unknown.length) fail(400, `Unknown content file: ${unknown.join(", ")}.`, "unknown_file", { files: unknown });

    const blobs = await Promise.all(
      uploads.map((u) => gh.rest("POST", "/git/blobs", { content: u.base64, encoding: "base64" })),
    );
    const tree = [
      ...entries.map(({ id, ...e }) => e),
      ...uploads.map((u, i) => ({ path: u.path, mode: "100644", type: "blob", sha: blobs[i].sha })),
    ];
    const head = await commitToDraft(gh, state, { entries: tree, message, email: data.email });
    const after = await readState(gh, env, { live: state.live.oid, draft: head || undefined });
    return json(await contentResponse(gh, after));
  },
});
