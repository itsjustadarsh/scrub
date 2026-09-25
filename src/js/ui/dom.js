/* Tiny DOM helpers and the one piece of shared mutable state.
   Everything else in ui/ reads and writes `state`. */

export const $ = id => document.getElementById(id);

export const esc = s => String(s).replace(/[&<>"]/g,
  c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

export const kb = n => n < 1024 ? n + " B"
  : n < 1048576 ? (n/1024).toFixed(1) + " KB"
  : (n/1048576).toFixed(2) + " MB";

export const setStatus = s => { $("status").textContent = s; };

export const state = {
  items: [],        // one entry per queued file — see intake.js for its shape
  forging: false,   // STRIP vs STRIP + FORGE
  tier: "off",      // pixel tier: off | subtle | medium | heavy | custom
  processed: false, // is what's on screen current?
  busy: false
};
