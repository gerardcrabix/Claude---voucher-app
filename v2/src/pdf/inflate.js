// Décompresseur DEFLATE (RFC 1951) + wrapper zlib (RFC 1950), en JS pur,
// sans aucune dépendance ni API navigateur récente (pas de
// DecompressionStream, pas de bibliothèque externe). Les PDF compressent
// leurs flux de contenu avec /FlateDecode, qui est exactement ce format.
//
// Implémentation compacte mais complète (tables de Huffman dynamiques et
// fixes, blocs stockés), suffisante pour décompresser les flux de texte
// des PDF — pas besoin de vitesse extrême, juste de fiabilité et de
// compatibilité maximale (ça doit tourner sur n'importe quel moteur JS).

const LENGTH_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LENGTH_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const CODE_LENGTH_ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

class LecteurBits {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0; // en bits
  }
  lireBit() {
    const octet = this.bytes[this.pos >> 3];
    const bit = (octet >> (this.pos & 7)) & 1;
    this.pos++;
    return bit;
  }
  lireBits(n) {
    let valeur = 0;
    for (let i = 0; i < n; i++) valeur |= this.lireBit() << i;
    return valeur;
  }
  alignerOctet() {
    this.pos = (this.pos + 7) & ~7;
  }
}

// Table de Huffman construite à partir des longueurs de code (méthode
// canonique standard décrite dans la RFC 1951).
function construireHuffman(longueurs) {
  const max = Math.max(...longueurs);
  const compte = new Array(max + 1).fill(0);
  for (const l of longueurs) if (l > 0) compte[l]++;
  const premierCode = new Array(max + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= max; bits++) {
    code = (code + compte[bits - 1]) << 1;
    premierCode[bits] = code;
  }
  const codes = new Array(longueurs.length);
  const suivant = premierCode.slice();
  for (let i = 0; i < longueurs.length; i++) {
    const l = longueurs[i];
    if (l > 0) {
      codes[i] = { code: suivant[l], longueur: l };
      suivant[l]++;
    }
  }
  return { codes, max };
}

// La recherche linéaire ci-dessus est correcte mais lente sur de gros
// fichiers ; on construit un index code->symbole par longueur pour aller
// plus vite sur les blocs dynamiques (les PDF de bons restent petits, mais
// autant rester raisonnable).
function indexerHuffman(table) {
  const parLongueur = new Map();
  for (let sym = 0; sym < table.codes.length; sym++) {
    const c = table.codes[sym];
    if (!c) continue;
    const cle = `${c.longueur}:${c.code}`;
    parLongueur.set(cle, sym);
  }
  table.index = parLongueur;
}

function decoderSymboleRapide(lecteur, table) {
  let code = 0;
  for (let longueur = 1; longueur <= table.max; longueur++) {
    code = (code << 1) | lecteur.lireBit();
    const sym = table.index.get(`${longueur}:${code}`);
    if (sym !== undefined) return sym;
  }
  throw new Error('DEFLATE: code Huffman invalide');
}

function tableFixeLitteraux() {
  const longueurs = new Array(288);
  for (let i = 0; i <= 143; i++) longueurs[i] = 8;
  for (let i = 144; i <= 255; i++) longueurs[i] = 9;
  for (let i = 256; i <= 279; i++) longueurs[i] = 7;
  for (let i = 280; i <= 287; i++) longueurs[i] = 8;
  const t = construireHuffman(longueurs);
  indexerHuffman(t);
  return t;
}

function tableFixeDistances() {
  const longueurs = new Array(30).fill(5);
  const t = construireHuffman(longueurs);
  indexerHuffman(t);
  return t;
}

function inflateBrut(bytes) {
  const lecteur = new LecteurBits(bytes);
  const sortie = [];
  let fin = false;

  while (!fin) {
    fin = lecteur.lireBit() === 1;
    const type = lecteur.lireBits(2);

    if (type === 0) {
      lecteur.alignerOctet();
      const octetPos = lecteur.pos >> 3;
      const len = bytes[octetPos] | (bytes[octetPos + 1] << 8);
      const debut = octetPos + 4;
      for (let i = 0; i < len; i++) sortie.push(bytes[debut + i]);
      lecteur.pos = (debut + len) << 3;
      continue;
    }

    let litteraux, distances;
    if (type === 1) {
      litteraux = tableFixeLitteraux();
      distances = tableFixeDistances();
    } else if (type === 2) {
      const hlit = lecteur.lireBits(5) + 257;
      const hdist = lecteur.lireBits(5) + 1;
      const hclen = lecteur.lireBits(4) + 4;
      const longueursCode = new Array(19).fill(0);
      for (let i = 0; i < hclen; i++) longueursCode[CODE_LENGTH_ORDER[i]] = lecteur.lireBits(3);
      const tableCode = construireHuffman(longueursCode);
      indexerHuffman(tableCode);

      const toutesLongueurs = [];
      while (toutesLongueurs.length < hlit + hdist) {
        const sym = decoderSymboleRapide(lecteur, tableCode);
        if (sym < 16) {
          toutesLongueurs.push(sym);
        } else if (sym === 16) {
          const rep = lecteur.lireBits(2) + 3;
          const prec = toutesLongueurs[toutesLongueurs.length - 1];
          for (let i = 0; i < rep; i++) toutesLongueurs.push(prec);
        } else if (sym === 17) {
          const rep = lecteur.lireBits(3) + 3;
          for (let i = 0; i < rep; i++) toutesLongueurs.push(0);
        } else {
          const rep = lecteur.lireBits(7) + 11;
          for (let i = 0; i < rep; i++) toutesLongueurs.push(0);
        }
      }
      litteraux = construireHuffman(toutesLongueurs.slice(0, hlit));
      indexerHuffman(litteraux);
      distances = construireHuffman(toutesLongueurs.slice(hlit, hlit + hdist));
      indexerHuffman(distances);
    } else {
      throw new Error('DEFLATE: type de bloc invalide');
    }

    for (;;) {
      const sym = decoderSymboleRapide(lecteur, litteraux);
      if (sym < 256) {
        sortie.push(sym);
      } else if (sym === 256) {
        break;
      } else {
        const idx = sym - 257;
        const longueur = LENGTH_BASE[idx] + lecteur.lireBits(LENGTH_EXTRA[idx]);
        const symDist = decoderSymboleRapide(lecteur, distances);
        const distance = DIST_BASE[symDist] + lecteur.lireBits(DIST_EXTRA[symDist]);
        const depart = sortie.length - distance;
        for (let i = 0; i < longueur; i++) sortie.push(sortie[depart + i]);
      }
    }
  }

  return Uint8Array.from(sortie);
}

// Décompresse un flux zlib (en-tête 2 octets + données DEFLATE + Adler32
// final ignoré) — c'est le format exact utilisé par /FlateDecode dans les
// PDF.
export function inflateZlib(bytes) {
  // En-tête zlib : 2 octets, on ignore l'Adler32 final (4 derniers octets).
  const donnees = bytes.subarray(2, bytes.length - 4);
  return inflateBrut(donnees);
}
