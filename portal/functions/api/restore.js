// POST /api/restore { sha, draftHead } → the GET /api/content shape. Makes the
// draft equal to the content as of an earlier live commit: every content file
// that differs from live is written to the draft. Publishing then puts it live.
import { json, readJson, route, fail } from "../_lib/http.js";
import { github, GitHubError } from "../_lib/github.js";
import { readState, readCommits, compare, contentResponse, checkDraftHead, commitToDraft } from "../_lib/repo.js";

export const onRequest = route({
  async POST({ request, env, data }) {
    const body = await readJson(request);
    if (typeof body.sha !== "string" || !/^[0-9a-f]{7,40}$/.test(body.sha)) fail(400, "sha must be a commit sha.", "bad_request");
    const gh = github(env);
    const state = await readState(gh, env);
    checkDraftHead(state, body.draftHead);

    const [old] = await readCommits(gh, [body.sha]);
    if (!old) fail(400, `No commit ${body.sha}.`, "bad_commit");
    let cmp;
    try {
      cmp = await compare(gh, old.oid, state.live.oid);
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) fail(400, `No commit ${body.sha}.`, "bad_commit");
      throw err;
    }
    if (cmp.status !== "ahead" && cmp.status !== "identical") {
      fail(400, `${body.sha.slice(0, 7)} isn't a commit on the live site.`, "bad_commit");
    }

    // Files that existed then and still exist now. One added since keeps its
    // live version (the pages need it); one removed since stays removed.
    const entries = [];
    for (const [path, blob] of state.live.files) {
      const then = old.files.get(path);
      if (then && then.oid !== blob.oid) entries.push({ path, mode: "100644", type: "blob", sha: then.oid });
    }
    const head = await commitToDraft(gh, state, {
      entries,
      message: `Restore content as of ${old.oid.slice(0, 7)}`,
      email: data.email,
      replace: true,
    });
    const after = await readState(gh, env, { live: state.live.oid, draft: head || undefined });
    return json(await contentResponse(gh, after));
  },
});
