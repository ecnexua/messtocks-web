// Classeur Excel (.xlsx) mis en forme : titre, en-têtes figés, filtres, totaux, lignes signalées.
// Expose window.Excel = { blob(book) }.
// book : { title, subtitle, sheets: [{ name, title, columns: [{ header, key, width, type }], rows, mark(row), markKey, totals: [keys] }] }
// type : 'text' (défaut) | 'int' | 'signed' (+3 / −2) | 'date'

(function () {
  const URL_JS = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  const INK = 'FF2E2E2E', ACCENT = 'FFFF4D00', ACCENT_SOFT = 'FFFFE4D6', OK_SOFT = 'FFDFF2E5', LINE = 'FFD6D6D6', GREY = 'FF6E6E6E';
  const HEAD_ROW = 4;

  let ready = null;
  function load() {
    if (!ready) {
      ready = new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = URL_JS;
        s.onload = ok;
        s.onerror = () => { ready = null; ko(new Error('Module Excel indisponible (réseau ?)')); };
        document.head.appendChild(s);
      });
    }
    return ready;
  }

  // Excel n'a pas de fuseau : on écrit l'heure locale telle qu'elle s'affiche
  const localDate = (iso) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000); };
  const FMT = { int: '#,##0', signed: '+#,##0;-#,##0;0', date: 'dd/mm/yyyy hh:mm' };
  const numeric = (c) => c.type === 'int' || c.type === 'signed';

  function addSheet(wb, book, sh) {
    const ws = wb.addWorksheet(sh.name, {
      views: [{ state: 'frozen', ySplit: HEAD_ROW, showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
      headerFooter: { oddFooter: `&L${book.title}&C${sh.name}&RPage &P / &N` },
    });
    ws.columns = sh.columns.map((c) => ({ key: c.key, width: c.width || 14 }));
    const last = sh.columns.length;

    ws.getCell(1, 1).value = sh.title || sh.name;
    ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: INK } };
    ws.getCell(2, 1).value = book.subtitle;
    ws.getCell(2, 1).font = { size: 10, color: { argb: GREY } };

    const head = ws.getRow(HEAD_ROW);
    sh.columns.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
      cell.alignment = { vertical: 'middle', horizontal: numeric(c) ? 'right' : 'left', wrapText: true };
    });
    head.height = 22;

    sh.rows.forEach((r) => {
      const row = ws.addRow(sh.columns.map((c) => (c.type === 'date' && r[c.key] ? localDate(r[c.key]) : r[c.key] ?? '')));
      const mark = sh.mark?.(r);
      sh.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (FMT[c.type]) cell.numFmt = FMT[c.type];
        cell.border = { bottom: { style: 'thin', color: { argb: LINE } } };
        cell.alignment = { vertical: 'middle' };
        if (mark === 'accent') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_SOFT } };
        if (mark === 'ok') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OK_SOFT } };
      });
      if (mark === 'accent' && sh.markKey) row.getCell(sh.markKey).font = { bold: true, color: { argb: ACCENT } };
    });

    const first = HEAD_ROW + 1, end = HEAD_ROW + sh.rows.length;
    if (sh.rows.length) ws.autoFilter = { from: { row: HEAD_ROW, column: 1 }, to: { row: end, column: last } };
    else ws.getCell(first, 1).value = 'Aucune donnée';

    if (sh.totals && sh.rows.length) {
      const row = ws.addRow([]);
      row.getCell(1).value = 'TOTAL';
      sh.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.font = { bold: true };
        cell.border = { top: { style: 'medium', color: { argb: INK } } };
        if (!sh.totals.includes(c.key)) return;
        const col = ws.getColumn(i + 1).letter;
        const sum = sh.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
        cell.value = { formula: `SUBTOTAL(9,${col}${first}:${col}${end})`, result: sum }; // suit les filtres
        cell.numFmt = FMT[c.type] || FMT.int;
      });
    }
  }

  async function blob(book) {
    await load();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MesStocks';
    wb.created = new Date();
    book.sheets.forEach((sh) => addSheet(wb, book, sh));
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  window.Excel = { blob };
})();
