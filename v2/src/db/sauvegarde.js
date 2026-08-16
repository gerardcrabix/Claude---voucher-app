// Équivalent v2 de src/db/sauvegarde.js. Fonctionne toujours en JSON avec
// PDF encodés en base64, format volontairement identique à la v1 pour
// rester compatible avec le script de migration (voir scripts/migrate-
// from-v1-backup.mjs) et avec les sauvegardes déjà faites depuis la v1.
//
// Différence importante avec la v1, à savoir avant de s'y fier : la v1
// exportait strictement tout, sans filtrage (il n'y avait qu'un seul
// appareil, donc qu'un seul jeu de données). En v2, Row Level Security
// (§A5) fait qu'un compte ne peut, par construction, jamais lire les bons
// que l'autre a marqués "réservés à lui/elle" — donc une sauvegarde lancée
// depuis le compte de CM n'inclut pas les bons privés d'AJ, et
// réciproquement. Ce n'est pas un bug de cet écran : c'est la garantie
// serveur qui fonctionne comme prévu. Une sauvegarde vraiment complète
// nécessite que chaque compte exporte la sienne.
import { supabase } from '../supabase/client.js';
import { listerBonsEnrichis, listerEnseignes, obtenirPdf } from './repository.js';

const VERSION_SAUVEGARDE = 2; // v1 = 1 (IndexedDB) ; v2 = 2 (Supabase, filtré par RLS)

async function blobVersBase64(blob) {
  const octets = new Uint8Array(await blob.arrayBuffer());
  let binaire = '';
  const CHUNK = 8192;
  for (let i = 0; i < octets.length; i += CHUNK) {
    binaire += String.fromCharCode(...octets.subarray(i, Math.min(i + CHUNK, octets.length)));
  }
  return btoa(binaire);
}

export async function exporterSauvegarde(identite) {
  const [enseignes, bonsEnrichis] = await Promise.all([
    listerEnseignes(),
    listerBonsEnrichis(identite),
  ]);

  const bons = bonsEnrichis.map(
    ({ enseigne: _enseigne, solde: _solde, statut: _statut, mouvements: _mvts, overrides: _ovr, modifications: _mods, ...bon }) => bon
  );
  const mouvements = bonsEnrichis.flatMap((b) => b.mouvements);
  const overrides = bonsEnrichis.flatMap((b) => b.overrides);
  const modifications = bonsEnrichis.flatMap((b) => b.modifications);

  const pdfs = [];
  for (const bon of bonsEnrichis) {
    if (!bon.pdfPath) continue;
    const pdf = await obtenirPdf(bon.id);
    if (pdf) {
      pdfs.push({
        bonId: bon.id,
        filename: pdf.filename,
        contentType: pdf.contentType,
        blobBase64: await blobVersBase64(pdf.blob),
      });
    }
  }

  return {
    version: VERSION_SAUVEGARDE,
    exportePar: identite,
    exporteLe: new Date().toISOString(),
    enseignes,
    bons,
    mouvements,
    overrides,
    modifications,
    pdfs,
  };
}

// La restauration n'est PAS proposée dans l'écran Export de la v2 (voir
// pages/Export.jsx) : contrairement à la v1 où elle ne touchait que
// l'appareil courant, ici elle écrirait dans la base partagée par les deux
// comptes — un remplacement complet déclenché par erreur serait bien plus
// grave qu'en v1. La restauration reste possible mais volontairement
// réservée à un script exécuté hors de l'application (voir
// scripts/migrate-from-v1-backup.mjs), avec la clé de service.
export async function verifierFichierSauvegarde(donnees) {
  if (!donnees || typeof donnees !== 'object' || !Array.isArray(donnees.bons)) {
    throw new Error('Fichier de sauvegarde invalide ou illisible.');
  }
  return donnees;
}

// Exposé pour permettre à l'écran Diagnostic d'afficher l'état de la
// session sans dupliquer la logique du client Supabase.
export async function verifierConnexion() {
  const { error } = await supabase.from('profiles').select('id').limit(1);
  return !error;
}
