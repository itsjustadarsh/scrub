/* Getting files into the queue and reading what they're carrying. */
import { $, state, setStatus } from "./dom.js";
import { render } from "./queue.js";
import { parseJPEG, jpegSize } from "../jpeg.js";
import { parsePNG, pngSize } from "../png.js";
import { readMeta } from "../exif-read.js";

const IMAGE = f => /image\/(jpeg|png)/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name);

export function add(fileList){
  const incoming = [...fileList].filter(IMAGE);
  const skipped = fileList.length - incoming.length;
  for (const file of incoming)
    state.items.push({file, name: file.name, url: URL.createObjectURL(file), open: false, ready: false});
  state.processed = false;
  render();
  setStatus(incoming.length
    ? incoming.length + " file" + (incoming.length > 1 ? "s" : "") + " queued" +
      (skipped ? " · " + skipped + " ignored (not JPEG/PNG)" : "")
    : "nothing usable in that drop");
  scan();
}

/* Parses each queued file, yielding between them so the page stays responsive. */
export async function scan(){
  for (const it of state.items){
    if (it.ready || it.err) continue;
    try{
      const buf = new Uint8Array(await it.file.arrayBuffer());
      it.bytes = buf;
      if (buf[0] === 0xFF && buf[1] === 0xD8){
        it.kind = "jpeg"; it.mime = "image/jpeg";
        it.parsed = parseJPEG(buf);
        it.dims = jpegSize(it.parsed.segs);
      } else if (buf[0] === 137 && buf[1] === 80){
        it.kind = "png"; it.mime = "image/png";
        it.parsed = parsePNG(buf);
        it.dims = pngSize(it.parsed);
      } else throw new Error("not a JPEG or PNG");
      it.before = readMeta(it.kind, it.parsed);
      it.ready = true;
    } catch(e){ it.err = e.message; }
    render();
    await new Promise(r => setTimeout(r, 0));
  }
  $("go").disabled = state.busy || !state.items.some(i => i.ready);
  $("clear").disabled = !state.items.length;
}

export function clearAll(){
  state.items.forEach(i => {
    URL.revokeObjectURL(i.url);
    if (i.outUrl) URL.revokeObjectURL(i.outUrl);
  });
  state.items = [];
  state.processed = false;
  $("zip").disabled = $("go").disabled = $("clear").disabled = true;
  render();
  setStatus("");
}
