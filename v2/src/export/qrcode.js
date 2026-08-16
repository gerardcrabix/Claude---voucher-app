// Générateur de QR code minimal, écrit à la main — mode octet uniquement,
// niveau de correction d'erreur M, versions 1 à 10 (largement suffisant pour
// un code de bon d'achat, une vingtaine de caractères au plus). Sert de
// repli quand le PDF du bon ne contient pas d'image de code-barres
// extractible (voir extraireImageCodeBarres dans lecteurPdfMinimal.js) :
// un QR généré à partir du code, pour pouvoir le présenter/scanner en
// magasin directement depuis l'appli. Vérifié par comparaison module par
// module avec la bibliothèque Python `qrcode` (référence de confiance) et
// par décodage indépendant (OpenCV) avant intégration.
//
// Renvoie { width, height, pixels } (1 octet par pixel, 0 = noir, 1 = blanc)
// — même forme que extraireImageCodeBarres, pour partager le même
// convertisseur vers "data:" URL (bitmapMonochromeVersDataUrl).

// ---- Arithmétique GF(256) (polynôme primitif x^8+x^4+x^3+x^2+1 = 0x11D) --

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

// Polynôme générateur Reed-Solomon de degré `n` : produit des (x - 2^i)
// pour i = 0..n-1, calculé directement (pas besoin de table par version).
function polynomeGenerateur(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const suivant = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      // Multiplier par (x + α^i) : la partie "×x" décale un cran vers le
      // bas de degré SANS changer la valeur (donc même indice j, le
      // coefficient de tête reste 1) ; la partie "×α^i" se décale d'un
      // indice de plus (j+1), elle. Les avoir inversés était le bug :
      // un cas particulier (n=1, α^0=1) le masquait par coïncidence.
      suivant[j] ^= poly[j];
      suivant[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = suivant;
  }
  return poly; // du plus haut degré au plus bas
}

// Codewords de correction d'erreur pour un bloc de données, par division
// polynomiale dans GF(256) (comme une division euclidienne classique).
function codewordsCorrection(donnees, nbEcc) {
  const generateur = polynomeGenerateur(nbEcc);
  const reste = new Uint8Array(donnees.length + nbEcc);
  reste.set(donnees);
  for (let i = 0; i < donnees.length; i++) {
    const coef = reste[i];
    if (coef === 0) continue;
    for (let j = 0; j < generateur.length; j++) {
      reste[i + j] ^= gfMul(generateur[j], coef);
    }
  }
  return reste.subarray(donnees.length);
}

// ---- Table de structure des blocs (niveau M uniquement, versions 1-10) ---
// [totalCodewordsDonnees, eccParBloc, blocsGroupe1, donneesParBlocGroupe1, blocsGroupe2, donneesParBlocGroupe2]
const STRUCTURE_M = {
  1: [16, 10, 1, 16, 0, 0],
  2: [28, 16, 1, 28, 0, 0],
  3: [44, 26, 1, 44, 0, 0],
  4: [64, 18, 2, 32, 0, 0],
  5: [86, 24, 2, 43, 0, 0],
  6: [108, 16, 4, 27, 0, 0],
  7: [124, 18, 4, 31, 0, 0],
  8: [154, 22, 2, 38, 2, 39],
  9: [182, 22, 3, 36, 2, 37],
  10: [216, 26, 4, 43, 1, 44],
};

// Positions des centres des motifs d'alignement, par version (vide en v1).
const ALIGNEMENTS = {
  2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 48], 10: [6, 28, 52],
};

function tailleMatrice(version) {
  return version * 4 + 17;
}

// ---- Encodage des données (mode octet) ------------------------------------

