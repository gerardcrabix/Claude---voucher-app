// Lecteur PDF minimal, écrit à la main, sans dépendance externe — en
// remplacement de pdfjs-dist (~1,7 Mo, worker séparé, plusieurs échecs
// "undefined is not a function" sur un vrai iPhone malgré plusieurs
// correctifs). Ces bons d'achat sont des PDF simples générés par un
// automate (une page, police standard, flux de contenu compressé en
// FlateDecode) : pas besoin d'un moteur de rendu PDF complet, juste
// d'extraire le texte positionné.
//
// Point important, découvert sur le PDF Carrefour réel : le texte visible
// n'est pas forcément tout dans le flux de contenu direct de la page — le
// gabarit statique (libellés, mentions légales, graphisme) est souvent un
// Form XObject séparé, invoqué depuis la page via l'opérateur "Do", pendant
// que seules les valeurs variables (montant, date, numéro, PIN) sont
// dessinées directement. Il faut donc suivre ces références pour récupérer
// tout le texte, pas seulement celui du flux de contenu principal.
import { inflateZlib } from './inflate.js';

function octetsVersLatin1(bytes) {
  // Un octet = un caractère : c'est volontaire, ça préserve la
  // correspondance position <-> octet pour le parsing PDF (qui est un
  // format binaire), tout en donnant des caractères Latin-1 corrects pour
  // les chaînes littérales des PDF (WinAnsiEncoding est très proche de
  // CP1252/Latin-1 pour les caractères français courants).
  let s = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return s;
}

function chaineVersOctets(s) {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return bytes;
}

// ---- Localisation des objets PDF ------------------------------------------

// Trouve tous les "N G obj ... endobj" du fichier. Suffisant pour ces PDF
// simples à un seul niveau d'indirection, sans avoir à implémenter un vrai
// parseur de table xref (souvent absente ou remplacée par un flux xref
// compressé dans les PDF récents, plus complexe à gérer pour peu de gain
// ici).
function trouverObjets(texte) {
  const objets = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g;
  let m;
  while ((m = re.exec(texte))) {
    objets.set(Number(m[1]), m[3]);
  }
  return objets;
}

function extraireFluxEtDict(contenuObjet) {
  const idx = contenuObjet.indexOf('stream');
  if (idx === -1) return null;
  const dict = contenuObjet.slice(0, idx);
  let debut = idx + 'stream'.length;
  if (contenuObjet[debut] === '\r') debut++;
  if (contenuObjet[debut] === '\n') debut++;
  const fin = contenuObjet.indexOf('endstream', debut);
  if (fin === -1) return null;
  return { dict, brut: contenuObjet.slice(debut, fin) };
}

function decoderFluxSiCompresse(dict, brut) {
  const bytes = chaineVersOctets(brut);
  if (/\/Filter\s*\/FlateDecode/.test(dict) || /\/Filter\s*\[\s*\/FlateDecode/.test(dict)) {
    try {
      return octetsVersLatin1(inflateZlib(bytes));
    } catch {
      return null; // flux corrompu ou format inattendu : on l'ignore.
    }
  }
  if (/\/Filter/.test(dict)) {
    return null; // autre filtre (image JPX, etc.) : pas du texte, on ignore.
  }
  return brut; // pas de filtre : déjà du texte/octets bruts exploitables.
}

function extraireRefsContents(dictPage) {
  const refs = [];
  const mUnique = dictPage.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
  if (mUnique) {
    refs.push(Number(mUnique[1]));
    return refs;
  }
  const mTableau = dictPage.match(/\/Contents\s*\[([^\]]*)\]/);
  if (mTableau) {
    const re = /(\d+)\s+\d+\s+R/g;
    let m;
    while ((m = re.exec(mTableau[1]))) refs.push(Number(m[1]));
  }
  return refs;
}

// Dictionnaire /XObject d'un Resources donné : { nom -> numéro d'objet }.
function extraireDictXObject(dictResources) {
  const map = new Map();
  const mBloc = dictResources.match(/\/XObject\s*<<([^>]*(?:>>[^>]*)*?)>>/);
  if (!mBloc) return map;
  const re = /\/(\S+)\s+(\d+)\s+\d+\s+R/g;
  let m;
  while ((m = re.exec(mBloc[1]))) map.set(m[1], Number(m[2]));
  return map;
}

