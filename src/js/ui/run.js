/* The pipeline, in order: optional pixel pass, then strip, then optional forge.
   Everything here is pure orchestration — the real work lives in the codecs. */
import { $, state, setStatus } from "./dom.js";
import { render } from "./queue.js";
import { fields } from "./forge.js";
import { readKnobs, seed } from "./pixels-ui.js";
import { parseJPEG, buildJPEG, stripJPEG, injectJPEG } from "../jpeg.js";
import { parsePNG, buildPNG, stripPNG, injectPNG } from "../png.js";
import { readMeta } from "../exif-read.js";
import { buildTIFF } from "../exif-write.js";
import { pixelPass } from "../pixels.js";

function rename(name, suffix, ext){
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name) + suffix + "." + ext;
}

export async function runProcess(){
  if (state.busy) return;
  const forging = state.forging;
  const f = forging ? fields() : null;
  if (f && isNaN(f.when.getTime())) return setStatus("that date isn't valid");

  const opt = state.tier === "off" ? null : readKnobs();
  const key = seed();
  const suffix = forging ? f.suffix : "_clean";
  const todo = state.items.filter(i => i.ready);

  state.busy = true;
  $("go").disabled = true;
  let done = 0, removed = 0;

  for (const it of todo){
    setStatus("processing " + (done + 1) + "/" + todo.length + " — " + it.name);
    await new Promise(r => setTimeout(r, 0));
    try{
      let source = it.parsed;
      it.stats = null;
      if (opt){
        const res = await pixelPass(it.file, opt, key, it.mime);
        it.stats = res.stats;
        // the re-encode produced a brand new file — strip what we just made, not the original
        source = it.kind === "jpeg" ? parseJPEG(res.bytes) : parsePNG(res.bytes);
      }
      const tiff = forging ? buildTIFF(f, f.when, it.dims) : null;
      if (it.kind === "jpeg"){
        let segs = stripJPEG(source.segs);
        if (forging) segs = injectJPEG(segs, tiff);
        it.out = buildJPEG(segs);
        it.outName = rename(it.name, suffix, "jpg");
        it.outType = "image/jpeg";
      } else {
        let chunks = stripPNG(source);
        if (forging) chunks = injectPNG(chunks, tiff, f, f.when);
        it.out = buildPNG(chunks);
        it.outName = rename(it.name, suffix, "png");
        it.outType = "image/png";
      }
      it.after = readMeta(it.kind, it.kind === "jpeg" ? parseJPEG(it.out) : parsePNG(it.out));
      if (it.outUrl) URL.revokeObjectURL(it.outUrl);
      it.outUrl = URL.createObjectURL(new Blob([it.out], {type: it.outType}));
      removed += it.before.length;
      done++;
    } catch(e){ it.err = e.message; }
    render();
    await new Promise(r => setTimeout(r, 0));
  }

  state.busy = false;
  state.processed = true;
  $("go").disabled = false;
  $("zip").disabled = done < 1;
  render();
  setStatus(done + " processed · " + removed + " metadata record" + (removed === 1 ? "" : "s") +
    " destroyed" + (forging ? " · fresh EXIF written" : "") +
    (opt ? " · pixels altered (" + state.tier + ")" : ""));
}
