// Couche d'accès aux données — équivalent Supabase de src/db/repository.js
// en v1. Mêmes noms de fonctions, mêmes signatures, mêmes règles métier
// (solde jamais stocké, blocage de dépassement, historique du montant
// initial) : c'était le but explicite de la réécriture (voir le document
// d'architecture, §A2 et Phase 2 du plan) — que les pages et composants de
// la v1 n'aient presque rien à changer.
//
// Deux différences volontaires avec la v1, dictées par le passage à un vrai
// serveur :
//   - le filtrage par visibilité n'est plus fait ici : Row Level Security
//     (voir supabase/migrations/0001_init.sql) le fait déjà côté base, une
//     requête ne peut physiquement pas renvoyer un bon non autorisé. Les
//     fonctions gardent un paramètre `identite` pour ne pas changer leur
//     signature, mais ne s'en servent plus pour filtrer.
//   - le contrôle "le montant dépensé ne dépasse pas le solde" (voir
//     `enregistrerMouvement`) n'est plus dans une transaction IndexedDB
//     atomique : c'est une vérification en deux temps (lecture puis
//     écriture). Avec deux appareils actifs en même temps, une dépense
//     lancée sur les deux appareils à la même seconde pourrait en théorie
//     passer les deux malgré un solde insuffisant pour les deux cumulées —
//     limite assumée et documentée (voir le rapport livré avec cette
//     construction), pas un oubli.
import { supabase } from '../supabase/client.js';
import { calculerSolde, calculerStatut } from './solde.js';
import { cleTriUrgence } from '../utils/dates.js';

export class DepassementError extends Error {
  constructor(soldeDisponible) {
    super('Le montant dépasse le solde disponible sur ce bon.');
    this.name = 'DepassementError';
    this.soldeDisponible = soldeDisponible;
  }
}

export class EnseigneUtiliseeError extends Error {
  constructor() {
    super('Cette enseigne a encore des bons associés.');
    this.name = 'EnseigneUtiliseeError';
  }
}

function normaliserNom(nom) {
  return nom.trim().toLowerCase();
}

function leverSiErreur(error) {
  if (error) throw new Error(error.message);
}

// ---- Conversion ligne DB (snake_case) <-> objet JS (camelCase, forme v1) --

