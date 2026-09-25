/* The file list: rendering rows, the before/after tables, and the
   pixel compare widget. Also owns invalidating results when settings change. */
import { $, esc, kb, state } from "./dom.js";

function table(rows){
  if (!rows || !rows.length) return '<div class="none">clean — nothing embedded</div>';
  return '<table class="tbl">' + rows.map(r =>
    `<tr><td>${esc(r.name)}</td><td>${esc(r.value)}</td></tr>`).join("") + "</table>";
}

/* The honest readout: what the pixel pass actually did, measured. */
function statsBlock(it){
  const s = it.stats;
  if (!s) return "";
  const psnr = s.psnr === Infinity ? "∞" : s.psnr.toFixed(1);
  const verdict = s.dist === 0
    ? "unchanged — perceptual matching still finds this image"
    : s.dist < 6 ? "barely moved — perceptual matching will likely still find this image"
    : "moved — perceptual matching is less likely to match the original";
  return `<div class="cmp">
    <div class="stage" data-cmp>
      <img src="${it.url}" alt="original">
      <img class="after" src="${it.outUrl}" alt="processed" style="clip-path:inset(0 0 0 50%)">
    </div>
    <input type="range" min="0" max="100" value="50" aria-label="Compare original and processed">
    <div class="legend"><span>original</span><span>processed</span></div>
    <div class="stats">
      average pixel change <b>${s.avg.toFixed(3)}%</b> · pixels changed after re-encode <b>${s.moved.toFixed(1)}%</b> · PSNR <b>${psnr} dB</b><br>
      difference-hash distance <b>${s.dist}/64</b> <span class="note">— ${verdict}</span>
    </div>
  </div>`;
}

export function render(){
  const q = $("queue");
  q.hidden = !state.items.length;
  q.innerHTML = state.items.map((it, i) => {
    const n = it.before ? it.before.length : 0;
    const after = it.after ? it.after.length : null;
    const badge = it.err ? `<span class="pill">error</span>`
      : after === null ? `<span class="pill">${n} record${n === 1 ? "" : "s"}</span>`
      : `<span class="pill">${n}</span><span class="pill ${after ? "" : "go"}">→ ${after}</span>`;
    const px = it.stats ? `<span class="pill px">Δ ${it.stats.avg.toFixed(2)}%</span>` : "";
    const size = it.out ? kb(it.file.size) + " → " + kb(it.out.length) : kb(it.file.size);
    const dims = it.dims ? it.dims[0] + "×" + it.dims[1] + " · " : "";
    return `<div class="item">
      <div class="head">
        <img class="thumb" src="${it.url}" alt="">
        <div class="meta">
          <div class="name">${esc(it.out ? it.outName : it.name)}</div>
          <div class="dim">${it.err ? `<em>${esc(it.err)}</em>` : dims + size}</div>
        </div>
        ${px}${badge}
        <button class="mini" data-x="${i}">${it.open ? "hide" : "inspect"}</button>
        ${it.out ? `<button class="mini" data-d="${i}">download</button>` : ""}
      </div>
      <div class="body" ${it.open ? "" : "hidden"}>
        ${statsBlock(it)}
        <div class="cols">
          <div class="col"><div class="chead">before</div>${table(it.before)}</div>
          <div class="col"><div class="chead">after</div>${it.after ? table(it.after) : '<div class="dim">not processed yet</div>'}</div>
        </div>
      </div>
    </div>`;
  }).join("");
  wire(q);
}

/* Rows are re-rendered wholesale, so handlers are re-attached each time. */
function wire(q){
  q.querySelectorAll("[data-x]").forEach(b => b.onclick = () => {
    const it = state.items[+b.dataset.x];
    it.open = !it.open;
    render();
  });
  q.querySelectorAll("[data-d]").forEach(b => b.onclick = () => {
    const it = state.items[+b.dataset.d];
    downloadOne(it);
  });
  q.querySelectorAll(".cmp").forEach(c => {
    const stage = c.querySelector("[data-cmp]"), shot = c.querySelector(".after"), rng = c.querySelector("input");
    const at = p => { shot.style.clipPath = "inset(0 0 0 " + p + "%)"; rng.value = p; };
    rng.oninput = () => at(rng.value);
    stage.onpointermove = e => {
      const r = stage.getBoundingClientRect();
      at(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)));
    };
  });
}

/* Set by init() — keeps this module from importing the zip/save layer. */
let downloadOne = () => {};
export function onDownload(fn){ downloadOne = fn; }

/* Any settings change makes existing results wrong, so throw them away. */
export function markStale(){
  if (!state.processed) return;
  state.items.forEach(i => {
    i.out = null; i.after = null; i.stats = null;
    if (i.outUrl){ URL.revokeObjectURL(i.outUrl); i.outUrl = null; }
  });
  state.processed = false;
  $("zip").disabled = true;
  render();
}
