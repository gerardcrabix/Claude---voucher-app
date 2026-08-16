#!/usr/bin/env node
// Migration v1 → v2 (§A8 du document d'architecture, Phase 8 du plan).
//
// Usage :
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CM_UID=... AJ_UID=... \
//     node scripts/migrate-from-v1-backup.mjs sauvegarde-cm.json sauvegarde-aj.json
//
// - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY : depuis Dashboard → Project
//   Settings → API. La clé de service contourne Row Level Security — c'est
//   nécessaire ici (il faut pouvoir écrire pour les deux comptes à la fois)
//   mais NE DOIT JAMAIS être utilisée dans le code de l'application ni
//   commitée. Ce script est fait pour tourner une fois, localement, jamais
//   depuis le navigateur.
// - CM_UID / AJ_UID : les uid Supabase Auth des deux comptes déjà créés
//   (Dashboard → Authentication → Users → copier l'UUID de chaque compte).
//   Nécessaires pour traduire les identifiants 'moi'/'elle' de la v1 (voir
//   src/identity/IdentityContext.jsx de la v1) vers de vrais comptes.
// - un ou plusieurs fichiers de sauvegarde JSON v1 (menu Export de la v1).
//   Fournir un fichier par personne s'ils ont divergé entre appareils —
//   voir la détection de doublons ci-dessous, qui n'écrit jamais rien
//   silencieusement en cas de désaccord entre les fichiers.
//
// Ce script est idempotent : rejouable sans dupliquer (les id d'origine de
// la v1 sont conservés tels quels et les écritures se font en upsert).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CM_UID, AJ_UID } = process.env;
const fichiers = process.argv.slice(2);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CM_UID || !AJ_UID) {
  console.error(
    'Variables manquantes. Requis : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CM_UID, AJ_UID.'
  );
  process.exit(1);
}
if (fichiers.length === 0) {
  console.error('Usage : node scripts/migrate-from-v1-backup.mjs <sauvegarde1.json> [sauvegarde2.json ...]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Traduction des identifiants simulés de la v1 vers les vrais comptes.
function traduireAuteur(id) {
  if (id === 'moi') return CM_UID;
  if (id === 'elle') return AJ_UID;
  return id; // déjà un uid (ré-import après une première migration, par ex.)
}
function traduireVisibilite(v) {
  if (!v || v === 'partage') return 'partage';
  return traduireAuteur(v);
}

function base64VersUint8Array(base64) {
  const binaire = Buffer.from(base64, 'base64');
  return new Uint8Array(binaire);
}

async function main() {
  const sauvegardes = fichiers.map((f) => ({
    fichier: f,
    donnees: JSON.parse(readFileSync(f, 'utf8')),
  }));

  // ---- 1. Fusion des enseignes (dédoublonnées par nom normalisé) ----------
  const enseignesParNom = new Map(); // nomNormalise -> enseigne retenue
  for (const { donnees } of sauvegardes) {
    for (const e of donnees.enseignes ?? []) {
      if (!enseignesParNom.has(e.nomNormalise)) enseignesParNom.set(e.nomNormalise, e);
    }
  }

  // ---- 2. Fusion des bons, avec détection explicite des doublons ---------
  // Un même bon (même enseigne + même code) présent dans plusieurs fichiers
  // avec un id différent est un signe de divergence entre appareils (§A8) —
  // on le journalise pour arbitrage manuel et on n'en garde qu'un seul
  // automatiquement (le premier rencontré), plutôt que de fusionner sans
  // le dire.
  const bonsParCle = new Map(); // "enseigneNom|code" -> bon retenu
  const conflits = [];
  const tousLesBons = [];
  for (const { fichier, donnees } of sauvegardes) {
    for (const b of donnees.bons ?? []) {
      const enseigne = (donnees.enseignes ?? []).find((e) => e.id === b.enseigneId);
      const cle = `${enseigne?.nomNormalise ?? '?'}|${b.code}`;
      const existant = bonsParCle.get(cle);
      if (existant && existant.id !== b.id) {
        conflits.push({ cle, fichier, idGarde: existant.id, idIgnore: b.id });
        continue; // on ne l'ajoute pas une seconde fois
      }
      if (!existant) {
        bonsParCle.set(cle, b);
        tousLesBons.push(b);
      }
    }
  }

  if (conflits.length > 0) {
    console.warn(`\n⚠️  ${conflits.length} bon(s) en doublon entre fichiers — à vérifier manuellement :`);
    for (const c of conflits) {
      console.warn(`   - ${c.cle} : gardé ${c.idGarde}, ignoré ${c.idIgnore} (venait de ${c.fichier})`);
    }
    console.warn('   Ce script continue avec la version gardée ; comparez les deux dans Supabase après import si besoin.\n');
  }

  // ---- 3. Écriture des enseignes ------------------------------------------
  const enseignes = [...enseignesParNom.values()];
  if (enseignes.length > 0) {
    const { error } = await supabase.from('enseignes').upsert(
      enseignes.map((e) => ({
        id: e.id,
        nom: e.nom,
        nom_normalise: e.nomNormalise,
        lien_verification: e.lienVerification ?? null,
        logo_url: e.logoUrl ?? null,
        created_by: traduireAuteur(e.createdBy),
        created_at: e.createdAt,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Échec import enseignes : ${error.message}`);
  }
  console.log(`✔ ${enseignes.length} enseigne(s) importée(s).`);

  // ---- 4. Écriture des bons ------------------------------------------------
  if (tousLesBons.length > 0) {
    const { error } = await supabase.from('bons').upsert(
      tousLesBons.map((b) => ({
        id: b.id,
        enseigne_id: b.enseigneId,
        montant_initial: b.montantInitial,
        date_achat: b.dateAchat,
        date_expiration: b.dateExpiration ?? null,
        code: b.code,
        pin: b.pin ?? null,
        visibilite: traduireVisibilite(b.visibilite),
        code_barres_url: b.codeBarresUrl ?? null,
        archived: !!b.archived,
        created_by: traduireAuteur(b.createdBy),
        created_at: b.createdAt,
        // tauxReduction volontairement abandonné (voir §A3 du document
        // d'architecture — jamais exposé dans l'interface v1).
      })),
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Échec import bons : ${error.message}`);
  }
  console.log(`✔ ${tousLesBons.length} bon(s) importé(s).`);

  const idsBonsRetenus = new Set(tousLesBons.map((b) => b.id));

  // ---- 5. Historique (mouvements / overrides / modifications) ------------
  async function importerHistorique(nomTable, champsMap) {
    const lignes = [];
    for (const { donnees } of sauvegardes) {
      for (const item of donnees[nomTable] ?? []) {
        if (!idsBonsRetenus.has(item.bonId)) continue; // bon ignoré comme doublon
        lignes.push(champsMap(item));
      }
    }
    // Dédoublonnage par id (un même mouvement peut apparaître dans les deux
    // fichiers si les appareils ont, à un moment, synchronisé via une
    // sauvegarde/restauration manuelle).
    const parId = new Map(lignes.map((l) => [l.id, l]));
    const finales = [...parId.values()];
    if (finales.length > 0) {
      const { error } = await supabase.from(nomTable).upsert(finales, { onConflict: 'id' });
      if (error) throw new Error(`Échec import ${nomTable} : ${error.message}`);
    }
    console.log(`✔ ${finales.length} ligne(s) importée(s) dans ${nomTable}.`);
  }

  await importerHistorique('mouvements', (m) => ({
    id: m.id,
    bon_id: m.bonId,
    montant: m.montant,
    date: m.date,
    note: m.note ?? '',
    auteur: traduireAuteur(m.auteur),
    created_at: m.createdAt,
  }));
  await importerHistorique('overrides', (o) => ({
    id: o.id,
    bon_id: o.bonId,
    nouveau_solde: o.nouveauSolde,
    motif: o.motif ?? '',
    auteur: traduireAuteur(o.auteur),
    created_at: o.createdAt,
  }));
  await importerHistorique('modifications', (m) => ({
    id: m.id,
    bon_id: m.bonId,
    auteur: traduireAuteur(m.auteur),
    created_at: m.createdAt,
    montant_avant: m.montantAvant,
    montant_apres: m.montantApres,
    solde_apres: m.soldeApres,
  }));

  // ---- 6. PDFs : upload vers Storage + mise à jour des colonnes sur bons -
  let comptePdfs = 0;
  for (const { donnees } of sauvegardes) {
    for (const pdf of donnees.pdfs ?? []) {
      if (!idsBonsRetenus.has(pdf.bonId)) continue;
      const chemin = `${pdf.bonId}/${pdf.filename}`;
      const octets = base64VersUint8Array(pdf.blobBase64);
      const { error: errUpload } = await supabase.storage
        .from('pdfs')
        .upload(chemin, octets, { contentType: pdf.contentType, upsert: true });
      if (errUpload) {
        console.warn(`   ⚠️  Échec upload PDF pour le bon ${pdf.bonId} : ${errUpload.message}`);
        continue;
      }
      const { error: errMaj } = await supabase
        .from('bons')
        .update({ pdf_path: chemin, pdf_filename: pdf.filename, pdf_content_type: pdf.contentType })
        .eq('id', pdf.bonId);
      if (errMaj) {
        console.warn(`   ⚠️  Échec mise à jour du bon ${pdf.bonId} après upload PDF : ${errMaj.message}`);
        continue;
      }
      comptePdfs++;
    }
  }
  console.log(`✔ ${comptePdfs} PDF(s) importé(s) dans Storage.`);

  console.log('\nMigration terminée. Vérifiez le résultat dans l\'application avant de considérer la v1 comme obsolète.');
  if (conflits.length > 0) {
    console.log(`Rappel : ${conflits.length} conflit(s) à examiner manuellement (voir avertissements ci-dessus).`);
  }
}

main().catch((e) => {
  console.error('\n❌ Migration interrompue :', e.message);
  process.exit(1);
});
