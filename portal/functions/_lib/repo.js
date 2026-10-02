// The live/draft model on top of git (see portal/README.md):
//
//   live   BASE_BRANCH. The public site builds from it.
//   draft  DRAFT_BRANCH. Created on the first save from live's head; differs
//          from live only in content files and uploads.
//
// "Draft changes" are the files that differ between the draft head and its
// merge-base with live. What the editor sees is live's content with those
// changes laid over it.
//
// When live has moved on since the draft branched (a code or content commit
// pushed straight to live), the next save writes a merge commit: parents
// [draft head, live head], tree = live's tree plus the draft changes plus the
// new files. That moves the merge-base up to live's head, so a file the owner
// edits after a developer changed it on live (he was shown the developer's
// version) isn't later mistaken for a conflict. When the draft and live have
// both changed the same file, no merge is made and publish refuses with a
// conflict instead, so neither side is silently lost.

import { HttpError, fail } from "./http.js";

export const CONTENT_DIR = "src/content/";
export const isContentPath = (p) => p.startsWith(CONTENT_DIR) && p.endsWith(".json");
export const idOf = (p) => p.slice(CONTENT_DIR.length, -".json".length);
export const pathOf = (id) => `${CONTENT_DIR}${id}.json`;

// What the portal may write. Uploads are photos; thumbs are the nav
// thumbnails the editor regenerates alongside a service photo.
export const UPLOAD_RE = /^public\/images\/uploads\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/;
export const THUMB_RE = /^public\/images\/thumbs\/[a-z0-9-]+\.jpg$/;
export const isUploadPath = (p) => UPLOAD_RE.test(p) || THUMB_RE.test(p);
// What a publish carries from the draft to live. Anything else that turns up
// on the draft branch (someone pushed code there) is ignored.
const isDraftPath = (p) =>
  isContentPath(p) || p.startsWith("public/images/uploads/") || p.startsWith("public/images/thumbs/");

/* A file id for content, the repo path for anything else (uploads). */
export const label = (p) => (isContentPath(p) ? idOf(p) : p);

const shaRe = /^[0-9a-f]{40}$/;
export const isSha = (s) => typeof s === "string" && shaRe.test(s);

export function settings(env) {
  const base = env.BASE_BRANCH || "main";
  const draft = env.DRAFT_BRANCH || "content-draft";
  if (base === draft) throw new HttpError(500, "BASE_BRANCH and DRAFT_BRANCH must differ.", "config");
  return { base, draft, previewUrl: env.PREVIEW_URL || null };
}

// ---------------------------------------------------------------------------
// Reading commits: one GraphQL query fetches each commit's metadata and every
// file under src/content/ (three directory levels deep) with its text.

const ENTRY = `path type object { ... on Blob { oid text isTruncated isBinary } }`;
const TREE = (depth) =>
  depth === 0 ? `entries { ${ENTRY} }` : `entries { ${ENTRY} object { ... on Tree { ${TREE(depth - 1)} } } }`;
const COMMIT = `fragment C on Commit {
  oid
  author { name email date }
  tree { oid }
  file(path: "src/content") { object { ... on Tree { ${TREE(2)} } } }
}`;

/* The commits at each git expression (branch ref or sha): null where it
   doesn't resolve. Each is { oid, treeOid, author, files: Map(path → blob) }. */
export async function readCommits(gh, expressions) {
  const vars = {};
  const fields = expressions.map((expr, i) => {
    vars[`e${i}`] = expr;
    return `c${i}: object(expression: $e${i}) { ...C }`;
  });
  const params = expressions.map((_, i) => `$e${i}: String!`).join(", ");
  const data = await gh.graphql(
    `query($owner: String!, $name: String!, ${params}) { repository(owner: $owner, name: $name) { ${fields.join(" ")} } } ${COMMIT}`,
    vars,
  );
  return expressions.map((_, i) => {
    const c = data.repository[`c${i}`];
    if (!c || !c.oid) return null;
    const files = new Map();
    const walk = (tree) => {
      for (const e of (tree && tree.entries) || []) {
        if (e.type === "blob" && isContentPath(e.path) && e.object) {
          files.set(e.path, { oid: e.object.oid, text: e.object.isTruncated || e.object.isBinary ? null : e.object.text });
        } else if (e.type === "tree") walk(e.object);
      }
    };
    walk(c.file && c.file.object);
    return { oid: c.oid, treeOid: c.tree.oid, author: c.author, files };
  });
}

