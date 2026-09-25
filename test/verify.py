#!/usr/bin/env python3
"""Independent verification with Pillow — checks the output with a library that
knows nothing about this codebase, rather than trusting our own reader.

    pip install pillow
    npm run build && npm run test:verify

Proves the two claims that matter: stripping is lossless, and forged EXIF is
real EXIF that other software can read.
"""
import hashlib, io, os, subprocess, sys, json, base64
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(HERE, "fixtures")
fails = 0

def ok(cond, msg):
    global fails
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails += 1

def run_node(script):
    """Run the real pipeline through Node and hand back the bytes."""
    out = subprocess.run([ "node", "--input-type=module", "-e", script],
                         cwd=ROOT, capture_output=True, text=True)
    if out.returncode != 0:
        print(out.stderr)
        sys.exit(1)
    return json.loads(out.stdout)

PIPELINE = """
import fs from "node:fs";
import { parseJPEG, buildJPEG, stripJPEG, injectJPEG, jpegSize } from "./src/js/jpeg.js";
import { parsePNG, buildPNG, stripPNG, injectPNG, pngSize } from "./src/js/png.js";
import { buildTIFF } from "./src/js/exif-write.js";

const FORGE = {make:"SONY", model:"ILCE-7M4", lens:"FE 35mm F1.4 GM", software:"Capture One 16.5",
  shutter:"1/250", fnumber:"1.8", iso:"320", focal:"35", focal35:"35", flash:"0",
  altitude:"64", artist:"Nobody", copyright:"CC0", gps:{lat:37.8199, lng:-122.4783}};
const WHEN = new Date(2023, 6, 14, 9, 30, 15);
const out = {};
for (const f of %s){
  const bytes = new Uint8Array(fs.readFileSync("test/fixtures/" + f));
  const jpeg = bytes[0] === 0xFF;
  const parsed = jpeg ? parseJPEG(bytes) : parsePNG(bytes);
  const dims = jpeg ? jpegSize(parsed.segs) : pngSize(parsed);
  for (const forge of [false, true]){
    const tiff = forge ? buildTIFF(FORGE, WHEN, dims) : null;
    let result;
    if (jpeg){
      let segs = stripJPEG(parsed.segs);
      if (forge) segs = injectJPEG(segs, tiff);
      result = buildJPEG(segs);
    } else {
      let ch = stripPNG(parsed);
      if (forge) ch = injectPNG(ch, tiff, FORGE, WHEN);
      result = buildPNG(ch);
    }
    out[f + (forge ? "|forged" : "|clean")] = Buffer.from(result).toString("base64");
  }
}
process.stdout.write(JSON.stringify(out));
"""

FILES = ["meta.jpg", "meta-progressive.jpg", "meta.png", "palette.png", "photo.jpg"]
print("running the pipeline through Node, verifying the output with Pillow\n")
produced = run_node(PIPELINE % json.dumps(FILES))

for name in FILES:
    src = Image.open(os.path.join(FIX, name))
    clean = Image.open(io.BytesIO(base64.b64decode(produced[name + "|clean"])))
    forged = Image.open(io.BytesIO(base64.b64decode(produced[name + "|forged"])))

    h = lambda im: hashlib.sha256(im.convert("RGB").tobytes()).hexdigest()
    ok(h(src) == h(clean), f"{name}: stripped pixels are bit-identical")
    ok(h(src) == h(forged), f"{name}: forged pixels are bit-identical")
    ok(src.size == clean.size == forged.size, f"{name}: size preserved {src.size}")
    ok(not dict(clean.getexif()), f"{name}: Pillow finds no EXIF after stripping")
    if name.endswith("png"):
        ok(not clean.text, f"{name}: no PNG text chunks after stripping")

    ex = forged.getexif()
    ok(ex.get(0x010F) == "SONY" and ex.get(0x0110) == "ILCE-7M4",
       f"{name}: Pillow reads Make/Model {ex.get(0x010F)}/{ex.get(0x0110)}")
    sub = ex.get_ifd(0x8769)
    ok(float(sub[0x829D]) == 1.8 and sub[0x8827] == 320 and abs(float(sub[0x829A]) - 0.004) < 1e-6,
       f"{name}: exposure f/{sub[0x829D]} ISO{sub[0x8827]} {sub[0x829A]}s")
    ok(sub.get(0xA434) == "FE 35mm F1.4 GM", f"{name}: LensModel {sub.get(0xA434)}")
    gps = ex.get_ifd(0x8825)
    lat = [float(x) for x in gps[2]]
    lng = [float(x) for x in gps[4]]
    dlat = lat[0] + lat[1]/60 + lat[2]/3600
    dlng = -(lng[0] + lng[1]/60 + lng[2]/3600)
    ok(abs(dlat - 37.8199) < 1e-4 and abs(dlng + 122.4783) < 1e-4,
       f"{name}: GPS round-trips to {dlat:.5f}, {dlng:.5f} ({gps[1]}/{gps[3]})")

print()
print(f"{fails} FAILURES" if fails else "independent verification passed")
sys.exit(1 if fails else 0)
