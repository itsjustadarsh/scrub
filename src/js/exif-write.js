import { enc, concat } from "./bytes.js";

/* ============================================================
   EXIF writer — builds a TIFF block from scratch, little-endian
   ============================================================ */
function bytesOf(list, each, write){
  const b = new Uint8Array(list.length * each);
  const dv = new DataView(b.buffer);
  list.forEach((v, i) => write(dv, i * each, v));
  return b;
}
const eAscii = (tag, s) => { const b = enc.encode(String(s) + "\0"); return {tag, type:2, count:b.length, data:b}; };
const eShort = (tag, ...v) => ({tag, type:3, count:v.length, data: bytesOf(v, 2, (dv,o,x) => dv.setUint16(o, x, true))});
const eLong  = (tag, ...v) => ({tag, type:4, count:v.length, data: bytesOf(v, 4, (dv,o,x) => dv.setUint32(o, x, true))});
const eByte  = (tag, ...v) => ({tag, type:1, count:v.length, data: new Uint8Array(v)});
const eUndef = (tag, b)    => ({tag, type:7, count:b.length, data:b});
const eRat   = (tag, prs)  => ({tag, type:5, count:prs.length,
  data: bytesOf(prs, 8, (dv,o,p) => { dv.setUint32(o, p[0], true); dv.setUint32(o+4, p[1], true); })});
const eSRat  = (tag, prs)  => ({tag, type:10, count:prs.length,
  data: bytesOf(prs, 8, (dv,o,p) => { dv.setInt32(o, p[0], true); dv.setInt32(o+4, p[1], true); })});

// A decimal as an exact-ish rational: 1.78 -> [178,100]
function frac(x, den){
  den = den || 1000;
  return [Math.round(Math.abs(x) * den), den];
}
function pad2(n){ return String(n).padStart(2, "0"); }
function exifDate(d){
  return d.getFullYear() + ":" + pad2(d.getMonth()+1) + ":" + pad2(d.getDate()) + " " +
         pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}
// "1/250", "0.004" or "250" (meaning 1/250) -> seconds
function parseShutter(s){
  s = String(s || "").trim();
  if (!s) return null;
  if (s.includes("/")){
    const [a, b] = s.split("/").map(Number);
    return b ? a / b : null;
  }
  const n = Number(s);
  if (!isFinite(n) || n <= 0) return null;
  return n > 1 ? 1 / n : n;
}
function shutterRational(sec){
  if (sec >= 1) return [Math.round(sec * 10), 10];
  return [1, Math.round(1 / sec)];
}
function dms(v){
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = (a - d - m / 60) * 3600;
  return [[d, 1], [m, 1], [Math.round(s * 1000), 1000]];
}

