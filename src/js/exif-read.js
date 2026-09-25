import { latin, str } from "./bytes.js";
import { APP } from "./jpeg.js";
import { PNG_KEEP } from "./png.js";

/* ============================================================
   EXIF reader — the TIFF tree shared by JPEG APP1 and PNG eXIf
   ============================================================ */
const TAGS_0 = {
  0x010E:"ImageDescription",0x010F:"Make",0x0110:"Model",0x0112:"Orientation",
  0x011A:"XResolution",0x011B:"YResolution",0x0128:"ResolutionUnit",0x0131:"Software",
  0x0132:"DateTime",0x013B:"Artist",0x013E:"WhitePoint",0x013F:"PrimaryChromaticities",
  0x0100:"ImageWidth",0x0101:"ImageLength",0x0102:"BitsPerSample",0x8298:"Copyright",
  0x829A:"ExposureTime",0x829D:"FNumber",0x9C9B:"XPTitle",0x9C9C:"XPComment",
  0x9C9D:"XPAuthor",0x9C9E:"XPKeywords",0x9C9F:"XPSubject",0xC4A5:"PrintIM",
  0x8769:"ExifIFD",0x8825:"GPSIFD",0xA005:"InteropIFD"
};
const TAGS_EXIF = {
  0x829A:"ExposureTime",0x829D:"FNumber",0x8822:"ExposureProgram",0x8827:"ISO",
  0x8830:"SensitivityType",0x9000:"ExifVersion",0x9003:"DateTimeOriginal",
  0x9004:"DateTimeDigitized",0x9010:"OffsetTime",0x9011:"OffsetTimeOriginal",
  0x9201:"ShutterSpeedValue",0x9202:"ApertureValue",0x9203:"BrightnessValue",
  0x9204:"ExposureBias",0x9205:"MaxApertureValue",0x9207:"MeteringMode",
  0x9208:"LightSource",0x9209:"Flash",0x920A:"FocalLength",0x927C:"MakerNote",
  0x9286:"UserComment",0xA001:"ColorSpace",0xA002:"PixelXDimension",
  0xA003:"PixelYDimension",0xA402:"ExposureMode",0xA403:"WhiteBalance",
  0xA404:"DigitalZoomRatio",0xA405:"FocalLengthIn35mmFilm",0xA406:"SceneCaptureType",
  0xA408:"Contrast",0xA409:"Saturation",0xA40A:"Sharpness",0xA420:"ImageUniqueID",
  0xA430:"CameraOwnerName",0xA431:"BodySerialNumber",0xA432:"LensSpecification",
  0xA433:"LensMake",0xA434:"LensModel",0xA435:"LensSerialNumber"
};
const TAGS_GPS = {
  0x0000:"GPSVersionID",0x0001:"GPSLatitudeRef",0x0002:"GPSLatitude",
  0x0003:"GPSLongitudeRef",0x0004:"GPSLongitude",0x0005:"GPSAltitudeRef",
  0x0006:"GPSAltitude",0x0007:"GPSTimeStamp",0x000B:"GPSDOP",0x000C:"GPSSpeedRef",
  0x000D:"GPSSpeed",0x0010:"GPSImgDirectionRef",0x0011:"GPSImgDirection",
  0x001D:"GPSDateStamp",0x001F:"GPSHPositioningError"
};
const TYPE_SIZE = {1:1, 2:1, 3:2, 4:4, 5:8, 6:1, 7:1, 8:2, 9:4, 10:8, 11:4, 12:8};

function readTIFF(t){
  const out = [];
  if (t.length < 8) return out;
  const le = str(t, 0, 2) === "II";
  const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  if (dv.getUint16(2, le) !== 42) return out;

  const readIFD = (off, names, label, depth) => {
    if (off <= 0 || off + 2 > t.length || depth > 4) return;
    const n = dv.getUint16(off, le);
    if (off + 2 + n * 12 > t.length) return;
    for (let i = 0; i < n; i++){
      const e = off + 2 + i * 12;
      const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le);
      const size = (TYPE_SIZE[type] || 1) * count;
      let vo = e + 8;
      if (size > 4){ vo = dv.getUint32(e + 8, le); if (vo + size > t.length) continue; }
      if (tag === 0x8769){ readIFD(dv.getUint32(vo, le), TAGS_EXIF, "Exif", depth + 1); continue; }
      if (tag === 0x8825){ readIFD(dv.getUint32(vo, le), TAGS_GPS, "GPS", depth + 1); continue; }
      if (tag === 0xA005){ readIFD(dv.getUint32(vo, le), TAGS_EXIF, "Interop", depth + 1); continue; }
      const name = names[tag] || ("Tag 0x" + tag.toString(16).padStart(4, "0"));
      out.push({group: label, name, value: readValue(dv, t, vo, type, count, le, name)});
    }
  };

  readIFD(dv.getUint32(4, le), TAGS_0, "IFD0", 0);
  return out;
}

