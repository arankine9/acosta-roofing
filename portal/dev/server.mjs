#!/usr/bin/env node
// Local mock of the portal, for working on the editor without GitHub or
// Cloudflare. Zero dependencies.
//
//   node portal/dev/server.mjs [--site <dir>] [--port 8788] [--delay <ms>]
//
//   /         the editor, straight from portal/app/ (edit and reload)
//   /site/    an edit build of the site. Default portal/dist/site; make one
//             with `CMS_EDIT=1 npx astro build --outDir portal/dist/site`
//             (or `npm run build` in portal/). Env SITE_DIR works too.
//   /api/*    portal/API.md, simulated in memory
//
// On start it copies the repo's src/content into a temp directory and works
// on that copy only; the repo is never written to. "Live" and "draft" are
// kept in memory (and mirrored to <tmp>/live and <tmp>/draft so you can look
// at the JSON). Restarting starts over from the repo's content.
//
// Dev-only extras:
//   POST /api/_dev/live-edit { "id": "pages/about", "path": "hero.title", "value": "..." }
//        changes a file on "live" directly, as a developer push would, so you
//        can try the publish conflict.
//   --delay 800 (or env MOCK_DELAY) slows every API call down.
//   env MOCK_EMAIL sets who /api/me says is signed in.

import http from "node:http";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const portal = resolve(here, "..");
const repo = resolve(portal, "..");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg("port", process.env.PORT || 8788));
const SITE = resolve(arg("site", process.env.SITE_DIR || join(portal, "dist", "site")));
const APP = join(portal, "app");
const DELAY = Number(arg("delay", process.env.MOCK_DELAY || 0));
const EMAIL = process.env.MOCK_EMAIL || "christian@acostaroofingpnw.com";
const PREVIEW = "https://content-draft.acosta-roofing.example/";

if (!existsSync(SITE)) {
  console.warn(`\n  No site build at ${SITE}.\n  Build one: CMS_EDIT=1 npx astro build --outDir ${relative(process.cwd(), join(portal, "dist", "site")) || "portal/dist/site"}\n`);
}

// ---------------------------------------------------------------------------
// The scratch copy and the simulated repository.

const tmp = mkdtempSync(join(tmpdir(), "acosta-portal-"));
cpSync(join(repo, "src", "content"), join(tmp, "seed"), { recursive: true });

function readContent(dir) {
  const files = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".json")) files[relative(dir, p).split(sep).join("/").replace(/\.json$/, "")] = JSON.parse(readFileSync(p, "utf8"));
    }
  };
  walk(dir);
  return files;
}

const sha = () => randomBytes(20).toString("hex");
const clone = (v) => structuredClone(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const seedFiles = readContent(join(tmp, "seed"));
const live = { head: sha(), files: seedFiles, uploads: new Map() };
const commits = [
  { sha: live.head, message: "Move copy into src/content\n\n(The mock's starting point.)", author: "Alex", email: "dev@example.com", date: now(), files: clone(seedFiles), uploads: new Map() },
];
let draft = null; // { head, base, baseFiles, baseUploads, files, uploads, updatedAt, updatedBy }

function mirror() {
  const write = (root, files, uploads) => {
    rmSync(root, { recursive: true, force: true });
    for (const [id, data] of Object.entries(files)) {
      const p = join(root, "src", "content", id + ".json");
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
    }
    for (const [path, buf] of uploads) {
      const p = join(root, path);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, buf);
    }
  };
  write(join(tmp, "live"), live.files, live.uploads);
  if (draft) write(join(tmp, "draft"), draft.files, draft.uploads);
  else rmSync(join(tmp, "draft"), { recursive: true, force: true });
}
mirror();

const changedIds = () => (draft ? Object.keys(draft.files).filter((id) => !same(draft.files[id], draft.baseFiles[id])).sort() : []);
const changedUploads = () => (draft ? [...draft.uploads.keys()].filter((p) => !draft.baseUploads.has(p)).sort() : []);
const conflictIds = () => changedIds().filter((id) => !same(live.files[id], draft.baseFiles[id]));

