/* Codec tests — run with `npm test`. Needs nothing but Node.
   These import the modules in src/ directly, so a failure points at a file. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { concat, crc32 } from "../src/js/bytes.js";
import { parseJPEG, buildJPEG, stripJPEG, injectJPEG, jpegSize } from "../src/js/jpeg.js";
import { parsePNG, buildPNG, stripPNG, injectPNG, pngSize } from "../src/js/png.js";
import { readMeta, readTIFF } from "../src/js/exif-read.js";
import { buildTIFF, parseShutter, dms } from "../src/js/exif-write.js";
import { PRESETS, CITIES } from "../src/js/presets.js";
import { zip } from "../src/js/zip.js";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = f => new Uint8Array(fs.readFileSync(path.join(DIR, f)));
const JPEGS = ["meta.jpg", "meta-progressive.jpg", "photo.jpg"];
const PNGS = ["meta.png", "palette.png", "photo.png"];

const FORGE = {
  make: "SONY", model: "ILCE-7M4", lens: "FE 35mm F1.4 GM", software: "Capture One 16.5",
  shutter: "1/250", fnumber: "1.8", iso: "320", focal: "35", focal35: "35", flash: "0",
  altitude: "64", artist: "Nobody", copyright: "CC0", gps: {lat: 37.8199, lng: -122.4783}
};
const WHEN = new Date(2023, 6, 14, 9, 30, 15);

/* Runs the same pipeline the app runs, minus the browser. */
function process(file, {forge = false} = {}){
  const bytes = load(file);
  const isJpeg = bytes[0] === 0xFF;
  const parsed = isJpeg ? parseJPEG(bytes) : parsePNG(bytes);
  const dims = isJpeg ? jpegSize(parsed.segs) : pngSize(parsed);
  const tiff = forge ? buildTIFF(FORGE, WHEN, dims) : null;
  let out;
  if (isJpeg){
    let segs = stripJPEG(parsed.segs);
    if (forge) segs = injectJPEG(segs, tiff);
    out = buildJPEG(segs);
  } else {
    let chunks = stripPNG(parsed);
    if (forge) chunks = injectPNG(chunks, tiff, FORGE, WHEN);
    out = buildPNG(chunks);
  }
  return {
    bytes, out, dims,
    before: readMeta(isJpeg ? "jpeg" : "png", parsed),
    after: readMeta(isJpeg ? "jpeg" : "png", isJpeg ? parseJPEG(out) : parsePNG(out))
  };
}
const EXIF_GROUPS = new Set(["IFD0", "Exif", "GPS", "Interop"]);
// PNG carries a tEXt "Model" alongside the EXIF one, so be explicit about which we mean.
const byName = rows => Object.fromEntries(
  rows.filter(r => EXIF_GROUPS.has(r.group)).map(r => [r.name, r.value]));
const textChunks = rows => Object.fromEntries(
  rows.filter(r => r.group === "tEXt").map(r => [r.name, r.value]));

test("fixtures carry the metadata the tests rely on", () => {
  for (const f of ["meta.jpg", "meta-progressive.jpg", "meta.png"])
    assert.ok(process(f).before.length > 10, `${f} should be loaded with metadata`);
});

test("stripping removes every record", () => {
  for (const f of [...JPEGS, ...PNGS]){
    const {after} = process(f);
    // JFIF density is deliberately kept: it identifies nothing.
    const left = after.filter(r => r.group !== "JFIF");
    assert.deepEqual(left, [], `${f} still carries ${JSON.stringify(left)}`);
  }
});

test("stripping never grows a file", () => {
  for (const f of [...JPEGS, ...PNGS]){
    const {bytes, out} = process(f);
    assert.ok(out.length <= bytes.length, `${f} grew: ${bytes.length} -> ${out.length}`);
  }
});

test("stripping preserves the compressed image data byte for byte", () => {
  // The whole lossless claim: scan data (JPEG) and IDAT (PNG) must be untouched.
  for (const f of JPEGS){
    const a = parseJPEG(load(f)), b = parseJPEG(process(f).out);
    const scanOf = p => p.segs.filter(s => s.scan).map(s => Buffer.from(s.scan).toString("base64"));
    assert.deepEqual(scanOf(b), scanOf(a), `${f} scan data changed`);
  }
  for (const f of PNGS){
    const idat = p => p.filter(c => c.type === "IDAT").map(c => Buffer.from(c.data).toString("base64"));
    assert.deepEqual(idat(parsePNG(process(f).out)), idat(parsePNG(load(f))), `${f} IDAT changed`);
  }
});

test("forged EXIF reads back correctly", () => {
  for (const f of [...JPEGS, ...PNGS]){
    const m = byName(process(f, {forge: true}).after);
    assert.equal(m.Make, "SONY", f);
    assert.equal(m.Model, "ILCE-7M4", f);
    assert.equal(m.LensModel, "FE 35mm F1.4 GM", f);
    assert.equal(m.ISO, "320", f);
    assert.equal(m.FNumber, "1.8", f);
    assert.equal(m.ExposureTime, "0.004", f);
    assert.equal(m.DateTimeOriginal, "2023:07:14 09:30:15", f);
    assert.equal(m.GPSLatitudeRef, "N", f);
    assert.equal(m.GPSLongitudeRef, "W", f);
    assert.equal(m.GPSLatitude, "37, 49, 11.64", f);
  }
});