function trouverPage(objets) {
  for (const [num, contenu] of objets) {
    if (/\/Type\s*\/Page\b(?!s)/.test(contenu)) return { num, contenu };
  }
  return null;
}

function resoudreRefIndirecte(dict, cle) {
  const m = dict.match(new RegExp(`/${cle}\\s+(\\d+)\\s+\\d+\\s+R`));
  return m ? Number(m[1]) : null;
}

// Dictionnaire /Font d'un Resources donné : { nom -> numéro d'objet }. Même
// forme que extraireDictXObject, pour résoudre "/F7 24 Tf" vers l'objet
// police utilisé au moment de décoder le texte qui suit.
function extraireDictFont(dictResources) {
  const map = new Map();
  const mBloc = dictResources.match(/\/Font\s*<<([^>]*(?:>>[^>]*)*?)>>/);
  if (!mBloc) return map;
  const re = /\/(\S+)\s+(\d+)\s+\d+\s+R/g;
  let m;
  while ((m = re.exec(mBloc[1]))) map.set(m[1], Number(m[2]));
  return map;
}

// ---- Police composite (Type0/Identity-H) et table ToUnicode ---------------
//
// Découvert sur des bons Leroy Merlin / Fnac / IKEA réels : contrairement au
// bon Carrefour (police simple Type1/TrueType, 1 octet = 1 caractère
// WinAnsi), ces PDF utilisent des polices composites Type0 en Identity-H où
// chaque code de 2 octets dans les chaînes "Tj"/"TJ" n'est qu'un indice de
// glyphe (CID) — pas un caractère. Le texte réel n'est récupérable qu'en
// repassant chaque CID par la table ToUnicode intégrée à la police.

function hexVersUnicode(hex) {
  const propre = hex.replace(/\s+/g, '');
  let res = '';
  for (let i = 0; i < propre.length; i += 4) {
    const groupe = propre.slice(i, i + 4).padEnd(4, '0');
    res += String.fromCharCode(parseInt(groupe, 16));
  }
  return res;
}

// Parse un flux CMap ToUnicode (sections "beginbfchar"/"beginbfrange") en
// Map<code CID, texte unicode>. Gère les deux formes de bfrange : une
// destination unique qu'on incrémente sur la plage, ou un tableau donnant
// une destination explicite par code.
function analyserCMapToUnicode(texte) {
  const cmap = new Map();

  for (const blocChar of texte.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of blocChar[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      cmap.set(parseInt(m[1], 16), hexVersUnicode(m[2]));
    }
  }

  for (const blocRange of texte.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    let corps = blocRange[1];
    const reTableau = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/g;
    for (const m of corps.matchAll(reTableau)) {
      const debut = parseInt(m[1], 16);
      const destinations = [...m[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => hexVersUnicode(x[1]));
      destinations.forEach((d, i) => cmap.set(debut + i, d));
    }
    // Retire les plages "tableau" déjà traitées pour ne pas les re-matcher
    // comme des plages "destination unique" ci-dessous.
    corps = corps.replace(reTableau, '');
    for (const m of corps.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const debut = parseInt(m[1], 16);
      const fin = parseInt(m[2], 16);
      const destinationBase = parseInt(m[3], 16);
      for (let code = debut; code <= fin; code++) {
        cmap.set(code, String.fromCharCode(destinationBase + (code - debut)));
      }
    }
  }

  return cmap;
}

// WinAnsiEncoding (proche de la page de code Windows CP1252) ne coïncide
// avec Latin-1 que sur 0x00-0x7F et 0xA0-0xFF : la plage 0x80-0x9F diffère
// (Latin-1 y met des caractères de contrôle C1 invisibles, WinAnsi/CP1252 y
// met €, guillemets courbes, tirets demi/cadratin, puce…). Bug réel trouvé
// sur le bon Carrefour : le montant "50.00 €" perdait son "€" (remplacé par
// l'octet 0x80 brut, un caractère de contrôle invisible), ce qui cassait
// silencieusement la reconnaissance du montant — sans erreur ni log, juste
// un champ resté vide. Table volontairement partielle : seuls les points de
// code que WinAnsiEncoding définit réellement sont couverts, le reste passe
// tel quel (comme avant ce correctif).
const CP1252_PLAGE_HAUTE = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„',
  0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ',
  0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ',
  0x8E: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“',
  0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›',
  0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ',
};