function contentResponse() {
  const files = clone(live.files);
  for (const id of changedIds()) files[id] = clone(draft.files[id]);
  return {
    files,
    draft: draft
      ? {
          exists: true,
          head: draft.head,
          changed: changedIds(),
          uploads: changedUploads(),
          conflicts: conflictIds(),
          updatedAt: draft.updatedAt,
          updatedBy: draft.updatedBy,
          previewUrl: PREVIEW,
        }
      : { exists: false },
    live: { head: live.head },
  };
}

class HttpError extends Error {
  constructor(status, message, code, extra = {}) {
    super(message);
    Object.assign(this, { status, code, extra });
  }
}
const fail = (status, message, code, extra) => {
  throw new HttpError(status, message, code, extra);
};

function checkHead(draftHead) {
  const current = draft ? draft.head : null;
  if ((draftHead ?? null) !== current) fail(409, "The draft was changed somewhere else (another tab or device). Reload to see the latest.", "stale");
}

function ensureDraft() {
  if (!draft) {
    draft = { head: sha(), base: live.head, baseFiles: clone(live.files), baseUploads: new Map(live.uploads), files: clone(live.files), uploads: new Map(live.uploads), updatedAt: now(), updatedBy: EMAIL };
  }
  return draft;
}

const UPLOAD_RE = /^public\/images\/(uploads|thumbs)\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/;

const routes = {
  "GET /api/me": () => ({ email: EMAIL }),
  "GET /api/content": () => contentResponse(),

  "POST /api/save": (body) => {
    checkHead(body.draftHead);
    const files = body.files || {};
    const uploads = body.uploads || [];
    if (!Object.keys(files).length && !uploads.length) fail(400, "Nothing to save.", "empty");
    for (const id of Object.keys(files)) if (!(id in live.files)) fail(400, `Unknown content file "${id}".`, "unknown_file");
    if (uploads.length > 20) fail(413, "Too many photos in one save (20 at most).", "too_large");
    let total = 0;
    const decoded = uploads.map((u) => {
      if (!UPLOAD_RE.test(u.path || "")) fail(400, `Not an allowed upload path: ${u.path}`, "bad_path");
      const buf = Buffer.from(u.base64 || "", "base64");
      if (!buf.length) fail(400, `Upload ${u.path} is empty.`, "bad_upload");
      if (buf.length > 8 * 1024 * 1024) fail(413, `${u.path} is over 8 MB.`, "too_large");
      total += buf.length;
      return [u.path, buf];
    });
    if (total > 40 * 1024 * 1024) fail(413, "Uploads are over 40 MB in total.", "too_large");
    const d = draft;
    const changes = Object.entries(files).some(([id, data]) => !same((d || live).files[id], data)) || decoded.some(([p]) => !(d || live).uploads.has(p));
    // As the real API: files that match what's there already commit nothing
    // and come back as the current state, not an error.
    if (!changes) return contentResponse();
    ensureDraft();
    for (const [id, data] of Object.entries(files)) draft.files[id] = clone(data);
    for (const [p, buf] of decoded) draft.uploads.set(p, buf);
    draft.head = sha();
    draft.updatedAt = now();
    draft.updatedBy = EMAIL;
    draft.lastMessage = body.message;
    console.log(`  save   ${body.message || ""} -> ${Object.keys(files).join(", ")}${decoded.length ? ` + ${decoded.length} upload(s)` : ""}`);
    mirror();
    return contentResponse();
  },

  "POST /api/publish": (body) => {
    if (!draft) fail(400, "There's no draft to publish.", "no_draft");
    checkHead(body.draftHead);
    const conflicts = conflictIds();
    if (conflicts.length) fail(409, "Live changed the same files since the draft was started.", "conflict", { files: conflicts });
    const ids = changedIds();
    for (const id of ids) live.files[id] = clone(draft.files[id]);
    for (const p of changedUploads()) live.uploads.set(p, draft.uploads.get(p));
    live.head = sha();
    commits.unshift({
      sha: live.head,
      message: body.message || draft.lastMessage || "Publish content changes",
      author: "Christian Acosta",
      email: EMAIL,
      date: now(),
      files: clone(live.files),
      uploads: new Map(live.uploads),
    });
    console.log(`  publish ${ids.join(", ")}`);
    draft = null;
    mirror();
    return { live: { head: live.head } };
  },

  "POST /api/discard": (body) => {
    if (draft) checkHead(body.draftHead);
    draft = null;
    console.log("  discard");
    mirror();
    return { ok: true };
  },

  "GET /api/history": () => ({
    commits: commits.slice(0, 30).map(({ sha, message, author, email, date }) => ({ sha, message, author, email, date })),
  }),

  "POST /api/restore": (body) => {
    const commit = commits.find((c) => c.sha === body.sha);
    if (!commit) fail(400, "No such version.", "bad_commit");
    checkHead(body.draftHead);
    ensureDraft();
    for (const id of Object.keys(live.files)) {
      draft.files[id] = clone(commit.files[id] && !same(commit.files[id], live.files[id]) ? commit.files[id] : live.files[id]);
    }
    for (const [p, buf] of commit.uploads) draft.uploads.set(p, buf);
    draft.head = sha();
    draft.updatedAt = now();
    draft.updatedBy = EMAIL;
    draft.lastMessage = `Restore content from ${commit.date}`;
    console.log(`  restore ${commit.sha.slice(0, 7)}`);
    mirror();
    return contentResponse();
  },

  "POST /api/_dev/live-edit": (body) => {
    const data = live.files[body.id];
    if (!data) fail(400, "Unknown file", "unknown_file");
    let v = data;
    const parts = String(body.path || "").split(".");
    for (const p of parts.slice(0, -1)) v = v[p];
    v[parts[parts.length - 1]] = body.value;
    live.head = sha();
    commits.unshift({ sha: live.head, message: `Developer edit to ${body.id}`, author: "Alex", email: "dev@example.com", date: now(), files: clone(live.files), uploads: new Map(live.uploads) });
    mirror();
    return { live: { head: live.head } };
  },
};

