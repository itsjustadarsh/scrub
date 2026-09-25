#!/usr/bin/env node
/* Bundles src/ into the single-file index.html that GitHub Pages serves.
   No dependencies, no bundler — the module graph here is small enough to
   resolve by hand, and keeping it that way is the point of the project.

   Usage: node build.mjs [--check]
     --check  exit non-zero if index.html is out of date (used by CI) */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "index.html");

/* ---------- module graph ---------- */
const IMPORT = /^import\s*\{[^}]*\}\s*from\s*"([^"]+)";?[ \t]*$/gm;

function bundle(entry){
  const seen = new Set(), order = [];
  (function visit(file){
    const abs = path.resolve(file);
    if (seen.has(abs)) return;
    seen.add(abs);
    const code = fs.readFileSync(abs, "utf8");
    for (const m of code.matchAll(IMPORT)) visit(path.resolve(path.dirname(abs), m[1]));
    order.push(abs);                       // dependencies first
  })(entry);

  return order.map(abs => {
    const rel = path.relative(SRC, abs);
    const code = fs.readFileSync(abs, "utf8")
      .replace(IMPORT, "")                 // imports become plain scope sharing
      .replace(/^export\s*\{[^}]*\};?[ \t]*$/gm, "")
      .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, "")
      .trim();
    return `/* ===== ${rel} ===== */\n${code}\n`;
  }).join("\n");
}

/* ---------- structured data, generated from the visible FAQ ---------- */
const plain = s => decodeEntities(s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
function decodeEntities(s){
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) =>
    ({amp:"&", lt:"<", gt:">", quot:'"', "#39":"'", nbsp:" "}[e]));
}
const SITE = "https://itsjustadarsh.github.io/scrub/";

function structuredData(html){
  const faqs = [...html.matchAll(
    /<details class="faq"><summary>(.*?)<\/summary>\s*<p>(.*?)<\/p><\/details>/gs)];
  if (faqs.length < 5) throw new Error("only found " + faqs.length + " FAQ entries in src/index.html");

  const blocks = [
    {"@context":"https://schema.org","@type":"SoftwareApplication",
     name:"Scrub — Image Metadata Remover", url:SITE,
     applicationCategory:"MultimediaApplication", operatingSystem:"Any (web browser)",
     browserRequirements:"Requires JavaScript. Works offline.",
     description:"Free browser-based tool that strips EXIF, GPS, XMP, IPTC, ICC and PNG text metadata from JPEG and PNG images, writes replacement EXIF, and optionally alters pixels. No uploads.",
     offers:{"@type":"Offer", price:"0", priceCurrency:"USD"},
     featureList:["Remove EXIF and GPS metadata from JPEG and PNG",
                  "Lossless stripping with no re-compression",
                  "Write replacement camera metadata",
                  "Optional pixel alteration with measured results",
                  "Batch processing and ZIP download",
                  "Runs entirely offline in the browser"],
     isAccessibleForFree:true,
     author:{"@type":"Person", name:"itsjustadarsh"}},
    {"@context":"https://schema.org","@type":"FAQPage",
     mainEntity: faqs.map(([, q, a]) => ({"@type":"Question", name: plain(q),
       acceptedAnswer:{"@type":"Answer", text: plain(a)}}))},
    {"@context":"https://schema.org","@type":"HowTo",
     name:"How to remove metadata from a JPEG or PNG image",
     totalTime:"PT1M", estimatedCost:{"@type":"MonetaryAmount", currency:"USD", value:"0"},
     step:[
      {"@type":"HowToStep", name:"Add your images",
       text:"Drag JPEG or PNG files onto the page, paste them from the clipboard, or click to choose them. They are read in your browser and never uploaded."},
      {"@type":"HowToStep", name:"Choose what happens",
       text:"Strip metadata only, strip and write replacement EXIF, and optionally turn on a pixel mode to alter the image data itself."},
      {"@type":"HowToStep", name:"Download the result",
       text:"Download each cleaned file, or take the whole batch as a single ZIP. Use inspect to see exactly what was removed."}]}
  ];
  return blocks.map(b =>
    `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join("\n");
}

/* ---------- assemble ---------- */
function build(){
  const page = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(SRC, "styles.css"), "utf8").trim();
  const js = bundle(path.join(SRC, "js", "main.js"));

  const out = page
    .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
    .replace("<!--json-ld-->", structuredData(page))
    .replace('<script type="module" src="js/main.js"></script>',
             `<script>\n"use strict";\n(function(){\n\n${js}\n})();\n</script>`);

  if (out.includes("<!--json-ld-->") || out.includes('src="js/main.js"'))
    throw new Error("a placeholder in src/index.html did not get replaced");
  return out;
}

const out = build();
if (process.argv.includes("--check")){
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== out){
    console.error("index.html is out of date — run `npm run build` and commit the result");
    process.exit(1);
  }
  console.log("index.html is up to date");
} else {
  fs.writeFileSync(OUT, out);
  console.log(`built index.html — ${(out.length / 1024).toFixed(1)} KB`);
}
