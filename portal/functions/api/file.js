// GET /api/file?path=public/images/uploads/<name> → the file's bytes from
// the draft branch, falling back to live.
import { json, route, fail } from "../_lib/http.js";
import { github } from "../_lib/github.js";
import { settings, isUploadPath } from "../_lib/repo.js";

const TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const onRequest = route({
  async GET({ request, env }) {
    const path = new URL(request.url).searchParams.get("path") || "";
    if (!isUploadPath(path)) fail(400, "path must be an upload: public/images/uploads/<name>.(jpg|jpeg|png|webp).", "bad_path");
    const gh = github(env);
    const { base, draft } = settings(env);
    const res = (await gh.raw(path, draft)) || (await gh.raw(path, base));
    if (!res) return json({ error: `${path} isn't on the draft or live.`, code: "not_found" }, 404);
    return new Response(res.body, {
      headers: {
        "content-type": TYPES[path.split(".").pop()],
        // Upload names carry a content hash, so a short private cache is safe.
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex",
      },
    });
  },
});
