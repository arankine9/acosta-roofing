# Portal API

The contract between the editor (`portal/app/`) and the server
(`portal/functions/api/`). The local mock (`portal/dev/`) implements the
same contract against the filesystem.

All endpoints are under `/api/`, take and return JSON, and sit behind
Cloudflare Access. The server re-verifies the Access JWT and the email
allowlist on every call; an unauthenticated call gets `401 { "error" }`.
Errors are `{ "error": "human-readable message", "code"?: "conflict" | ... }`
with a 4xx/5xx status.

## Model

- **Live**: the `main` branch (env `BASE_BRANCH`). The public site builds
  from it.
- **Draft**: the `content-draft` branch (env `DRAFT_BRANCH`), created on the
  first save from the then-current live commit. It only ever differs from
  live in `src/content/**/*.json` and `public/images/uploads/*`.
- **Draft changes** = files that differ between the draft head and its
  merge-base with live.
- **What the editor shows** = live content with the draft changes laid over
  it. So a code or content change pushed to live while a draft exists still
  shows up, for every file the draft hasn't touched.
- **Publish** applies the draft changes onto the current live head as one
  commit, then deletes the draft branch. If live changed a file since the
  draft branched that the draft also changed, publish refuses with
  `409 { code: "conflict", files: [...] }`.

File ids are paths under `src/content/` without `.json`: `site`, `shared`,
`services`, `pages/about`, `pages/services-roof-repair`.

## Endpoints

### `GET /api/me`
`{ "email": "christian@acostaroofingpnw.com" }`

### `GET /api/content`
```json
{
  "files": { "site": {…}, "pages/about": {…} },
  "draft": {
    "exists": true,
    "head": "<sha>",
    "changed": ["pages/about", "site"],
    "uploads": ["public/images/uploads/front-porch-1a2b.jpg"],
    "updatedAt": "2026-10-01T18:00:00Z",
    "updatedBy": "christian@acostaroofingpnw.com",
    "previewUrl": "https://content-draft.acosta-roofing-eb8.pages.dev/"
  },
  "live": { "head": "<sha>" }
}
```
`draft.exists` is false (and the other draft fields absent) when there is
no draft.

### `POST /api/save`
```json
{
  "draftHead": "<sha the editor last saw, or null when there was no draft>",
  "files": { "pages/about": {…whole file…} },
  "uploads": [{ "path": "public/images/uploads/front-porch-1a2b.jpg", "base64": "…" }],
  "message": "Edit About, Business info"
}
```
Commits the given whole files (and uploads) onto the draft branch, creating
it if needed. Only existing file ids are accepted. Upload paths must match
`public/images/uploads/[a-z0-9-]+\.(jpg|jpeg|png|webp)` and be ≤ 8 MB each;
thumbnails are uploads too (`public/images/thumbs/<slug>-<hash>.jpg` is also
allowed). If `draftHead` doesn't match the branch's head (saved from another
tab or device), `409 { code: "stale" }`. Returns the same shape as
`GET /api/content`.

### `POST /api/publish`
`{ "draftHead": "<sha>", "message"?: "…" }` → `{ "live": { "head": "<sha>" } }`
Errors: `409 stale`, `409 conflict` (with `files`), `400` when there is no
draft.

### `POST /api/discard`
`{ "draftHead": "<sha>" }` → `{ "ok": true }`. Deletes the draft branch.

### `GET /api/history`
Last 30 live commits that touched `src/content/` or `public/images/uploads/`:
```json
{ "commits": [{ "sha": "…", "message": "…", "author": "…", "email": "…", "date": "…" }] }
```

### `POST /api/restore`
`{ "sha": "<live commit>", "draftHead": "<sha or null>" }`. Makes the draft
equal to the content as of that commit (every content file that differs
from live is written to the draft). Returns the `GET /api/content` shape.
Publishing it then puts that version live.

### `GET /api/file?path=public/images/uploads/<name>`
Streams an uploaded file from the draft branch (falls back to live), with
its content type. The editor uses it to show uploads the portal's built copy
of the site doesn't have yet.