test("forged PNGs also get human-readable text chunks", () => {
  for (const f of PNGS){
    const t = textChunks(process(f, {forge: true}).after);
    assert.equal(t.Artist, "Nobody", f);
    assert.equal(t.Copyright, "CC0", f);
    assert.equal(t.Model, "SONY ILCE-7M4", f);
    assert.ok(t["Creation Time"], f);
  }
});

test("forged EXIF survives a round trip through the reader", () => {
  const tiff = buildTIFF(FORGE, WHEN, [640, 480]);
  const m = byName(readTIFF(tiff));
  assert.equal(m.PixelXDimension, "640");
  assert.equal(m.PixelYDimension, "480");
  assert.equal(m.ExifVersion, "0232");
  assert.equal(m.Orientation, "1");
});

test("blank forge fields are omitted, not written empty", () => {
  const tiff = buildTIFF({...FORGE, artist: "", copyright: "", lens: "", gps: null}, WHEN, null);
  const names = readTIFF(tiff).map(r => r.name);
  for (const absent of ["Artist", "Copyright", "LensModel", "GPSLatitude"])
    assert.ok(!names.includes(absent), `${absent} should not be written`);
  assert.ok(names.includes("Make"));
});

test("shutter speeds parse in every notation", () => {
  assert.equal(parseShutter("1/250"), 1 / 250);
  assert.equal(parseShutter("250"), 1 / 250);   // bare numbers mean 1/n
  assert.equal(parseShutter("0.004"), 0.004);
  assert.equal(parseShutter("2"), 0.5);
  assert.equal(parseShutter(""), null);
  assert.equal(parseShutter("garbage"), null);
});

test("coordinates convert to degrees/minutes/seconds", () => {
  assert.deepEqual(dms(37.8199), [[37, 1], [49, 1], [11640, 1000]]);
  assert.deepEqual(dms(-122.4783), [[122, 1], [28, 1], [41880, 1000]]);
});

test("data appended after the end-of-image marker is found and removed", () => {
  const payload = "SECRET-PAYLOAD-HIDDEN-AFTER-EOI";
  const tainted = concat([load("meta.jpg"), Buffer.from(payload)]);
  const parsed = parseJPEG(tainted);
  assert.ok(readMeta("jpeg", parsed).some(r => r.group === "RAW"), "trailing data not reported");
  const out = buildJPEG(stripJPEG(parsed.segs));
  assert.ok(!Buffer.from(out).includes(payload), "payload survived");
});

test("garbage input is rejected with a clear message", () => {
  assert.throws(() => parseJPEG(new Uint8Array([1, 2, 3])), /not a JPEG/);
  assert.throws(() => parsePNG(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), /not a PNG/);
});

test("PNG chunk CRCs are correct", () => {
  for (const f of PNGS){
    const {out} = process(f, {forge: true});
    let p = 8;
    while (p + 8 <= out.length){
      const len = (out[p] << 24 | out[p+1] << 16 | out[p+2] << 8 | out[p+3]) >>> 0;
      const body = out.subarray(p + 4, p + 8 + len);
      const stored = (out[p+8+len] << 24 | out[p+9+len] << 16 | out[p+10+len] << 8 | out[p+11+len]) >>> 0;
      assert.equal(crc32(body), stored, `${f}: bad CRC`);
      p += 12 + len;
    }
  }
});

test("ZIP output is a valid archive", () => {
  const files = [{name: "a.bin", data: new Uint8Array([1, 2, 3])},
                 {name: "b.png", data: load("meta.png")}];
  const z = zip(files);
  assert.equal(z[0], 0x50);                                     // "PK"
  const eocd = z.length - 22;
  assert.equal(new DataView(z.buffer, z.byteOffset).getUint32(eocd, true), 0x06054B50);
  assert.equal(new DataView(z.buffer, z.byteOffset).getUint16(eocd + 8, true), 2);
});

test("camera presets are internally coherent", () => {
  const ids = new Set();
  for (const p of PRESETS){
    assert.ok(!ids.has(p.id), `duplicate preset id ${p.id}`);
    ids.add(p.id);
    for (const k of ["label", "make", "model", "software", "lens"])
      assert.ok(p[k], `${p.id} is missing ${k}`);
    assert.ok(p.fnum.length && p.iso.length && p.shutter.length, `${p.id} has an empty range`);
    for (const f of p.fnum) assert.ok(f >= 0.9 && f <= 32, `${p.id}: implausible f/${f}`);
    for (const s of p.shutter) assert.ok(parseShutter(s) > 0, `${p.id}: bad shutter ${s}`);
  }
});

test("city coordinates are in range", () => {
  for (const [name, lat, lng] of CITIES.slice(1)){
    assert.ok(Math.abs(lat) <= 90, name);
    assert.ok(Math.abs(lng) <= 180, name);
  }
});