function corrigerWinAnsi(texte) {
  let res = '';
  for (let i = 0; i < texte.length; i++) {
    const code = texte.charCodeAt(i);
    res += code >= 0x80 && code <= 0x9f ? (CP1252_PLAGE_HAUTE[code] ?? texte[i]) : texte[i];
  }
  return res;
}

// Décode les octets bruts capturés par Tj/TJ (1 caractère JS = 1 octet du
// flux, voir octetsVersLatin1) en texte réel, selon la police en cours :
// - police simple (1 octet = 1 caractère) : passthrough Latin1, corrigé sur
//   la plage 0x80-0x9F (voir corrigerWinAnsi) ;
// - police composite Type0 (2 octets = 1 CID) : passage par sa table
//   ToUnicode. Un CID absent de la table est ignoré plutôt que de produire
//   un caractère erroné.
function decoderTexteAvecPolice(octets, decodeurPolice) {
  if (!decodeurPolice || !decodeurPolice.deuxOctets) return corrigerWinAnsi(octets);
  let res = '';
  for (let i = 0; i + 1 < octets.length; i += 2) {
    const code = (octets.charCodeAt(i) << 8) | octets.charCodeAt(i + 1);
    const mappe = decodeurPolice.cmap?.get(code);
    if (mappe != null) res += mappe;
  }
  return res;
}

// ---- Mini-interpréteur du flux de contenu ---------------------------------

function decoderChaineLitterale(s) {
  let res = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      const suivant = s[i + 1];
      if (suivant === 'n') { res += '\n'; i++; }
      else if (suivant === 'r') { res += '\r'; i++; }
      else if (suivant === 't') { res += '\t'; i++; }
      else if (suivant === 'b') { res += '\b'; i++; }
      else if (suivant === 'f') { res += '\f'; i++; }
      else if (suivant === '(' || suivant === ')' || suivant === '\\') { res += suivant; i++; }
      else if (suivant >= '0' && suivant <= '7') {
        let oct = suivant;
        i++;
        for (let k = 0; k < 2 && s[i + 1] >= '0' && s[i + 1] <= '7'; k++) { oct += s[i + 1]; i++; }
        res += String.fromCharCode(parseInt(oct, 8) & 0xff);
      } else if (suivant === '\n') { i++; }
      else { res += suivant; i++; }
    } else {
      res += c;
    }
  }
  return res;
}

function decoderChaineHex(s) {
  const propre = s.replace(/\s+/g, '');
  let res = '';
  for (let i = 0; i < propre.length; i += 2) {
    res += String.fromCharCode(parseInt(propre.slice(i, i + 2).padEnd(2, '0'), 16));
  }
  return res;
}