function encoderDonnees(octets, version) {
  const [totalDonnees] = STRUCTURE_M[version];
  const bits = [];
  const pousser = (valeur, nbBits) => {
    for (let i = nbBits - 1; i >= 0; i--) bits.push((valeur >> i) & 1);
  };

  pousser(0b0100, 4); // indicateur de mode : octet
  const bitsCompte = version <= 9 ? 8 : 16;
  pousser(octets.length, bitsCompte);
  for (const o of octets) pousser(o, 8);

  const capaciteBits = totalDonnees * 8;
  // Terminateur (jusqu'à 4 bits de 0), puis complétage à l'octet.
  for (let i = 0; i < 4 && bits.length < capaciteBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    codewords.push(v);
  }
  // Octets de bourrage alternés (spec QR), jusqu'à remplir la capacité.
  const PAD = [0xec, 0x11];
  let p = 0;
  while (codewords.length < totalDonnees) {
    codewords.push(PAD[p % 2]);
    p++;
  }
  return codewords;
}

// Découpe en blocs, calcule la correction d'erreur par bloc, puis
// entrelace données et correction comme l'exige la spec.
function construireCodewordsFinaux(codewords, version) {
  const [, eccParBloc, blocs1, donnees1, blocs2, donnees2] = STRUCTURE_M[version];
  const blocsDonnees = [];
  let pos = 0;
  for (let i = 0; i < blocs1; i++) { blocsDonnees.push(codewords.slice(pos, pos + donnees1)); pos += donnees1; }
  for (let i = 0; i < blocs2; i++) { blocsDonnees.push(codewords.slice(pos, pos + donnees2)); pos += donnees2; }

  const blocsEcc = blocsDonnees.map((bloc) => Array.from(codewordsCorrection(Uint8Array.from(bloc), eccParBloc)));

  const resultat = [];
  const maxDonnees = Math.max(donnees1, donnees2 || 0);
  for (let i = 0; i < maxDonnees; i++) {
    for (const bloc of blocsDonnees) if (i < bloc.length) resultat.push(bloc[i]);
  }
  for (let i = 0; i < eccParBloc; i++) {
    for (const bloc of blocsEcc) resultat.push(bloc[i]);
  }
  return resultat;
}

// ---- Construction de la matrice --------------------------------------------

function creerMatriceVide(taille) {
  return Array.from({ length: taille }, () => new Array(taille).fill(null));
}

function placerMotifRecherche(m, x0, y0) {
  for (let y = -1; y <= 7; y++) {
    for (let x = -1; x <= 7; x++) {
      const px = x0 + x, py = y0 + y;
      if (px < 0 || py < 0 || px >= m.length || py >= m.length) continue;
      const surBord = x === -1 || x === 7 || y === -1 || y === 7;
      const anneauNoir = x >= 0 && x <= 6 && y >= 0 && y <= 6 && (x === 0 || x === 6 || y === 0 || y === 6);
      const centre = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      m[py][px] = surBord ? 0 : (anneauNoir || centre ? 1 : 0);
    }
  }
}

function placerMotifAlignement(m, cx, cy) {
  for (let y = -2; y <= 2; y++) {
    for (let x = -2; x <= 2; x++) {
      const anneau = Math.max(Math.abs(x), Math.abs(y));
      m[cy + y][cx + x] = anneau === 1 ? 0 : 1;
    }
  }
}

function reserverZonesFonction(reserve, taille, version) {
  const marquer = (x, y) => { reserve[y][x] = true; };
  for (let d = 0; d < 9; d++) {
    marquer(d, 8); marquer(8, d);
  }
  for (let d = 0; d < 8; d++) {
    marquer(taille - 1 - d, 8); marquer(8, taille - 1 - d);
  }
  for (let x = 0; x < taille; x++) marquer(x, 6);
  for (let y = 0; y < taille; y++) marquer(6, y);
  for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
    if (x >= 0 && y >= 0 && x < taille && y < taille) marquer(x, y);
  }
  // Motif haut-droit et bas-gauche (7x7 + séparateur d'1 module)
  for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
    const px1 = taille - 7 + x, py1 = y;
    if (px1 >= 0 && py1 >= 0 && px1 < taille && py1 < taille) marquer(px1, py1);
    const px2 = x, py2 = taille - 7 + y;
    if (px2 >= 0 && py2 >= 0 && px2 < taille && py2 < taille) marquer(px2, py2);
  }
  const positions = ALIGNEMENTS[version] || [];
  for (const cy of positions) {
    for (const cx of positions) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === taille - 7) || (cx === taille - 7 && cy === 6)) continue;
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) marquer(cx + x, cy + y);
    }
  }
}