function buildTIFF(f, when, dims){
  const num = v => (v === "" || v == null || !isFinite(Number(v))) ? null : Number(v);
  const ifd0 = [], exif = [], gps = [];
  const stamp = exifDate(when);

  if (f.make)      ifd0.push(eAscii(0x010F, f.make));
  if (f.model)     ifd0.push(eAscii(0x0110, f.model));
  if (f.software)  ifd0.push(eAscii(0x0131, f.software));
  if (f.artist)    ifd0.push(eAscii(0x013B, f.artist));
  if (f.copyright) ifd0.push(eAscii(0x8298, f.copyright));
  ifd0.push(eAscii(0x0132, stamp));
  ifd0.push(eShort(0x0112, 1));                              // Orientation: normal
  ifd0.push(eRat(0x011A, [[72, 1]]), eRat(0x011B, [[72, 1]]), eShort(0x0128, 2));
  ifd0.push(eShort(0x0213, 1));                              // YCbCrPositioning

  exif.push(eUndef(0x9000, enc.encode("0232")));             // ExifVersion 2.32
  exif.push(eAscii(0x9003, stamp), eAscii(0x9004, stamp));
  const tz = -when.getTimezoneOffset();
  const tzs = (tz < 0 ? "-" : "+") + pad2(Math.floor(Math.abs(tz)/60)) + ":" + pad2(Math.abs(tz)%60);
  exif.push(eAscii(0x9010, tzs), eAscii(0x9011, tzs));

  const sec = parseShutter(f.shutter);
  if (sec){
    exif.push(eRat(0x829A, [shutterRational(sec)]));
    exif.push(eSRat(0x9201, [[Math.round(Math.log2(1 / sec) * 100), 100]]));
  }
  const fn = num(f.fnumber);
  if (fn){
    exif.push(eRat(0x829D, [frac(fn, 100)]));
    exif.push(eRat(0x9202, [[Math.round(2 * Math.log2(fn) * 100), 100]]));
    exif.push(eRat(0x9205, [[Math.round(2 * Math.log2(fn) * 100), 100]]));
  }
  const iso = num(f.iso);
  if (iso){ exif.push(eShort(0x8827, iso)); exif.push(eShort(0x8830, 1)); exif.push(eLong(0x8832, iso)); }
  const fl = num(f.focal);
  if (fl) exif.push(eRat(0x920A, [frac(fl, 100)]));
  const fl35 = num(f.focal35);
  if (fl35) exif.push(eShort(0xA405, Math.round(fl35)));
  exif.push(eShort(0x9209, num(f.flash) || 0));
  exif.push(eSRat(0x9204, [[0, 10]]));                       // ExposureBias 0
  exif.push(eShort(0x8822, 2), eShort(0x9207, 5), eShort(0xA402, 0), eShort(0xA403, 0));
  exif.push(eShort(0xA001, 1));                              // sRGB
  exif.push(eShort(0xA406, 0), eShort(0xA408, 0), eShort(0xA409, 0), eShort(0xA40A, 0));
  if (dims){ exif.push(eLong(0xA002, dims[0]), eLong(0xA003, dims[1])); }
  if (f.make)  exif.push(eAscii(0xA433, f.make));
  if (f.lens)  exif.push(eAscii(0xA434, f.lens));
  if (fl && fn) exif.push(eRat(0xA432, [frac(fl,100), frac(fl,100), frac(fn,100), frac(fn,100)]));

  const g = f.gps;
  if (g){
    gps.push(eByte(0x0000, 2, 3, 0, 0));
    gps.push(eAscii(0x0001, g.lat >= 0 ? "N" : "S"), eRat(0x0002, dms(g.lat)));
    gps.push(eAscii(0x0003, g.lng >= 0 ? "E" : "W"), eRat(0x0004, dms(g.lng)));
    const alt = num(f.altitude);
    if (alt != null){ gps.push(eByte(0x0005, alt < 0 ? 1 : 0), eRat(0x0006, [frac(alt, 100)])); }
    const u = new Date(when.getTime());
    gps.push(eRat(0x0007, [[u.getUTCHours(),1], [u.getUTCMinutes(),1], [u.getUTCSeconds(),1]]));
    gps.push(eAscii(0x001D, u.getUTCFullYear() + ":" + pad2(u.getUTCMonth()+1) + ":" + pad2(u.getUTCDate())));
    gps.push(eRat(0x001F, [[Math.round(3.4 * 100), 100]]));  // horizontal error, metres
  }

  // --- layout: header(8) | IFD0 | ExifIFD | GPSIFD | value pool ---
  const tableSize = n => 2 + 12 * n + 4;
  const ptrExif = eLong(0x8769, 0), ptrGps = eLong(0x8825, 0);
  if (exif.length) ifd0.push(ptrExif);
  if (gps.length)  ifd0.push(ptrGps);
  const byTag = (a, b) => a.tag - b.tag;
  ifd0.sort(byTag); exif.sort(byTag); gps.sort(byTag);

  const off0 = 8;
  const off1 = off0 + tableSize(ifd0.length);
  const off2 = off1 + (exif.length ? tableSize(exif.length) : 0);
  const poolBase = off2 + (gps.length ? tableSize(gps.length) : 0);
  if (exif.length) new DataView(ptrExif.data.buffer).setUint32(0, off1, true);
  if (gps.length)  new DataView(ptrGps.data.buffer).setUint32(0, off2, true);

  const pool = [];
  let poolLen = 0;
  const table = (entries, next) => {
    const buf = new Uint8Array(tableSize(entries.length));
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, entries.length, true);
    entries.forEach((en, i) => {
      const o = 2 + i * 12;
      dv.setUint16(o, en.tag, true);
      dv.setUint16(o + 2, en.type, true);
      dv.setUint32(o + 4, en.count, true);
      if (en.data.length <= 4){
        buf.set(en.data, o + 8);
      } else {
        dv.setUint32(o + 8, poolBase + poolLen, true);
        const d = en.data.length % 2 ? concat([en.data, new Uint8Array(1)]) : en.data;
        pool.push(d); poolLen += d.length;
      }
    });
    dv.setUint32(2 + entries.length * 12, next, true);
    return buf;
  };

  const header = new Uint8Array([0x49, 0x49, 0x2A, 0x00, 8, 0, 0, 0]);
  const parts = [header, table(ifd0, 0)];
  if (exif.length) parts.push(table(exif, 0));
  if (gps.length)  parts.push(table(gps, 0));
  return concat([...parts, ...pool]);
}

export { buildTIFF, parseShutter, dms };
