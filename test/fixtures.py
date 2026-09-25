#!/usr/bin/env python3
"""Regenerate test/fixtures/. Requires Pillow: pip install pillow

The fixtures are committed, so you only need to run this if you want to change
them. `npm test` uses the committed files and needs nothing but Node.
"""
from PIL import Image, ImageFilter, ImageDraw, PngImagePlugin
import math, random, os

random.seed(7)

def gradient(w, h):
    """Harsh synthetic content — adversarial for JPEG and for resampling."""
    im = Image.new("RGB", (w, h)); px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = ((x*255)//w, (y*255)//h, (x*y) % 255)
    return im

def photo(w, h):
    """Photo-like content: smooth gradients, soft shapes, fine grain."""
    im = Image.new("RGB", (w, h)); px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (int(120+90*math.sin(x/160)+40*math.cos(y/110)),
                        int(110+70*math.sin((x+y)/180)+30*math.sin(y/55)),
                        int(100+60*math.cos(x/120)+50*math.sin(y/140)))
    n = Image.effect_noise((w, h), 36).convert("L").filter(ImageFilter.GaussianBlur(2.0))
    im = Image.blend(im, Image.merge("RGB", (n, n, n)), 0.25).filter(ImageFilter.GaussianBlur(0.6))
    d = ImageDraw.Draw(im, "RGBA")
    for _ in range(10):
        x, y = random.randint(0, w), random.randint(0, h); r = random.randint(30, 120)
        d.ellipse([x-r, y-r, x+r, y+r],
                  fill=(random.randint(0,255), random.randint(0,255), random.randint(0,255), 46))
    im = im.filter(ImageFilter.GaussianBlur(1.0))
    g = Image.effect_noise((w, h), 7).convert("L")
    return Image.blend(im, Image.merge("RGB", (g, g, g)), 0.06)

exif = Image.Exif()
exif[0x010F] = "ACME"; exif[0x0110] = "SecretCam 9000"
exif[0x0131] = "TotallyRealSoftware 1.0"; exif[0x013B] = "Real Name Here"
exif[0x8298] = "(c) 2024 someone"; exif[0x0132] = "2024:03:04 11:22:33"; exif[0x0112] = 1
exif[0x8825] = {0: b"\x02\x03\x00\x00", 1: "N", 2: (51.0, 30.0, 26.0), 3: "W",
                4: (0.0, 7.0, 39.0), 5: 0, 6: 35.0}
exif[0x8769] = {0x829A: 0.008, 0x829D: 2.8, 0x8827: 400,
                0x9003: "2024:03:04 11:22:33", 0x920A: 50.0}
blob = exif.tobytes()

here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
os.makedirs(here, exist_ok=True)
os.chdir(here)

g = gradient(320, 240)
g.save("meta.jpg", quality=88, exif=blob, comment=b"a jpeg COM marker")
g.save("meta-progressive.jpg", quality=80, progressive=True, exif=blob)

info = PngImagePlugin.PngInfo()
info.add_text("Author", "Real Name Here")
info.add_text("Comment", "location: home")
info.add_itxt("Description", "utf8 é text")
info.add_text("Zipped", "x" * 400, zip=True)
g.save("meta.png", pnginfo=info, exif=blob)
g.convert("P", palette=Image.ADAPTIVE).save("palette.png", pnginfo=info)

photo(480, 360).save("photo.jpg", quality=92)
photo(320, 240).save("photo.png")

for f in sorted(os.listdir(".")):
    print(f"{f:24} {os.path.getsize(f):>8}")
