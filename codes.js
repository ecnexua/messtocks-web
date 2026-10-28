// Lecture des étiquettes imprimées (QR et Code 128 "MS:<N° carton>") avec ZXing (WebAssembly).
// Plusieurs codes par photo, avec leur position. Les autres codes (emballages) sont ignorés.
// Expose window.Codes = { read(source) } → [{ code, x, y, w, h (fractions) }].
// source : canvas, ou image (Blob/File) lue en pleine résolution.

(function () {
  const URL_JS = 'https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.5/dist/iife/reader/index.js';
  const OPTIONS = { formats: ['QRCode', 'Code128'], tryHarder: true, maxNumberOfSymbols: 64 };
  const TILE = 1100; // côté d'une tuile (px) : peu de codes par tuile = moins de confusions

  let ready = null;
  function load() {
    if (!ready) {
      ready = new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = URL_JS;
        s.onload = ok;
        s.onerror = () => { ready = null; ko(new Error('Lecteur de codes indisponible (réseau ?)')); };
        document.head.appendChild(s);
      });
    }
    return ready;
  }

  async function toCanvas(source) {
    if (source instanceof HTMLCanvasElement) return source;
    const bitmap = await createImageBitmap(source);
    const c = document.createElement('canvas');
    c.width = bitmap.width;
    c.height = bitmap.height;
    c.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return c;
  }

  // Lit une zone de l'image ; renvoie les codes en coordonnées de l'image entière
  async function readRegion(ctx, x, y, w, h) {
    const results = await ZXingWASM.readBarcodes(ctx.getImageData(x, y, w, h), OPTIONS);
    const out = [];
    for (const r of results) {
      const m = /^MS:(.+)$/.exec(r.text || '');
      if (!r.isValid || !m) continue;
      const p = r.position;
      const xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x].map((v) => v + x);
      const ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y].map((v) => v + y);
      out.push({ code: m[1].toUpperCase().replace(/[^A-Z0-9]/g, ''), x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
    }
    return out;
  }

  async function read(source) {
    await load();
    const canvas = await toCanvas(source);
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // image entière, puis tuiles qui se chevauchent d'un tiers
    const all = await readRegion(ctx, 0, 0, W, H);
    if (Math.max(W, H) > TILE * 1.2) {
      const step = Math.round(TILE * 0.66);
      for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
          const w = Math.min(TILE, W - x), h = Math.min(TILE, H - y);
          if (w < TILE / 3 || h < TILE / 3) continue;
          all.push(...(await readRegion(ctx, x, y, w, h)));
          await new Promise((r) => setTimeout(r, 0)); // laisse respirer l'écran
        }
      }
    }

    // un même code lu dans plusieurs tuiles = une seule étiquette
    const found = [];
    for (const c of all) {
      const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2, size = Math.max(c.x1 - c.x0, c.y1 - c.y0);
      if (found.some((f) => Math.hypot(f.cx - cx, f.cy - cy) < size * 0.5)) continue;
      found.push({ ...c, cx, cy });
    }
    return found.map((c) => ({ code: c.code, x: c.x0 / W, y: c.y0 / H, w: (c.x1 - c.x0) / W, h: (c.y1 - c.y0) / H }));
  }

  // Préchargement (le moteur pèse ~1 Mo) peu après l'ouverture de l'app
  window.addEventListener('load', () => setTimeout(() => load().catch(() => {}), 1500));

  window.Codes = { read };
})();
