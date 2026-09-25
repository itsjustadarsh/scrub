#!/usr/bin/env node
/* Browser tests. The pixel engine needs a real canvas and the UI needs a real
   DOM, so these run in headless Chrome instead of Node.

   Usage: npm run test:browser
   Set CHROME_PATH to point at a specific binary. Without a browser installed
   this skips (exit 0) unless SCRUB_REQUIRE_BROWSER=1, which CI sets. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8731;
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".mjs":"text/javascript; charset=utf-8", ".css":"text/css", ".png":"image/png",
  ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".json":"application/json"};

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const near = (v, lo, hi) => v >= lo && v <= hi;

/* ---------- find a browser ---------- */
function findChrome(){
  const named = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  const paths = [process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"];
  for (const p of paths) if (p && fs.existsSync(p)) return p;
  for (const n of named){
    const r = spawnSync("which", [n], {encoding: "utf8"});
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

/* ---------- server that also collects results ---------- */
const results = new Map();
const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/result/")){
    const name = req.url.slice("/result/".length);
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      results.set(name, JSON.parse(Buffer.concat(chunks).toString()));
      res.end("ok");
    });
    return;
  }
  const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){
    res.writeHead(404); return res.end("not found");
  }
  res.writeHead(200, {"content-type": TYPES[path.extname(file)] || "application/octet-stream",
                      "cache-control": "no-store"});
  res.end(fs.readFileSync(file));
});

function runPage(chrome, url, key){
  return new Promise((resolve, reject) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "scrub-"));
    const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox",
      "--disable-dev-shm-usage", "--user-data-dir=" + profile, url],
      {stdio: "ignore"});
    const started = Date.now();
    const poll = setInterval(() => {
      if (results.has(key)){
        clearInterval(poll); child.kill(); fs.rmSync(profile, {recursive: true, force: true});
        resolve(results.get(key));
      } else if (Date.now() - started > 120000){
        clearInterval(poll); child.kill(); fs.rmSync(profile, {recursive: true, force: true});
        reject(new Error(key + ": timed out"));
      }
    }, 200);
  });
}

/* ---------- assertions ---------- */
function checkPixels(r){
  console.log("\npixel engine");
  if (r.error) return ok(false, "threw: " + r.error);
  ok(r.dhashSanity > 10, `dHash discriminates unrelated images (${r.dhashSanity}/64)`);
  ok(r.seedStable, "the same seed reproduces identical bytes");
  ok(r.seedVaries, "a different seed produces different bytes");

  // Expected ranges are wide on purpose: encoders differ between browsers.
  const bands = {subtle: [0.02, 2.0], medium: [0.05, 6.0], heavy: [0.3, 12.0]};
  const floors = {subtle: 30, medium: 20, heavy: 18};   // PSNR, dB
  for (const x of r.results){
    const tag = `${x.name}/${x.tier}`;
    const [lo, hi] = bands[x.tier];
    ok(near(x.stats.avg, lo, hi), `${tag}: average change ${x.stats.avg.toFixed(3)}% within ${lo}–${hi}%`);
    ok(x.stats.moved > 10, `${tag}: ${x.stats.moved.toFixed(1)}% of pixels changed`);
    ok(x.stats.psnr > floors[x.tier], `${tag}: PSNR ${x.stats.psnr.toFixed(1)} dB above ${floors[x.tier]}`);
    ok(x.bytes > 0, `${tag}: produced ${x.bytes} bytes`);
    if (x.forge){
      for (const tag2 of ["Make", "Model", "GPSLatitude", "ISO"])
        ok(x.meta.includes(tag2), `${tag}: forged ${tag2} survives the re-encode`);
    } else {
      ok(x.meta.length === 0, `${tag}: no metadata left (${x.meta.join(", ") || "none"})`);
    }
  }
  // PSNR should fall as the tier gets stronger — the tiers must actually differ.
  for (const name of ["photo.jpg", "photo.png"]){
    const by = t => r.results.find(x => x.name === name && x.tier === t).stats.psnr;
    ok(by("subtle") > by("medium") && by("medium") > by("heavy"),
       `${name}: tiers are ordered subtle > medium > heavy by fidelity`);
  }
}

function checkUI(r){
  console.log("\nui (driving the built index.html)");
  if (r.error) return ok(false, "threw: " + r.error);
  ok(r.errors.length === 0, "no page errors" + (r.errors.length ? ": " + r.errors.join(" | ") : ""));
  ok(/2 processed/.test(r.stripStatus), "strip run: " + r.stripStatus);
  ok(/metadata records destroyed/.test(r.stripStatus), "strip reports what it removed");
  ok(r.forgeVisible, "the forge panel opens");
  ok(r.pixVisible, "the pixel panel opens");
  ok(/no longer lossless/.test(r.warn), "the pixel warning is shown");
  ok(r.staleAfterEdit, "editing a field invalidates the previous results");
  ok(/fresh EXIF written/.test(r.fullStatus) && /pixels altered/.test(r.fullStatus),
     "forge + pixel run: " + r.fullStatus);
  ok(/difference-hash distance/.test(r.stats), "measured stats are shown: " + r.stats);
  ok(r.afterRows > 30, `forged file shows ${r.afterRows} metadata rows`);
  ok(r.tierNow.includes("p-custom"), "editing a knob switches to the custom tier");
  ok(r.cleared, "clear empties the queue and disables the actions");
  ok(r.overflow <= 402, `no horizontal overflow at 400px (scrollWidth ${r.overflow})`);
  ok(r.h1 === 1, "exactly one h1");
  ok(r.focusable > 40, `${r.focusable} keyboard-reachable controls`);
}

/* ---------- go ---------- */
const chrome = findChrome();
if (!chrome){
  const required = process.env.SCRUB_REQUIRE_BROWSER === "1";
  console.log(required ? "no Chrome found and SCRUB_REQUIRE_BROWSER=1" : "no Chrome found — skipping browser tests");
  process.exit(required ? 1 : 0);
}
console.log("browser: " + chrome);
if (!fs.existsSync(path.join(ROOT, "index.html"))){
  console.error("index.html is missing — run `npm run build` first");
  process.exit(1);
}

await new Promise(r => server.listen(PORT, r));
try{
  checkPixels(await runPage(chrome, `http://localhost:${PORT}/test/browser/pixels.html`, "pixels"));
  checkUI(await runPage(chrome, `http://localhost:${PORT}/test/browser/ui.html`, "ui"));
} finally {
  server.close();
}
console.log(fails ? `\n${fails} failing assertion(s)` : "\nall browser assertions passed");
process.exit(fails ? 1 : 0);