function enseigneDepuisRow(row) {
  return {
    id: row.id,
    nom: row.nom,
    nomNormalise: row.nom_normalise,
    lienVerification: row.lien_verification,
    logoUrl: row.logo_url,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function bonDepuisRow(row) {
  return {
    id: row.id,
    enseigneId: row.enseigne_id,
    montantInitial: row.montant_initial,
    dateAchat: row.date_achat,
    dateExpiration: row.date_expiration,
    code: row.code,
    pin: row.pin,
    visibilite: row.visibilite,
    codeBarresUrl: row.code_barres_url,
    pdfPath: row.pdf_path,
    pdfFilename: row.pdf_filename,
    pdfContentType: row.pdf_content_type,
    archived: row.archived,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function mouvementDepuisRow(row) {
  return {
    id: row.id,
    bonId: row.bon_id,
    montant: row.montant,
    date: row.date,
    note: row.note,
    auteur: row.auteur,
    createdAt: row.created_at,
  };
}

function overrideDepuisRow(row) {
  return {
    id: row.id,
    bonId: row.bon_id,
    nouveauSolde: row.nouveau_solde,
    motif: row.motif,
    auteur: row.auteur,
    createdAt: row.created_at,
  };
}

function modificationDepuisRow(row) {
  return {
    id: row.id,
    bonId: row.bon_id,
    auteur: row.auteur,
    createdAt: row.created_at,
    montantAvant: row.montant_avant,
    montantApres: row.montant_apres,
    soldeApres: row.solde_apres,
  };
}

// ---- Enseignes -------------------------------------------------------------

export async function listerEnseignes() {
  const { data, error } = await supabase.from('enseignes').select('*');
  leverSiErreur(error);
  return data.map(enseigneDepuisRow).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export async function trouverEnseigneParNom(nom) {
  const { data, error } = await supabase
    .from('enseignes')
    .select('*')
    .eq('nom_normalise', normaliserNom(nom))
    .maybeSingle();
  leverSiErreur(error);
  return data ? enseigneDepuisRow(data) : null;
}

export async function trouverOuCreerEnseigne(nom, auteur) {
  const existante = await trouverEnseigneParNom(nom);
  if (existante) return existante;

  const { data, error } = await supabase
    .from('enseignes')
    .insert({
      nom: nom.trim(),
      nom_normalise: normaliserNom(nom),
      created_by: auteur,
    })
    .select()
    .single();
  leverSiErreur(error);
  return enseigneDepuisRow(data);
}

export async function renommerEnseigne(id, nouveauNom) {
  const { error } = await supabase
    .from('enseignes')
    .update({ nom: nouveauNom.trim(), nom_normalise: normaliserNom(nouveauNom) })
    .eq('id', id);
  leverSiErreur(error);
}

export async function definirLienEnseigne(id, lien) {
  const { error } = await supabase
    .from('enseignes')
    .update({ lien_verification: lien ? lien.trim() : null })
    .eq('id', id);
  leverSiErreur(error);
}

export async function definirLogoEnseigne(id, urlLogo) {
  const { error } = await supabase
    .from('enseignes')
    .update({ logo_url: urlLogo ? urlLogo.trim() : null })
    .eq('id', id);
  leverSiErreur(error);
}

export async function supprimerEnseigne(id) {
  const { count, error: errComptage } = await supabase
    .from('bons')
    .select('id', { count: 'exact', head: true })
    .eq('enseigne_id', id);
  leverSiErreur(errComptage);
  if (count > 0) throw new EnseigneUtiliseeError();

  const { error } = await supabase.from('enseignes').delete().eq('id', id);
  leverSiErreur(error);
}

// ---- Lecture enrichie des bons ---------------------------------------------
// (identite n'est plus utilisé pour filtrer — Row Level Security s'en
// charge déjà côté serveur — gardé pour ne pas changer la signature.)

// Historique d'UN bon (fiche détail) : 3 requêtes, indépendantes du nombre
// total de bons — pas de souci de performance ici.
async function chargerHistorique(bonId) {
  const [mvts, ovr, mods] = await Promise.all([
    supabase.from('mouvements').select('*').eq('bon_id', bonId),
    supabase.from('overrides').select('*').eq('bon_id', bonId),
    supabase.from('modifications').select('*').eq('bon_id', bonId),
  ]);
  leverSiErreur(mvts.error);
  leverSiErreur(ovr.error);
  leverSiErreur(mods.error);
  return {
    mouvements: mvts.data.map(mouvementDepuisRow),
    overrides: ovr.data.map(overrideDepuisRow),
    modifications: mods.data.map(modificationDepuisRow),
  };
}

// Historique de PLUSIEURS bons en une seule fois — 3 requêtes au total,
// quel que soit le nombre de bons, au lieu de 3 requêtes PAR bon. C'est le
// correctif d'un vrai problème de performance : `listerBonsEnrichis` et
// `getSoldeActifParEnseigne` appelaient `chargerHistorique` une fois par
// bon (donc 3×N requêtes réseau, chacune avec son propre aller-retour et sa
// propre évaluation RLS), ce qui devenait très lentement perceptible dès
// que le nombre de bons grandissait — et se déclenchait en plus à chaque
// évènement Realtime, potentiellement plusieurs fois par minute. Signalé
// par un ralentissement sévère de l'application (voir le rapport de
// livraison) après le tout premier test réel avec des données un peu
// nombreuses.
async function chargerHistoriqueGroupe(bonIds) {
  const vide = { mouvements: new Map(), overrides: new Map(), modifications: new Map() };
  if (bonIds.length === 0) return vide;

  const [mvts, ovr, mods] = await Promise.all([
    supabase.from('mouvements').select('*').in('bon_id', bonIds),
    supabase.from('overrides').select('*').in('bon_id', bonIds),
    supabase.from('modifications').select('*').in('bon_id', bonIds),
  ]);
  leverSiErreur(mvts.error);
  leverSiErreur(ovr.error);
  leverSiErreur(mods.error);

  function grouperParBon(lignes, convertir) {
    const parBon = new Map();
    for (const ligne of lignes) {
      const obj = convertir(ligne);
      const liste = parBon.get(obj.bonId);
      if (liste) liste.push(obj);
      else parBon.set(obj.bonId, [obj]);
    }
    return parBon;
  }

  return {
    mouvements: grouperParBon(mvts.data, mouvementDepuisRow),
    overrides: grouperParBon(ovr.data, overrideDepuisRow),
    modifications: grouperParBon(mods.data, modificationDepuisRow),
  };
}

function historiqueDuBon(groupe, bonId) {
  return {
    mouvements: groupe.mouvements.get(bonId) ?? [],
    overrides: groupe.overrides.get(bonId) ?? [],
    modifications: groupe.modifications.get(bonId) ?? [],
  };
}

function enrichir(bon, historique) {
  const solde = calculerSolde(bon, historique.mouvements, historique.overrides);
  const statut = calculerStatut(bon, solde);
  return { ...bon, ...historique, solde, statut };
}

export async function listerBonsEnrichis(_identite) {
  const [{ data: bonsData, error: errBons }, { data: enseignesData, error: errEns }] = await Promise.all([
    supabase.from('bons').select('*'),
    supabase.from('enseignes').select('*'),
  ]);
  leverSiErreur(errBons);
  leverSiErreur(errEns);

  const enseignesParId = new Map(enseignesData.map((e) => [e.id, enseigneDepuisRow(e)]));
  const bons = bonsData.map(bonDepuisRow);
  const groupe = await chargerHistoriqueGroupe(bons.map((b) => b.id));

  return bons
    .map((b) => ({
      ...enrichir(b, historiqueDuBon(groupe, b.id)),
      enseigne: enseignesParId.get(b.enseigneId) ?? null,
    }))
    .sort((a, b) => cleTriUrgence(a.dateExpiration).localeCompare(cleTriUrgence(b.dateExpiration)));
}

export async function obtenirBon(id, _identite) {
  const { data, error } = await supabase.from('bons').select('*').eq('id', id).maybeSingle();
  leverSiErreur(error);
  if (!data) return null; // introuvable, ou filtré par RLS (bon privé non autorisé)

  const bon = bonDepuisRow(data);
  const [{ data: ens }, historique] = await Promise.all([
    supabase.from('enseignes').select('*').eq('id', bon.enseigneId).maybeSingle(),
    chargerHistorique(id),
  ]);
  return { ...enrichir(bon, historique), enseigne: ens ? enseigneDepuisRow(ens) : null };
}

export async function getSoldeActifParEnseigne(enseigneId, _identite) {
  const { data, error } = await supabase.from('bons').select('*').eq('enseigne_id', enseigneId);
  leverSiErreur(error);
  const bons = data.map(bonDepuisRow);
  const groupe = await chargerHistoriqueGroupe(bons.map((b) => b.id));
  const enrichis = bons.map((b) => enrichir(b, historiqueDuBon(groupe, b.id)));
  const actifs = enrichis.filter((b) => b.statut === 'actif');

  if (actifs.length === 0) {
    return { totalCentimes: 0, nombreBons: 0, prochaineExpiration: null };
  }

  const totalCentimes = actifs.reduce((s, b) => s + b.solde, 0);
  const avecDate = actifs
    .filter((b) => b.dateExpiration)
    .sort((a, b) => a.dateExpiration.localeCompare(b.dateExpiration));

  return {
    totalCentimes,
    nombreBons: actifs.length,
    prochaineExpiration: avecDate[0]?.dateExpiration ?? null,
  };
}

// Une seule volée de requêtes pour toutes les enseignes à la fois (au lieu
// d'appeler `getSoldeActifParEnseigne` une fois par enseigne, qui aurait
// réintroduit le même problème de performance que `listerBonsEnrichis` —
// voir le commentaire de `chargerHistoriqueGroupe`).
export async function listerPastillesEnseignes(_identite) {
  const [{ data: enseignesData, error: errEns }, { data: bonsData, error: errBons }] = await Promise.all([
    supabase.from('enseignes').select('*'),
    supabase.from('bons').select('*'),
  ]);
  leverSiErreur(errEns);
  leverSiErreur(errBons);

  const enseignes = enseignesData.map(enseigneDepuisRow);
  const bons = bonsData.map(bonDepuisRow);
  const groupe = await chargerHistoriqueGroupe(bons.map((b) => b.id));
  const enrichis = bons.map((b) => enrichir(b, historiqueDuBon(groupe, b.id)));

  const actifsParEnseigne = new Map();
  for (const b of enrichis) {
    if (b.statut !== 'actif') continue;
    const liste = actifsParEnseigne.get(b.enseigneId);
    if (liste) liste.push(b);
    else actifsParEnseigne.set(b.enseigneId, [b]);
  }

  const pastilles = enseignes.map((e) => {
    const actifs = actifsParEnseigne.get(e.id) ?? [];
    if (actifs.length === 0) {
      return { enseigne: e, totalCentimes: 0, nombreBons: 0, prochaineExpiration: null };
    }
    const totalCentimes = actifs.reduce((s, b) => s + b.solde, 0);
    const avecDate = actifs
      .filter((b) => b.dateExpiration)
      .sort((a, b) => a.dateExpiration.localeCompare(b.dateExpiration));
    return {
      enseigne: e,
      totalCentimes,
      nombreBons: actifs.length,
      prochaineExpiration: avecDate[0]?.dateExpiration ?? null,
    };
  });

  return pastilles.filter((p) => p.nombreBons > 0);
}

// Historique complet d'une enseigne, tous bons confondus (actifs, expirés
// ou clôturés) — pas juste un bon à la fois comme dans la fiche détail.
// Rejoue chronologiquement les dépenses et corrections de chaque bon pour
// donner un "montant avant / montant après" à chaque ligne, même pour les
// dépenses qui n'ont normalement qu'un montant, pas un avant/après — c'est
// plus parlant pour relire un historique que la seule valeur dépensée.
function calculerLignesHistoriqueBon(bon, mouvements, overrides, modifications) {
  const evenements = [
    ...mouvements.map((m) => ({ type: 'depense', ...m })),
    ...overrides.map((o) => ({ type: 'correction', ...o })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  let solde = bon.montantInitial;
  const lignes = evenements.map((e) => {
    const avant = solde;
    const apres = e.type === 'depense' ? avant - e.montant : e.nouveauSolde;
    solde = apres;
    return {
      bonCode: bon.code,
      bonId: bon.id,
      date: e.type === 'depense' ? e.date : e.createdAt.slice(0, 10),
      createdAt: e.createdAt,
      type: e.type === 'depense' ? 'Dépense' : 'Correction de solde',
      montantAvant: avant,
      montantApres: apres,
      auteur: e.auteur,
      note: (e.type === 'depense' ? e.note : e.motif) || '',
    };
  });

  for (const m of modifications) {
    lignes.push({
      bonCode: bon.code,
      bonId: bon.id,
      date: m.createdAt.slice(0, 10),
      createdAt: m.createdAt,
      type: 'Montant initial modifié',
      montantAvant: m.montantAvant,
      montantApres: m.montantApres,
      auteur: m.auteur,
      note: '',
    });
  }

  return lignes;
}

export async function listerHistoriqueParEnseigne(enseigneId) {
  const { data, error } = await supabase.from('bons').select('*').eq('enseigne_id', enseigneId);
  leverSiErreur(error);
  const bons = data.map(bonDepuisRow);
  const groupe = await chargerHistoriqueGroupe(bons.map((b) => b.id));

  const parBon = bons.map((b) => {
    const h = historiqueDuBon(groupe, b.id);
    return calculerLignesHistoriqueBon(b, h.mouvements, h.overrides, h.modifications);
  });

  return parBon.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ---- Création / cycle de vie d'un bon --------------------------------------

export async function creerBon({
  enseigneNom,
  montantInitial,
  dateAchat,
  dateExpiration,
  code,
  pin,
  visibilite,
  codeBarresUrl,
  auteur,
}) {
  const enseigne = await trouverOuCreerEnseigne(enseigneNom, auteur);
  const { data, error } = await supabase
    .from('bons')
    .insert({
      enseigne_id: enseigne.id,
      montant_initial: montantInitial,
      date_achat: dateAchat,
      date_expiration: dateExpiration || null,
      code: code.trim(),
      pin: pin?.trim() || null,
      visibilite: visibilite || 'partage',
      code_barres_url: codeBarresUrl || null,
      created_by: auteur,
    })
    .select()
    .single();
  leverSiErreur(error);
  return { bon: bonDepuisRow(data), enseigne };
}

export async function modifierBon({
  id,
  enseigneNom,
  montantInitial,
  dateAchat,
  dateExpiration,
  code,
  pin,
  visibilite,
  codeBarresUrl,
  auteur,
}) {
  const enseigne = await trouverOuCreerEnseigne(enseigneNom, auteur);

  const { data: avant, error: errAvant } = await supabase
    .from('bons')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  leverSiErreur(errAvant);
  if (!avant) throw new Error('Bon introuvable');
  const montantAvant = avant.montant_initial;

  const { data, error } = await supabase
    .from('bons')
    .update({
      enseigne_id: enseigne.id,
      montant_initial: montantInitial,
      date_achat: dateAchat,
      date_expiration: dateExpiration || null,
      code: code.trim(),
      pin: pin?.trim() || null,
      visibilite: visibilite || 'partage',
      code_barres_url: codeBarresUrl || null,
    })
    .eq('id', id)
    .select()
    .single();
  leverSiErreur(error);
  const bonModifie = bonDepuisRow(data);

  if (montantAvant !== montantInitial) {
    const historique = await chargerHistorique(id);
    const soldeApres = calculerSolde(bonModifie, historique.mouvements, historique.overrides);
    const { error: errMod } = await supabase.from('modifications').insert({
      bon_id: id,
      auteur,
      montant_avant: montantAvant,
      montant_apres: montantInitial,
      solde_apres: soldeApres,
    });
    leverSiErreur(errMod);
  }

  return bonModifie;
}

export async function enregistrerMouvement({ bonId, montant, date, note, auteur }) {
  const { data: bonRow, error: errBon } = await supabase
    .from('bons')
    .select('*')
    .eq('id', bonId)
    .maybeSingle();
  leverSiErreur(errBon);
  if (!bonRow) throw new Error('Bon introuvable');

  const historique = await chargerHistorique(bonId);
  const soldeActuel = calculerSolde(bonDepuisRow(bonRow), historique.mouvements, historique.overrides);

  if (montant > soldeActuel) {
    throw new DepassementError(soldeActuel);
  }

  const { data, error } = await supabase
    .from('mouvements')
    .insert({ bon_id: bonId, montant, date, note: note?.trim() || '', auteur })
    .select()
    .single();
  leverSiErreur(error);
  return mouvementDepuisRow(data);
}

export async function corrigerSolde({ bonId, nouveauSolde, motif, auteur }) {
  const { data, error } = await supabase
    .from('overrides')
    .insert({ bon_id: bonId, nouveau_solde: nouveauSolde, motif: motif?.trim() || '', auteur })
    .select()
    .single();
  leverSiErreur(error);
  return overrideDepuisRow(data);
}

export async function terminerBon(id) {
  const { error } = await supabase
    .from('bons')
    .update({ archived: true, archived_at: new Date().toISOString() })
    .eq('id', id);
  leverSiErreur(error);
}

export async function reactiverBon(id) {
  const { error } = await supabase
    .from('bons')
    .update({ archived: false, archived_at: null })
    .eq('id', id);
  leverSiErreur(error);
}

export async function supprimerBonDefinitivement(id) {
  // Le PDF éventuel n'est pas couvert par la suppression de la ligne (c'est
  // un objet Storage à part) : on le retire explicitement en premier. Les
  // lignes mouvements/overrides/modifications, elles, sont supprimées
  // automatiquement par les contraintes ON DELETE CASCADE du schéma.
  await supprimerPdf(id).catch(() => {});
  const { error } = await supabase.from('bons').delete().eq('id', id);
  leverSiErreur(error);
}

// ---- PDF (Supabase Storage, bucket privé "pdfs") ---------------------------

export async function enregistrerPdf(bonId, file) {
  const chemin = `${bonId}/${file.name}`;
  const { error: errUpload } = await supabase.storage
    .from('pdfs')
    .upload(chemin, file, { contentType: file.type || 'application/pdf', upsert: true });
  leverSiErreur(errUpload);

  const { error } = await supabase
    .from('bons')
    .update({ pdf_path: chemin, pdf_filename: file.name, pdf_content_type: file.type || 'application/pdf' })
    .eq('id', bonId);
  leverSiErreur(error);
}

export async function obtenirPdf(bonId) {
  const { data: bonRow, error } = await supabase
    .from('bons')
    .select('pdf_path, pdf_filename, pdf_content_type')
    .eq('id', bonId)
    .maybeSingle();
  leverSiErreur(error);
  if (!bonRow?.pdf_path) return null;

  const { data: blob, error: errTelechargement } = await supabase.storage
    .from('pdfs')
    .download(bonRow.pdf_path);
  leverSiErreur(errTelechargement);

  return { bonId, filename: bonRow.pdf_filename, contentType: bonRow.pdf_content_type, blob };
}

export async function supprimerPdf(bonId) {
  const { data: bonRow } = await supabase.from('bons').select('pdf_path').eq('id', bonId).maybeSingle();
  if (bonRow?.pdf_path) {
    await supabase.storage.from('pdfs').remove([bonRow.pdf_path]);
  }
  const { error } = await supabase
    .from('bons')
    .update({ pdf_path: null, pdf_filename: null, pdf_content_type: null })
    .eq('id', bonId);
  leverSiErreur(error);
}
