// Lecture des numéros écrits sur les cartons, dans le navigateur.
// 1. seuillage local : l'encre ressort, quel que soit l'éclairage
// 2. on repère les taches en forme de chiffre et on les regroupe en numéros
// 3. chaque chiffre est lu par un petit réseau entraîné sur des chiffres manuscrits
//    (models/digits), Tesseract.js lit le numéro entier en second avis
// 4. on retient le N° carton connu le plus probable
// Expose window.Ocr = { prepare(file), read(prepared, codes, onProgress, opts), normalize(text) }.

(function () {
  const MAX_SIDE = 1600;       // taille de l'image analysée (px)
  const THRESHOLD_K = 0.3;     // un pixel est "encre" s'il est 30 % plus sombre que son voisinage
  const THRESHOLD_K_FINE = 0.15; // second passage, plus sensible : stylo fin, faible lumière
  const CROP_TEXT_H = 48;      // hauteur des chiffres envoyés à Tesseract (px)
  const TESS_MIN_CONF = 40;    // confiance Tesseract minimale
  const CODE_MIN_SCORE = 0.35; // probabilité moyenne par chiffre pour accepter un N° connu
  const MODEL_URL = 'models/digits/model.json?v=1.2';

  // Confusions fréquentes quand un chiffre est attendu
  const DIGIT_FIXES = { O: '0', D: '0', Q: '0', U: '0', I: '1', L: '1', J: '1', T: '7', S: '5', B: '8', Z: '2', G: '6', A: '4' };

  const normalize = (t) => String(t).toUpperCase().replace(/[^A-Z0-9]/g, '');

  // ---------------------------------------------------------------- moteurs

  let workerPromise = null;
  function getWorker(onProgress) {
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status !== 'recognizing text' && typeof m.progress === 'number') onProgress(m.progress * 0.25, 'Chargement du lecteur');
        },
      });
      workerPromise.catch(() => { workerPromise = null; });
    }
    return workerPromise;
  }

  // WebAssembly (rapide, sans compilation qui fige l'écran), sinon processeur.
  // Pas de WebGL : sur iPhone il recompile ses shaders à chaque nouveau nombre de chiffres.
  const WASM_DIR = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/';
  async function initBackend() {
    try {
      if (!tf.wasm) {
        await new Promise((ok, ko) => {
          const s = document.createElement('script');
          s.src = WASM_DIR + 'tf-backend-wasm.min.js';
          s.onload = ok;
          s.onerror = ko;
          document.head.appendChild(s);
        });
      }
      tf.wasm.setWasmPaths(WASM_DIR);
      if (await tf.setBackend('wasm')) return;
    } catch (err) {
      console.warn('WebAssembly indisponible', err);
    }
    await tf.setBackend('cpu');
  }

  let modelPromise = null;
  function getModel() {
    if (!window.tf) return Promise.resolve(null); // tfjs se charge encore : Tesseract seul cette fois
    if (!modelPromise) {
      modelPromise = initBackend().then(() => tf.loadLayersModel(MODEL_URL));
      modelPromise.catch((err) => { console.warn('Modèle chiffres indisponible', err); modelPromise = null; });
    }
    return modelPromise.catch(() => null);
  }

  // ---------------------------------------------------------------- image

  async function prepare(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, w, h);
      return { canvas, display: canvas.toDataURL('image/jpeg', 0.82), w, h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Niveaux de gris + moyennes locales (via image intégrale), calculés une fois par image
  // et partagés par les deux passages.
  const localCache = new WeakMap();
  function localMeans(canvas, radius) {
    const cached = localCache.get(canvas);
    if (cached && cached.radius === radius) return cached;
    const w = canvas.width, h = canvas.height;
    const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) gray[j] = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;

    const W = w + 1;
    const integral = new Float64Array(W * (h + 1));
    for (let y = 1; y <= h; y++) {
      let row = 0;
      for (let x = 1; x <= w; x++) {
        row += gray[(y - 1) * w + x - 1];
        integral[y * W + x] = integral[(y - 1) * W + x] + row;
      }
    }
    const r = radius || Math.max(8, Math.round(Math.max(w, h) / 40));
    const mean = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        mean[y * w + x] = (integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
      }
    }
    const result = { gray, mean, radius };
    localCache.set(canvas, result);
    return result;
  }

  // Masque "encre" : pixel plus sombre que son voisinage d'au moins k (seuillage local).
  function inkMask(canvas, radius, k = THRESHOLD_K) {
    const { gray, mean } = localMeans(canvas, radius);
    const ink = new Uint8Array(gray.length);
    const f = 1 - k;
    for (let i = 0; i < gray.length; i++) ink[i] = gray[i] < mean[i] * f ? 1 : 0;
    return { ink, gray };
  }

  // Le fond autour d'un numéro doit être clair et uni (étiquette, carton, papier) :
  // élimine les "chiffres" vus dans le décor (enceinte, câbles, ombres…).
  function onLightBackground(gray, ink, w, h, g) {
    const m = Math.round(g.h * 0.35);
    const x0 = Math.max(0, g.x - m), y0 = Math.max(0, g.y - m);
    const x1 = Math.min(w, g.x + g.w + m), y1 = Math.min(h, g.y + g.h + m);
    const step = Math.max(1, Math.round((x1 - x0) / 60));
    let bg = 0, bg2 = 0, nb = 0, fg = 0, nf = 0;
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        const v = gray[y * w + x];
        if (ink[y * w + x]) { fg += v; nf++; } else { bg += v; bg2 += v * v; nb++; }
      }
    }
    if (!nb || !nf) return false;
    const mean = bg / nb, std = Math.sqrt(Math.max(0, bg2 / nb - mean * mean));
    return mean >= 100 && mean - fg / nf >= 25 && std <= 45;
  }

  // ------------------------------------------------------------ segmentation

  // Taches d'encre connexes ayant une forme de caractère, regroupées en numéros.
  // Chaque numéro garde la liste de ses caractères (taches fusionnées si superposées).
  function findNumbers(ink, w, h, maxCharH) {
    const label = new Int32Array(w * h);
    const comps = [null];
    const stack = [];
    for (let s = 0; s < w * h; s++) {
      if (!ink[s] || label[s]) continue;
      const id = comps.length;
      let minx = w, miny = h, maxx = 0, maxy = 0, n = 0, edge = 0;
      label[s] = id;
      stack.push(s);
      while (stack.length) {
        const p = stack.pop();
        const x = p % w, y = (p - x) / w;
        n++;
        // pixel de bord : un voisin hors encre (sert à estimer l'épaisseur du trait)
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !ink[p - 1] || !ink[p + 1] || !ink[p - w] || !ink[p + w]) edge++;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (x > 0 && ink[p - 1] && !label[p - 1]) { label[p - 1] = id; stack.push(p - 1); }
        if (x < w - 1 && ink[p + 1] && !label[p + 1]) { label[p + 1] = id; stack.push(p + 1); }
        if (y > 0 && ink[p - w] && !label[p - w]) { label[p - w] = id; stack.push(p - w); }
        if (y < h - 1 && ink[p + w] && !label[p + w]) { label[p + w] = id; stack.push(p + w); }
      }
      comps.push({ id, x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, n, thick: (2 * n) / Math.max(1, edge) });
    }

    const isChar = (c) => {
      const ratio = c.w / c.h, fill = c.n / (c.w * c.h);
      // trait proportionné à la taille : écarte bords de feuille, câbles, contours fins et grands
      return c.h > h * 0.012 && c.h < h * maxCharH && ratio > 0.08 && ratio < 2.2 && fill > 0.03 && fill < 0.9
        && c.thick / c.h >= 0.025;
    };
    const chars = comps.slice(1).filter(isChar).sort((a, b) => a.x - b.x);
    // Traits horizontaux isolés : souvent la base d'un 2 (stylo levé), rattachés plus bas
    const strokes = comps.slice(1).filter((c) => !isChar(c) && c.w / c.h >= 1.6 && c.n >= 8 && c.w < w * 0.5);

    // Deux caractères voisins, de même taille et sur la même ligne = même numéro
    const parent = chars.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < chars.length; i++) {
      for (let j = i + 1; j < chars.length; j++) {
        const a = chars[i], b = chars[j];
        const hi = Math.max(a.h, b.h), lo = Math.min(a.h, b.h);
        if (b.x - (a.x + a.w) > 0.9 * hi) break;
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapY > 0.5 * lo && hi / lo < 1.7) parent[find(j)] = find(i);
      }
    }
    const groups = {};
    chars.forEach((c, i) => { (groups[find(i)] = groups[find(i)] || []).push(c); });

    return Object.values(groups).map((g) => {
      // Taches superposées horizontalement (barre d'un 5, d'un 7 barré…) = un seul caractère
      const glyphs = [];
      g.sort((a, b) => a.x - b.x).forEach((c) => {
        const last = glyphs[glyphs.length - 1];
        const overlapX = last ? Math.min(last.x + last.w, c.x + c.w) - Math.max(last.x, c.x) : -1;
        if (last && overlapX > 0.5 * Math.min(last.w, c.w)) {
          const x1 = Math.max(last.x + last.w, c.x + c.w), y1 = Math.max(last.y + last.h, c.y + c.h);
          last.x = Math.min(last.x, c.x); last.y = Math.min(last.y, c.y);
          last.w = x1 - last.x; last.h = y1 - last.y;
          last.ids.push(c.id);
        } else {
          glyphs.push({ x: c.x, y: c.y, w: c.w, h: c.h, ids: [c.id] });
        }
      });
      // Trait horizontal qui part du bas d'un caractère = partie de ce caractère
      glyphs.forEach((gl) => {
        strokes.forEach((s) => {
          if (s.used || s.h > 0.6 * gl.h) return;
          const top = s.y + s.h / 2;
          if (top < gl.y + 0.55 * gl.h || top > gl.y + 1.15 * gl.h) return;
          if (s.x < gl.x - 0.3 * gl.w || s.x > gl.x + 0.9 * gl.w) return;
          s.used = true;
          const x1 = Math.max(gl.x + gl.w, s.x + s.w), y1 = Math.max(gl.y + gl.h, s.y + s.h);
          gl.x = Math.min(gl.x, s.x); gl.y = Math.min(gl.y, s.y);
          gl.w = x1 - gl.x; gl.h = y1 - gl.y;
          gl.ids.push(s.id);
        });
      });
      const x0 = Math.min(...glyphs.map((c) => c.x)), y0 = Math.min(...glyphs.map((c) => c.y));
      const x1 = Math.max(...glyphs.map((c) => c.x + c.w)), y1 = Math.max(...glyphs.map((c) => c.y + c.h));
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, glyphs };
    }).filter((g) => g.glyphs.length <= 6).map((g) => ({ ...g, label }));
  }

  // Caractère → image 28×28 façon MNIST : tient dans 20×20, centré sur son centre de masse.
  function glyphTensorData(label, w, glyph) {
    const ids = new Set(glyph.ids);
    const s = 20 / Math.max(glyph.w, glyph.h);
    const gw = Math.max(1, Math.round(glyph.w * s)), gh = Math.max(1, Math.round(glyph.h * s));
    // réduction par moyenne de zone
    const small = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      const sy0 = glyph.y + Math.floor(y / s), sy1 = Math.max(sy0 + 1, glyph.y + Math.floor((y + 1) / s));
      for (let x = 0; x < gw; x++) {
        const sx0 = glyph.x + Math.floor(x / s), sx1 = Math.max(sx0 + 1, glyph.x + Math.floor((x + 1) / s));
        let sum = 0, n = 0;
        for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) { sum += ids.has(label[yy * w + xx]) ? 1 : 0; n++; }
        small[y * gw + x] = sum / n;
      }
    }
    let mx = 0, my = 0, m = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const v = small[y * gw + x]; mx += v * x; my += v * y; m += v; }
    const ox = Math.round(14 - (m ? mx / m : gw / 2)), oy = Math.round(14 - (m ? my / m : gh / 2));
    const out = new Float32Array(28 * 28);
    for (let y = 0; y < gh; y++) {
      const ty = y + oy;
      if (ty < 0 || ty > 27) continue;
      for (let x = 0; x < gw; x++) {
        const tx = x + ox;
        if (tx >= 0 && tx <= 27) out[ty * 28 + tx] = small[y * gw + x];
      }
    }
    // Trait fin (stylo) : on normalise puis on épaissit, le réseau a appris sur des traits de feutre
    let max = 0;
    for (let i = 0; i < 784; i++) if (out[i] > max) max = out[i];
    if (max > 0) for (let i = 0; i < 784; i++) out[i] = Math.min(1, out[i] / max);
    for (let pass = 0; pass < 2 && inkCount(out) < 70; pass++) dilate(out);
    return out;
  }

  const inkCount = (a) => a.reduce((n, v) => n + (v > 0.35 ? 1 : 0), 0);

  function dilate(a) {
    const src = a.slice();
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 28; x++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < 28 && xx >= 0 && xx < 28 && src[yy * 28 + xx] > m) m = src[yy * 28 + xx];
        }
        a[y * 28 + x] = m;
      }
    }
  }

  // Découpe un numéro en noir sur blanc, à la taille idéale pour Tesseract.
  function cropNumber(ink, w, h, box) {
    const pad = Math.round(box.h * 0.5);
    const scale = CROP_TEXT_H / box.h;
    const cw = Math.round((box.w + 2 * pad) * scale);
    const ch = Math.round((box.h + 2 * pad) * scale);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) {
      const sy = Math.floor(y / scale) + box.y - pad;
      for (let x = 0; x < cw; x++) {
        const sx = Math.floor(x / scale) + box.x - pad;
        const v = sx >= 0 && sy >= 0 && sx < w && sy < h && ink[sy * w + sx] ? 0 : 255;
        const p = (y * cw + x) * 4;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  function matchTesseract(text, codes) {
    if (codes.has(text)) return text;
    const fixed = text.split('').map((c) => DIGIT_FIXES[c] || c).join('');
    return codes.has(fixed) ? fixed : null;
  }

  // Probabilité moyenne (géométrique) qu'un numéro corresponde aux chiffres lus.
  function codeScore(code, probs) {
    let logSum = 0;
    for (let i = 0; i < code.length; i++) {
      const d = code.charCodeAt(i) - 48;
      if (d < 0 || d > 9) return 0;
      logSum += Math.log(Math.max(1e-6, probs[i][d]));
    }
    return Math.exp(logSum / code.length);
  }

  // ---------------------------------------------------------------- lecture

  // Renvoie [{x, y, w, h (fractions de l'image), raw, code|null}]
  // opts : { radius, maxCharH } pour les cadrages serrés (viseur de la caméra)
  async function read(prepared, codeList, onProgress = () => {}, opts = {}) {
    const codes = new Set(codeList.map(normalize).filter(Boolean));
    const chars = new Set('0123456789');
    codes.forEach((c) => [...c].forEach((ch) => chars.add(ch)));

    const model = await getModel();
    // Tesseract (lourd à démarrer sur téléphone) seulement s'il sert : réseau pas encore
    // chargé, ou N° carton contenant des lettres
    const useTess = !model || [...chars].some((c) => !/[0-9]/.test(c));
    let tessReady = null;
    const tess = () => tessReady || (tessReady = getWorker(onProgress).then(async (worker) => {
      await worker.setParameters({
        tessedit_char_whitelist: [...chars].join(''),
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
      });
      return worker;
    }));
    const worker = useTess ? tess : null;

    // Deux passages (feutre / stylo fin), puis fusion : une lecture par emplacement
    const { w, h } = prepared;
    const all = [];
    const passes = [THRESHOLD_K, THRESHOLD_K_FINE];
    for (let p = 0; p < passes.length; p++) {
      onProgress(0.25 + (0.75 * p) / passes.length, 'Repérage des numéros');
      await new Promise((r) => setTimeout(r, 0)); // laisse l'interface se mettre à jour
      const span = [0.25 + (0.75 * p) / passes.length, 0.25 + (0.75 * (p + 1)) / passes.length];
      all.push(...(await readPass(prepared, passes[p], p > 0, codes, worker, model, opts, (f, text) => onProgress(span[0] + f * (span[1] - span[0]), text))));
    }
    all.sort((a, b) => (b.keep ? 1 : 0) - (a.keep ? 1 : 0) || (b.code ? 1 : 0) - (a.code ? 1 : 0) || b.score - a.score);
    const candidates = [];
    all.forEach((f) => { if (!candidates.some((g) => overlap(f, g) > 0.3)) candidates.push(f); });

    // IA (si activée) : elle relit chaque zone repérée et tranche
    if (opts.ai && candidates.length) {
      try {
        onProgress(0.97, 'Vérification par l’IA');
        const readings = await opts.ai(prepared.canvas, candidates.slice(0, 48), codes);
        onProgress(1, 'Terminé');
        return candidates.slice(0, 48)
          .map((c, i) => ({ ...c, raw: readings[i], code: readings[i] && codes.has(readings[i]) ? readings[i] : null, ai: true }))
          .filter((c) => c.raw);
      } catch (err) {
        console.warn(err);
        opts.onAiError?.(err);
      }
    }
    onProgress(1, 'Terminé');
    return candidates.filter((c) => c.keep);
  }

  function overlap(a, b) {
    const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return (x * y) / Math.min(a.w * a.h, b.w * b.h);
  }

  async function readPass(prepared, k, strict, codes, worker, model, opts, onProgress) {
    const { w, h } = prepared;
    const { ink, gray } = inkMask(prepared.canvas, opts.radius, k);
    let groups = findNumbers(ink, w, h, opts.maxCharH || 0.4).filter((g) => onLightBackground(gray, ink, w, h, g));
    // Viseur : seulement les zones les plus centrales (lecture rapide à chaque image)
    if (opts.maxGroups) {
      const d = (g) => Math.hypot((g.x + g.w / 2) / w - 0.5, (g.y + g.h / 2) / h - 0.5);
      groups = groups.sort((a, b) => d(a) - d(b)).slice(0, opts.maxGroups);
    }

    // Réseau : tous les caractères de tous les numéros en un seul passage
    let probsByGroup = groups.map(() => null);
    if (model && groups.length) {
      const all = groups.flatMap((g) => g.glyphs.map((gl) => glyphTensorData(g.label, w, gl)));
      const flat = new Float32Array(all.length * 784);
      all.forEach((a, i) => flat.set(a, i * 784));
      // par paquets de 8, en rendant la main à l'écran entre deux paquets
      const out = [];
      for (let s = 0; s < all.length; s += 8) {
        const n = Math.min(8, all.length - s);
        const x = tf.tensor4d(flat.subarray(s * 784, (s + n) * 784), [n, 28, 28, 1]);
        const y = model.predict(x);
        out.push(...(await y.array()));
        tf.dispose([x, y]);
        await new Promise((r) => setTimeout(r, 0));
      }
      let k = 0;
      probsByGroup = groups.map((g) => g.glyphs.map(() => out[k++]));
    }

    const found = [];
    for (let i = 0; i < groups.length; i++) {
      onProgress(i / groups.length, `Lecture ${i + 1} / ${groups.length}`);
      const g = groups[i];
      const probs = probsByGroup[i];

      // Candidats parmi les N° connus de même longueur, classés par le réseau
      let best = null, bestScore = 0, second = 0;
      if (probs) {
        codes.forEach((c) => {
          if (c.length !== probs.length) return;
          const s = codeScore(c, probs);
          if (s > bestScore) { second = bestScore; bestScore = s; best = c; } else if (s > second) second = s;
        });
      }
      const netText = probs ? probs.map((p) => p.indexOf(Math.max(...p))).join('') : '';
      const netConf = probs ? Math.exp(probs.reduce((s, p) => s + Math.log(Math.max(...p)), 0) / probs.length) : 0;

      // Second avis : Tesseract sur le numéro entier
      let tessText = '', tessCode = null;
      const sure = best && bestScore > 0.8 && bestScore > 4 * second;
      if (!sure && !opts.ai && worker) {
        const { data } = await (await worker()).recognize(cropNumber(ink, w, h, g));
        if (data.confidence >= TESS_MIN_CONF) {
          tessText = normalize(data.text);
          tessCode = tessText ? matchTesseract(tessText, codes) : null;
        }
      }

      let code = null;
      if (strict) {
        // passage sensible : seulement les lectures très sûres du réseau
        if (best && bestScore >= 0.6 && bestScore > 3 * second) code = best;
      } else if (best && bestScore >= CODE_MIN_SCORE && bestScore > 1.5 * second) code = best;
      else if (tessCode && (!probs || probs.length !== tessCode.length || codeScore(tessCode, probs) > 0.02)) code = tessCode;
      else if (best && tessCode === best) code = best;

      const raw = code || netText || tessText;
      // Numéro inconnu : affiché seulement si le réseau est sûr et que Tesseract est d'accord
      const keep = !!code || (raw.length <= 4 && netConf >= 0.9 && tessText === netText);
      const score = code ? (code === best ? bestScore : 0.5) : netConf;
      found.push({ x: g.x / w, y: g.y / h, w: g.w / w, h: g.h / h, raw, code, score, keep });
    }
    return found;
  }

  // Préchargement du réseau peu après l'ouverture de l'app : le premier scan est immédiat
  const warm = () => (window.tf ? getModel() : setTimeout(warm, 500));
  window.addEventListener('load', () => setTimeout(warm, 800));

  window.Ocr = { prepare, read, normalize, _debug: { inkMask, findNumbers, onLightBackground, glyphTensorData } };
})();
