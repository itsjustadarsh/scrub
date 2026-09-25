/* ---------- binary helpers ---------- */
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8");
const latin = new TextDecoder("latin1");

function concat(parts){
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts){ out.set(p, o); o += p.length; }
  return out;
}
function str(bytes, off, len){ return latin.decode(bytes.subarray(off, off + len)); }
function be32(bytes, o){ return (bytes[o]<<24 | bytes[o+1]<<16 | bytes[o+2]<<8 | bytes[o+3]) >>> 0; }
function u32be(v){ return new Uint8Array([v>>>24 & 255, v>>>16 & 255, v>>>8 & 255, v & 255]); }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export { enc, dec, latin, concat, str, be32, u32be, crc32 };