function readValue(dv, t, o, type, count, le, name){
  try{
    if (type === 2) return latin.decode(t.subarray(o, o + count)).replace(/\0+$/, "").trim();
    if (type === 7){
      if (name === "ExifVersion") return latin.decode(t.subarray(o, o + Math.min(count, 4)));
      return count + " bytes";
    }
    const vals = [];
    for (let i = 0; i < Math.min(count, 12); i++){
      const p = o + i * TYPE_SIZE[type];
      if (type === 1) vals.push(dv.getUint8(p));
      else if (type === 3) vals.push(dv.getUint16(p, le));
      else if (type === 4) vals.push(dv.getUint32(p, le));
      else if (type === 8) vals.push(dv.getInt16(p, le));
      else if (type === 9) vals.push(dv.getInt32(p, le));
      else if (type === 5) vals.push(ratio(dv.getUint32(p, le), dv.getUint32(p + 4, le)));
      else if (type === 10) vals.push(ratio(dv.getInt32(p, le), dv.getInt32(p + 4, le)));
      else if (type === 11) vals.push(round(dv.getFloat32(p, le)));
      else if (type === 12) vals.push(round(dv.getFloat64(p, le)));
      else vals.push("?");
    }
    if (count > 12) vals.push("…");
    return vals.join(", ");
  } catch(e){ return "?"; }
}
function ratio(n, d){
  if (!d) return "0";
  if (n / d < 1 && n !== 0 && d % n !== 0) return n + "/" + d;
  return round(n / d);
}
function round(x){ return String(Math.round(x * 10000) / 10000); }

/* ---------- gather everything a file is carrying ---------- */
function readMeta(kind, parsed){
  const rows = [];
  if (kind === "jpeg"){
    for (const s of parsed.segs){
      if (!s.data) continue;
      const d = s.data;
      if (s.m === 0xE1 && str(d, 0, 4) === "Exif")
        rows.push(...readTIFF(d.subarray(6)));
      else if (s.m === 0xE1 && str(d, 0, 28).startsWith("http://ns.adobe.com/xap"))
        rows.push({group:"XMP", name:"XMP packet", value: d.length + " bytes"});
      else if (s.m === 0xE2 && str(d, 0, 11) === "ICC_PROFILE")
        rows.push({group:"ICC", name:"ICC profile", value: (str(d, 96, 4).trim() || "embedded") + ", " + d.length + " bytes"});
      else if (s.m === 0xED && str(d, 0, 13) === "Photoshop 3.0")
        rows.push({group:"IPTC", name:"Photoshop / IPTC", value: d.length + " bytes"});
      else if (s.m === 0xE0 && str(d, 0, 4) === "JFIF")
        rows.push({group:"JFIF", name:"JFIF density", value: ((d[8]<<8)|d[9]) + "×" + ((d[10]<<8)|d[11])});
      else if (APP(s.m))
        rows.push({group:"APP", name:"APP" + (s.m - 0xE0) + " " + (str(d, 0, 12).split("\0")[0] || ""), value: d.length + " bytes"});
      else if (s.m === 0xFE)
        rows.push({group:"COM", name:"Comment", value: latin.decode(d).slice(0, 120)});
    }
    if (parsed.trailing > 0)
      rows.push({group:"RAW", name:"Data after end-of-image", value: parsed.trailing + " bytes"});
  } else {
    for (const c of parsed){
      if (c.type === "eXIf") rows.push(...readTIFF(c.data));
      else if (c.type === "tEXt"){
        const i = c.data.indexOf(0);
        rows.push({group:"tEXt", name: latin.decode(c.data.subarray(0, i)),
                   value: latin.decode(c.data.subarray(i + 1)).slice(0, 160)});
      }
      else if (c.type === "iTXt"){
        const i = c.data.indexOf(0);
        rows.push({group:"iTXt", name: latin.decode(c.data.subarray(0, i)), value: c.data.length + " bytes"});
      }
      else if (c.type === "zTXt"){
        const i = c.data.indexOf(0);
        rows.push({group:"zTXt", name: latin.decode(c.data.subarray(0, i)), value: "compressed, " + c.data.length + " bytes"});
      }
      else if (c.type === "tIME" && c.data.length >= 7){
        const d = c.data;
        rows.push({group:"tIME", name:"Last modified",
                   value: ((d[0]<<8)|d[1]) + "-" + d[2] + "-" + d[3] + " " + d[4] + ":" + d[5] + ":" + d[6]});
      }
      else if (c.type === "iCCP"){
        const i = c.data.indexOf(0);
        rows.push({group:"ICC", name:"ICC profile", value: latin.decode(c.data.subarray(0, i)) + ", " + c.data.length + " bytes"});
      }
      else if (!PNG_KEEP.has(c.type))
        rows.push({group:"PNG", name: c.type + " chunk", value: c.data.length + " bytes"});
    }
  }
  return rows;
}

export { readTIFF, readMeta };
