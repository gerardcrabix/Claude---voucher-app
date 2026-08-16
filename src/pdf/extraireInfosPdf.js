// Extraction "au mieux" du code, du PIN et de la date d'expiration à partir
// du texte d'un PDF de bon d'achat. Ne fonctionne que si le PDF contient du
// texte sélectionnable (pas une simple photo/scan sans couche texte) — dans
// ce cas les champs restent vides et la saisie manuelle reste le repli
// normal, comme demandé.
//
// Après plusieurs échecs "undefined is not a function" sur un vrai iPhone
// avec pdfjs-dist (~1,7 Mo, worker séparé, plusieurs API JS récentes en
// interne) malgré build legacy + polyfills + réessais réseau, la lecture du
// PDF est maintenant faite par un lecteur minimal écrit à la main
// (lecteurPdfMinimal.js + inflate.js), sans aucune dépendance ni API
// navigateur récente : juste ArrayBuffer, regex et de l'arithmétique. Ces
// bons sont des PDF simples générés par un automate — pas besoin d'un
// moteur PDF complet pour en extraire le texte.
import { chercherCode, chercherDateExpiration, chercherPin, construireLignes } from './analyserLignesBon.js';
import { extraireItemsPdf } from './lecteurPdfMinimal.js';
import { ajouterEntree } from '../diagnostic/journal.js';

async function extraireLignes(file) {
  const buffer = await file.arrayBuffer();
  const items = extraireItemsPdf(buffer);
  return construireLignes(items);
}

// Renvoie { code, pin, dateExpiration, texteBrutDisponible, erreur }.
// `erreur` n'est renseigné que si une vraie panne technique a empêché la
// lecture (PDF corrompu, structure inattendue…) — à distinguer de "le PDF a
// bien été lu mais ne contient rien d'exploitable".
export async function extraireInfosPdf(file) {
  try {
    const lignes = await extraireLignes(file);
    if (lignes.length === 0) {
      return { code: null, pin: null, dateExpiration: null, texteBrutDisponible: false, erreur: null };
    }
    return {
      code: chercherCode(lignes),
      pin: chercherPin(lignes),
      dateExpiration: chercherDateExpiration(lignes),
      texteBrutDisponible: true,
      erreur: null,
    };
  } catch (e) {
    const message = e?.message || String(e);
    ajouterEntree('extraction-pdf', `Échec lecture PDF "${file?.name ?? '?'}" : ${message}`, e?.stack);
    return { code: null, pin: null, dateExpiration: null, texteBrutDisponible: false, erreur: message };
  }
}
