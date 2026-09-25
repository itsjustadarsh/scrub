import { enc, concat, str, be32, u32be, crc32 } from "./bytes.js";

/* ============================================================
   PNG — chunk walker
   ============================================================ */
const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
// Chunks that change how the image renders — everything else is metadata.
const PNG_KEEP = new Set(["IHDR","PLTE","IDAT","IEND","tRNS","gAMA","cHRM","sRGB","sBIT",
                          "bKGD","pHYs","hIST","sPLT","acTL","fcTL","fdAT"]);

function parsePNG(d){
  for (let i = 0; i < 8; i++) if (d[i] !== PNG_SIG[i]) throw new Error("not a PNG");
  const chunks = [];
  let p = 8;
  while (p + 8 <= d.length){
    const len = be32(d, p);
    const type = str(d, p + 4, 4);
    if (p + 12 + len > d.length) break;
    chunks.push({type, data: d.subarray(p + 8, p + 8 + len)});
    p += 12 + len;
    if (type === "IEND") break;
  }
  return chunks;
}

function pngChunk(type, data){
  const body = concat([enc.encode(type), data]);
  return concat([u32be(data.length), body, u32be(crc32(body))]);
}
function buildPNG(chunks){
  return concat([new Uint8Array(PNG_SIG), ...chunks.map(c => pngChunk(c.type, c.data))]);
}
function pngSize(chunks){
  const ihdr = chunks.find(c => c.type === "IHDR");
  return ihdr ? [be32(ihdr.data, 0), be32(ihdr.data, 4)] : null;
}
function stripPNG(chunks){ return chunks.filter(c => PNG_KEEP.has(c.type)); }

function injectPNG(chunks, tiff, f, when){
  const add = [{type: "eXIf", data: tiff}];
  const text = [
    ["Software", f.software && f.make ? f.make + " " + f.software : f.software],
    ["Artist", f.artist], ["Copyright", f.copyright],
    ["Model", f.make && f.model ? f.make + " " + f.model : f.model],
    ["Creation Time", when ? when.toUTCString() : ""]
  ];
  for (const [k, v] of text)
    if (v) add.push({type: "tEXt", data: concat([enc.encode(k), new Uint8Array([0]), enc.encode(String(v))])});
  if (when){
    const t = new Uint8Array(7), dv = new DataView(t.buffer);
    dv.setUint16(0, when.getUTCFullYear());
    t[2] = when.getUTCMonth() + 1; t[3] = when.getUTCDate();
    t[4] = when.getUTCHours(); t[5] = when.getUTCMinutes(); t[6] = when.getUTCSeconds();
    add.push({type: "tIME", data: t});
  }
  const out = chunks.slice();
  out.splice(1, 0, ...add);  // straight after IHDR
  return out;
}

export { PNG_SIG, PNG_KEEP, parsePNG, pngChunk, buildPNG, pngSize, stripPNG, injectPNG };
