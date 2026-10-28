// MesStocks web — gestion de stocks + comptage d'étagère par numéros écrits sur les cartons.
// Même modèle de données que la version React Native / Firestore, stocké en localStorage.

const STORE_KEY = 'messtocks.web.v1';
const MANUAL_SIZE = 0.07; // taille d'un cadre ajouté à la main (fraction de la largeur)

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const byId = (list, id) => list.find((x) => x.id === id);
const nomOf = (list, id) => byId(list, id)?.nom || '—';
const sortNum = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true });
const fmtDate = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDateLong = (iso) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const aCommander = (a) => a.stocksMini > 0 && a.stocks < a.stocksMini;
const int = (v, min = 0) => Math.max(min, parseInt(v, 10) || 0);

// ---------------------------------------------------------------- données

function demoData() {
  const now = Date.now();
  const ago = (h) => new Date(now - h * 3600e3).toISOString();
  const art = (id, nom, reference, idCategorie, idSousCategorie, idMarque, stocks, stocksMini) =>
    ({ id, nom, reference, idCategorie, idSousCategorie, idMarque, stocks, stocksMini, profondeur: 1 });
  return {
    categories: [{ id: 'c1', nom: 'Épicerie sèche' }, { id: 'c2', nom: 'Conserves' }, { id: 'c3', nom: 'Boissons' }, { id: 'c4', nom: 'Condiments' }],
    sousCategories: [
      { id: 's1', nom: 'Pâtes', idCategorie: 'c1' }, { id: 's2', nom: 'Riz & céréales', idCategorie: 'c1' },
      { id: 's3', nom: 'Légumes', idCategorie: 'c2' }, { id: 's4', nom: 'Tomates', idCategorie: 'c2' },
      { id: 's5', nom: 'Eaux', idCategorie: 'c3' }, { id: 's6', nom: 'Jus', idCategorie: 'c3' },
      { id: 's7', nom: 'Huiles', idCategorie: 'c4' }, { id: 's8', nom: 'Sauces', idCategorie: 'c4' },
    ],
    marques: [
      { id: 'm1', nom: 'Barilla' }, { id: 'm2', nom: 'Taureau Ailé' }, { id: 'm3', nom: 'Bonduelle' }, { id: 'm4', nom: 'Mutti' },
      { id: 'm5', nom: 'Cristaline' }, { id: 'm6', nom: 'Joker' }, { id: 'm7', nom: 'Lesieur' }, { id: 'm8', nom: 'Heinz' },
    ],
    utilisateurs: [{ id: 'u1', nom: 'Karim' }, { id: 'u2', nom: 'Julie' }, { id: 'u3', nom: 'Thomas' }],
    articles: [
      art('a1', 'Spaghetti n°5 — 12 × 1 kg', '12', 'c1', 's1', 'm1', 8, 4),
      art('a2', 'Penne rigate — 12 × 1 kg', '14', 'c1', 's1', 'm1', 3, 4),
      art('a3', 'Riz long grain — 10 × 1 kg', '21', 'c1', 's2', 'm2', 12, 5),
      art('a4', 'Haricots verts extra-fins — 6 × 4/4', '23', 'c2', 's3', 'm3', 24, 10),
      art('a5', 'Maïs doux — 6 × 4/4', '24', 'c2', 's3', 'm3', 6, 10),
      art('a6', 'Tomates concassées — 6 × 5/1', '31', 'c2', 's4', 'm4', 5, 3),
      art('a7', 'Eau de source 50 cl — 24 bout.', '35', 'c3', 's5', 'm5', 40, 20),
      art('a8', 'Jus d’orange 1 L — 6 brik', '42', 'c3', 's6', 'm6', 18, 10),
      art('a9', 'Huile de tournesol 5 L — 3 bidons', '45', 'c4', 's7', 'm7', 2, 8),
      art('a10', 'Ketchup 875 ml — 6 flacons', '52', 'c4', 's8', 'm8', 60, 30),
    ],
    historique: [
      { id: 'h1', idArticle: 'a9', type: 'S', quantite: 6, idUtilisateur: 'u1', date: ago(3), source: 'scan' },
      { id: 'h2', idArticle: 'a4', type: 'E', quantite: 12, idUtilisateur: 'u2', date: ago(20), source: 'scan' },
      { id: 'h3', idArticle: 'a2', type: 'S', quantite: 2, idUtilisateur: 'u3', date: ago(28), source: 'scan' },
      { id: 'h4', idArticle: 'a7', type: 'E', quantite: 20, idUtilisateur: 'u2', date: ago(52), source: 'scan' },
      { id: 'h5', idArticle: 'a5', type: 'S', quantite: 4, idUtilisateur: 'u1', date: ago(100), source: 'scan' },
      { id: 'h6', idArticle: 'a1', type: 'E', quantite: 5, idUtilisateur: '', date: ago(200), source: 'manuel' },
    ],
    evenements: [{ id: 'e1', objet: 'D', nomObjet: 'Données de démonstration', type: 'A', date: ago(240) }],
    inventaire: { etageres: [] },
    params: { theme: 'auto' },
  };
}

function emptyData() {
  return { categories: [], sousCategories: [], marques: [], utilisateurs: [], articles: [], historique: [], evenements: [], inventaire: { etageres: [] }, params: { theme: 'auto' } };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // Ancienne démo (matériel électrique) jamais modifiée → remplacée par la démo alimentaire
      if (data.articles?.[0]?.nom === 'Câble R2V 3G2,5 — 50 m' && data.categories?.[0]?.nom === 'Câblage') return demoData();
      return { ...emptyData(), ...data };
    }
  } catch (e) { /* stockage indisponible */ }
  return demoData();
}

let db = load();

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { toast('Impossible d’enregistrer sur cet appareil', true); }
}

// Objets journalisés, comme "derniersEvenements" dans la version Firestore
const OBJETS = { A: 'Produit', C: 'Catégorie', SC: 'Sous-catégorie', M: 'Marque', U: 'Utilisateur', I: 'Inventaire', D: 'Données' };
const TYPES_EVT = { A: 'Créé', M: 'Modifié', S: 'Supprimé' };

function logEvent(objet, nomObjet, type) {
  db.evenements.push({ id: uid(), objet, nomObjet, type, date: new Date().toISOString() });
}

function addMovement(article, type, quantite, idUtilisateur, source) {
  article.stocks = Math.max(0, article.stocks + (type === 'E' ? quantite : -quantite));
  db.historique.push({ id: uid(), idArticle: article.id, type, quantite, idUtilisateur: idUtilisateur || '', date: new Date().toISOString(), source });
}

// Numéros qu'on confond facilement à la lecture
function confusions(code, exceptId) {
  const out = [];
  if (!code) return out;
  const flip = { 6: '9', 9: '6' };
  const others = db.articles.filter((a) => a.id !== exceptId && a.reference).map((a) => a.reference);
  if (others.includes(code)) out.push(`Le numéro ${code} est déjà utilisé`);
  if (/[69]/.test(code)) {
    const upside = code.split('').reverse().map((d) => flip[d] || d).join('');
    if (upside !== code && others.includes(upside)) out.push(`${code} et ${upside} se confondent à l’envers`);
    else out.push('Soulignez le 6 / 9 sur les cartons');
  }
  const pairs = ['17', '38', '08', '56'];
  others.forEach((o) => {
    if (o.length !== code.length) return;
    const diff = [...code].map((c, i) => [c, o[i]]).filter(([x, y]) => x !== y);
    if (diff.length === 1 && pairs.some((p) => p === diff[0][0] + diff[0][1] || p === diff[0][1] + diff[0][0])) {
      out.push(`${code} et ${o} : un seul chiffre facile à confondre`);
    }
  });
  return out;
}

// ---------------------------------------------------------------- état UI

const ui = {
  tab: 'recap',
  page: null,            // 'historique' | 'evenements'
  histArticle: null,
  search: { q: '', cat: '', sous: '', marque: '', type: 'tous' },
  hist: { type: 'tous', user: '', periode: 'toutes' },
  scanMode: 'mouvement',
  mvt: { type: 'S', articleId: null, qty: 1, userId: '', q: '' },
  shelf: null,           // { img, detections, depths, nom }
  photoPurpose: null,    // 'shelf' | 'mvt'
  ocr: null,             // { p, text } pendant la lecture
};