/* A blob's text, fetching it when GraphQL left it out (very large file). */
async function blobText(gh, blob) {
  if (blob.text != null) return blob.text;
  const data = await gh.rest("GET", `/git/blobs/${blob.oid}`);
  const bin = atob(data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return (blob.text = new TextDecoder().decode(bytes));
}

/* Files that differ between two commits: [{ path, sha }] with sha null for a
   deletion, plus the merge-base. A rename is a deletion and an addition. */
export async function compare(gh, base, head) {
  const data = await gh.rest("GET", `/compare/${base}...${head}?per_page=1`);
  const files = [];
  for (const f of data.files || []) {
    if (f.status === "renamed" && f.previous_filename) files.push({ path: f.previous_filename, sha: null });
    files.push({ path: f.filename, sha: f.status === "removed" ? null : f.sha });
  }
  if (files.length >= 300) {
    // GitHub's compare lists at most 300 files; a draft never gets close.
    throw new HttpError(500, "Too many changed files between live and the draft to compare.", "too_many_changes");
  }
  return { status: data.status, mergeBase: data.merge_base_commit.sha, files };
}

// ---------------------------------------------------------------------------
// The state of live and the draft.

/* Live and the draft, read from GitHub. Pass shas to read exact commits (just
   after writing them) instead of whatever the branches point at. */
export async function readState(gh, env, { live: liveExpr, draft: draftExpr } = {}) {
  const cfg = settings(env);
  const [live, draft] = await readCommits(gh, [liveExpr || `refs/heads/${cfg.base}`, draftExpr || `refs/heads/${cfg.draft}`]);
  if (!live) throw new HttpError(500, `The live branch "${cfg.base}" doesn't exist.`, "config");
  const state = { cfg, live, draft: null };
  if (!draft) return state;

  const cmp = await compare(gh, live.oid, draft.oid);
  const changes = cmp.files.filter((f) => isDraftPath(f.path));
  // Files live changed since the draft branched that the draft changed too.
  let conflicts = [];
  if (cmp.mergeBase !== live.oid && changes.length) {
    const liveSince = new Set((await compare(gh, cmp.mergeBase, live.oid)).files.map((f) => f.path));
    conflicts = changes.filter((f) => liveSince.has(f.path)).map((f) => f.path);
  }
  state.draft = { ...draft, mergeBase: cmp.mergeBase, changes, conflicts };
  return state;
}

/* The content the editor shows: live with the draft's changes over it, as
   Map(path → blob). */
export function overlay(state) {
  const files = new Map(state.live.files);
  for (const { path, sha } of state.draft ? state.draft.changes : []) {
    if (!isContentPath(path)) continue;
    if (sha === null) files.delete(path);
    else files.set(path, state.draft.files.get(path) || { oid: sha, text: null });
  }
  return files;
}

const isoSeconds = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z");

/* The GET /api/content response. */
export async function contentResponse(gh, state) {
  const merged = overlay(state);
  const files = {};
  for (const path of [...merged.keys()].sort()) {
    const text = await blobText(gh, merged.get(path));
    try {
      files[idOf(path)] = JSON.parse(text);
    } catch {
      throw new HttpError(500, `${path} isn't valid JSON, so the editor can't load it. A developer needs to fix it.`, "bad_content");
    }
  }
  const d = state.draft;
  const draft = d
    ? {
        exists: true,
        head: d.oid,
        changed: d.changes.filter((c) => isContentPath(c.path)).map((c) => idOf(c.path)).sort(),
        uploads: d.changes.filter((c) => !isContentPath(c.path) && c.sha).map((c) => c.path).sort(),
        conflicts: d.conflicts.map(label).sort(),
        updatedAt: isoSeconds(d.author.date),
        updatedBy: d.author.email,
        previewUrl: state.cfg.previewUrl,
      }
    : { exists: false };
  return { files, draft, live: { head: state.live.oid } };
}

/* 409 unless `draftHead` (from the request) is the draft's current head, or
   null when there's no draft. */
export function checkDraftHead(state, draftHead) {
  if (draftHead !== null && draftHead !== undefined && !isSha(draftHead)) {
    fail(400, "draftHead must be a commit sha or null.", "bad_request");
  }
  const current = state.draft ? state.draft.oid : null;
  if ((draftHead || null) !== current) {
    fail(
      409,
      current
        ? "The draft was changed somewhere else (another tab or device). Reload to see the latest."
        : "The draft was published or discarded somewhere else. Reload to see the latest.",
      "stale",
    );
  }
}

// ---------------------------------------------------------------------------
// Writing the draft.

export const author = (email) => ({ name: `${email.split("@")[0]} (portal)`, email });

/* Commit `entries` (tree API entries; sha null deletes) to the draft branch
   as one commit and point the branch at it. `replace` makes the draft equal
   live plus `entries` (restore); otherwise the draft's existing changes are
   kept. Returns the new head; the old one (null when there's no draft) when
   the commit would change nothing. */
export async function commitToDraft(gh, state, { entries, message, email, replace = false }) {
  const { live, draft, cfg } = state;
  const writing = new Set(entries.map((e) => e.path));
  // Parents: the draft's head, plus live's head when live has moved on since
  // the draft branched (a merge; see the top of this file).
  const behind = draft && draft.mergeBase !== live.oid;
  let baseTree, all;

  if (!draft || replace) {
    baseTree = live.treeOid;
    all = entries;
  } else if (!behind || draft.conflicts.length) {
    // On top of live's head already; or live and the draft both changed a
    // file, in which case no merge is made and publish reports the conflict.
    baseTree = draft.treeOid;
    all = entries;
  } else {
    baseTree = live.treeOid;
    all = [...draft.changes.filter((c) => !writing.has(c.path)).map(blobEntry), ...entries];
  }
  const merge = behind && baseTree === live.treeOid;
  const parents = !draft ? [live.oid] : merge ? [draft.oid, live.oid] : [draft.oid];

  const tree = await gh.rest("POST", "/git/trees", { base_tree: baseTree, tree: all });
  if (!merge && tree.sha === (draft ? draft.treeOid : live.treeOid)) return draft ? draft.oid : null;

  const who = author(email);
  const commit = await gh.rest("POST", "/git/commits", { message, tree: tree.sha, parents, author: who, committer: who });
  const ok = await gh.setBranch(cfg.draft, commit.sha, { create: !draft });
  if (!ok) fail(409, "The draft was changed somewhere else (another tab or device). Reload to see the latest.", "stale");
  return commit.sha;
}

export const blobEntry = (c) => ({ path: c.path, mode: "100644", type: "blob", sha: c.sha });
