/* ============================================================
   Presets — coherent bundles so the numbers hang together
   ============================================================ */
const PRESETS = [
  {id:"iphone16", label:"Apple iPhone 16 Pro", make:"Apple", model:"iPhone 16 Pro", software:"18.1",
   lens:"iPhone 16 Pro back triple camera 6.765mm f/1.78",
   focal:6.765, focal35:24, fnum:[1.78], iso:[50, 400], shutter:["1/1000","1/500","1/250","1/120","1/60"]},
  {id:"iphone13", label:"Apple iPhone 13", make:"Apple", model:"iPhone 13", software:"17.6.1",
   lens:"iPhone 13 back dual wide camera 5.1mm f/1.6",
   focal:5.1, focal35:26, fnum:[1.6], iso:[32, 800], shutter:["1/900","1/400","1/121","1/60","1/30"]},
  {id:"pixel9", label:"Google Pixel 9 Pro", make:"Google", model:"Pixel 9 Pro", software:"HDR+ 1.0.720483519",
   lens:"Pixel 9 Pro back camera 6.9mm f/1.68",
   focal:6.9, focal35:24, fnum:[1.68], iso:[41, 640], shutter:["1/1200","1/500","1/180","1/90","1/45"]},
  {id:"r5", label:"Canon EOS R5", make:"Canon", model:"Canon EOS R5", software:"Adobe Lightroom 14.1 (Macintosh)",
   lens:"RF24-70mm F2.8 L IS USM",
   focal:[24, 70], focal35:null, fnum:[2.8, 4, 5.6, 8], iso:[100, 3200],
   shutter:["1/2000","1/500","1/250","1/125","1/60"]},
  {id:"a7iv", label:"Sony α7 IV", make:"SONY", model:"ILCE-7M4", software:"Capture One 16.5",
   lens:"FE 35mm F1.4 GM", focal:35, focal35:35, fnum:[1.4, 2, 2.8, 4], iso:[100, 6400],
   shutter:["1/4000","1/1000","1/250","1/80","1/40"]},
  {id:"z6", label:"Nikon Z6 III", make:"NIKON CORPORATION", model:"NIKON Z 6III", software:"Ver.1.10",
   lens:"NIKKOR Z 24-120mm f/4 S", focal:[24, 120], focal35:null, fnum:[4, 5.6, 8], iso:[100, 4000],
   shutter:["1/1600","1/400","1/200","1/100","1/50"]},
  {id:"xt5", label:"Fujifilm X-T5", make:"FUJIFILM", model:"X-T5", software:"Digital Camera X-T5 Ver3.00",
   lens:"XF33mmF1.4 R LM WR", focal:33, focal35:50, fnum:[1.4, 2, 2.8, 5.6], iso:[125, 3200],
   shutter:["1/2000","1/640","1/250","1/125","1/60"]},
  {id:"q3", label:"Leica Q3", make:"Leica Camera AG", model:"LEICA Q3", software:"Adobe Photoshop 26.0 (Macintosh)",
   lens:"Summilux 1:1.7/28 ASPH.", focal:28, focal35:28, fnum:[1.7, 2.8, 4, 5.6], iso:[100, 1600],
   shutter:["1/2000","1/500","1/125","1/60","1/30"]},
  {id:"film", label:"Film scan — Epson V600", make:"EPSON", model:"Perfection V600 Photo",
   software:"Epson Scan 3.9.3.0", lens:"Kodak Portra 400", focal:50, focal35:50,
   fnum:[2, 2.8, 4, 8], iso:[400], shutter:["1/250","1/125","1/60"]}
];
const CITIES = [
  ["—", null, null],
  ["San Francisco, US", 37.7749, -122.4194], ["New York, US", 40.7128, -74.0060],
  ["London, UK", 51.5074, -0.1278], ["Paris, FR", 48.8566, 2.3522],
  ["Berlin, DE", 52.5200, 13.4050], ["Lisbon, PT", 38.7223, -9.1393],
  ["Reykjavík, IS", 64.1466, -21.9426], ["Tokyo, JP", 35.6762, 139.6503],
  ["Kyoto, JP", 35.0116, 135.7681], ["Seoul, KR", 37.5665, 126.9780],
  ["Bengaluru, IN", 12.9716, 77.5946], ["Mumbai, IN", 19.0760, 72.8777],
  ["Delhi, IN", 28.6139, 77.2090], ["Singapore, SG", 1.3521, 103.8198],
  ["Dubai, AE", 25.2048, 55.2708], ["Sydney, AU", -33.8688, 151.2093],
  ["Cape Town, ZA", -33.9249, 18.4241], ["São Paulo, BR", -23.5505, -46.6333],
  ["Mexico City, MX", 19.4326, -99.1332], ["Toronto, CA", 43.6532, -79.3832]
];
const pick = a => a[Math.floor(Math.random() * a.length)];
const between = (a, b) => a + Math.random() * (b - a);

export { PRESETS, CITIES, pick, between };