// ---------------------------------------------------------------- thème

function applyTheme() {
  const t = db.params.theme;
  const dark = t === 'night' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'night' : 'paper';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0e0e0f' : '#e3e3e3';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ---------------------------------------------------------------- rendu

function render() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', !ui.page && b.dataset.tab === ui.tab));
  const views = { recap: viewRecap, recherche: viewRecherche, scan: viewScan, produits: viewProduits, params: viewParams };
  const pages = { historique: viewHistorique, evenements: viewEvenements };
  $('view').innerHTML = ui.page ? pages[ui.page]() : views[ui.tab]();
}

const kpi = (lbl, val, opts = {}) => {
  const tag = opts.act ? 'button' : 'div';
  const attrs = opts.act ? ` data-act="${opts.act}"${opts.data || ''}` : '';
  return `<${tag} class="kpi${opts.alert ? ' alert' : ''}"${attrs}><div class="lbl">${lbl}</div><div class="val">${val}</div></${tag}>`;
};

function movementRow(h) {
  const a = byId(db.articles, h.idArticle);
  const sign = h.type === 'E' ? '+' : '−';
  const who = h.idUtilisateur ? nomOf(db.utilisateurs, h.idUtilisateur) : '';
  const src = h.source === 'inventaire' ? 'Inventaire' : h.source === 'manuel' ? 'Correction' : '';
  return `<li ${a ? `data-act="open-article" data-id="${a.id}"` : ''}>
    <span class="tag ${h.type}">${sign}${h.quantite}</span>
    <span class="grow"><b>${esc(a?.nom || 'Produit supprimé')}</b>
      <small>${[a?.reference ? 'N° ' + a.reference : '', who, src, fmtDate(h.date)].filter(Boolean).map(esc).join(' · ')}</small></span>
  </li>`;
}

function articleRow(a) {
  const low = aCommander(a);
  return `<li data-act="open-article" data-id="${a.id}">
    <span class="num${a.reference ? '' : ' none'}">${esc(a.reference || '··')}</span>
    <span class="grow"><b>${esc(a.nom)}</b><small>${esc(nomOf(db.marques, a.idMarque))} · ${esc(nomOf(db.sousCategories, a.idSousCategorie))}</small></span>
    <span class="stock${low ? ' low' : ''}">${a.stocks}<small>MIN ${a.stocksMini}</small></span>
  </li>`;
}

// ---- 01 Récap

function viewRecap() {
  const week = Date.now() - 7 * 864e5;
  const mvts = db.historique.filter((h) => new Date(h.date) >= week).length;
  const low = db.articles.filter(aCommander);
  const totalUnits = db.articles.reduce((s, a) => s + a.stocks, 0);
  const recent = [...db.historique].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const sousRows = db.sousCategories.map((sc) => {
    const arts = db.articles.filter((a) => a.idSousCategorie === sc.id);
    const n = arts.filter(aCommander).length;
    return { sc, total: arts.length, n };
  }).filter((r) => r.total).sort((a, b) => b.n - a.n || a.sc.nom.localeCompare(b.sc.nom));

  return `
    <div class="page-title">RÉCAP'<small>${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</small></div>
    <div class="kpis">
      ${kpi('Produits', db.articles.length, { act: 'tab', data: ' data-tab="recherche"' })}
      ${kpi('À commander', low.length, { alert: low.length > 0, act: 'search-low' })}
      ${kpi('Unités en stock', totalUnits)}
      ${kpi('Mouvements 7 j', mvts, { act: 'page', data: ' data-page="historique"' })}
    </div>
    <div class="cols">
      <section class="card">
        <h2><i>A</i> Sous-catégories <span class="count">${sousRows.length}</span></h2>
        <ul class="list">${sousRows.map(({ sc, total, n }) => `
          <li data-act="search-sous" data-id="${sc.id}">
            <span class="grow"><b>${esc(sc.nom)}</b><small>${esc(nomOf(db.categories, sc.idCategorie))} · ${total} produit${total > 1 ? 's' : ''}</small></span>
            ${n ? `<span class="pill accent">${n} à commander</span>` : '<span class="pill">À jour</span>'}
          </li>`).join('') || '<li class="empty">Aucune sous-catégorie</li>'}
        </ul>
      </section>
      <section class="card">
        <h2><i>B</i> Derniers mouvements</h2>
        <ul class="list">${recent.map(movementRow).join('') || '<li class="empty">Aucun mouvement</li>'}</ul>
        <div class="btn-row">
          <button class="btn ghost" data-act="page" data-page="historique">Historique →</button>
          <button class="btn ghost" data-act="page" data-page="evenements">Évènements →</button>
        </div>
      </section>
    </div>`;
}

// ---- 02 Rechercher

function filteredArticles() {
  const s = ui.search;
  const q = s.q.trim().toLowerCase();
  return db.articles.filter((a) => {
    if (s.cat && a.idCategorie !== s.cat) return false;
    if (s.sous && a.idSousCategorie !== s.sous) return false;
    if (s.marque && a.idMarque !== s.marque) return false;
    if (s.type === 'commander' && !aCommander(a)) return false;
    if (s.type === 'ajour' && aCommander(a)) return false;
    if (q && !(a.nom.toLowerCase().includes(q) || (a.reference || '').toLowerCase() === q || (a.reference || '').toLowerCase().startsWith(q))) return false;
    return true;
  }).sort((a, b) => sortNum(a.reference || 'zz', b.reference || 'zz'));
}

function resultsHtml() {
  const list = filteredArticles();
  return `<h2><i>R</i> Résultats <span class="count">${list.length}</span></h2>
    <ul class="list">${list.map(articleRow).join('') || '<li class="empty">Aucun produit</li>'}</ul>`;
}

const options = (list, selected, placeholder) =>
  `<option value="">${placeholder}</option>` + list.map((x) => `<option value="${x.id}"${x.id === selected ? ' selected' : ''}>${esc(x.nom)}</option>`).join('');

