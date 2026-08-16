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
import { ajouterEntree } from '../diagnostic/journal.js';

// pdfjs-dist + son worker pèsent ~1,7 Mo au total : chargés à la demande
// seulement quand un PDF est effectivement choisi, pas au démarrage de
// l'app ni dans le bundle principal. Une fois récupérés une première fois
// avec succès, le service worker les garde en cache définitivement (voir
// vite.config.js) — donc ce coût réseau n'est payé qu'une seule fois par
// appareil, dans l'idéal en Wi-Fi.
//
// Important : si ce chargement échoue une fois (ex. coupure réseau), on NE
// GARDE PAS la promesse rejetée en cache — sinon tous les essais suivants
// dans la même session échoueraient silencieusement sans jamais retenter le
// téléchargement.
//
// Build "legacy" plutôt que le build standard : c'est la variante que
// Mozilla publie spécifiquement pour les navigateurs qui ne supportent pas
// toute la syntaxe JS la plus récente utilisée par le build standard — avec
// plus de code de compatibilité embarqué. Après plusieurs échecs
// "undefined is not a function" sur un vrai iPhone (build standard,
// jusqu'à l'intérieur de getTextContent elle-même), c'est le bon levier :
// pas une nouvelle rustine ponctuelle, un changement de variante de la
// librairie pensée pour ce cas précis.
let pdfjsLibPromise = null;
function chargerPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
    pdfjsLibPromise.catch(() => {
      pdfjsLibPromise = null;
    });
  }
  return pdfjsLibPromise;
}

// pdf.worker.min.mjs (~1,2 Mo, la grosse partie du poids) n'est en fait
// récupéré que plus tard, à l'intérieur de getDocument() ci-dessous — pas
// dans chargerPdfjs(). C'est cette étape qui échoue en premier sur un
// réseau faible, avec le message WebKit "Importing a module script failed."
function estErreurReseau(e) {
  const m = (e?.message || String(e)).toLowerCase();
  return /module script failed|failed to fetch|load failed|network|econnreset|err_network|err_internet/.test(m);
}

async function avecReessaiReseau(fn, tentatives = 3, delaiMs = 700) {
  let derniereErreur;
  for (let i = 0; i < tentatives; i++) {
    try {
      return await fn();
    } catch (e) {
      derniereErreur = e;
      if (!estErreurReseau(e) || i === tentatives - 1) throw e;
      ajouterEntree(
        'extraction-pdf',
        `Échec réseau (tentative ${i + 1}/${tentatives}), nouvel essai dans ${delaiMs}ms : ${e?.message}`,
        null
      );
      await new Promise((r) => setTimeout(r, delaiMs));
    }
  }
  throw derniereErreur;
}

async function extraireLignes(file) {
  const pdfjsLib = await chargerPdfjs();
  const buffer = await file.arrayBuffer();
  const doc = await avecReessaiReseau(() => pdfjsLib.getDocument({ data: buffer }).promise);
  let lignes = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const contenu = await page.getTextContent();
    lignes = lignes.concat(construireLignes(contenu.items));
  }
  return lignes;
}

// Renvoie { code, pin, dateExpiration, texteBrutDisponible, erreur,
// erreurReseau }. `erreur` n'est renseigné que si une vraie panne technique
// a empêché la lecture (réseau, PDF corrompu…) — à distinguer de "le PDF a
// bien été lu mais ne contient rien d'exploitable". `erreurReseau` permet
// d'afficher un message adapté ("mauvais signal, réessayez") plutôt qu'un
// message technique générique.
export async function extraireInfosPdf(file) {
  try {
    const lignes = await avecReessaiReseau(() => extraireLignes(file));
    if (lignes.length === 0) {
      return { code: null, pin: null, dateExpiration: null, texteBrutDisponible: false, erreur: null, erreurReseau: false };
    }
    return {
      code: chercherCode(lignes),
      pin: chercherPin(lignes),
      dateExpiration: chercherDateExpiration(lignes),
      texteBrutDisponible: true,
      erreur: null,
      erreurReseau: false,
    };
  } catch (e) {
    const message = e?.message || String(e);
    const reseau = estErreurReseau(e);
    ajouterEntree('extraction-pdf', `Échec lecture PDF "${file?.name ?? '?'}" : ${message}`, e?.stack);
    return {
      code: null,
      pin: null,
      dateExpiration: null,
      texteBrutDisponible: false,
      erreur: message,
      erreurReseau: reseau,
    };
  }
}
