/* Controls for the pixel tiers. The transforms themselves live in ../pixels.js. */
import { $, state } from "./dom.js";
import { markStale } from "./queue.js";
import { TIERS, KNOBS } from "../pixels.js";

export const TIER_IDS = ["off", "subtle", "medium", "heavy", "custom"];

const TIER_NOTE = {
  off:    "pixels pass through untouched — bit-identical output",
  subtle: "±1 level of noise, no geometry change — visually identical, every byte different",
  medium: "noise plus a small rescale and crop",
  heavy:  "grain, a tone curve and a fraction of a degree of rotation",
  custom: "your own settings"
};

export function writeKnobs(o){ KNOBS.forEach(k => $("x-" + k).value = o[k]); }

export function readKnobs(){
  const o = {};
  KNOBS.forEach(k => { const v = parseFloat($("x-" + k).value); o[k] = isFinite(v) ? v : 0; });
  o.quality = Math.min(100, Math.max(1, o.quality || 92));
  return o;
}

export function setTier(t){
  state.tier = t;
  TIER_IDS.forEach(k => $("p-" + k).setAttribute("aria-pressed", String(k === t)));
  $("pixpanel").hidden = t === "off";
  $("pixnote").textContent = TIER_NOTE[t];
  if (TIERS[t]) writeKnobs(TIERS[t]);
  if (t !== "off"){
    const o = readKnobs();
    $("pixwarn").textContent = "re-encodes the image — pixels change and this is no longer lossless" +
      (o.quality < 100 ? "; jpeg quality " + o.quality : "") +
      (o.noise > 0 || o.grain > 0 ? ". PNG files grow, because noise does not compress" : "") + ".";
  }
  markStale();
}

export function seed(){ return Math.abs(parseInt($("x-seed").value, 10) || 1) >>> 0; }
export function reseed(){ $("x-seed").value = Math.floor(Math.random() * 1e9); }
