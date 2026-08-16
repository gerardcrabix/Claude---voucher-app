// Écrit un classeur .xlsx minimal à la main : un ZIP "stored" (aucune
// compression — le format ZIP l'autorise explicitement, et Excel/Numbers/
// Google Sheets l'ouvrent sans problème) contenant les quelques fichiers XML
// requis par le format OOXML. Dans la même logique que le lecteur PDF maison
// de ce projet : évite d'ajouter une dépendance d'environ 1 Mo (type
// SheetJS) pour un besoin aussi simple — quelques colonnes de texte/nombres
// sur une poignée de lignes, générées et téléchargées entièrement côté
// client, sans réseau.

function crc32(octets) {
  let crc = ~0;
  for (let i = 0; i < octets.length; i++) {
    crc ^= octets[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function u16(n) { return [n & 0xff, (n >> 8) & 0xff]; }
function u32(n) { return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]; }
function texteVersOctets(s) { return new TextEncoder().encode(s); }

// Construit un ZIP "stored" à partir d'une liste de { nom, contenu:
// Uint8Array }. Implémente juste ce qu'il faut de la spec ZIP (en-tête
// local + répertoire central + fin de répertoire central) pour produire un
// fichier valide, sans bibliothèque.
function construireZip(fichiers) {
  const morceaux = [];
  const centraux = [];
  let decalage = 0;

  for (const { nom, contenu } of fichiers) {
    const nomOctets = texteVersOctets(nom);
    const crc = crc32(contenu);

    const enteteLocal = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,
      ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(contenu.length), ...u32(contenu.length),
      ...u16(nomOctets.length), ...u16(0),
    ]);
    morceaux.push(enteteLocal, nomOctets, contenu);

    centraux.push(new Uint8Array([
      0x50, 0x4b, 0x01, 0x02,
      ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(contenu.length), ...u32(contenu.length),
      ...u16(nomOctets.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(decalage),
    ]));
    centraux.push(nomOctets);

    decalage += enteteLocal.length + nomOctets.length + contenu.length;
  }

  const debutCentral = decalage;
  const tailleCentral = centraux.reduce((s, m) => s + m.length, 0);

  const finCentral = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,
    ...u16(0), ...u16(0),
    ...u16(fichiers.length), ...u16(fichiers.length),
    ...u32(tailleCentral), ...u32(debutCentral),
    ...u16(0),
  ]);

  const total = [...morceaux, ...centraux, finCentral];
  const resultat = new Uint8Array(total.reduce((s, m) => s + m.length, 0));
  let pos = 0;
  for (const m of total) { resultat.set(m, pos); pos += m.length; }
  return resultat;
}

function echapperXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Index de colonne (0-based) -> lettre(s) de colonne Excel (0 -> "A", 26 ->
// "AA"…).
function colonneLettre(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function celluleXml(valeur, ref) {
  if (valeur == null || valeur === '') return '';
  if (typeof valeur === 'number' && Number.isFinite(valeur)) {
    return `<c r="${ref}"><v>${valeur}</v></c>`;
  }
  // Chaînes en ligne (t="inlineStr") plutôt qu'une table de chaînes
  // partagées séparée : un fichier de moins à générer, pour un export dont
  // le volume ne justifie pas l'optimisation.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${echapperXml(valeur)}</t></is></c>`;
}

// `lignes` : tableau de tableaux (une ligne = un tableau de cellules,
// nombre ou texte). La première ligne sert généralement d'en-têtes.
export function construireClasseurXlsx(nomFeuille, lignes) {
  const lignesXml = lignes
    .map((ligne, i) => {
      const numLigne = i + 1;
      const cellules = ligne
        .map((val, c) => celluleXml(val, `${colonneLettre(c)}${numLigne}`))
        .join('');
      return `<row r="${numLigne}">${cellules}</row>`;
    })
    .join('');

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${lignesXml}</sheetData></worksheet>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    + `</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" `
    + `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets><sheet name="${echapperXml(nomFeuille)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
    + `</Relationships>`;

  return construireZip([
    { nom: '[Content_Types].xml', contenu: texteVersOctets(contentTypes) },
    { nom: '_rels/.rels', contenu: texteVersOctets(rootRels) },
    { nom: 'xl/workbook.xml', contenu: texteVersOctets(workbookXml) },
    { nom: 'xl/_rels/workbook.xml.rels', contenu: texteVersOctets(workbookRels) },
    { nom: 'xl/worksheets/sheet1.xml', contenu: texteVersOctets(sheetXml) },
  ]);
}