function apiFile(url) {
  const path = url.searchParams.get("path") || "";
  if (!/^public\/images\/[a-z0-9/_-]+\.(jpg|jpeg|png|webp|svg)$/i.test(path)) fail(400, "Bad path", "bad_path");
  const buf = draft?.uploads.get(path) || live.uploads.get(path) || (existsSync(join(repo, path)) ? readFileSync(join(repo, path)) : null);
  if (!buf) fail(404, "Not found", "not_found");
  return { file: buf, type: MIME[extname(path).toLowerCase()] || "application/octet-stream" };
}

// ---------------------------------------------------------------------------
// HTTP.

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function serveStatic(res, root, rel) {
  let p = normalize(join(root, decodeURIComponent(rel)));
  // Inside root, not just a path that starts with the same letters
  // (dist/site-old next to dist/site).
  if (p !== root && !p.startsWith(root.endsWith(sep) ? root : root + sep)) return false;
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p) || !statSync(p).isFile()) return false;
  res.writeHead(200, { "content-type": MIME[extname(p).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(p));
  return true;
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const sendJson = (res, status, data) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      if (DELAY) await new Promise((r) => setTimeout(r, DELAY));
      if (req.method === "GET" && url.pathname === "/api/file") {
        const { file, type } = apiFile(url);
        res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
        return res.end(file);
      }
      const handler = routes[`${req.method} ${url.pathname}`];
      if (!handler) fail(404, "No such endpoint.", "not_found");
      let body = {};
      if (req.method === "POST") {
        const raw = await readBody(req);
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          fail(400, "Bad JSON.", "bad_request");
        }
      }
      return sendJson(res, 200, await handler(body, url));
    }
    if (url.pathname === "/site") {
      res.writeHead(301, { location: "/site/" });
      return res.end();
    }
    if (url.pathname.startsWith("/site/")) {
      if (serveStatic(res, SITE, url.pathname.slice("/site/".length))) return;
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      return res.end(existsSync(join(SITE, "404.html")) ? readFileSync(join(SITE, "404.html")) : "Not found");
    }
    if (serveStatic(res, APP, url.pathname.slice(1) || "index.html")) return;
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message, code: err.code, ...err.extra });
    console.error(err);
    sendJson(res, 500, { error: "Mock server error: " + err.message, code: "internal" });
  }
});

// Loopback only: the mock has no sign-in, so it isn't for the rest of the
// network to reach.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Acosta portal mock on http://localhost:${PORT}/`);
  console.log(`  site:    ${SITE}`);
  console.log(`  content: ${tmp} (a scratch copy; the repo is never written)\n`);
});
