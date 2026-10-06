// Draws every SeastackSchool logo file from one definition, so the mark is identical everywhere.
//   node scripts/make-logo-assets.mjs
// Two marks: the SEAL (name around the S; used where there is room) and the MARK (ring, S and one amber dot;
// used for small sizes such as the phone icon and the browser tab). Needs Microsoft Edge to rasterise.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sslogo-"));
const PURPLE = "#5b49c6", CREAM = "#fffdf8", AMBER = "#ffc46b";

const S = `<path id="S" d="M66 34C66 26 56 22.5 47.5 24.5C36.5 27 32.5 37 40 43C45.5 47.5 56 49 62 54.5C70 61.5 68 75 55.5 78C46 80.5 35.5 78 32.5 70" fill="none" stroke-linecap="round"/>`;
const mark = (fg, bg) => `<circle cx="50" cy="50" r="42" fill="none" stroke="${fg}" stroke-width="2"/><use href="#S" stroke="${fg}" stroke-width="4.4"/><circle cx="79.7" cy="20.3" r="6.5" fill="${AMBER}" stroke="${bg}" stroke-width="3"/>`;
const seal = (fg) => `<path id="arcTop" d="M14.2 50a35.8 35.8 0 0 1 71.6 0" fill="none"/><path id="arcBot" d="M8.6 50a41.4 41.4 0 0 0 82.8 0" fill="none"/>
  <circle cx="50" cy="50" r="46" fill="none" stroke="${fg}" stroke-width="2.2"/><circle cx="50" cy="50" r="28.5" fill="none" stroke="${fg}" stroke-width="1.5"/>
  <g font-family="Segoe UI,Arial,sans-serif" font-weight="800" fill="${fg}" text-anchor="middle"><text font-size="8.1" letter-spacing="1.05"><textPath href="#arcTop" startOffset="50%">SEASTACK SCHOOL</textPath></text><text font-size="6.1" letter-spacing="1"><textPath href="#arcBot" startOffset="50%">TEACHERS EVERYWHERE</textPath></text></g>
  <circle cx="10.6" cy="50" r="2.3" fill="${AMBER}"/><circle cx="89.4" cy="50" r="2.3" fill="${AMBER}"/>
  <g transform="translate(22.5,21.7) scale(.55)"><use href="#S" stroke="${fg}" stroke-width="7.4"/></g>`;

// One picture: a square of `size` px with background `page`; the drawing is scaled by `scale` about the centre.
function shot(file, size, { page, tile, radius = 0, inner, scale = 1, tileSize = size }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html{margin:0;background:${page}}body{margin:0;width:${size}px;height:${size}px;overflow:hidden;position:relative;background:${page}}
    .t{position:absolute;left:${(size - tileSize) / 2}px;top:${(size - tileSize) / 2}px;width:${tileSize}px;height:${tileSize}px;border-radius:${radius}px;background:${tile}}svg{position:absolute;inset:0;width:100%;height:100%}</style></head>
    <body><div class="t"><svg viewBox="0 0 100 100"><defs>${S}</defs><g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${inner}</g></svg></div></body></html>`;
  const h = path.join(tmp, path.basename(file) + ".html");
  fs.writeFileSync(h, html);
  const out = path.join(root, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.rmSync(out, { force: true });
  execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--default-background-color=00000000",
    `--window-size=${size},${size}`, `--screenshot=${out}`, pathToFileURL(h).href], { stdio: "ignore" });
  // Edge can return a moment before the file is on disk
  for (let i = 0; i < 100 && !fs.existsSync(out); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  console.log(file, fs.statSync(out).size);
}

const M = mark("#fff", PURPLE), SL = seal("#fff");
// website and installable app
shot("app/icon-512.png", 512, { page: "transparent", tile: PURPLE, radius: 112, inner: M, scale: 0.94 });
shot("app/icon-192.png", 192, { page: "transparent", tile: PURPLE, radius: 42, inner: M, scale: 0.94 });
shot("app/apple-touch-icon.png", 180, { page: PURPLE, tile: PURPLE, inner: M, scale: 0.86 });
shot("app/icon-maskable-512.png", 512, { page: PURPLE, tile: PURPLE, inner: M, scale: 0.7 });
shot("app/seal-512.png", 512, { page: PURPLE, tile: PURPLE, inner: SL, scale: 0.9 });
// Android app (Capacitor assets)
shot("mobile/assets/icon-only.png", 1024, { page: PURPLE, tile: PURPLE, inner: M, scale: 0.84 });
shot("mobile/assets/icon-foreground.png", 1024, { page: "transparent", tile: "transparent", inner: M, scale: 0.56 });
shot("mobile/assets/icon-background.png", 1024, { page: PURPLE, tile: PURPLE, inner: "" });
shot("mobile/assets/splash.png", 2732, { page: CREAM, tile: PURPLE, radius: 132, tileSize: 600, inner: SL, scale: 0.9 });
shot("mobile/assets/splash-dark.png", 2732, { page: "#1b1a33", tile: PURPLE, radius: 132, tileSize: 600, inner: SL, scale: 0.9 });
// Google Play listing
shot("play/icon-512.png", 512, { page: PURPLE, tile: PURPLE, inner: M, scale: 0.84 });
fs.rmSync(tmp, { recursive: true, force: true });