// Interprète un flux de contenu et ajoute les fragments de texte trouvés à
// `items` (offsetX/offsetY = position d'insertion du bloc, pour composer
// correctement un Form XObject invoqué via "cm ... Do"). `resoudreDo`
// permet de descendre récursivement dans les Form XObject référencés.
// `dictFontCourant` (nom -> numéro d'objet police) et `decodeurPour` (numéro
// d'objet police -> décodeur, mémoïsé côté appelant) servent à décoder le
// texte selon la police sélectionnée par "Tf" — nécessaire pour les
// polices composites Type0/Identity-H (voir decoderTexteAvecPolice).
function interpreterFluxDeContenu(contenu, items, offsetX, offsetY, dictFontCourant, decodeurPour, resoudreDo, profondeur) {
  // Matrice de texte courante [a, b, c, d, e, f] — identité au départ de
  // chaque bloc BT. "Td tx ty" ne fait PAS que soustraire tx/ty : il
  // compose la translation avec cette matrice (e' = tx*a + ty*c + e,
  // f' = tx*b + ty*d + f). Sur ce PDF réel, "Tm" fixe une échelle de 11
  // (taille de police) — ignorer cette composition faisait retomber les
  // libellés à ~3 points d'écart au lieu de ~35, cassant l'association
  // libellé/valeur alors que le texte brut était pourtant correct.
  let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;
  let cmOffsetX = 0;
  let cmOffsetY = 0;
  let decodeurPoliceCourante = null;

  const re = /\((?:\\.|[^\\)])*\)|<[^>]*>|\[(?:[^[\]]|\[[^[\]]*\])*\]|-?\d*\.?\d+|\/[A-Za-z0-9]+|[A-Za-z*']+/g;
  let m;
  const pile = [];

  while ((m = re.exec(contenu))) {
    const tok = m[0];

    if (tok[0] === '(') {
      pile.push({ type: 'str', valeur: decoderChaineLitterale(tok.slice(1, -1)) });
    } else if (tok[0] === '<') {
      pile.push({ type: 'str', valeur: decoderChaineHex(tok.slice(1, -1)) });
    } else if (tok[0] === '[') {
      const interieur = tok.slice(1, -1);
      const reStr = /\((?:\\.|[^\\)])*\)|<[^>]*>/g;
      let texte = '';
      let mm;
      while ((mm = reStr.exec(interieur))) {
        texte += mm[0][0] === '(' ? decoderChaineLitterale(mm[0].slice(1, -1)) : decoderChaineHex(mm[0].slice(1, -1));
      }
      pile.push({ type: 'str', valeur: texte });
    } else if (tok[0] === '/') {
      pile.push({ type: 'nom', valeur: tok.slice(1) });
    } else if (/^-?\d*\.?\d+$/.test(tok)) {
      pile.push({ type: 'num', valeur: parseFloat(tok) });
    } else {
      if (tok === 'BT') {
        // Chaque nouveau bloc BT...ET réinitialise la position du texte à
        // (0,0) — sans ça, les Td des blocs suivants s'accumulent sur la
        // position laissée par le bloc précédent au lieu de repartir de
        // zéro (bug constaté : positions qui grandissent sans fin d'une
        // valeur à l'autre).
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      } else if (tok === 'Tf') {
        const nomPolice = [...pile].reverse().find((p) => p.type === 'nom');
        const numPolice = nomPolice ? dictFontCourant.get(nomPolice.valeur) : null;
        decodeurPoliceCourante = numPolice != null ? decodeurPour(numPolice) : null;
      } else if (tok === 'Tm') {
        const nums = pile.filter((p) => p.type === 'num').map((p) => p.valeur);
        if (nums.length >= 6) [a, b, c, d, e, f] = nums;
      } else if (tok === 'Td' || tok === 'TD') {
        const nums = pile.filter((p) => p.type === 'num').map((p) => p.valeur);
        if (nums.length >= 2) {
          const [tx, ty] = nums;
          e = tx * a + ty * c + e;
          f = tx * b + ty * d + f;
        }
      } else if (tok === 'cm') {
        // Matrice de transformation courante : on ne garde que la
        // translation (e, f) — suffisant pour composer la position des
        // Form XObject invoqués juste après, sans faire de l'algèbre
        // matricielle complète pour un usage aussi simple.
        const nums = pile.filter((p) => p.type === 'num').map((p) => p.valeur);
        if (nums.length >= 6) { cmOffsetX = nums[4]; cmOffsetY = nums[5]; }
      } else if (tok === 'Tj' || tok === 'TJ' || tok === "'" || tok === '"') {
        const s = [...pile].reverse().find((p) => p.type === 'str');
        if (s) {
          const enComposite = !!decodeurPoliceCourante?.deuxOctets;
          let texte = decoderTexteAvecPolice(s.valeur, decodeurPoliceCourante);
          // Bug connu du générateur de ces PDF (Leroy Merlin/Fnac/IKEA) : le
          // glyphe espace d'une police composite est mappé dans sa table
          // ToUnicode vers TAB (U+0009) au lieu de U+0020. On le normalise
          // et on le garde comme fragment à part entière (au lieu de le
          // rejeter comme "vide") : c'est lui qui porte l'espacement réel
          // entre les mots, voir assemblerLigne() dans analyserLignesBon.js.
          if (enComposite) texte = texte.replace(/[\t\n\r\f\v]/g, ' ');
          const aGarder = enComposite ? texte !== '' : texte.trim() !== '';
          if (aGarder) {
            items.push({ str: texte, transform: [1, 0, 0, 1, offsetX + e, offsetY + f] });
          }
        }
      } else if (tok === 'Do' && profondeur < 6) {
        const nom = [...pile].reverse().find((p) => p.type === 'nom');
        if (nom) resoudreDo(nom.valeur, offsetX + cmOffsetX, offsetY + cmOffsetY, profondeur + 1);
      } else if (tok === 'q') {
        cmOffsetX = 0;
        cmOffsetY = 0;
      }
      pile.length = 0;
    }
  }
}

