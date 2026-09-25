# Contributing to Scrub

Thanks for looking. Scrub is deliberately small and deliberately dependency-free — that
constraint is the feature, not an accident, and it is the one thing worth protecting.

## Ground rules

1. **No runtime dependencies. Ever.** The page must work offline, from a single file, with
   nothing fetched from a network. No fonts, no CDNs, no analytics, no frameworks. There is a
   test that fails if an external URL sneaks in.
2. **No build tooling beyond `build.mjs`.** It is ~100 lines of Node with no dependencies.
   If a change needs webpack, it needs a different project.
3. **Don't overstate what the tool does.** Especially around pixel changes and AI detection:
   the UI reports measured numbers and states its limits plainly. Keep it that way.
4. **Pixels are sacred on the lossless path.** Stripping must never re-encode.

## Quick start

```sh
git clone https://github.com/itsjustadarsh/scrub.git
cd scrub
npm run dev          # http://localhost:8080 — serves src/ with live ES modules
```

There is nothing to install. `npm install` does nothing, because there are no dependencies.

In development the browser loads `src/js/*.js` as real ES modules, so you edit a file and
reload. (This needs the dev server — ES modules don't load over `file://`.)

## The one thing that trips people up

`index.html` in the repo root is **generated**. It is the single self-contained file that
GitHub Pages serves, and it is committed on purpose. After changing anything in `src/`:

```sh
npm run build        # regenerates index.html
```

Commit the rebuilt `index.html` along with your source change. CI fails if you forget
(`npm run check` verifies the two are in sync).

## Project map

```
src/
  index.html          page markup, the SEO head, and all the prose/FAQ copy
  styles.css          every style; design tokens live at the top of the file
  js/
    bytes.js          concat, crc32, endian readers — shared by everything
    jpeg.js           JPEG segment walker: parse, strip, rebuild, inject
    png.js            PNG chunk walker: parse, strip, rebuild, inject
    exif-read.js      reads the TIFF tree (JPEG APP1 and PNG eXIf) plus XMP/IPTC/ICC/tEXt
    exif-write.js     builds a TIFF/EXIF block from scratch
    presets.js        camera presets and city coordinates
    pixels.js         the optional pixel transforms and the measurement code
    zip.js            minimal stored-mode ZIP writer, download helper
    main.js           entry point
    ui/
      dom.js          $, esc, kb, and the shared `state` object
      queue.js        the file list, before/after tables, compare widget
      intake.js       drag/paste/pick, and parsing each queued file
      forge.js        the metadata form: presets, randomiser, reading fields
      pixels-ui.js    tier buttons and the manual knobs
      run.js          the pipeline: pixels → strip → forge
      index.js        every event listener, in one place
build.mjs             bundles src/ into index.html
scripts/serve.mjs     the dev server
test/                 see below
index.html            GENERATED — do not edit by hand
```

## How to make common changes

**Add a camera preset** → `src/js/presets.js`. Add an entry to `PRESETS`. Ranges, not fixed
numbers: `fnum`, `iso` and `shutter` are arrays the randomiser draws from, and `focal` may be
a `[min, max]` pair for a zoom. Keep the combination physically plausible for that body —
there's a test that checks the apertures and shutter speeds parse and are in range.

**Add a city** → `CITIES` in the same file, as `["Name, CC", lat, lng]`.

**Change what gets stripped** → `PNG_KEEP` in `src/js/png.js` (chunks that affect rendering
are kept, everything else goes) or `stripJPEG` in `src/js/jpeg.js`.

**Support a new metadata record** → teach `readMeta` in `src/js/exif-read.js` to recognise it,
and add a fixture that contains it in `test/fixtures.py`.

**Add or tune a pixel tier** → `TIERS` in `src/js/pixels.js`, then the label in `TIER_NOTE`
in `src/js/ui/pixels-ui.js`. The browser test asserts the tiers stay ordered by fidelity.

**Change the page copy or the FAQ** → `src/index.html`. The FAQ structured data is generated
from the visible FAQ at build time, so you only write it once; a test checks every question and
answer appears verbatim on the page.

**Change styling** → `src/styles.css`. Colours are CSS variables defined three times: light on
`:root`, then the dark overrides under both `prefers-color-scheme` and `[data-theme="dark"]`.
Add new colours as tokens in all three places.

## Tests

```sh
npm test             # codecs + SEO, pure Node, ~100ms, no setup
npm run test:browser # pixel engine and the real UI, in headless Chrome
npm run test:verify  # independent check with Pillow (pip install pillow)
```

- **`test/codecs.test.mjs`** imports the modules in `src/` directly, so a failure points at a
  file. It covers stripping, forging, the shutter/GPS conversions, CRCs, ZIP structure and the
  preset sanity checks — including an assertion that the compressed image data is byte-identical
  after a strip, which is the lossless claim.
- **`test/seo.test.mjs`** checks the *built* `index.html`: head tags, structured data mirroring
  the visible FAQ, heading order, and that nothing is loaded from the network.
- **`test/browser/`** runs the pixel engine against a real canvas, and drives the shipped
  `index.html` in an iframe through actual clicks. It skips with exit 0 if no Chrome is found,
  so it never blocks you; CI requires it.
- **`test/fixtures.py`** regenerates the committed test images. You only need it if you're
  changing the fixtures, and it's the only thing that needs Pillow.

Please add a test with behaviour changes. If you're fixing a bug, a test that fails before your
fix is the most useful thing in the PR.

## Pull requests

- Branch from `main`, keep the change focused.
- Run `npm run build` and commit the regenerated `index.html`.
- Run `npm test` and `npm run test:browser`.
- Describe what you changed and how you checked it. Screenshots help for UI changes.

Bug reports are welcome too — the most useful ones include the image that triggered it, or at
least its format, origin (which camera or app made it) and what the before/after panel showed.
