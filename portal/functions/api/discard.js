// POST /api/discard { draftHead } → { ok: true }. Deletes the draft branch.
import { json, readJson, route, fail } from "../_lib/http.js";
import { github } from "../_lib/github.js";
import { settings, isSha } from "../_lib/repo.js";

export const onRequest = route({
  async POST({ request, env }) {
    const body = await readJson(request);
    const draftHead = body.draftHead ?? null;
    if (draftHead !== null && !isSha(draftHead)) fail(400, "draftHead must be the draft's commit sha.", "bad_request");
    const gh = github(env);
    const { draft } = settings(env);
    const head = await gh.branchHead(draft);
    // Already gone (discarded or published elsewhere): nothing left to do.
    if (head === null) return json({ ok: true });
    if (head !== draftHead) {
      fail(409, "The draft was changed somewhere else (another tab or device). Reload to see the latest.", "stale");
    }
    await gh.deleteBranch(draft);
    return json({ ok: true });
  },
});
