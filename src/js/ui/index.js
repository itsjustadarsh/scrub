/* Wiring. Every event listener in the app is registered here, once,
   so there is a single place to look when a control misbehaves. */
import { $, state, setStatus } from "./dom.js";
import { render, markStale, onDownload } from "./queue.js";
import { add, clearAll } from "./intake.js";
import { fillMenus, applyPreset, randomize, setMode, fields, FORGE_INPUTS } from "./forge.js";
import { setTier, writeKnobs, reseed, TIER_IDS } from "./pixels-ui.js";
import { runProcess } from "./run.js";
import { PRESETS, CITIES } from "../presets.js";
import { TIERS, KNOBS } from "../pixels.js";
import { zip, save } from "../zip.js";

export function init(){
  onDownload(it => save(it.out, it.outName, it.outType));

  /* theme — follows the system until the user overrides it */
  $("theme").onclick = () => {
    const now = document.documentElement.getAttribute("data-theme");
    const dark = now ? now === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "light" : "dark");
  };

  /* forge controls */
  fillMenus();
  $("preset").onchange = e => {
    const p = PRESETS.find(x => x.id === e.target.value);
    if (p) applyPreset(p);
    markStale();
  };
  $("f-city").onchange = e => {
    const c = CITIES[+e.target.value];
    if (c && c[1] != null) $("f-gps").value = c[1].toFixed(4) + ", " + c[2].toFixed(4);
    markStale();
  };
  $("roll").onclick = randomize;
  $("m-strip").onclick = () => setMode(false);
  $("m-forge").onclick = () => setMode(true);
  FORGE_INPUTS.forEach(id => $(id).oninput = markStale);

  /* pixel controls — touching any knob moves you to the custom tier */
  TIER_IDS.forEach(k => $("p-" + k).onclick = () => setTier(k));
  KNOBS.forEach(k => $("x-" + k).oninput = () => {
    if (state.tier !== "custom") setTier("custom"); else markStale();
  });
  $("x-seed").oninput = markStale;
  $("reseed").onclick = () => { reseed(); markStale(); setStatus("new seed"); };

  /* intake: click, drag, paste */
  const drop = $("drop"), picker = $("picker");
  drop.onclick = () => picker.click();
  drop.onkeydown = e => {
    if (e.key === "Enter" || e.key === " "){ e.preventDefault(); picker.click(); }
  };
  picker.onchange = e => { add(e.target.files); picker.value = ""; };
  ["dragenter","dragover"].forEach(t => addEventListener(t, e => {
    e.preventDefault(); drop.classList.add("hot");
  }));
  addEventListener("dragleave", e => { if (e.relatedTarget === null) drop.classList.remove("hot"); });
  addEventListener("drop", e => {
    e.preventDefault(); drop.classList.remove("hot");
    if (e.dataTransfer) add(e.dataTransfer.files);
  });
  addEventListener("paste", e => {
    if (e.clipboardData && e.clipboardData.files.length) add(e.clipboardData.files);
  });

  /* actions */
  $("go").onclick = runProcess;
  $("zip").onclick = () => {
    const files = state.items.filter(i => i.out).map(i => ({name: i.outName, data: i.out}));
    if (!files.length) return;
    save(zip(files), "scrubbed.zip", "application/zip");
    setStatus("zipped " + files.length + " file" + (files.length > 1 ? "s" : ""));
  };
  $("clear").onclick = clearAll;

  /* starting state */
  reseed();
  writeKnobs(TIERS.subtle);
  setMode(false);
  setTier("off");
  setStatus("");
  render();
}
