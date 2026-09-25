/* ============================================================
   Pixel engine — optional, re-encodes, off by default
   ============================================================ */
function mulberry32(a){
  return function(){
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const TIERS = {
  subtle: {noise:1, grain:0,   scale:0,   crop:0, rot:0,   bright:0,   contrast:0, sat:0,   quality:95},
  medium: {noise:2, grain:0.8, scale:0.3, crop:2, rot:0,   bright:0,   contrast:0, sat:0,   quality:92},
  heavy:  {noise:2, grain:2.5, scale:0.6, crop:4, rot:0.2, bright:1.5, contrast:2, sat:1.5, quality:88}
};
const KNOBS = ["noise","grain","scale","crop","rot","bright","contrast","sat","quality"];

function canvasOf(w, h){
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
function dataOf(src, w, h){
  const c = canvasOf(w, h);
  const x = c.getContext("2d", {willReadFrequently:true});
  x.drawImage(src, 0, 0, w, h);
  return x.getImageData(0, 0, w, h);
}

// One draw does all the geometry, so the image is resampled once and only once.
function renderPixels(bmp, o, seed){
  const w = bmp.width, h = bmp.height;
  const cv = canvasOf(w, h);
  const ctx = cv.getContext("2d", {willReadFrequently:true});
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const inset = o.crop + (o.scale / 100) * Math.min(w, h) / 2;
  const sx = inset, sy = inset, sw = Math.max(8, w - 2*inset), sh = Math.max(8, h - 2*inset);
  const th = Math.abs(o.rot) * Math.PI / 180;
  // scale just enough that a rotated draw still covers every corner
  const cover = o.rot ? Math.max((w*Math.cos(th) + h*Math.sin(th))/w,
                                 (w*Math.sin(th) + h*Math.cos(th))/h) : 1;
  const dw = w * cover, dh = h * cover;
  ctx.translate(w/2, h/2);
  if (o.rot) ctx.rotate(o.rot * Math.PI / 180);
  ctx.drawImage(bmp, sx, sy, sw, sh, -dw/2, -dh/2, dw, dh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const rnd = mulberry32(seed >>> 0);
  const bright = o.bright / 100 * 255, contrast = 1 + o.contrast / 100, sat = 1 + o.sat / 100;
  const tone = bright !== 0 || contrast !== 1, desat = sat !== 1;
  let spare = null;
  const gauss = () => {                       // Box-Muller, one value cached
    if (spare !== null){ const v = spare; spare = null; return v; }
    const u = Math.max(rnd(), 1e-9), v = rnd();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  // never returns zero, so every pixel genuinely moves
  const kick = n => (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * n));

  for (let i = 0; i < d.length; i += 4){
    let r = d[i], g = d[i+1], b = d[i+2];
    if (tone){
      r = (r - 128) * contrast + 128 + bright;
      g = (g - 128) * contrast + 128 + bright;
      b = (b - 128) * contrast + 128 + bright;
    }
    if (desat){
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    }
    if (o.grain > 0){
      const n = gauss() * o.grain;            // luminance grain: same nudge per channel
      r += n; g += n; b += n;
    }
    if (o.noise > 0){ r += kick(o.noise); g += kick(o.noise); b += kick(o.noise); }
    d[i] = r; d[i+1] = g; d[i+2] = b;         // Uint8ClampedArray clamps and rounds
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/* ---- measurement: what actually changed, not what we hope changed ---- */
function dhash(src){
  const c = canvasOf(9, 8);
  const x = c.getContext("2d", {willReadFrequently:true});
  x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, 9, 8);
  const d = x.getImageData(0, 0, 9, 8).data;
  const bits = new Uint8Array(64);
  const lum = i => d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
  for (let y = 0; y < 8; y++)
    for (let xx = 0; xx < 8; xx++)
      bits[y*8 + xx] = lum((y*9 + xx) * 4) > lum((y*9 + xx + 1) * 4) ? 1 : 0;
  return bits;
}
function hamming(a, b){
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}
function compare(before, after){
  const w = before.width, h = before.height;
  const a = dataOf(before, w, h).data, b = dataOf(after, w, h).data;
  let sum = 0, sq = 0, moved = 0;
  const n = w * h;
  for (let i = 0; i < a.length; i += 4){
    const dr = a[i] - b[i], dg = a[i+1] - b[i+1], db = a[i+2] - b[i+2];
    sum += Math.abs(dr) + Math.abs(dg) + Math.abs(db);
    sq  += dr*dr + dg*dg + db*db;
    if (dr || dg || db) moved++;
  }
  const mse = sq / (n * 3);
  return {
    avg: sum / (n * 3) / 255 * 100,
    moved: moved / n * 100,
    psnr: mse > 0 ? 10 * Math.log10(255 * 255 / mse) : Infinity,
    dist: hamming(dhash(before), dhash(after))
  };
}

// decode -> transform -> encode -> measure. Metadata is handled by the v1 code afterwards.
async function pixelPass(file, opt, seed, mime){
  const bmp = await createImageBitmap(file, {imageOrientation: "none"});
  const cv = renderPixels(bmp, opt, seed);
  const blob = await new Promise(res => cv.toBlob(res, mime, opt.quality / 100));
  if (!blob) throw new Error("the browser refused to encode this image");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const out = await createImageBitmap(blob, {imageOrientation: "none"});
  const stats = compare(bmp, out);            // measured against the real re-decoded output
  if (bmp.close) bmp.close();
  if (out.close) out.close();
  return {bytes, stats};
}

export { mulberry32, TIERS, KNOBS, renderPixels, dhash, hamming, compare, pixelPass };