// Renvoie une liste d'"items" { str, transform } — transform[4]/[5] = x/y —
// même forme que les items de pdfjs, pour rester compatible avec
// construireLignes() sans rien changer côté analyse.
export function extraireItemsPdf(buffer) {
  const octets = new Uint8Array(buffer);
  const texteComplet = octetsVersLatin1(octets);
  const objets = trouverObjets(texteComplet);
  const page = trouverPage(objets);
  const items = [];

  function contenuDecodeDe(num) {
    const contenuObjet = objets.get(num);
    if (!contenuObjet) return null;
    const flux = extraireFluxEtDict(contenuObjet);
    if (!flux) return null;
    return decoderFluxSiCompresse(flux.dict, flux.brut);
  }

  function dictResourcesDe(dictObjet) {
    const numRes = resoudreRefIndirecte(dictObjet, 'Resources');
    if (numRes == null) return dictObjet; // Resources parfois inline (rare ici)
    return objets.get(numRes) || '';
  }

  // Décodeur de police mémoïsé par numéro d'objet — partagé pour tout le
  // document (une police définie dans les Resources de la page a le même
  // numéro d'objet partout où elle est référencée, y compris depuis un Form
  // XObject).
  const cacheDecodeursPolice = new Map();
  function decodeurPour(numPolice) {
    if (numPolice == null) return null;
    if (!cacheDecodeursPolice.has(numPolice)) {
      const dictPolice = objets.get(numPolice);
      let decodeur = null;
      if (dictPolice) {
        const estType0 = /\/Subtype\s*\/Type0\b/.test(dictPolice);
        let cmap = null;
        const numToUnicode = resoudreRefIndirecte(dictPolice, 'ToUnicode');
        if (numToUnicode != null) {
          const brut = contenuDecodeDe(numToUnicode);
          if (brut) cmap = analyserCMapToUnicode(brut);
        }
        decodeur = { deuxOctets: estType0, cmap };
      }
      cacheDecodeursPolice.set(numPolice, decodeur);
    }
    return cacheDecodeursPolice.get(numPolice);
  }

  // Résout et interprète un Form XObject invoqué par "Do", en composant sa
  // position avec le décalage accumulé par les "cm" qui précèdent l'appel.
  function resoudreDo(dictResourcesCourant, nom, offX, offY, profondeur) {
    const xobjets = extraireDictXObject(dictResourcesCourant);
    const numCible = xobjets.get(nom);
    if (numCible == null) return;
    const contenuCible = objets.get(numCible);
    if (!contenuCible) return;
    if (!/\/Subtype\s*\/Form\b/.test(contenuCible)) return; // image, etc. : pas de texte.

    const decode = contenuDecodeDe(numCible);
    if (!decode) return;
    const dictRessourcesCible = dictResourcesDe(contenuCible);
    interpreterFluxDeContenu(
      decode,
      items,
      offX,
      offY,
      extraireDictFont(dictRessourcesCible),
      decodeurPour,
      (n, ox, oy, p) => resoudreDo(dictRessourcesCible, n, ox, oy, p),
      profondeur
    );
  }

  if (page) {
    const dictRessourcesPage = dictResourcesDe(page.contenu);
    const dictFontPage = extraireDictFont(dictRessourcesPage);
    for (const numContenu of extraireRefsContents(page.contenu)) {
      const decode = contenuDecodeDe(numContenu);
      if (!decode) continue;
      interpreterFluxDeContenu(
        decode,
        items,
        0,
        0,
        dictFontPage,
        decodeurPour,
        (n, ox, oy, p) => resoudreDo(dictRessourcesPage, n, ox, oy, p),
        0
      );
    }
  } else {
    // Filet de sécurité : PDF atypique sans objet /Type/Page repérable —
    // on tente quand même tous les flux qui ressemblent à du contenu.
    for (const [num] of objets) {
      const decode = contenuDecodeDe(num);
      if (decode && /\bBT\b/.test(decode)) {
        interpreterFluxDeContenu(decode, items, 0, 0, new Map(), decodeurPour, () => {}, 0);
      }
    }
  }

  return items;
}

