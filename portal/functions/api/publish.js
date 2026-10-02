// POST /api/publish { draftHead, message? } → { live: { head } }. Applies the
// draft's changes onto live's current head as one commit, fast-forwards live
// to it, and deletes the draft branch.
import { json, readJson, route, fail } from "../_lib/http.js";
import { github } from "../_lib/github.js";
import { readState, checkDraftHead, blobEntry, label, author, isContentPath } from "../_lib/repo.js";

function defaultMessage(changes) {
  const names = changes.filter((c) => isContentPath(c.path)).map((c) => label(c.path));
  const uploads = changes.length - names.length;
  const parts = [...names];
  if (uploads) parts.push(`${uploads} photo${uploads === 1 ? "" : "s"}`);
  const subject = names.length <= 3 ? `Publish ${parts.join(", ")}` : `Publish ${names.length} content files${uploads ? ` and ${uploads} photos` : ""}`;
  return `${subject}\n\n${changes.map((c) => `- ${c.path}${c.sha ? "" : " (deleted)"}`).join("\n")}\n`;
}

export const onRequest = route({
  async POST({ request, env, data }) {
    const body = await readJson(request);
    const gh = github(env);
    const who = author(data.email);

    // Twice at most: if live moves between reading it and updating it, the
    // fast-forward fails and we start over from the new head.
    for (let attempt = 0; attempt < 2; attempt++) {
      const state = await readState(gh, env);
      const { live, draft, cfg } = state;
      if (!draft) fail(400, "There's no draft to publish.", "no_draft");
      checkDraftHead(state, body.draftHead);
      if (draft.conflicts.length) {
        const files = draft.conflicts.map(label).sort();
        fail(409, `The live site changed ${files.join(", ")} since this draft started, and the draft changes it too.`, "conflict", { files });
      }

      let head = live.oid;
      if (draft.changes.length) {
        const message = typeof body.message === "string" && body.message.trim() ? body.message.trim() : defaultMessage(draft.changes);
        const tree = await gh.rest("POST", "/git/trees", { base_tree: live.treeOid, tree: draft.changes.map(blobEntry) });
        const commit = await gh.rest("POST", "/git/commits", { message, tree: tree.sha, parents: [live.oid], author: who, committer: who });
        if (!(await gh.setBranch(cfg.base, commit.sha))) continue;
        head = commit.sha;
      }
      // Delete the draft unless someone saved to it while we published.
      if ((await gh.branchHead(cfg.draft)) === draft.oid) await gh.deleteBranch(cfg.draft);
      return json({ live: { head } });
    }
    fail(409, "The live site changed while publishing. Try again.", "live_changed");
  },
});
