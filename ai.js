// Vérification des numéros par une IA de vision (Groq), appelée depuis le navigateur.
// Seuls les extraits de photo autour des numéros repérés sont envoyés, en une mosaïque.
// La clé reste sur l'appareil (localStorage), hors des sauvegardes.
// Expose window.Ai = { settings(), save(s), enabled(), readTiles(canvas, boxes, codes), test(), DEFAULT_MODEL }.

(function () {
  const STORE_KEY = 'messtocks.ai';
  const DEFAULT_MODEL = 'qwen/qwen3.8-27b';
  const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
  const TILES_PER_REQUEST = 24;

  function settings() {
    try {
      return { on: false, key: '', model: DEFAULT_MODEL, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
    } catch (e) {
      return { on: false, key: '', model: DEFAULT_MODEL };
    }
  }

  function save(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* stockage indisponible */ }
  }

  const enabled = () => { const s = settings(); return s.on && !!s.key; };

  let pausedUntil = 0;      // après un refus pour quota (429)
  let noReasoning = true;   // demande une réponse directe, sans raisonnement, si le modèle l'accepte

  async function call(content, maxTokens) {
    const s = settings();
    const body = {
      model: s.model || DEFAULT_MODEL,
      messages: [{ role: 'user', content }],
      temperature: 0,
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
    };
    if (noReasoning) body.reasoning_effort = 'none';
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + s.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 400 && noReasoning && /reasoning/i.test(text)) {
        noReasoning = false;
        return call(content, maxTokens);
      }
      if (res.status === 429) pausedUntil = Date.now() + 15000;
      const msg = res.status === 401 ? 'clé API refusée' : res.status === 429 ? 'quota atteint, réessai dans 15 s' : `erreur ${res.status}`;
      throw new Error(`Groq : ${msg}`);
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  function parseJson(text) {
    const t = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    const m = t.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : t);
  }

  // Mosaïque : une tuile par zone repérée, avec un bandeau numéroté au-dessus.
  function mosaic(canvas, boxes) {
    const COLS = Math.min(4, boxes.length), TW = 256, TH = 160, HEAD = 26;
    const rows = Math.ceil(boxes.length / COLS);
    const out = document.createElement('canvas');
    out.width = COLS * TW;
    out.height = rows * (TH + HEAD);
    const x = out.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, out.width, out.height);
    boxes.forEach((b, i) => {
      const tx = (i % COLS) * TW, ty = Math.floor(i / COLS) * (TH + HEAD);
      x.fillStyle = '#111111';
      x.fillRect(tx, ty, TW, HEAD);
      x.fillStyle = '#ffffff';
      x.font = 'bold 16px sans-serif';
      x.textBaseline = 'middle';
      x.fillText(`TILE ${i + 1}`, tx + 8, ty + HEAD / 2);
      // zone repérée + marge, en pixels de l'image
      const bw = b.w * canvas.width, bh = b.h * canvas.height;
      const m = Math.max(bh, bw * 0.25) * 0.45;
      const sx = Math.max(0, b.x * canvas.width - m), sy = Math.max(0, b.y * canvas.height - m);
      const sw = Math.min(canvas.width - sx, bw + 2 * m), sh = Math.min(canvas.height - sy, bh + 2 * m);
      const scale = Math.min((TW - 8) / sw, (TH - 8) / sh);
      const dw = sw * scale, dh = sh * scale;
      x.fillStyle = '#dddddd';
      x.fillRect(tx + 2, ty + HEAD + 2, TW - 4, TH - 4);
      x.drawImage(canvas, sx, sy, sw, sh, tx + (TW - dw) / 2, ty + HEAD + (TH - dh) / 2, dw, dh);
      x.strokeStyle = '#111111';
      x.strokeRect(tx + 0.5, ty + 0.5, TW - 1, TH + HEAD - 1);
    });
    return out.toDataURL('image/jpeg', 0.85);
  }

  // Renvoie, pour chaque zone, le numéro lu (chiffres/lettres) ou null.
  async function readTiles(canvas, boxes, codes) {
    if (!boxes.length) return [];
    if (Date.now() < pausedUntil) throw new Error('Groq : quota atteint, réessai dans quelques secondes');
    const known = [...codes].join(', ');
    const chunks = [];
    for (let i = 0; i < boxes.length; i += TILES_PER_REQUEST) chunks.push(boxes.slice(i, i + TILES_PER_REQUEST));

    const answers = await Promise.all(chunks.map(async (chunk) => {
      const prompt = `The image is a grid of ${chunk.length} tiles. Each tile has a black header "TILE n" (n = 1 to ${chunk.length}) and below it a crop from a photo of a storage shelf.
A tile may show a number handwritten or printed on a box, a label or a sheet of paper, or only background clutter (devices, cables, patterns, shadows, logos).
For each tile, give the number written in the crop (ignore the header), or null if the crop does not clearly show a hand-written or label number.
Known product numbers: ${known}. Prefer one of them when the writing is ambiguous, but never invent a number that is not visible.
Answer only with JSON: {"tiles": [{"tile": 1, "number": "12"}, {"tile": 2, "number": null}]}`;
      const text = await call([
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: mosaic(canvas, chunk) } },
      ], 1500);
      const data = parseJson(text);
      const list = Array.isArray(data.tiles) ? data.tiles : [];
      return chunk.map((_, k) => {
        const t = list.find((e) => +e.tile === k + 1) || list[k];
        const n = t && t.number != null ? String(t.number).toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
        return n || null;
      });
    }));
    return answers.flat();
  }

  async function test() {
    const text = await call([{ type: 'text', text: 'Reply only with this JSON: {"ok": true}' }], 50);
    return parseJson(text).ok === true;
  }

  window.Ai = { settings, save, enabled, readTiles, test, DEFAULT_MODEL };
})();