// ---- Extraction d'une image "code-barres" ---------------------------------
//
// Découvert sur le vrai bon Carrefour : le code-barres imprimé sur le bon
// est une véritable image /Subtype /Image dans le PDF (356×30, niveaux de
// gris 1 bit, FlateDecode avec un prédicteur PNG), référencée directement
// depuis les Resources de la page — pas juste du texte ou des lignes
// dessinées. Les bons Leroy Merlin/Fnac/IKEA testés n'ont eux aucune image
// de ce type (juste une photo décorative) : cette fonction renvoie `null`
// dans ce cas, et l'appelant se rabat sur un QR code généré depuis le code
// du bon (voir qrcode.js).

// Une image "en forme de code-barres" est beaucoup plus large que haute.
// Seuil volontairement large pour rester tolérant à d'autres gabarits.
function ressembleAUnCodeBarres(w, h) {
  return w > 0 && h > 0 && w / h >= 4 && h <= 120;
}

function nombreDict(dict, cle, defaut) {
  const m = dict.match(new RegExp(`/${cle}\\s+(\\d+)`));
  return m ? Number(m[1]) : defaut;
}

// Inverse un prédicteur PNG (DecodeParms /Predictor 10-15) : chaque ligne
// codée est précédée d'un octet de type de filtre (0 None, 1 Sub, 2 Up,
// 3 Average, 4 Paeth) à annuler pour retrouver les octets bruts de l'image.
function inverserPredicteurPng(octets, colonnes, couleurs, bitsParComposante) {
  const bpp = Math.max(1, Math.ceil((couleurs * bitsParComposante) / 8));
  const octetsParLigne = Math.ceil((colonnes * couleurs * bitsParComposante) / 8);
  const nbLignes = Math.floor(octets.length / (octetsParLigne + 1));
  const resultat = new Uint8Array(nbLignes * octetsParLigne);
  let precedente = new Uint8Array(octetsParLigne);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  for (let l = 0; l < nbLignes; l++) {
    const debut = l * (octetsParLigne + 1);
    const typeFiltre = octets[debut];
    const ligneBrute = octets.subarray(debut + 1, debut + 1 + octetsParLigne);
    const ligneSortie = resultat.subarray(l * octetsParLigne, (l + 1) * octetsParLigne);

    for (let i = 0; i < octetsParLigne; i++) {
      const a = i >= bpp ? ligneSortie[i - bpp] : 0;
      const b = precedente[i];
      const c = i >= bpp ? precedente[i - bpp] : 0;
      let valeur = ligneBrute[i];
      if (typeFiltre === 1) valeur = (valeur + a) & 0xff;
      else if (typeFiltre === 2) valeur = (valeur + b) & 0xff;
      else if (typeFiltre === 3) valeur = (valeur + Math.floor((a + b) / 2)) & 0xff;
      else if (typeFiltre === 4) valeur = (valeur + paeth(a, b, c)) & 0xff;
      ligneSortie[i] = valeur;
    }
    precedente = ligneSortie;
  }
  return resultat;
}

