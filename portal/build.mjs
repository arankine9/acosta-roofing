// Builds the portal into portal/dist/ (what Cloudflare Pages serves):
//
//   dist/site/   the site itself, built with CMS_EDIT=1 (base /site, every
//                editable field marked with data-cms attributes)
//   dist/*       the editor, copied from portal/app/
//   dist/_headers
//
// The API lives in portal/functions/, which Pages deploys alongside.
//
// Run from portal/: `npm run build`. On Cloudflare (CF_PAGES or CI set) or
// when the site has no node_modules yet, it first runs `npm ci` at the repo
// root; locally it reuses the installed modules (pass --install to force a
// clean install).

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const portal = dirname(fileURLToPath(import.meta.url));
const root = resolve(portal, "..");
const app = join(portal, "app");
const dist = join(portal, "dist");

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", ...opts });
  if (res.status !== 0) {
    console.error(`\n${cmd} ${args.join(" ")} failed (exit ${res.status ?? res.signal}).`);
    process.exit(res.status || 1);
  }
}

// 1. The site's dependencies.
const ci = !!(process.env.CF_PAGES || process.env.CI);
if (ci || process.argv.includes("--install") || !existsSync(join(root, "node_modules"))) {
  run("npm", ["ci"]);
} else {
  console.log("Using the site's installed node_modules (pass --install for a clean `npm ci`).");
}

// 2. The site, in edit mode, under /site.
rmSync(dist, { recursive: true, force: true });
run("npx", ["astro", "build", "--outDir", join(dist, "site")], { env: { ...process.env, CMS_EDIT: "1" } });

// 3. The editor.
const htmlPaths = [];
if (existsSync(app)) {
  for (const reserved of ["site", "api"]) {
    if (existsSync(join(app, reserved))) console.warn(`Warning: portal/app/${reserved} clashes with the portal's /${reserved}/ and is skipped.`);
  }
  cpSync(app, dist, {
    recursive: true,
    filter: (src) => {
      const rel = relative(app, src).split(/[\\/]/)[0];
      return rel !== "site" && rel !== "api" && rel !== "_headers";
    },
  });
  // Every HTML page of the editor, by the URLs Pages serves it at.
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = "/" + relative(app, full).split(/[\\/]/).join("/");
      if (rel.startsWith("/site") || rel.startsWith("/api")) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".html")) {
        htmlPaths.push(rel);
        if (name === "index.html") htmlPaths.push(rel.slice(0, -"index.html".length));
        else htmlPaths.push(rel.slice(0, -".html".length));
      }
    }
  };
  walk(app);
} else {
  console.warn("\nWarning: portal/app/ doesn't exist yet; dist/ has the site but no editor.");
}

// 4. Headers. The portal is private: nothing in it is for search engines, and
// the editor's pages must always be fetched fresh so a deploy takes effect.
// (Functions set their own headers; these apply to static files.)
let headers = `/*\n  X-Robots-Tag: noindex\n\n/api/*\n  Cache-Control: no-store\n`;
for (const path of [...new Set(["/", ...htmlPaths])].sort()) headers += `\n${path}\n  Cache-Control: no-store\n`;
if (existsSync(join(app, "_headers"))) headers += `\n# From portal/app/_headers\n${readFileSync(join(app, "_headers"), "utf8")}`;
writeFileSync(join(dist, "_headers"), headers);

console.log(`\nPortal built into ${relative(process.cwd(), dist) || "."}/`);
