import { enc, concat, str } from "./bytes.js";

/* ============================================================
   JPEG — segment walker
   Structure: FFD8, then [FF marker, len(2), payload]..., SOS (FFDA)
   is followed by entropy-coded scan data that we copy verbatim.
   ============================================================ */
const APP = m => m >= 0xE0 && m <= 0xEF;
const SOF = m => (m >= 0xC0 && m <= 0xCF) && m !== 0xC4 && m !== 0xC8 && m !== 0xCC;

function parseJPEG(d){
  if (d[0] !== 0xFF || d[1] !== 0xD8) throw new Error("not a JPEG");
  const segs = [];
  let p = 2, trailing = 0;
  while (p < d.length - 1){
    if (d[p] !== 0xFF){ p++; continue; }          // resync on corruption
    let m = d[p+1];
    while (m === 0xFF){ p++; m = d[p+1]; }        // skip fill bytes
    if (m === 0x00){ p += 2; continue; }
    if (m === 0xD9){ trailing = d.length - (p + 2); break; }
    if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)){ segs.push({m, bare:true}); p += 2; continue; }
    if (p + 4 > d.length) break;
    const len = (d[p+2] << 8) | d[p+3];
    if (len < 2) break;
    const data = d.subarray(p + 4, Math.min(p + 2 + len, d.length));
    if (m === 0xDA){
      // walk the scan until a marker that isn't a stuffed byte or RST
      let q = p + 2 + len;
      while (q < d.length - 1){
        if (d[q] === 0xFF){
          const n = d[q+1];
          if (n !== 0x00 && n !== 0xFF && !(n >= 0xD0 && n <= 0xD7)) break;
        }
        q++;
      }
      if (q >= d.length - 1) q = d.length;
      segs.push({m, data, scan: d.subarray(p + 2 + len, q)});
      p = q;
      continue;
    }
    segs.push({m, data});
    p += 2 + len;
  }
  return {segs, trailing};
}

function buildJPEG(segs){
  const parts = [new Uint8Array([0xFF, 0xD8])];
  for (const s of segs){
    if (s.bare){ parts.push(new Uint8Array([0xFF, s.m])); continue; }
    const len = s.data.length + 2;
    parts.push(new Uint8Array([0xFF, s.m, len >> 8 & 255, len & 255]), s.data);
    if (s.scan) parts.push(s.scan);
  }
  parts.push(new Uint8Array([0xFF, 0xD9]));
  return concat(parts);
}

function jpegSize(segs){
  for (const s of segs){
    if (SOF(s.m) && s.data && s.data.length >= 5)
      return [(s.data[3] << 8) | s.data[4], (s.data[1] << 8) | s.data[2]];
  }
  return null;
}

// Keep only what affects decoding: drop every APPn and COM.
// JFIF (APP0) is pure density info, so it survives — nothing identifying lives there.
function stripJPEG(segs){
  return segs.filter(s => {
    if (s.m === 0xFE) return false;                                  // COM
    if (s.m === 0xE0) return s.data && str(s.data, 0, 4) === "JFIF"; // keep plain JFIF
    if (APP(s.m)) return false;
    return true;
  });
}

function injectJPEG(segs, tiff){
  const app1 = concat([enc.encode("Exif\0\0"), tiff]);
  const out = segs.slice();
  let at = 0;
  if (out[0] && out[0].m === 0xE0) at = 1;   // sit right after JFIF
  out.splice(at, 0, {m: 0xE1, data: app1});
  return out;
}

export { APP, SOF, parseJPEG, buildJPEG, jpegSize, stripJPEG, injectJPEG };
