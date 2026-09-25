/* Checks the built index.html — the file GitHub Pages actually serves.
   Run `npm run build` first; CI does. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const SITE = "https://itsjustadarsh.github.io/scrub/";

const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
  .map(m => JSON.parse(m[1]));
const byType = t => blocks.find(b => b["@type"] === t);

const stripTags = s => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const entities = s => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g,
  (_, e) => ({amp:"&", lt:"<", gt:">", quot:'"', "#39":"'", nbsp:" "}[e]));
const pageText = entities(stripTags(html));

test("the document has a real head", () => {
  assert.ok(html.startsWith("<!doctype html>"));
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<meta name="viewport"/);
});

test("title and description are within the lengths search engines show", () => {
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  const desc = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(title.length <= 70, `title is ${title.length} chars`);
  assert.ok(desc.length >= 110 && desc.length <= 165, `description is ${desc.length} chars`);
});

test("canonical, og:url and the sitemap all point at the same place", () => {
  assert.ok(html.includes(`<link rel="canonical" href="${SITE}">`));
  assert.ok(html.includes(`<meta property="og:url" content="${SITE}">`));
  assert.ok(html.includes(`<meta property="og:image" content="${SITE}og.png">`));
  const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  assert.ok(sitemap.includes(`<loc>${SITE}</loc>`));
  const robots = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8");
  assert.ok(robots.includes(`${SITE}sitemap.xml`));
});

test("social cards are complete", () => {
  for (const tag of ["og:type", "og:site_name", "og:title", "og:description",
                     "og:image:width", "og:image:alt"])
    assert.match(html, new RegExp(`property="${tag}"`), tag + " is missing");
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
});

test("structured data is present and well formed", () => {
  assert.equal(blocks.length, 3);
  assert.ok(byType("SoftwareApplication"));
  assert.ok(byType("FAQPage"));
  assert.ok(byType("HowTo"));
  assert.equal(byType("SoftwareApplication").offers.price, "0");
  assert.equal(byType("SoftwareApplication").url, SITE);
  assert.equal(byType("HowTo").step.length, 3);
});

test("every structured-data FAQ appears verbatim on the page", () => {
  // Structured data that isn't on the page is a penalty, not a boost.
  const faqs = byType("FAQPage").mainEntity;
  assert.ok(faqs.length >= 10, `only ${faqs.length} FAQs`);
  for (const q of faqs){
    assert.ok(pageText.includes(q.name), `question missing from page: ${q.name}`);
    assert.ok(pageText.includes(q.acceptedAnswer.text),
      `answer missing from page: ${q.acceptedAnswer.text.slice(0, 60)}…`);
  }
});

test("headings are ordered and there is exactly one h1", () => {
  const levels = [...html.matchAll(/<h([1-3])[ >]/g)].map(m => +m[1]);
  assert.equal(levels.filter(l => l === 1).length, 1);
  assert.equal(levels[0], 1);
  for (let i = 1; i < levels.length; i++)
    assert.ok(levels[i] <= levels[i-1] + 1, `heading jumps from h${levels[i-1]} to h${levels[i]}`);
});

test("the page loads nothing from the network", () => {
  // The offline promise depends on this: no fonts, no CDN, no analytics.
  const subresources = [...html.matchAll(
    /<(?:script|img|link(?! rel="canonical"))[^>]*?(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  const external = subresources.filter(u => /^(https?:)?\/\//.test(u));
  assert.deepEqual(external, [], "external subresources: " + external.join(", "));
  assert.ok(!/\bfetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(html), "the script makes a request");
});

test("the build is current", async () => {
  // Guards against editing src/ and forgetting to rebuild before committing.
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["build.mjs", "--check"], {cwd: ROOT, stdio: "pipe"});
});
