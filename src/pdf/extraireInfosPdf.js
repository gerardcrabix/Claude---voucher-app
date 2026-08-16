// Extraction "au mieux" du code, du PIN et de la date d'expiration à partir
// du texte d'un PDF de bon d'achat. Ne fonctionne que si le PDF contient du
// texte sélectionnable (pas une simple photo/scan sans couche texte) — dans
// ce cas les champs restent vides et la saisie manuelle reste le repli
// normal, comme demandé.
//
// L'analyse elle-même (reconstruction des lignes visuelles à partir des
// coordonnées x/y, recherche des libellés) vit dans analyserLignesBon.js,
// sans dépendance à pdfjs-dist, pour rester testable indépendamment du
// navigateur. Voir ce fichier pour le pourquoi de la reconstruction par
// coordonnées plutôt que l'ordre brut du flux PDF.
import { chercherCode, chercherDateExpiration, chercherPin, construireLignes } from './analyserLignesBon.js';

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

async function extraireLignes(file) {
  const pdfjsLib = await chargerPdfjs();
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  let lignes = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const contenu = await page.getTextContent();
    lignes = lignes.concat(construireLignes(contenu.items));
  }
  return lignes;
}

// Renvoie { code, pin, dateExpiration, texteBrutDisponible } — chaque champ
// est null si non trouvé, à charge de l'appelant de laisser la saisie
// manuelle pour les champs manquants.
export async function extraireInfosPdf(file) {
  try {
    const lignes = await extraireLignes(file);
    if (lignes.length === 0) {
      return { code: null, pin: null, dateExpiration: null, texteBrutDisponible: false };
    }
    return {
      code: chercherCode(lignes),
      pin: chercherPin(lignes),
      dateExpiration: chercherDateExpiration(lignes),
      texteBrutDisponible: true,
    };
  } catch {
    return { code: null, pin: null, dateExpiration: null, texteBrutDisponible: false };
  }
}
