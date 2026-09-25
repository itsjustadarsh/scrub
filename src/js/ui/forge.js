/* The "write believable metadata" form: presets, the randomiser,
   and reading the form back out as a plain object. */
import { $, esc, state, setStatus } from "./dom.js";
import { markStale } from "./queue.js";
import { PRESETS, CITIES, pick, between } from "../presets.js";

export function fillMenus(){
  $("preset").innerHTML = '<option value="">custom</option>' +
    PRESETS.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join("");
  $("f-city").innerHTML = CITIES.map((c, i) => `<option value="${i}">${esc(c[0])}</option>`).join("");
}

/* Presets carry ranges, not fixed numbers, so a preset still varies per roll
   while staying plausible for that body. */
export function applyPreset(p){
  $("f-make").value = p.make;
  $("f-model").value = p.model;
  $("f-lens").value = p.lens;
  $("f-software").value = p.software;
  $("f-fnum").value = pick(p.fnum);
  $("f-iso").value = p.iso.length > 1 ? Math.round(between(p.iso[0], p.iso[1]) / 50) * 50 || p.iso[0] : p.iso[0];
  $("f-shutter").value = pick(p.shutter);
  const fl = Array.isArray(p.focal) ? Math.round(between(p.focal[0], p.focal[1])) : p.focal;
  $("f-focal").value = fl;
  $("f-focal35").value = p.focal35 != null ? p.focal35 : fl;
}

export function randomize(){
  const p = pick(PRESETS);
  $("preset").value = p.id;
  applyPreset(p);
  const c = pick(CITIES.slice(1));
  $("f-gps").value = (c[1] + between(-0.02, 0.02)).toFixed(6) + ", " +
                     (c[2] + between(-0.02, 0.02)).toFixed(6);
  $("f-alt").value = Math.round(between(2, 320));
  const d = new Date(Date.now() - Math.floor(between(0, 900)) * 86400000
                                - Math.floor(between(0, 86400)) * 1000);
  setLocal("f-date", d);
  markStale();
  setStatus("rolled " + p.label + " · " + c[0]);
}

function setLocal(id, d){
  const t = new Date(d.getTime());
  t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
  $(id).value = t.toISOString().slice(0, 19);
}

export function setMode(forging){
  state.forging = forging;
  $("m-strip").setAttribute("aria-pressed", String(!forging));
  $("m-forge").setAttribute("aria-pressed", String(forging));
  $("forge").hidden = !forging;
  $("modenote").textContent = forging
    ? "strips everything first, then writes the metadata below in its place"
    : "removes every EXIF, GPS, XMP, IPTC, ICC and text record";
  if (forging && !$("f-make").value){ $("preset").value = PRESETS[0].id; applyPreset(PRESETS[0]); }
  if (forging && !$("f-date").value) setLocal("f-date", new Date());
  markStale();
}

export const FORGE_INPUTS = ["f-make","f-model","f-lens","f-software","f-shutter","f-fnum",
  "f-iso","f-focal","f-focal35","f-flash","f-gps","f-alt","f-date","f-artist","f-copy","f-suffix"];

/* Blank fields are omitted from the EXIF block rather than written empty. */
export function fields(){
  const v = id => $(id).value.trim();
  let gps = null;
  const raw = v("f-gps");
  if (raw){
    const m = raw.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (m){
      const lat = +m[1], lng = +m[2];
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) gps = {lat, lng};
    }
  }
  return {
    make: v("f-make"), model: v("f-model"), lens: v("f-lens"), software: v("f-software"),
    shutter: v("f-shutter"), fnumber: v("f-fnum"), iso: v("f-iso"),
    focal: v("f-focal"), focal35: v("f-focal35"), flash: v("f-flash"),
    altitude: v("f-alt"), artist: v("f-artist"), copyright: v("f-copy"),
    gps, suffix: v("f-suffix") || "_meta",
    when: $("f-date").value ? new Date($("f-date").value) : new Date()
  };
}
