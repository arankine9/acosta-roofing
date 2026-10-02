# Content portal

A private editor for the site's words and photos, at
**portal.acostaroofingpnw.com**. The owner signs in with a one-time code
emailed to him, edits the pages in place, and publishes. Every change is a
git commit on this repo, so nothing is lost and anything can be undone.

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

## Setup (one time)

You need: the Cloudflare account that hosts acostaroofingpnw.com and the
`acosta-roofing` Pages project, and admin on the GitHub repo
`arankine9/acosta-roofing`. Do the steps in order; the portal is locked to
everyone until Access is set up, and the API refuses all calls until its
secrets are set.

### 1. GitHub token

1. github.com → your avatar → **Settings → Developer settings → Personal
   access tokens → Fine-grained tokens → Generate new token**.
2. Name `acosta-portal`. Pick an expiration and put the date in a calendar:
   when it expires, saving stops until you replace it.
3. **Resource owner** `arankine9`. **Repository access → Only select
   repositories →** `arankine9/acosta-roofing`.
4. **Permissions → Repository permissions → Contents: Read and write.**
   (Metadata: Read-only is added automatically.) Nothing else.
5. Generate, and copy the token for step 2.6.

If `main` gets branch protection or a ruleset later, it must still allow
this token to push (the portal updates `main` directly when publishing),
and must not require pull requests.

### 2. Pages project

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Import an
   existing Git repository** (Connect to Git). Pick `arankine9/acosta-roofing`
   → **Begin setup**.
2. **Project name** `acosta-portal`. **Production branch** `main`.
3. **Framework preset** None. **Build command** `npm run build`. **Build
   output directory** `dist`. Under **Root directory (advanced)**: `portal`.
4. **Save and Deploy.** The first build should succeed; the API will answer
   500 (not configured) until the next steps are done.
5. The plain settings (`GITHUB_REPO`, branches, `ALLOWED_EMAILS`,
   `PREVIEW_URL`) come from `portal/wrangler.toml`, which is the source of
   truth for them: change them there, not in the dashboard.
6. Project → **Settings → Variables and Secrets → Add**, for
   **Production**, each with **Type: Secret**:
   - `GITHUB_TOKEN`: the token from step 1.
   - `ACCESS_TEAM_DOMAIN`: from step 4.6, e.g. `yourteam.cloudflareaccess.com`.
   - `ACCESS_AUD`: from step 4.6.
   Secrets apply from the next deployment: after adding them, **Deployments
   → latest → ⋯ → Retry deployment**.
7. **Settings → Build → Branch control**: keep automatic production
   deployments on, and set **Preview branch** to **None**. Pushes to
   `content-draft` should build only the public site's preview, never the
   portal.

The Node version comes from `portal/.node-version` (22).

### 3. Custom domain

Project → **Custom domains → Set up a custom domain →**
`portal.acostaroofingpnw.com` → **Continue → Activate domain**. The zone is
in this account, so Cloudflare adds the DNS record itself. Wait for it to
show Active.

### 4. Cloudflare Access (Zero Trust)

1. Dashboard → **Zero Trust**. The first time, it asks for a **team name**
   (your login page becomes `<team>.cloudflareaccess.com`) and a plan: the
   **Free** plan covers this (up to 50 users).
2. **Settings → Authentication → Login methods → Add new → One-time PIN**
   (in the newer layout: **Integrations → Identity providers → Add →
   One-time PIN**). No configuration needed.
3. **Access → Applications → Add an application → Self-hosted** (newer
   layout: **Access controls → Applications**). Name `Acosta portal`;
   session duration as you like (24 hours means a new code each day).
4. Add these destinations / public hostnames, all with no path:
   - `portal.acostaroofingpnw.com`
   - `acosta-portal.pages.dev`
   - `*.acosta-portal.pages.dev` (the per-deployment URLs)

   Use the project's actual `*.pages.dev` name from its overview page: if
   `acosta-portal` was taken it has a suffix, like the public site's
   `acosta-roofing-eb8`.
5. Add a policy: name `Owners`, **Action: Allow**, **Include → Emails**:
   `christian@acostaroofingpnw.com` and `arankine909@gmail.com`. Under
   login methods, allow One-time PIN (turn on **Instant Auth** to skip the
   chooser). Save.
6. Copy two values into the Pages secrets (step 2.6), then redeploy:
   - `ACCESS_AUD`: the application's **Application Audience (AUD) Tag**
     (open the application → **Overview** / **Basic information**).
   - `ACCESS_TEAM_DOMAIN`: the team domain, `<team>.cloudflareaccess.com`
     (**Settings → Custom Pages** or **Settings → General → Team domain**).

### 5. Check

1. Open https://portal.acostaroofingpnw.com in a private window: you get
   the Access login, a code arrives by email, and the editor loads.
2. https://portal.acostaroofingpnw.com/api/me shows your email.
3. Try another address at the login: it gets no code.
4. `curl -i https://acosta-portal.pages.dev/api/me` (the pages.dev URL,
   no login) is redirected to Access, never answered by the API.

The public project `acosta-roofing` must build previews for the
`content-draft` branch (Settings → Build → Branch control: all non-production
branches, or a custom list including `content-draft`), so the editor's
preview link works.

### Limits worth knowing

- A save takes at most 20 photos, 8 MB each, 40 MB in all; a content file at
  most 1 MB. On the Workers Free plan a request gets very little CPU time,
  so very large uploads could fail to save. The editor already scales photos
  to at most 2000 px as JPEG (a few hundred KB) before uploading; Workers
  Paid removes the concern entirely.
- The token can only touch this repo's contents. Rotate it before it expires
  (step 1, then update the secret and redeploy).
