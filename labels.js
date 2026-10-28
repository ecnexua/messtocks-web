// Étiquettes à imprimer (PDF A4) : un code par produit (QR ou Code 128),
// le N° carton en gros et le nom du produit.
// Expose window.Labels = { FORMATS, payload(code), pdf(options) }.

(function () {
  const LIBS = {
    jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',
    qr: 'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js',
    barcode: 'https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/JsBarcode.all.min.js',
  };

  // Planches A4 courantes (mm). Marges et écarts des planches autocollantes du commerce.
  const FORMATS = {
    8: { cols: 2, rows: 4, w: 105, h: 74.25, left: 0, top: 0, gapX: 0, gapY: 0, label: '8 par page · 105 × 74 mm' },
    14: { cols: 2, rows: 7, w: 99.1, h: 38.1, left: 4.65, top: 15.15, gapX: 2.5, gapY: 0, label: '14 par page · 99 × 38 mm' },
    21: { cols: 3, rows: 7, w: 63.5, h: 38.1, left: 7.2, top: 15.15, gapX: 2.5, gapY: 0, label: '21 par page · 63,5 × 38 mm' },
    24: { cols: 3, rows: 8, w: 70, h: 37.125, left: 0, top: 0, gapX: 0, gapY: 0, label: '24 par page · 70 × 37 mm' },
  };

  // Contenu du code : préfixe "MS:" pour ignorer les autres codes (emballages, fournisseurs)
  const payload = (code) => 'MS:' + code;

  const loaded = {};
  function load(name) {
    if (!loaded[name]) {
      loaded[name] = new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = LIBS[name];
        s.onload = ok;
        s.onerror = () => { loaded[name] = null; ko(new Error('Chargement impossible (réseau ?)')); };
        document.head.appendChild(s);
      });
    }
    return loaded[name];
  }

  // QR en vectoriel : une bande noire par suite de modules noirs, ligne par ligne
  function drawQr(doc, text, x, y, size) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 2; // marge blanche autour du code, en modules
    const m = size / (n + 2 * quiet);
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!qr.isDark(r, c)) { c++; continue; }
        let end = c;
        while (end + 1 < n && qr.isDark(r, end + 1)) end++;
        doc.rect(x + (quiet + c) * m, y + (quiet + r) * m, (end - c + 1) * m + 0.12, m + 0.12, 'F'); // léger chevauchement : pas de liseré blanc à l'impression
        c = end + 1;
      }
    }
  }

  function barcodeImage(text) {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, text, { format: 'CODE128', displayValue: false, margin: 30, width: 3, height: 120 }); // marge blanche (zone de silence) obligatoire pour la lecture
    return canvas.toDataURL('image/png');
  }

  function fitText(doc, text, maxW, maxPt, minPt) {
    let pt = maxPt;
    doc.setFontSize(pt);
    while (pt > minPt && doc.getTextWidth(text) > maxW) { pt -= 0.5; doc.setFontSize(pt); }
    return pt;
  }

  function drawLabel(doc, x, y, w, h, article, type) {
    const pad = Math.min(w, h) * 0.07;
    const code = article.reference;
    doc.setTextColor(0, 0, 0);

    if (type === 'code128') {
      // code-barres en haut, numéro et nom dessous
      const bh = (h - 2 * pad) * 0.42;
      doc.addImage(barcodeImage(payload(code)), 'PNG', x + pad, y + pad, w - 2 * pad, bh);
      const top = y + pad + bh + pad * 0.6;
      const rest = y + h - pad - top;
      doc.setFont('helvetica', 'bold');
      const numPt = fitText(doc, code, (w - 2 * pad) * 0.45, rest * 0.95 * 2.835, 8);
      doc.text(code, x + pad, top + (numPt / 2.835) * 0.78);
      doc.setFont('helvetica', 'normal');
      const nameX = x + pad + doc.getTextWidth(code) + pad;
      doc.setFontSize(Math.min(9, h * 0.2));
      const lines = doc.splitTextToSize(article.nom, x + w - pad - nameX).slice(0, 2);
      doc.text(lines, nameX, top + 3);
      return;
    }

    // QR à gauche, numéro en gros et nom à droite
    const qrSize = Math.min(h - 2 * pad, w * 0.5);
    drawQr(doc, payload(code), x + pad * 0.6, y + (h - qrSize) / 2, qrSize);
    const tx = x + pad * 0.6 + qrSize + pad * 0.5;
    const tw = x + w - pad - tx;
    doc.setFont('helvetica', 'bold');
    const numPt = fitText(doc, code, tw, (h - 2 * pad) * 0.62 * 2.835, 10);
    const numH = numPt / 2.835;
    doc.text(code, tx, y + pad + numH * 0.8);
    doc.setFont('helvetica', 'normal');
    const namePt = Math.max(6, Math.min(10, h * 0.16));
    doc.setFontSize(namePt);
    const lines = doc.splitTextToSize(article.nom, tw).slice(0, 3);
    doc.text(lines, tx, y + pad + numH * 0.8 + namePt / 2.835 + 1.5);
  }

  // options : { items: [{ article, count }], format: '8'|'14'|'21'|'24', type: 'qr'|'code128',
  //             start: n° de la première étiquette libre (1 = en haut à gauche), cut: traits de coupe }
  async function pdf({ items, format, type, start = 1, cut = true }) {
    await Promise.all([load('jspdf'), load(type === 'code128' ? 'barcode' : 'qr')]);
    const f = FORMATS[format];
    const perPage = f.cols * f.rows;
    const labels = items.flatMap(({ article, count }) => Array.from({ length: count }, () => article));
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.setProperties({ title: 'Étiquettes MesStocks' });
    let slot = Math.max(0, Math.min(perPage - 1, start - 1));
    labels.forEach((article, i) => {
      if (i > 0 && slot === 0) doc.addPage();
      const col = slot % f.cols, row = Math.floor(slot / f.cols);
      const x = f.left + col * (f.w + f.gapX), y = f.top + row * (f.h + f.gapY);
      if (cut) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.rect(x, y, f.w, f.h);
      }
      drawLabel(doc, x, y, f.w, f.h, article, type);
      slot = (slot + 1) % perPage;
    });
    return doc.output('blob');
  }

  window.Labels = { FORMATS, payload, pdf };
})();