const FORMULES_MASQUE = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, _y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// BCH(15,5) pour les informations de format, générateur 0x537, masque final
// 0x5412 — valeurs fixes de la spec QR.
function bitsFormat(niveauEccBits, masque) {
  const data = (niveauEccBits << 3) | masque;
  let reste = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((reste >> i) & 1) reste ^= 0x537 << (i - 10);
  }
  const combine = ((data << 10) | reste) ^ 0x5412;
  const bits = [];
  for (let i = 14; i >= 0; i--) bits.push((combine >> i) & 1);
  return bits;
}

function placerFormat(m, masque) {
  const bits = bitsFormat(0b00, masque); // 00 = niveau M
  const taille = m.length;
  const seq1 = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  // Le bit de poids faible (LSB, bits[14]) se place en premier sur le
  // chemin, le poids fort (MSB, bits[0]) en dernier — vérifié par
  // comparaison directe avec une bibliothèque de référence.
  for (let i = 0; i < 15; i++) {
    const [x, y] = seq1[i];
    m[y][x] = bits[14 - i];
  }
  // Deuxième copie : 8 modules le long de la ligne 8 (haut-droit, de
  // droite à gauche) puis 7 modules le long de la colonne 8 (bas-gauche,
  // de haut en bas) = 15 au total, même ordre LSB->MSB que seq1.
  const seq2 = [];
  for (let d = 0; d < 8; d++) seq2.push([taille - 1 - d, 8]);
  for (let d = 0; d < 7; d++) seq2.push([8, taille - 7 + d]);
  for (let i = 0; i < 15; i++) { const [x, y] = seq2[i]; m[y][x] = bits[14 - i]; }
  m[taille - 8][8] = 1; // module sombre, toujours noir
}

function placerDonnees(m, reserve, codewords, masque) {
  const taille = m.length;
  const bits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  let idx = 0;
  const formule = FORMULES_MASQUE[masque];

  let x = taille - 1;
  let montant = true;
  while (x > 0) {
    if (x === 6) x--; // colonne de synchronisation entièrement sautée
    for (let i = 0; i < taille; i++) {
      const y = montant ? taille - 1 - i : i;
      for (const colonne of [x, x - 1]) {
        if (reserve[y][colonne]) continue;
        let bit = idx < bits.length ? bits[idx] : 0;
        idx++;
        if (formule(colonne, y)) bit ^= 1;
        m[y][colonne] = bit;
      }
    }
    montant = !montant;
    x -= 2;
  }
}