// Décode une image /Subtype /Image en bitmap { width, height, pixels }
// (pixels : 1 octet par pixel, 0 = noir, 1 = blanc). Ne gère que le cas
// rencontré en pratique pour un code-barres (FlateDecode, 1 bit par pixel,
// niveaux de gris) — largement suffisant pour ce besoin précis ; les autres
// cas renvoient `null` et laissent la place au repli (QR généré).
function decoderImageMonochrome(dict, brut) {
  const w = nombreDict(dict, 'Width', 0);
  const h = nombreDict(dict, 'Height', 0);
  const bpc = nombreDict(dict, 'BitsPerComponent', 8);
  const predicteur = nombreDict(dict, 'Predictor', 1);
  const colonnes = nombreDict(dict, 'Columns', w);
  const couleurs = nombreDict(dict, 'Colors', 1);
  const decodeInverse = /\/Decode\s*\[\s*1\s+0\s*\]/.test(dict);

  if (!w || !h || bpc !== 1 || couleurs !== 1) return null;
  if (!/\/Filter\s*\/FlateDecode/.test(dict) && !/\/Filter\s*\[\s*\/FlateDecode/.test(dict)) return null;

  let donnees;
  try {
    donnees = inflateZlib(chaineVersOctets(brut));
  } catch {
    return null;
  }
  if (predicteur >= 10) {
    donnees = inverserPredicteurPng(donnees, colonnes, couleurs, bpc);
  }

  const octetsParLigne = Math.ceil(w / 8);
  if (donnees.length < octetsParLigne * h) return null;

  const pixels = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const octet = donnees[y * octetsParLigne + (x >> 3)];
      const bit = (octet >> (7 - (x & 7))) & 1;
      pixels[y * w + x] = decodeInverse ? 1 - bit : bit;
    }
  }
  return { width: w, height: h, pixels };
}

// Renvoie { width, height, pixels } de la première image "en forme de
// code-barres" trouvée dans les Resources de la page, en descendant au
// besoin dans les Form XObject (le gabarit statique d'un bon vit souvent
// là — voir le commentaire en tête de fichier) ; sinon `null`.
export function extraireImageCodeBarres(buffer) {
  const octets = new Uint8Array(buffer);
  const texteComplet = octetsVersLatin1(octets);
  const objets = trouverObjets(texteComplet);
  const page = trouverPage(objets);
  if (!page) return null;

  function dictResourcesDe(dictObjet) {
    const numRes = resoudreRefIndirecte(dictObjet, 'Resources');
    if (numRes == null) return dictObjet;
    return objets.get(numRes) || '';
  }

  function chercherDans(dictResources, profondeur) {
    if (profondeur > 6) return null;
    const mBloc = dictResources.match(/\/XObject\s*<<([^>]*(?:>>[^>]*)*?)>>/);
    if (!mBloc) return null;
    const re = /\/(\S+)\s+(\d+)\s+\d+\s+R/g;
    const candidats = [];
    let m;
    while ((m = re.exec(mBloc[1]))) candidats.push(Number(m[2]));

    for (const num of candidats) {
      const contenuObjet = objets.get(num);
      if (!contenuObjet || !/\/Subtype\s*\/Image\b/.test(contenuObjet)) continue;
      const w = nombreDict(contenuObjet, 'Width', 0);
      const h = nombreDict(contenuObjet, 'Height', 0);
      if (!ressembleAUnCodeBarres(w, h)) continue;
      const flux = extraireFluxEtDict(contenuObjet);
      if (!flux) continue;
      const image = decoderImageMonochrome(flux.dict, flux.brut);
      if (image) return image;
    }

    for (const num of candidats) {
      const contenuObjet = objets.get(num);
      if (!contenuObjet || !/\/Subtype\s*\/Form\b/.test(contenuObjet)) continue;
      const dictRessourcesCible = dictResourcesDe(contenuObjet);
      const trouve = chercherDans(dictRessourcesCible, profondeur + 1);
      if (trouve) return trouve;
    }
    return null;
  }

  return chercherDans(dictResourcesDe(page.contenu), 0);
}
