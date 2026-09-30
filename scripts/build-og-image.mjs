// Renders the social preview card (public/og-image.png, 1200x630) with
// headless Chrome: the cream lockup centred on a forest field, with the
// treeline along the foot. Drawn from the real mark, wordmark and treeline
// rather than redrawn by hand.
//
//   node scripts/build-og-image.mjs
//
// Re-run after changing the palette or the logo art. Needs Google Chrome
// installed (CHROME=/path/to/chrome to override).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pub = join(root, "public");
const out = join(pub, "og-image.png");

const chrome =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Pull the inks from global.css so the card cannot drift from the site.
const css = readFileSync(join(root, "src/styles/global.css"), "utf8");
const token = (name) => css.match(new RegExp(`--color-${name}:\\s*([^;]+);`))[1].trim();

const forest = token("forest");
const cream = token("cream");

// The wordmark lives inline in Wordmark.astro; lift its <svg> and pin the ink.
const wordmark = readFileSync(join(root, "src/components/Wordmark.astro"), "utf8")
  .match(/<svg[\s\S]*<\/svg>/)[0]
  .replace(/class=\{className\}/, "")
  .replace('fill="currentColor"', `fill="${cream}"`);

const file = (name) => pathToFileURL(join(pub, name)).href;

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative;
    background: ${forest};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-bottom: 72px; /* centre in the field above the treeline */
  }
  .mark { display: block; width: 480px; }
  svg { display: block; width: 450px; height: auto; margin-top: 38px; }
  .trees {
    position: absolute;
    inset: auto 0 0 0;
    height: 72px;
    background: url("${file("treeline-light.svg")}") repeat-x left bottom / auto 72px;
  }
</style></head>
<body>
  <img class="mark" src="${file("mark-light.svg")}" alt="">
  ${wordmark}
  <div class="trees"></div>
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), "og-"));
try {
  const page = join(dir, "card.html");
  writeFileSync(page, html);
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      "--force-device-scale-factor=1",
      "--window-size=1200,630",
      "--virtual-time-budget=5000",
      `--screenshot=${out}`,
      pathToFileURL(page).href,
    ],
    { stdio: "inherit" },
  );
  console.log(`Wrote ${out}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
