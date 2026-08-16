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
import {
  chercherCode,
  chercherDateExpiration,
  chercherEnseigne,
  chercherMontant,
  chercherPin,
  construireLignes,
} from './analyserLignesBon.js';
import { extraireItemsPdf } from './lecteurPdfMinimal.js';
import { ajouterEntree } from '../diagnostic/journal.js';

async function extraireLignes(file) {
  const buffer = await file.arrayBuffer();
  const items = extraireItemsPdf(buffer);
  return construireLignes(items);
}

// Journalise systématiquement le résultat de l'extraction (pas seulement
// les pannes techniques) : sans ça, un PDF lu "avec succès" mais dont les
// libellés ne matchent rien (ex. un gabarit encore différent) ne laisse
// aucune trace exploitable dans l'écran Diagnostic — ce qui empêche tout
// dépannage à distance.
function journaliserResultat(nomFichier, lignes, resultat) {
  const resume = `enseigne=${resultat.enseigneNom ?? '—'} code=${resultat.code ?? '—'} pin=${resultat.pin ?? '—'} `
    + `dateExpiration=${resultat.dateExpiration ?? '—'} montant=${resultat.montant ?? '—'}`;
  const extraitLignes = lignes.slice(0, 25).map((l, i) => `${i}: ${l}`).join('\n');
  ajouterEntree('extraction-pdf', `Lecture PDF "${nomFichier}" — ${resume}`, extraitLignes || null);
}

const RESULTAT_VIDE = {
  enseigneNom: null, code: null, pin: null, dateExpiration: null, montant: null,
  texteBrutDisponible: false, erreur: null,
};

// Renvoie { enseigneNom, code, pin, dateExpiration, montant,
// texteBrutDisponible, erreur }. `erreur` n'est renseigné que si une vraie
// panne technique a empêché la lecture (PDF corrompu, structure
// inattendue…) — à distinguer de "le PDF a bien été lu mais ne contient
// rien d'exploitable". `nomsEnseignesConnues` (optionnel) améliore la
// détection de l'enseigne en la faisant correspondre en priorité à une
// enseigne déjà utilisée dans l'app (voir chercherEnseigne).
export async function extraireInfosPdf(file, nomsEnseignesConnues = []) {
  try {
    const lignes = await extraireLignes(file);
    if (lignes.length === 0) {
      const resultat = { ...RESULTAT_VIDE };
      journaliserResultat(file?.name ?? '?', lignes, resultat);
      return resultat;
    }
    const resultat = {
      enseigneNom: chercherEnseigne(lignes, nomsEnseignesConnues),
      code: chercherCode(lignes),
      pin: chercherPin(lignes),
      dateExpiration: chercherDateExpiration(lignes),
      montant: chercherMontant(lignes),
      texteBrutDisponible: true,
      erreur: null,
    };
    journaliserResultat(file?.name ?? '?', lignes, resultat);
    return resultat;
  } catch (e) {
    const message = e?.message || String(e);
    ajouterEntree('extraction-pdf', `Échec lecture PDF "${file?.name ?? '?'}" : ${message}`, e?.stack);
    return { ...RESULTAT_VIDE, erreur: message };
  }
}
