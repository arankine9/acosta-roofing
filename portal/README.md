# Content portal

A private editor for the site's words and photos. The owner goes to
**portal.acostaroofingpnw.com** (which redirects to
**acosta.arankine.com**), signs in with a one-time code emailed to him,
edits the pages in place, and publishes. Every change is a git commit on
this repo, so nothing is lost and anything can be undone.

It is its own Cloudflare Pages project (`acosta-portal`), built from this
folder. The public site (`acosta-roofing`) is unaffected by it except
through the commits it makes.

```
portal/
  app/         the editor (static HTML/JS)
  dev/         a local mock of the API for working on the editor
  functions/   the API: Cloudflare Pages Functions under /api/
  build.mjs    builds dist/: the site in edit mode + the editor
  API.md       the contract between app/ and functions/
```

## How it works

- **Live** is `main`. The public site builds from it.
- **Draft** is the `content-draft` branch. The first save creates it from
  live's head; every save is one commit on it (content files plus any
  photos). Cloudflare builds it as a preview of the public site, linked from
  the editor (`PREVIEW_URL`).
- **What the editor shows** is live's content with the draft's changes over
  it, so a developer's change on `main` shows up in the editor for every file
  the owner hasn't touched.
- **Publish** applies the draft's changes to live's current head as one
  commit, fast-forwards `main` to it (never a force push), and deletes the
  draft. Cloudflare then deploys the public site from `main` as usual.
- **Conflicts.** If a developer changed a file on `main` that the owner has
  also changed in the draft, publish refuses (`409 conflict`) rather than
  overwrite either side. The editor lists those files (`draft.conflicts` in
  `GET /api/content`). Discarding the draft resolves it.
- **History and restore.** History lists the last 30 commits on `main` that
  touched content or uploads. Restore makes the draft equal to the content as
  of one of them; publishing it puts that version back live.

The editor shows the site from `dist/site/`, a build of the site with
`CMS_EDIT=1`: same pages, under `/site/`, with every editable field marked.
That copy is rebuilt only when the portal deploys (a push to `main`), so
photos uploaded since are served from GitHub through `/api/file`.

### Security

Cloudflare Access guards the whole hostname: only the two allowed emails can
sign in, by one-time PIN. The API doesn't rely on that alone: every `/api/`
call re-verifies the Access JWT (signature against the team's keys,
audience, issuer, expiry) and checks the email against `ALLOWED_EMAILS`. Writes
from another origin are refused. The GitHub token lives only in Cloudflare
as an encrypted secret and can write to this one repo's contents, nothing
else.

### Writes, in git terms

A save builds one tree (`base_tree` + the changed files and photos), one
commit (author `<name> (portal) <email>`), and moves the draft ref with a
fast-forward. A save from a stale tab (the draft moved since it loaded) gets
`409 stale`. If `main` has moved since the draft branched, the save is a
merge commit with `main`'s head as second parent, so the draft keeps
tracking live; this way a file the owner edits after a developer changed it
isn't mistaken for a conflict at publish.

## Local development

```sh
cd portal
npm install
cp .dev.vars.example .dev.vars    # then set GITHUB_TOKEN (e.g. `gh auth token`)
npm run build                     # dist/: the site in edit mode + the editor
npm run dev                       # http://localhost:8788
```

`DEV_AUTH_EMAIL` stands in for Cloudflare Access, and only on
localhost/127.0.0.1. The example `.dev.vars` points `BASE_BRANCH` and
`DRAFT_BRANCH` at throwaway `cms-test/*` branches: create `cms-test/live`
from `main` first, never test against `main`, and delete the test branches
afterwards. To work on the editor without GitHub at all, use the mock in
`portal/dev/`.

`npm run build` reuses the site's installed `node_modules` locally; on
Cloudflare (or with `--install`) it runs `npm ci` at the repo root first.

## Where it runs

| What | Where |
| --- | --- |
| Public site, project `acosta-roofing` | Client's Cloudflare account (C.acosta.us@gmail.com's), Git-connected to this repo. Builds on every push to `main`; previews for other branches at `<branch>.acosta-roofing-eb8.pages.dev`, which is the editor's preview link for `content-draft`. |
| Portal, project `acosta-portal` | Alex's Cloudflare account (Arankine909@gmail.com's), **direct upload** (a repo can be Git-connected to only one Cloudflare account). Served at `acosta.arankine.com` and `acosta-portal.pages.dev`. |
| Login | Cloudflare Access in Alex's account (team `green-cloud-0c12.cloudflareaccess.com`): application "Acosta portal" covering `acosta.arankine.com`, `acosta-portal.pages.dev` and `*.acosta-portal.pages.dev`; One-time PIN only; policy "Owners" allows christian@acostaroofingpnw.com and arankine909@gmail.com. Session lasts a week. |
| `portal.acostaroofingpnw.com` | Redirect rule "Portal" on the client's zone: 302 to `https://acosta.arankine.com`. The zone lives in the client's account, whose Zero Trust only its Super Administrator can enable, so the portal can't be served there behind Access. On `arankine.com`, the "Redirect to LinkedIn" rule exempts `acosta.arankine.com`. |

Project settings (production): `GITHUB_TOKEN` (secret), `ACCESS_TEAM_DOMAIN`,
`ACCESS_AUD`, plus the plain values in `wrangler.toml`.

## Deploying the portal

The portal is not rebuilt by pushes. Content edits don't need it: the
editor loads every content file from GitHub on start and lays it over its
copy of the site. **Redeploy after changing the site's code** (templates,
styles, a new page) or the editor's:

```bash
cd portal && npm run deploy
```

(`wrangler login` as arankine909@gmail.com first if needed.)

## Changing access

- **Add or remove someone:** edit the "Owners" policy (Zero Trust → Access →
  Applications → Acosta portal) *and* `ALLOWED_EMAILS` in `wrangler.toml`,
  then redeploy. The API checks both.
- **GitHub token:** a fine-grained token scoped to `arankine9/acosta-roofing`
  with Contents: Read and write. Replace it in the project's settings
  (Workers & Pages → acosta-portal → Settings → Variables and Secrets →
  `GITHUB_TOKEN`), then redeploy. If `main` gets branch protection, it must
  still let this token push without a pull request.

## Check

1. In a private window, https://portal.acostaroofingpnw.com lands on the
   Access login; a code arrives by email; the editor loads.
2. https://acosta.arankine.com/api/me shows your email.
3. Another address at the login gets no code.
4. `curl -i https://acosta-portal.pages.dev/api/me` is redirected to Access.

### Limits worth knowing

- A save takes at most 20 photos, 8 MB each, 40 MB in all; a content file at
  most 1 MB. On the Workers Free plan a request gets very little CPU time,
  so very large uploads could fail to save. The editor already scales photos
  to at most 2000 px as JPEG (a few hundred KB) before uploading; Workers
  Paid removes the concern entirely.
- Rotate the GitHub token before it expires (see Changing access).