function penalite(m) {
  const taille = m.length;
  let score = 0;
  // Règle 1 : runs horizontaux/verticaux >= 5
  for (let y = 0; y < taille; y++) {
    let run = 1;
    for (let x = 1; x < taille; x++) {
      if (m[y][x] === m[y][x - 1]) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    if (run >= 5) score += run - 2;
  }
  for (let x = 0; x < taille; x++) {
    let run = 1;
    for (let y = 1; y < taille; y++) {
      if (m[y][x] === m[y - 1][x]) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    if (run >= 5) score += run - 2;
  }
  // Règle 2 : blocs 2x2 uniformes
  for (let y = 0; y < taille - 1; y++) {
    for (let x = 0; x < taille - 1; x++) {
      const v = m[y][x];
      if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) score += 3;
    }
  }
  // Règle 3 : motifs ressemblant au repère de recherche (1:1:3:1:1)
  const motif = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const motifInverse = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x <= taille - 11; x++) {
      const segment = [];
      for (let i = 0; i < 11; i++) segment.push(m[y][x + i]);
      if (segment.every((v, i) => v === motif[i]) || segment.every((v, i) => v === motifInverse[i])) score += 40;
    }
  }
  for (let x = 0; x < taille; x++) {
    for (let y = 0; y <= taille - 11; y++) {
      const segment = [];
      for (let i = 0; i < 11; i++) segment.push(m[y + i][x]);
      if (segment.every((v, i) => v === motif[i]) || segment.every((v, i) => v === motifInverse[i])) score += 40;
    }
  }
  // Règle 4 : proportion noir/blanc
  let noirs = 0;
  for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) if (m[y][x]) noirs++;
  const pourcent = (noirs * 100) / (taille * taille);
  score += Math.floor(Math.abs(pourcent - 50) / 5) * 10;
  return score;
}

// Plafonné à la version 6 (106 octets de capacité brute, largement de quoi
// tenir un code de bon d'achat d'une vingtaine de caractères) : à partir de
// la version 7, la spec QR exige un bloc d'informations de version en plus
// des informations de format — non implémenté ici pour rester simple, sans
// jamais produire un QR invalide (verifié par comparaison avec une
// bibliothèque de référence jusqu'à la version 10 avant de plafonner ici).
function choisirVersion(nbOctets) {
  for (let v = 1; v <= 6; v++) {
    const [totalDonnees] = STRUCTURE_M[v];
    const capaciteOctets = totalDonnees - Math.ceil((4 + 8) / 8);
    if (nbOctets <= capaciteOctets) return v;
  }
  return null; // texte trop long pour ce générateur (cas non rencontré en pratique)
}

// Génère un QR code (mode octet, niveau M) à partir d'une chaîne — renvoie
// { width, height, pixels } (0 = noir, 1 = blanc), ou `null` si le texte est
// trop long pour les versions supportées (jusqu'à la v10, ~170 octets).
export function genererQrCode(texte) {
  const octets = new TextEncoder().encode(texte);
  const version = choisirVersion(octets.length);
  if (!version) return null;

  const donnees = encoderDonnees(octets, version);
  const codewordsFinaux = construireCodewordsFinaux(donnees, version);

  const taille = tailleMatrice(version);
  const reserve = Array.from({ length: taille }, () => new Array(taille).fill(false));
  reserverZonesFonction(reserve, taille, version);

  let meilleure = null;
  let meilleurScore = Infinity;
  for (let masque = 0; masque < 8; masque++) {
    const m = creerMatriceVide(taille);
    placerMotifRecherche(m, 0, 0);
    placerMotifRecherche(m, taille - 7, 0);
    placerMotifRecherche(m, 0, taille - 7);
    for (const cy of (ALIGNEMENTS[version] || [])) {
      for (const cx of (ALIGNEMENTS[version] || [])) {
        if ((cx === 6 && cy === 6) || (cx === 6 && cy === taille - 7) || (cx === taille - 7 && cy === 6)) continue;
        placerMotifAlignement(m, cx, cy);
      }
    }
    for (let i = 8; i < taille - 8; i++) { m[6][i] = i % 2 === 0 ? 1 : 0; m[i][6] = i % 2 === 0 ? 1 : 0; }
    placerDonnees(m, reserve, codewordsFinaux, masque);
    placerFormat(m, masque);

    const score = penalite(m);
    if (score < meilleurScore) { meilleurScore = score; meilleure = m; }
  }

  const pixels = new Uint8Array(taille * taille);
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      pixels[y * taille + x] = meilleure[y][x] ? 0 : 1; // 1 (module noir) -> pixel 0 (noir)
    }
  }
  return { width: taille, height: taille, pixels };
}
