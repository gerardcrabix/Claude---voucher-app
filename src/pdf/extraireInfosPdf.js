// Extraction "au mieux" du code, du PIN et de la date d'expiration à partir
// du texte d'un PDF de bon d'achat. Ne fonctionne que si le PDF contient du
// texte sélectionnable (pas une simple photo/scan sans couche texte) — dans
// ce cas les champs restent vides et la saisie manuelle reste le repli
// normal, comme demandé.
// pdfjs-dist pèse plus d'1 Mo (worker compris) : chargé à la demande
// seulement quand un PDF est effectivement choisi, pas au démarrage de
// l'app ni dans le bundle principal.
let pdfjsLibPromise = null;
function chargerPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsLibPromise;
}

const MOIS_FR = {
  janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04',
  mai: '05', juin: '06', juillet: '07', août: '08', aout: '08',
  septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12',
};

async function extraireTexte(file) {
  const pdfjsLib = await chargerPdfjs();
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  let texte = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const contenu = await page.getTextContent();
    texte += contenu.items.map((it) => it.str).join(' ') + '\n';
  }
  return texte;
}

function normaliserDate(jour, mois, annee) {
  const j = jour.padStart(2, '0');
  const a = annee.length === 2 ? `20${annee}` : annee;
  return `${a}-${mois.padStart(2, '0')}-${j}`;
}

function chercherDateExpiration(texte) {
  // DD/MM/YYYY ou DD-MM-YYYY, si possible proche d'un mot-clé d'expiration.
  const motsCles = /(expir|valable jusqu|validit[ée])/i;
  const reNumerique = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/g;
  const reLitterale = /(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/gi;

  const lignes = texte.split(/\n/);
  for (const ligne of lignes) {
    if (!motsCles.test(ligne)) continue;
    const mNum = [...ligne.matchAll(reNumerique)][0];
    if (mNum) return normaliserDate(mNum[1], mNum[2], mNum[3]);
    const mLit = [...ligne.matchAll(reLitterale)][0];
    if (mLit) return normaliserDate(mLit[1], MOIS_FR[mLit[2].toLowerCase()], mLit[3]);
  }
  // À défaut, on prend la première date plausible du document entier.
  const mNum = [...texte.matchAll(reNumerique)][0];
  if (mNum) return normaliserDate(mNum[1], mNum[2], mNum[3]);
  const mLit = [...texte.matchAll(reLitterale)][0];
  if (mLit) return normaliserDate(mLit[1], MOIS_FR[mLit[2].toLowerCase()], mLit[3]);
  return null;
}

function chercherCode(texte) {
  const re = /\bcode\s*(?:promo|bon|voucher)?\s*:?\s*([A-Z0-9][A-Z0-9-]{3,19})\b/i;
  const m = texte.match(re);
  return m ? m[1].toUpperCase() : null;
}

function chercherPin(texte) {
  const re = /\b(?:pin|code confidentiel|num[ée]ro confidentiel)\s*:?\s*(\d{4,8})\b/i;
  const m = texte.match(re);
  return m ? m[1] : null;
}

// Renvoie { code, pin, dateExpiration, texteBrutDisponible } — chaque champ
// est null si non trouvé, à charge de l'appelant de laisser la saisie
// manuelle pour les champs manquants.
export async function extraireInfosPdf(file) {
  try {
    const texte = await extraireTexte(file);
    if (!texte.trim()) {
      return { code: null, pin: null, dateExpiration: null, texteBrutDisponible: false };
    }
    return {
      code: chercherCode(texte),
      pin: chercherPin(texte),
      dateExpiration: chercherDateExpiration(texte),
      texteBrutDisponible: true,
    };
  } catch {
    return { code: null, pin: null, dateExpiration: null, texteBrutDisponible: false };
  }
}