function viewRecherche() {
  const s = ui.search;
  const sous = db.sousCategories.filter((sc) => !s.cat || sc.idCategorie === s.cat);
  const seg = [['tous', 'Tous'], ['commander', 'À commander'], ['ajour', 'À jour']];
  return `
    <div class="page-title">STOCKS</div>
    <div class="search"><input id="q" data-bind="search.q" value="${esc(s.q)}" placeholder="Nom ou numéro" autocomplete="off" enterkeyhint="search"></div>
    <div class="filters">
      <select data-bind="search.cat">${options(db.categories, s.cat, 'Catégorie')}</select>
      <select data-bind="search.sous">${options(sous, s.sous, 'Sous-cat.')}</select>
      <select data-bind="search.marque">${options(db.marques, s.marque, 'Marque')}</select>
    </div>
    <div class="seg full" style="margin-bottom:6px">${seg.map(([k, l]) => `<button data-act="search-type" data-v="${k}" class="${s.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <section class="card" id="results">${resultsHtml()}</section>
    <button class="btn big primary" data-act="new-article">+ Nouveau produit</button>`;
}

// ---- 03 Scan

function viewScan() {
  return `
    <div class="page-title">SCAN<small>${ui.scanMode === 'mouvement' ? 'Entrée ou sortie d’un produit' : 'Compter une étagère en photo'}</small></div>
    <div class="seg full" style="margin-bottom:6px">
      <button data-act="scan-mode" data-v="mouvement" class="${ui.scanMode === 'mouvement' ? 'on' : ''}">Mouvement</button>
      <button data-act="scan-mode" data-v="inventaire" class="${ui.scanMode === 'inventaire' ? 'on' : ''}">Inventaire étagère</button>
    </div>
    ${ui.scanMode === 'mouvement' ? scanMouvement() : scanInventaire()}`;
}

function progressHtml() {
  if (!ui.ocr) return '';
  return `<div class="progress"><div class="bar"><div id="ocr-bar" style="width:${Math.round(ui.ocr.p * 100)}%"></div></div>
    <p class="hint" id="ocr-text">${esc(ui.ocr.text)}…</p></div>`;
}

function scanMouvement() {
  const m = ui.mvt;
  const a = m.articleId && byId(db.articles, m.articleId);
  let articleBlock;
  if (a) {
    articleBlock = `<div class="picked">
      <span class="big-num">${esc(a.reference || '··')}</span>
      <span style="min-width:0"><b>${esc(a.nom)}</b><span class="sub">Stock ${a.stocks} · Mini ${a.stocksMini}</span></span>
      <button class="text-btn" data-act="mvt-clear">Changer</button>
    </div>`;
  } else {
    const q = m.q.trim().toLowerCase();
    const sugg = q ? db.articles.filter((x) => (x.reference || '').toLowerCase().startsWith(q) || x.nom.toLowerCase().includes(q)).slice(0, 6) : [];
    articleBlock = `
      <div class="field-row" style="grid-template-columns:1fr auto">
        <input id="mvt-q" data-bind="mvt.q" value="${esc(m.q)}" placeholder="N° du carton ou nom" inputmode="text" autocomplete="off">
        <button class="btn" data-act="cam-open" data-mode="mouvement">Scan</button>
      </div>
      <ul class="list suggest" id="mvt-sugg">${suggestHtml(sugg, q)}</ul>`;
  }
  return `
    <section class="card">
      <div class="seg full" style="margin-bottom:14px">
        <button data-act="mvt-type" data-v="E" class="in ${m.type === 'E' ? 'on' : ''}">+ Entrée</button>
        <button data-act="mvt-type" data-v="S" class="out ${m.type === 'S' ? 'on' : ''}">− Sortie</button>
      </div>
      <div class="field"><span>Produit</span>${articleBlock}</div>
      ${progressHtml()}
      <div class="field-row">
        <div class="field"><span>Quantité</span>
          <div class="stepper">
            <button class="btn" data-act="qty" data-d="-1">−</button>
            <input id="mvt-qty" type="number" min="1" inputmode="numeric" data-bind="mvt.qty" value="${m.qty}">
            <button class="btn" data-act="qty" data-d="1">+</button>
          </div>
        </div>
        <label class="field"><span>Par</span>
          <select data-bind="mvt.userId" style="height:52px">${options(db.utilisateurs, m.userId, '—')}</select>
        </label>
      </div>
      <button class="btn big ${m.type === 'E' ? 'primary' : 'accent'}" data-act="mvt-submit" ${a ? '' : 'disabled'}>
        Valider ${m.type === 'E' ? 'l’entrée' : 'la sortie'}${a ? ` · ${m.type === 'E' ? '+' : '−'}${m.qty}` : ''}
      </button>
    </section>`;
}

function suggestHtml(list, q) {
  if (!q) return '';
  return list.map((x) => `<li data-act="mvt-pick" data-id="${x.id}"><span class="num">${esc(x.reference || '··')}</span>
    <span class="grow"><b>${esc(x.nom)}</b><small>Stock ${x.stocks}</small></span></li>`).join('') || '<li class="empty">Aucun produit</li>';
}

function shelfCounts() {
  const items = {};
  ui.shelf.detections.forEach((d) => {
    if (!d.code || !d.active) return;
    (items[d.code] = items[d.code] || { visible: 0 }).visible++;
  });
  Object.entries(items).forEach(([code, it]) => {
    it.profondeur = ui.shelf.depths[code] || 1;
    it.total = it.visible * it.profondeur;
  });
  return items;
}

const articleByRef = (code) => db.articles.find((a) => a.reference === code);

function inventoryTotals() {
  const totals = {};
  db.inventaire.etageres.forEach((e) => Object.entries(e.items).forEach(([code, it]) => {
    totals[code] = (totals[code] || 0) + it.total;
  }));
  return totals;
}

function scanInventaire() {
  const refs = db.articles.filter((a) => a.reference);
  let html = '';
  if (!refs.length) {
    html += `<section class="card"><p class="hint">Aucun produit n’a de numéro. Ajoutez le <b>numéro écrit sur les cartons</b> dans la fiche de chaque produit.</p></section>`;
  }

  html += `<section class="card">
    <h2><i>1</i> Étagère</h2>
    <label class="field"><span>Nom de l’étagère</span><input data-bind="shelfName" value="${esc(ui.shelfName || '')}" placeholder="ex. A-03" autocomplete="off"></label>
    <div class="btn-row" style="margin-top:0">
      <button class="btn big accent" data-act="cam-open" data-mode="inventaire" ${refs.length ? '' : 'disabled'}>Ouvrir la caméra</button>
      <button class="btn" data-act="photo" data-purpose="shelf" ${refs.length ? '' : 'disabled'}>Importer une photo</button>
    </div>
    ${progressHtml()}
  </section>`;

  if (ui.shelf) {
    const items = shelfCounts();
    const codes = Object.keys(items).sort(sortNum);
    const total = codes.reduce((s, c) => s + items[c].total, 0);
    html += `<section class="card">
      <h2><i>2</i> Vérification <span class="count">${ui.shelf.detections.filter((d) => d.code && d.active).length} lus</span></h2>
      <div class="legend"><span><i class="l-ok"></i>Compté</span><span><i class="l-unk"></i>Inconnu — touchez</span><span><i class="l-off"></i>Exclu</span></div>
      <div class="stage" id="stage" data-act="stage">
        <img src="${ui.shelf.img}" alt="Photo de l’étagère">
        ${ui.shelf.detections.map((d, i) => markerHtml(d, i)).join('')}
      </div>
      <p class="hint">Touchez un cadre pour l’exclure, une zone vide pour ajouter un carton oublié.</p>
      <table class="table">
        <thead><tr><th>N°</th><th>Produit</th><th class="r">Vis.</th><th class="r">× Prof.</th><th class="r">Total</th></tr></thead>
        <tbody>${codes.map((c) => `<tr>
          <td class="d">${esc(c)}</td>
          <td>${esc(articleByRef(c)?.nom || '')}</td>
          <td class="r d">${items[c].visible}</td>
          <td class="r"><input type="number" min="1" inputmode="numeric" data-act-change="depth" data-code="${esc(c)}" value="${items[c].profondeur}"></td>
          <td class="r d">${items[c].total}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Aucun numéro reconnu — touchez la photo pour ajouter</td></tr>'}
        </tbody>
        <tfoot><tr><td colspan="4">TOTAL ÉTAGÈRE</td><td class="r d">${total}</td></tr></tfoot>
      </table>
      <div class="btn-row">
        <button class="btn ghost" data-act="shelf-cancel">Annuler</button>
        <button class="btn primary" data-act="shelf-add" ${codes.length ? '' : 'disabled'}>Ajouter à l’inventaire</button>
      </div>
    </section>`;
  }

  const shelves = db.inventaire.etageres;
  if (shelves.length) {
    const totals = inventoryTotals();
    const codes = Object.keys(totals).sort(sortNum);
    html += `<section class="card">
      <h2><i>3</i> Inventaire en cours <span class="count">${shelves.length} étag.</span></h2>
      <div class="chips" style="margin-bottom:12px">${shelves.map((e) => `<button class="chip" data-act="shelf-remove" data-id="${e.id}" title="Retirer">${esc(e.nom)} <small>${Object.values(e.items).reduce((s, it) => s + it.total, 0)} ×</small></button>`).join('')}</div>
      <table class="table">
        <thead><tr><th>N°</th><th>Produit</th><th class="r">Stock</th><th class="r">Compté</th><th class="r">Écart</th></tr></thead>
        <tbody>${codes.map((c) => {
          const a = articleByRef(c);
          const diff = a ? totals[c] - a.stocks : 0;
          return `<tr><td class="d">${esc(c)}</td><td>${esc(a?.nom || 'Inconnu')}</td>
            <td class="r d">${a ? a.stocks : '—'}</td><td class="r d">${totals[c]}</td>
            <td class="r d ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}">${diff > 0 ? '+' : ''}${diff}</td></tr>`;
        }).join('')}</tbody>
      </table>
      <p class="hint">Seuls les produits comptés sont mis à jour. Les écarts sont enregistrés dans l’historique.</p>
      <div class="btn-row">
        <button class="btn danger" data-act="inv-clear">Vider</button>
        <button class="btn primary" data-act="inv-apply">Appliquer au stock</button>
      </div>
    </section>`;
  }
  return html;
}

function markerHtml(d, i) {
  const pad = 0.008;
  const cls = 'marker' + (d.code ? '' : ' unknown') + (d.code && !d.active ? ' off' : '') + (d.manual ? ' manual' : '');
  const style = `left:${(d.x - pad) * 100}%;top:${(d.y - pad) * 100}%;width:${(d.w + pad * 2) * 100}%;height:${(d.h + pad * 2) * 100}%`;
  return `<button class="${cls}" style="${style}" data-act="marker" data-i="${i}"><span>${esc(d.code || d.raw + ' ?')}</span></button>`;
}

// ---- 04 Ajouter

const KINDS = {
  categories: { label: 'Catégories', one: 'catégorie', objet: 'C', field: 'idCategorie' },
  sousCategories: { label: 'Sous-catégories', one: 'sous-catégorie', objet: 'SC', field: 'idSousCategorie' },
  marques: { label: 'Marques', one: 'marque', objet: 'M', field: 'idMarque' },
  utilisateurs: { label: 'Utilisateurs', one: 'utilisateur', objet: 'U', field: null },
};

function viewProduits() {
  const kinds = Object.entries(KINDS);
  return `
    <div class="page-title">PRODUITS</div>
    <div class="kpis">${kinds.map(([k, d]) => kpi(d.label, db[k].length)).join('')}</div>
    <button class="btn big primary" data-act="new-article" style="margin-bottom:6px">+ Nouveau produit</button>
    <div class="cols">${kinds.map(([k, d], i) => `
      <section class="card">
        <h2><i>${String(i + 1).padStart(2, '0')}</i> ${d.label} <span class="count">${db[k].length}</span></h2>
        <div class="chips">
          ${[...db[k]].sort((a, b) => a.nom.localeCompare(b.nom)).map((x) => `<button class="chip" data-act="edit-data" data-kind="${k}" data-id="${x.id}">${esc(x.nom)}${k === 'sousCategories' ? `<small>${esc(nomOf(db.categories, x.idCategorie))}</small>` : ''}</button>`).join('')}
          <button class="chip add" data-act="edit-data" data-kind="${k}">+ ${d.one}</button>
        </div>
      </section>`).join('')}
    </div>`;
}

// ---- 05 Params

function viewParams() {
  const t = db.params.theme;
  return `
    <div class="page-title">PARAMS</div>
    <div class="cols">
      <section class="card">
        <h2><i>01</i> Thème</h2>
        <div class="seg full">${[['paper', 'Paper'], ['night', 'Night'], ['auto', 'Auto']].map(([k, l]) => `<button data-act="theme" data-v="${k}" class="${t === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      </section>
      <section class="card">
        <h2><i>02</i> Exporter</h2>
        <div class="btn-row" style="margin-top:0">
          <button class="btn" data-act="export-articles">Produits CSV</button>
          <button class="btn" data-act="export-historique">Historique CSV</button>
        </div>
        <p class="hint">Fichiers séparés par « ; », lisibles directement dans Excel.</p>
      </section>
      <section class="card">
        <h2><i>03</i> Sauvegarde</h2>
        <div class="btn-row" style="margin-top:0">
          <button class="btn" data-act="backup">Télécharger</button>
          <button class="btn" data-act="restore">Restaurer</button>
        </div>
        <p class="hint">Les données sont stockées sur cet appareil uniquement. Pensez à sauvegarder.</p>
      </section>
      <section class="card">
        <h2><i>04</i> Données</h2>
        <div class="btn-row" style="margin-top:0">
          <button class="btn" data-act="demo">Charger la démo</button>
          <button class="btn danger" data-act="wipe">Tout effacer</button>
        </div>
      </section>
      ${aiSettingsHtml()}
    </div>
    <p class="hint" style="text-align:center;margin-top:16px">Version 1.3 ·D’après MesStocks de Christophe Garcia · Interface Font Lab</p>`;
}

function aiSettingsHtml() {
  const s = Ai.settings();
  return `
      <section class="card">
        <h2><i>05</i> IA de lecture · Groq ${s.on && s.key ? '<span class="pill accent">Active</span>' : ''}</h2>
        <div class="seg full" style="margin-bottom:12px">
          <button data-act="ai-on" data-v="1" class="${s.on ? 'on' : ''}">Activée</button>
          <button data-act="ai-on" data-v="0" class="${s.on ? '' : 'on'}">Désactivée</button>
        </div>
        <label class="field"><span>Clé API Groq</span>
          <input id="ai-key" type="password" value="${esc(s.key)}" placeholder="gsk_…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <label class="field"><span>Modèle</span>
          <input id="ai-model" value="${esc(s.model)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <div class="btn-row" style="margin-top:0">
          <button class="btn" data-act="ai-test">Tester</button>
          <button class="btn primary" data-act="ai-save">Enregistrer</button>
        </div>
        <p class="hint">L’IA relit chaque numéro repéré et écarte le décor. Seuls de petits extraits de la photo autour des numéros sont envoyés à Groq. La clé reste sur cet appareil et n’est pas incluse dans les sauvegardes. Clé gratuite sur console.groq.com.</p>
      </section>`;
}

function readAiForm() {
  const s = Ai.settings();
  const key = $('ai-key')?.value.trim();
  const model = $('ai-model')?.value.trim();
  if (key !== undefined) s.key = key;
  if (model !== undefined) s.model = model || Ai.DEFAULT_MODEL;
  return s;
}

// ---- Historique

function viewHistorique() {
  const f = ui.hist;
  const art = ui.histArticle && byId(db.articles, ui.histArticle);
  const since = { toutes: 0, mois: 30, semaine: 7, jour: 0.0001 }[f.periode];
  const start = f.periode === 'jour' ? new Date().setHours(0, 0, 0, 0) : since ? Date.now() - since * 864e5 : 0;
  const list = db.historique.filter((h) =>
    (!art || h.idArticle === art.id) &&
    (f.type === 'tous' || h.type === f.type) &&
    (!f.user || h.idUtilisateur === f.user) &&
    new Date(h.date) >= start
  ).sort((a, b) => b.date.localeCompare(a.date));
  const sum = (t) => list.filter((h) => h.type === t).reduce((s, h) => s + h.quantite, 0);
  const seg = (key, opts) => `<div class="seg full" style="margin-bottom:6px">${opts.map(([k, l]) => `<button data-act="hist" data-k="${key}" data-v="${k}" class="${f[key] === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;

  return `
    <div class="page-head"><button class="btn small" data-act="back">← Retour</button></div>
    <div class="page-title">HISTORIQUE<small>${art ? esc((art.reference ? 'N° ' + art.reference + ' · ' : '') + art.nom) : 'Toutes les entrées / sorties'}</small></div>
    <div class="kpis" style="grid-template-columns:1fr 1fr">${kpi('Entrées', '+' + sum('E'))}${kpi('Sorties', '−' + sum('S'), { alert: sum('S') > 0 })}</div>
    ${seg('type', [['tous', 'Tous'], ['E', 'Entrées'], ['S', 'Sorties']])}
    ${seg('periode', [['toutes', 'Toutes'], ['mois', 'Mois'], ['semaine', 'Semaine'], ['jour', 'Aujourd’hui']])}
    <div class="filters" style="grid-template-columns:1fr"><select data-bind="hist.user">${options(db.utilisateurs, f.user, 'Toutes les personnes')}</select></div>
    <section class="card">
      <h2><i>H</i> Mouvements <span class="count">${list.length}</span></h2>
      <ul class="list">${list.map(movementRow).join('') || '<li class="empty">Aucun mouvement</li>'}</ul>
    </section>`;
}

function viewEvenements() {
  const list = [...db.evenements].sort((a, b) => b.date.localeCompare(a.date));
  return `
    <div class="page-head"><button class="btn small" data-act="back">← Retour</button></div>
    <div class="page-title">ÉVÈNEMENTS<small>Créations, modifications, suppressions</small></div>
    <section class="card">
      <ul class="list">${list.map((e) => `<li>
        <span class="pill${e.type === 'S' ? ' accent' : ''}">${TYPES_EVT[e.type] || e.type}</span>
        <span class="grow"><b>${esc(e.nomObjet)}</b><small>${esc(OBJETS[e.objet] || '')} · ${fmtDateLong(e.date)}</small></span>
      </li>`).join('') || '<li class="empty">Aucun évènement</li>'}</ul>
    </section>`;
}

// ---------------------------------------------------------------- feuilles (fiche article, données, choix)

function openSheet(html) {
  $('sheet-body').innerHTML = html;
  $('sheet').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  $('sheet').classList.add('hidden');
  $('sheet-body').innerHTML = '';
  document.body.style.overflow = '';
  sheetCtx = null;
}

let sheetCtx = null;

function sheetHead(tag, title) {
  return `<div class="sheet-head"><h2><i>${tag}</i> ${title}</h2><button class="text-btn" data-act="sheet-close">Fermer</button></div>`;
}

function openArticle(id) {
  const a = id ? byId(db.articles, id) : { id: null, nom: '', reference: '', idCategorie: '', idSousCategorie: '', idMarque: '', stocks: 0, stocksMini: 0, profondeur: 1 };
  sheetCtx = { kind: 'article', id };
  const recent = id ? db.historique.filter((h) => h.idArticle === id).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 4) : [];
  const warns = confusions(a.reference, id);
  openSheet(`
    ${sheetHead('FA', id ? 'Fiche produit' : 'Nouveau produit')}
    <section class="card">
      <div class="field-row" style="grid-template-columns:110px 1fr">
        <label class="field"><span>N° carton</span><input id="f-reference" value="${esc(a.reference)}" maxlength="6" autocomplete="off" style="font-family:var(--dot);font-weight:800;font-size:26px;padding:6px 10px;text-transform:uppercase"></label>
        <label class="field"><span>Nom</span><input id="f-nom" value="${esc(a.nom)}" autocomplete="off" style="height:52px"></label>
      </div>
      <div id="f-warn" class="field" style="margin-top:-8px">${warns.map((w) => `<span class="warn">! ${esc(w)}</span>`).join('')}</div>
      <div class="field-row three">
        <label class="field"><span>Catégorie</span><select id="f-cat">${options(db.categories, a.idCategorie, '—')}</select></label>
        <label class="field"><span>Sous-cat.</span><select id="f-sous">${options(db.sousCategories.filter((s) => !a.idCategorie || s.idCategorie === a.idCategorie), a.idSousCategorie, '—')}</select></label>
        <label class="field"><span>Marque</span><select id="f-marque">${options(db.marques, a.idMarque, '—')}</select></label>
      </div>
      <div class="field-row three">
        <label class="field"><span>Stock</span><input id="f-stocks" type="number" min="0" inputmode="numeric" value="${a.stocks}"></label>
        <label class="field"><span>Stock mini</span><input id="f-mini" type="number" min="0" inputmode="numeric" value="${a.stocksMini}"></label>
        <label class="field"><span>Profondeur</span><input id="f-prof" type="number" min="1" inputmode="numeric" value="${a.profondeur || 1}"></label>
      </div>
      <p class="hint" style="margin-top:-4px">Profondeur : nombre de cartons cachés derrière chaque carton visible sur l’étagère.</p>
      <div class="btn-row">
        ${id ? '<button class="btn danger" data-act="article-delete">Supprimer</button>' : ''}
        <button class="btn primary" data-act="article-save">Enregistrer</button>
      </div>
    </section>
    ${id ? `<section class="card">
      <h2><i>H</i> Derniers mouvements</h2>
      <ul class="list">${recent.map(movementRow).join('') || '<li class="empty">Aucun mouvement</li>'}</ul>
      <div class="btn-row"><button class="btn ghost" data-act="article-history">Tout l’historique →</button>
      <button class="btn ghost" data-act="article-move">Entrée / sortie →</button></div>
    </section>` : ''}`);
}

function saveArticle() {
  const id = sheetCtx.id;
  const v = {
    nom: $('f-nom').value.trim(),
    reference: Ocr.normalize($('f-reference').value),
    idCategorie: $('f-cat').value,
    idSousCategorie: $('f-sous').value,
    idMarque: $('f-marque').value,
    stocks: int($('f-stocks').value),
    stocksMini: int($('f-mini').value),
    profondeur: int($('f-prof').value, 1),
  };
  if (!v.nom) { toast('Le nom est obligatoire', true); return; }
  if (v.reference && db.articles.some((a) => a.id !== id && a.reference === v.reference)) {
    toast(`Le numéro ${v.reference} est déjà utilisé`, true);
    return;
  }
  if (id) {
    const a = byId(db.articles, id);
    const delta = v.stocks - a.stocks;
    Object.assign(a, { ...v, stocks: a.stocks });
    if (delta) addMovement(a, delta > 0 ? 'E' : 'S', Math.abs(delta), '', 'manuel');
    logEvent('A', a.nom, 'M');
  } else {
    db.articles.push({ id: uid(), ...v });
    logEvent('A', v.nom, 'A');
  }
  persist();
  closeSheet();
  toast(id ? 'Produit modifié' : 'Produit créé');
  render();
}

function openData(kind, id) {
  const d = KINDS[kind];
  const x = id ? byId(db[kind], id) : { nom: '', idCategorie: '' };
  sheetCtx = { kind: 'data', dataKind: kind, id };
  openSheet(`
    ${sheetHead(d.objet, (id ? 'Modifier ' : 'Nouvelle ') + d.one)}
    <section class="card">
      <label class="field"><span>Nom</span><input id="d-nom" value="${esc(x.nom)}" autocomplete="off"></label>
      ${kind === 'sousCategories' ? `<label class="field"><span>Catégorie parente</span><select id="d-cat">${options(db.categories, x.idCategorie, '—')}</select></label>` : ''}
      <div class="btn-row">
        ${id ? '<button class="btn danger" data-act="data-delete">Supprimer</button>' : ''}
        <button class="btn primary" data-act="data-save">Enregistrer</button>
      </div>
    </section>`);
  setTimeout(() => $('d-nom')?.focus(), 50);
}

function saveData() {
  const { dataKind: kind, id } = sheetCtx;
  const d = KINDS[kind];
  const nom = $('d-nom').value.trim();
  if (!nom) { toast('Le nom est obligatoire', true); return; }
  if (db[kind].some((x) => x.id !== id && x.nom.toLowerCase() === nom.toLowerCase())) { toast('Ce nom existe déjà', true); return; }
  const extra = kind === 'sousCategories' ? { idCategorie: $('d-cat').value } : {};
  if (id) Object.assign(byId(db[kind], id), { nom, ...extra });
  else db[kind].push({ id: uid(), nom, ...extra });
  logEvent(d.objet, nom, id ? 'M' : 'A');
  persist();
  closeSheet();
  render();
}

function deleteData() {
  const { dataKind: kind, id } = sheetCtx;
  const d = KINDS[kind];
  const x = byId(db[kind], id);
  const used = d.field ? db.articles.filter((a) => a[d.field] === id).length : 0;
  const children = kind === 'categories' ? db.sousCategories.filter((s) => s.idCategorie === id).length : 0;
  if (used || children) {
    toast(`Utilisé par ${used ? used + ' produit(s)' : children + ' sous-catégorie(s)'}`, true);
    return;
  }
  if (!confirm(`Supprimer ${x.nom} ?`)) return;
  db[kind] = db[kind].filter((y) => y.id !== id);
  logEvent(d.objet, x.nom, 'S');
  persist();
  closeSheet();
  render();
}

// Choix d'un article ayant un numéro (scan d'étagère, lecture de numéro)
function pickArticle(title, list, callback, nullLabel) {
  sheetCtx = { kind: 'pick', callback };
  openSheet(`
    ${sheetHead('?', esc(title))}
    <div class="picker">
      ${list.map((a) => `<button data-act="pick" data-id="${a.id}"><span class="num">${esc(a.reference)}</span><small>${esc(a.nom)}</small></button>`).join('')}
    </div>
    ${nullLabel ? `<div class="btn-row"><button class="btn danger" data-act="pick" data-id="">${esc(nullLabel)}</button></div>` : ''}`);
}

// ---------------------------------------------------------------- photo / OCR

// Photo d'étagère (importée ou prise par la caméra) → cartons comptés par numéro.
// `source` est un fichier image ou une image déjà préparée { canvas, w, h, display }.
async function analyzeShelf(source) {
  const refs = db.articles.filter((a) => a.reference);
  ui.tab = 'scan';
  ui.page = null;
  ui.scanMode = 'inventaire';
  ui.shelf = null;
  ui.ocr = { p: 0, text: 'Préparation de la photo' };
  $('busy').classList.remove('hidden');
  render();
  try {
    const prepared = source instanceof Blob ? await Ocr.prepare(source) : source;
    const found = await Ocr.read(prepared, refs.map((a) => a.reference), (p, text) => {
      ui.ocr = { p, text };
      const bar = $('ocr-bar');
      if (bar) { bar.style.width = Math.round(p * 100) + '%'; $('ocr-text').textContent = text + '…'; }
    }, { ai: Ai.enabled() ? Ai.readTiles : null, onAiError: aiError });
    ui.ocr = null;
    const depths = {};
    refs.forEach((a) => { depths[a.reference] = a.profondeur || 1; });
    ui.shelf = {
      img: prepared.display,
      depths,
      detections: found.map((d) => ({ ...d, active: !!d.code, manual: false })),
    };
    const n = found.filter((d) => d.code).length;
    toast(n ? `${n} carton${n > 1 ? 's' : ''} reconnu${n > 1 ? 's' : ''}` : 'Aucun numéro reconnu', !n);
    render();
  } catch (err) {
    console.error(err);
    ui.ocr = null;
    toast('Lecture impossible : ' + err.message, true);
    render();
  } finally {
    $('busy').classList.add('hidden');
  }
}

function selectMvtArticle(id) {
  ui.mvt.articleId = id;
  ui.mvt.q = '';
  render();
}

// Enregistre l'entrée / sortie en cours (ui.mvt). Renvoie true si c'est fait.
function submitMovement() {
  const m = ui.mvt;
  const a = byId(db.articles, m.articleId);
  if (!a) return false;
  if (m.type === 'S' && m.qty > a.stocks && !confirm(`Stock actuel : ${a.stocks}. Sortir ${m.qty} quand même ?`)) return false;
  addMovement(a, m.type, m.qty, m.userId, 'scan');
  persist();
  const msg = `${m.type === 'E' ? 'Entrée' : 'Sortie'} ${m.qty} × ${a.reference || a.nom} — stock ${a.stocks}`;
  ui.mvt = { ...m, articleId: null, qty: 1, q: '' };
  render();
  toast(aCommander(a) ? msg + ' · À commander' : msg, aCommander(a));
  return true;
}

// ---------------------------------------------------------------- caméra intégrée
// Mouvement : lecture en continu du numéro dans le viseur, puis fiche produit par-dessus.
// Inventaire : déclencheur → photo de l'étagère → vérification.

const cam = { mode: 'mouvement', stream: null, track: null, torch: false, timer: null, busy: false, foundId: null, lastCode: null, lastAi: 0, unreadTicks: 0, aiDownUntil: 0, shooting: false };

// Erreur IA : on prévient (une fois toutes les 20 s) et la lecture locale prend le relais
let lastAiError = 0;
function aiError(err) {
  if (Date.now() - lastAiError < 20000) return;
  lastAiError = Date.now();
  toast(err.message + ' — lecture locale', true);
}
const camOpen = () => !$('cam').classList.contains('hidden');

async function openCamera(mode) {
  cam.mode = mode || ui.scanMode;
  cam.foundId = null;
  if (!db.articles.some((a) => a.reference)) {
    toast('Ajoutez d’abord le N° carton de vos produits', true);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Caméra indisponible ici : importez une photo', true);
    return;
  }
  $('cam').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderCam();
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    if (!camOpen()) { cam.stream.getTracks().forEach((t) => t.stop()); cam.stream = null; return; }
    const video = $('cam-video');
    video.srcObject = cam.stream;
    await video.play();
    cam.track = cam.stream.getVideoTracks()[0];
    const caps = cam.track.getCapabilities?.() || {};
    $('cam-torch').classList.toggle('hidden', !caps.torch);
    startCamLoop();
  } catch (err) {
    console.error(err);
    closeCamera();
    toast(err.name === 'NotAllowedError' ? 'Accès à la caméra refusé' : 'Caméra indisponible', true);
  }
}

function closeCamera() {
  clearTimeout(cam.timer);
  cam.timer = null;
  cam.stream?.getTracks().forEach((t) => t.stop());
  Object.assign(cam, { stream: null, track: null, torch: false, foundId: null });
  $('cam-video').srcObject = null;
  $('cam-torch').classList.add('hidden');
  $('cam').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderCam() {
  $('cam-seg').innerHTML = [['mouvement', 'Mouvement'], ['inventaire', 'Inventaire']]
    .map(([k, l]) => `<button data-act="cam-mode" data-v="${k}" class="${cam.mode === k ? 'on' : ''}">${l}</button>`).join('');
  $('cam-torch').classList.toggle('on', cam.torch);
  $('cam-reticle').classList.toggle('hidden', cam.mode !== 'mouvement' || !!cam.foundId);

  const bottom = $('cam-bottom');
  if (cam.mode === 'inventaire') {
    const n = db.inventaire.etageres.length;
    bottom.innerHTML = `
      <div class="cam-hint">Cadrez toute l’étagère, <b>de face</b></div>
      <div class="cam-row">
        <button class="cam-btn" data-act="photo" data-purpose="shelf">Importer</button>
        <button class="shutter" data-act="cam-shoot" aria-label="Photographier l’étagère"></button>
        <button class="cam-btn" data-act="cam-close">${n ? `Inventaire · ${n}` : 'Inventaire'}</button>
      </div>`;
  } else if (cam.foundId) {
    const a = byId(db.articles, cam.foundId);
    const m = ui.mvt;
    bottom.innerHTML = `
      <div class="cam-card">
        <div class="picked">
          <span class="big-num">${esc(a.reference)}</span>
          <span style="min-width:0"><b>${esc(a.nom)}</b><span class="sub">Stock ${a.stocks} · Mini ${a.stocksMini}</span></span>
          <button class="text-btn" data-act="cam-rescan">Autre</button>
        </div>
        <div class="seg full">
          <button data-act="mvt-type" data-v="E" class="in ${m.type === 'E' ? 'on' : ''}">+ Entrée</button>
          <button data-act="mvt-type" data-v="S" class="out ${m.type === 'S' ? 'on' : ''}">− Sortie</button>
        </div>
        <div class="stepper">
          <button class="btn" data-act="qty" data-d="-1">−</button>
          <input type="number" min="1" inputmode="numeric" data-bind="mvt.qty" value="${m.qty}">
          <button class="btn" data-act="qty" data-d="1">+</button>
        </div>
        <button class="btn big ${m.type === 'E' ? 'primary' : 'accent'}" data-act="cam-submit">
          Valider ${m.type === 'E' ? 'l’entrée' : 'la sortie'} · ${m.type === 'E' ? '+' : '−'}${m.qty}
        </button>
      </div>`;
  } else {
    bottom.innerHTML = `
      <div class="cam-hint">${cam.shooting ? 'Lecture…' : 'Visez le <b>numéro</b>, ou appuyez pour photographier'}</div>
      <div class="cam-row">
        <button class="cam-btn" data-act="cam-manual">Saisir</button>
        <button class="shutter" data-act="cam-shoot-mvt" aria-label="Photographier le carton" ${cam.shooting ? 'disabled' : ''}></button>
        <span></span>
      </div>`;
  }
}

function startCamLoop() {
  clearTimeout(cam.timer);
  if (cam.stream && cam.mode === 'mouvement' && !cam.foundId) cam.timer = setTimeout(camTick, 400);
}

// Découpe la zone du viseur dans l'image vidéo (la vidéo est affichée en "cover").
function reticleCrop(video) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const box = video.getBoundingClientRect();
  const r = $('cam-reticle').getBoundingClientRect();
  const scale = Math.max(box.width / vw, box.height / vh);
  const ox = box.left + (box.width - vw * scale) / 2;
  const oy = box.top + (box.height - vh * scale) / 2;
  const sx = (r.left - ox) / scale, sy = (r.top - oy) / scale;
  const sw = r.width / scale, sh = r.height / scale;
  const w = 640, h = Math.max(1, Math.round((640 * sh) / sw));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  return { canvas, w, h };
}

async function camTick() {
  const video = $('cam-video');
  if (!cam.stream || cam.mode !== 'mouvement' || cam.foundId || cam.shooting) return;
  if (video.readyState >= 2 && !cam.busy) {
    cam.busy = true;
    try {
      const refs = db.articles.filter((a) => a.reference).map((a) => a.reference);
      // IA activée (quota Groq limité) : on ne l'appelle que pour confirmer un numéro lu
      // localement, ou quand des zones restent illisibles plusieurs images de suite.
      const aiOn = Ai.enabled() && Date.now() > cam.aiDownUntil;
      const ai = aiOn ? async (canvas, cands, codes) => {
        const localHit = cands.find((c) => c.keep && c.code);
        cam.unreadTicks = localHit ? 0 : cam.unreadTicks + 1;
        const since = Date.now() - cam.lastAi;
        const due = localHit ? since > 1200 : cam.unreadTicks >= 3 && since > 3000;
        if (!due) return cands.map(() => null);
        cam.lastAi = Date.now();
        return Ai.readTiles(canvas, cands.slice(0, 4), codes);
      } : null;
      const onAiError = (err) => { cam.aiDownUntil = Date.now() + 30000; aiError(err); };
      const found = await Ocr.read(reticleCrop(video), refs, undefined, { radius: 24, maxCharH: 0.95, ai, onAiError });
      const hit = found.find((d) => d.code);
      // Sans IA (ou IA indisponible) : même numéro lu sur deux images de suite
      const confirmed = hit && (hit.ai || (!aiOn && cam.lastCode === hit.code));
      cam.lastCode = hit ? hit.code : null;
      if (confirmed && cam.stream && cam.mode === 'mouvement' && !cam.foundId) {
        cam.lastCode = null;
        cam.foundId = articleByRef(hit.code).id;
        ui.mvt.articleId = cam.foundId;
        ui.mvt.qty = 1;
        navigator.vibrate?.(40);
        renderCam();
      }
    } catch (err) {
      console.error(err);
    }
    cam.busy = false;
  }
  startCamLoop();
}

// Image entière de la caméra, réduite à 1600 px max.
function grabFrame(withDisplay) {
  const video = $('cam-video');
  if (!cam.stream || video.readyState < 2) return null;
  const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
  const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, w, h);
  return { canvas, w, h, display: withDisplay ? canvas.toDataURL('image/jpeg', 0.82) : null };
}

function camShoot() {
  const prepared = grabFrame(true);
  if (!prepared) return;
  closeCamera();
  analyzeShelf(prepared);
}

// Mouvement : photo du carton, lecture complète (IA comprise), numéro le plus central retenu.
async function camShootMvt() {
  const frame = grabFrame(false);
  if (!frame || cam.shooting) return;
  cam.shooting = true;
  clearTimeout(cam.timer);
  renderCam();
  try {
    const refs = db.articles.filter((a) => a.reference).map((a) => a.reference);
    const found = await Ocr.read(frame, refs, undefined, { ai: Ai.enabled() ? Ai.readTiles : null, onAiError: aiError });
    const hits = found.filter((d) => d.code)
      .sort((a, b) => Math.hypot(a.x + a.w / 2 - 0.5, a.y + a.h / 2 - 0.45) - Math.hypot(b.x + b.w / 2 - 0.5, b.y + b.h / 2 - 0.45));
    if (hits.length && cam.stream && cam.mode === 'mouvement') {
      cam.foundId = articleByRef(hits[0].code).id;
      ui.mvt.articleId = cam.foundId;
      ui.mvt.qty = 1;
      navigator.vibrate?.(40);
    } else if (!hits.length) {
      toast('Aucun numéro lu : approchez-vous du carton', true);
    }
  } catch (err) {
    console.error(err);
    toast('Lecture impossible : ' + err.message, true);
  }
  cam.shooting = false;
  if (cam.stream) { renderCam(); startCamLoop(); }
}

function onStageTap(ev) {
  const stage = $('stage');
  const rect = stage.getBoundingClientRect();
  const cx = (ev.clientX - rect.left) / rect.width;
  const cy = (ev.clientY - rect.top) / rect.height;
  const refs = db.articles.filter((a) => a.reference).sort((a, b) => sortNum(a.reference, b.reference));
  pickArticle('Ajouter un carton', refs, (id) => {
    if (!id) return;
    const w = MANUAL_SIZE;
    const h = MANUAL_SIZE * (rect.width / rect.height);
    ui.shelf.detections.push({ x: cx - w / 2, y: cy - h / 2, w, h, raw: '', code: byId(db.articles, id).reference, active: true, manual: true });
    render();
  });
}

function onMarkerTap(i) {
  const d = ui.shelf.detections[i];
  if (d.code) {
    if (d.manual) ui.shelf.detections.splice(i, 1);
    else d.active = !d.active;
    render();
    return;
  }
  const refs = db.articles.filter((a) => a.reference).sort((a, b) => sortNum(a.reference, b.reference));
  pickArticle(`Lu « ${d.raw} » : quel produit ?`, refs, (id) => {
    if (!id) ui.shelf.detections.splice(i, 1);
    else { d.code = byId(db.articles, id).reference; d.active = true; }
    render();
  }, 'Ignorer cette lecture');
}

// ---------------------------------------------------------------- exports

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function csv(rows) {
  const cell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- actions

const ACT = {
  tab: (el) => {
    ui.tab = el.dataset.tab;
    ui.page = null;
    render();
    scrollTo(0, 0);
    // SCAN ouvre directement la caméra
    if (ui.tab === 'scan') openCamera(ui.scanMode);
  },
  page: (el) => { ui.page = el.dataset.page; if (ui.page === 'historique') ui.histArticle = null; render(); scrollTo(0, 0); },
  back: () => { ui.page = null; render(); },
  'toggle-theme': () => {
    const dark = document.documentElement.dataset.theme === 'night';
    db.params.theme = dark ? 'paper' : 'night';
    persist(); applyTheme(); render();
  },
  theme: (el) => { db.params.theme = el.dataset.v; persist(); applyTheme(); render(); },

  'search-low': () => { ui.tab = 'recherche'; ui.page = null; ui.search = { q: '', cat: '', sous: '', marque: '', type: 'commander' }; render(); },
  'search-sous': (el) => {
    const sc = byId(db.sousCategories, el.dataset.id);
    ui.tab = 'recherche'; ui.page = null;
    ui.search = { q: '', cat: sc.idCategorie || '', sous: sc.id, marque: '', type: 'tous' };
    render();
  },
  'search-type': (el) => { ui.search.type = el.dataset.v; render(); },

  'open-article': (el) => openArticle(el.dataset.id),
  'new-article': () => openArticle(null),
  'article-save': saveArticle,
  'article-delete': () => {
    const a = byId(db.articles, sheetCtx.id);
    if (!confirm(`Supprimer « ${a.nom} » ?`)) return;
    db.articles = db.articles.filter((x) => x !== a);
    logEvent('A', a.nom, 'S');
    persist(); closeSheet(); toast('Produit supprimé'); render();
  },
  'article-history': () => { ui.page = 'historique'; ui.histArticle = sheetCtx.id; closeSheet(); render(); scrollTo(0, 0); },
  'article-move': () => { const id = sheetCtx.id; closeSheet(); ui.tab = 'scan'; ui.page = null; ui.scanMode = 'mouvement'; selectMvtArticle(id); },

  'edit-data': (el) => openData(el.dataset.kind, el.dataset.id || null),
  'data-save': saveData,
  'data-delete': deleteData,

  'sheet-close': closeSheet,
  'sheet-backdrop': (el, ev) => { if (ev.target === el) closeSheet(); },
  pick: (el) => { const cb = sheetCtx.callback; closeSheet(); cb(el.dataset.id || null); },

  'scan-mode': (el) => { ui.scanMode = el.dataset.v; render(); },
  'mvt-type': (el) => { ui.mvt.type = el.dataset.v; render(); if (camOpen()) renderCam(); },
  'mvt-pick': (el) => selectMvtArticle(el.dataset.id),
  'mvt-clear': () => { ui.mvt.articleId = null; render(); setTimeout(() => $('mvt-q')?.focus(), 30); },
  qty: (el) => { ui.mvt.qty = Math.max(1, ui.mvt.qty + int(el.dataset.d, -1)); render(); if (camOpen()) renderCam(); },
  'mvt-submit': submitMovement,

  'cam-open': (el) => { ui.scanMode = el.dataset.mode; render(); openCamera(el.dataset.mode); },
  'cam-close': () => { closeCamera(); render(); },
  'cam-mode': (el) => {
    cam.mode = ui.scanMode = el.dataset.v;
    cam.foundId = null;
    renderCam();
    render();
    startCamLoop();
  },
  'cam-torch': () => {
    cam.torch = !cam.torch;
    cam.track?.applyConstraints({ advanced: [{ torch: cam.torch }] }).catch(() => {});
    renderCam();
  },
  'cam-shoot': camShoot,
  'cam-shoot-mvt': camShootMvt,
  'cam-rescan': () => { cam.foundId = null; ui.mvt.articleId = null; renderCam(); startCamLoop(); },
  'cam-submit': () => {
    if (!submitMovement()) return;
    cam.foundId = null;
    renderCam();
    startCamLoop();
  },
  'ai-on': (el) => {
    const s = readAiForm();
    s.on = el.dataset.v === '1';
    if (s.on && !s.key) toast('Ajoutez d’abord votre clé API Groq', true);
    Ai.save(s);
    render();
  },
  'ai-save': () => { Ai.save(readAiForm()); toast('Réglages IA enregistrés'); render(); },
  'ai-test': async (el) => {
    const s = readAiForm();
    if (!s.key) { toast('Ajoutez d’abord votre clé API Groq', true); return; }
    Ai.save(s);
    el.disabled = true;
    el.textContent = 'Test…';
    try {
      toast(await Ai.test() ? 'Groq répond : tout est prêt' : 'Réponse inattendue de Groq', false);
    } catch (err) {
      toast(err.message, true);
    }
    render();
  },

  'cam-manual': () => {
    closeCamera();
    ui.scanMode = 'mouvement';
    ui.mvt.articleId = null;
    render();
    setTimeout(() => $('mvt-q')?.focus(), 30);
  },

  photo: (el) => {
    if (camOpen()) closeCamera();
    ui.photoPurpose = el.dataset.purpose;
    $('photo').click();
  },
  stage: (el, ev) => onStageTap(ev),
  marker: (el) => onMarkerTap(int(el.dataset.i)),
  'shelf-cancel': () => { ui.shelf = null; render(); },
  'shelf-add': () => {
    const items = shelfCounts();
    const nom = (ui.shelfName || '').trim() || `Étagère ${db.inventaire.etageres.length + 1}`;
    db.inventaire.etageres.push({ id: uid(), nom, date: new Date().toISOString(), items });
    persist();
    ui.shelf = null;
    ui.shelfName = '';
    toast(`${nom} ajoutée à l’inventaire`);
    render();
  },
  'shelf-remove': (el) => {
    const e = byId(db.inventaire.etageres, el.dataset.id);
    if (!confirm(`Retirer ${e.nom} de l’inventaire ?`)) return;
    db.inventaire.etageres = db.inventaire.etageres.filter((x) => x !== e);
    persist(); render();
  },
  'inv-clear': () => {
    if (!confirm('Vider l’inventaire en cours ?')) return;
    db.inventaire.etageres = [];
    persist(); render();
  },
  'inv-apply': () => {
    const totals = inventoryTotals();
    const changes = Object.entries(totals).map(([code, n]) => [articleByRef(code), n]).filter(([a, n]) => a && a.stocks !== n);
    if (!confirm(changes.length ? `Mettre à jour ${changes.length} produit(s) ?` : 'Aucun écart. Clôturer l’inventaire ?')) return;
    changes.forEach(([a, n]) => {
      const delta = n - a.stocks;
      addMovement(a, delta > 0 ? 'E' : 'S', Math.abs(delta), '', 'inventaire');
    });
    logEvent('I', `Inventaire · ${db.inventaire.etageres.length} étagère(s) · ${changes.length} écart(s)`, 'M');
    db.inventaire.etageres = [];
    persist();
    toast('Stock mis à jour');
    render();
  },

  'export-articles': () => {
    const rows = [['N°', 'Nom', 'Catégorie', 'Sous-catégorie', 'Marque', 'Stock', 'Stock mini', 'À commander']];
    [...db.articles].sort((a, b) => sortNum(a.reference || 'zz', b.reference || 'zz')).forEach((a) => rows.push([
      a.reference, a.nom, nomOf(db.categories, a.idCategorie), nomOf(db.sousCategories, a.idSousCategorie),
      nomOf(db.marques, a.idMarque), a.stocks, a.stocksMini, aCommander(a) ? Math.max(0, a.stocksMini - a.stocks) : 0,
    ]));
    download(`produits-${today()}.csv`, csv(rows), 'text/csv;charset=utf-8');
  },
  'export-historique': () => {
    const rows = [['Date', 'N°', 'Produit', 'Type', 'Quantité', 'Personne', 'Origine']];
    [...db.historique].sort((a, b) => b.date.localeCompare(a.date)).forEach((h) => {
      const a = byId(db.articles, h.idArticle);
      rows.push([fmtDateLong(h.date), a?.reference || '', a?.nom || 'Supprimé', h.type === 'E' ? 'Entrée' : 'Sortie', h.quantite,
        h.idUtilisateur ? nomOf(db.utilisateurs, h.idUtilisateur) : '', h.source]);
    });
    download(`historique-${today()}.csv`, csv(rows), 'text/csv;charset=utf-8');
  },
  backup: () => download(`messtocks-${today()}.json`, JSON.stringify(db, null, 2), 'application/json'),
  restore: () => $('restore').click(),
  demo: () => {
    if (!confirm('Remplacer toutes les données par la démo ?')) return;
    db = demoData(); persist(); applyTheme(); render(); toast('Démo chargée');
  },
  wipe: () => {
    if (!confirm('Effacer toutes les données de cet appareil ?')) return;
    db = emptyData(); persist(); applyTheme(); render(); toast('Données effacées');
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) fn(el, ev);
});

// Champs liés à l'état : data-bind="search.q", "mvt.qty", …
document.addEventListener('input', (ev) => {
  const el = ev.target;
  const bind = el.dataset.bind;
  if (!bind) return;
  const [scope, key] = bind.split('.');
  if (!key) { ui[scope] = el.value; return; }
  ui[scope][key] = key === 'qty' ? int(el.value, 1) : el.value;

  // Mise à jour partielle pour garder le focus pendant la saisie
  if (bind === 'search.q') $('results').innerHTML = resultsHtml();
  else if (bind === 'mvt.q') {
    const q = el.value.trim().toLowerCase();
    const exact = db.articles.find((a) => a.reference && a.reference.toLowerCase() === q);
    const sugg = q ? db.articles.filter((x) => (x.reference || '').toLowerCase().startsWith(q) || x.nom.toLowerCase().includes(q)).slice(0, 6) : [];
    $('mvt-sugg').innerHTML = suggestHtml(sugg, q);
    if (exact && sugg.length === 1) selectMvtArticle(exact.id);
  } else if (el.tagName === 'SELECT') {
    if (bind === 'search.cat') ui.search.sous = '';
    render();
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.bind === 'mvt.qty') { render(); if (camOpen()) renderCam(); }
  if (el.dataset.actChange === 'depth') {
    ui.shelf.depths[el.dataset.code] = int(el.value, 1);
    render();
  }
  // Fiche produit : la catégorie filtre les sous-catégories
  if (el.id === 'f-cat') {
    const cur = $('f-sous').value;
    const list = db.sousCategories.filter((s) => !el.value || s.idCategorie === el.value);
    $('f-sous').innerHTML = options(list, list.some((s) => s.id === cur) ? cur : '', '—');
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id !== 'f-reference') return;
  const code = Ocr.normalize(ev.target.value);
  $('f-warn').innerHTML = confusions(code, sheetCtx?.id).map((w) => `<span class="warn">! ${esc(w)}</span>`).join('');
});

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (camOpen()) { closeCamera(); render(); }
  else if (!$('sheet').classList.contains('hidden')) closeSheet();
});

// Appli en arrière-plan : on coupe la caméra
document.addEventListener('visibilitychange', () => {
  if (document.hidden && camOpen()) { closeCamera(); render(); }
});

$('photo').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (file) analyzeShelf(file);
});

$('restore').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.articles)) throw new Error('fichier invalide');
    if (!confirm(`Restaurer ${data.articles.length} produits ? Les données actuelles seront remplacées.`)) return;
    db = { ...emptyData(), ...data };
    persist(); applyTheme(); render(); toast('Sauvegarde restaurée');
  } catch (err) {
    toast('Restauration impossible : ' + err.message, true);
  }
});

// ---------------------------------------------------------------- toast

let toastTimer;
function toast(msg, warn) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (warn ? ' warn' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

applyTheme();
render();
