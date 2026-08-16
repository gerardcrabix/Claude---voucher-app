// Couche d'accès aux données : tout le reste de l'application passe par ici,
// jamais par IndexedDB directement. Ça garde les règles métier (blocage de
// dépassement, dérivation du solde, tri par urgence) à un seul endroit, ce
// qui facilitera le remplacement de ce fichier par des appels Supabase plus
// tard sans toucher aux écrans.
import { getDb, nouvelId, maintenant } from './database.js';
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

// ---- Enseignes -----------------------------------------------------------

export async function listerEnseignes() {
  const db = await getDb();
  const enseignes = await db.getAll('enseignes');
  return enseignes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export async function trouverEnseigneParNom(nom) {
  const db = await getDb();
  const toutes = await db.getAll('enseignes');
  return toutes.find((e) => e.nomNormalise === normaliserNom(nom)) ?? null;
}

// Utilisée par le formulaire de création de bon : crée l'enseigne à la volée
// si elle n'existe pas encore (section 11).
export async function trouverOuCreerEnseigne(nom, auteur) {
  const existante = await trouverEnseigneParNom(nom);
  if (existante) return existante;

  const db = await getDb();
  const enseigne = {
    id: nouvelId(),
    nom: nom.trim(),
    nomNormalise: normaliserNom(nom),
    lienVerification: null,
    createdAt: maintenant(),
    createdBy: auteur,
  };
  await db.add('enseignes', enseigne);
  return enseigne;
}

export async function renommerEnseigne(id, nouveauNom) {
  const db = await getDb();
  const enseigne = await db.get('enseignes', id);
  if (!enseigne) throw new Error('Enseigne introuvable');
  enseigne.nom = nouveauNom.trim();
  enseigne.nomNormalise = normaliserNom(nouveauNom);
  await db.put('enseignes', enseigne);
}

export async function definirLienEnseigne(id, lien) {
  const db = await getDb();
  const enseigne = await db.get('enseignes', id);
  if (!enseigne) throw new Error('Enseigne introuvable');
  enseigne.lienVerification = lien ? lien.trim() : null;
  await db.put('enseignes', enseigne);
}

export async function supprimerEnseigne(id) {
  const db = await getDb();
  const bonsLies = await db.getAllFromIndex('bons', 'parEnseigne', id);
  if (bonsLies.length > 0) throw new EnseigneUtiliseeError();
  await db.delete('enseignes', id);
}

// ---- Lecture enrichie des bons --------------------------------------------

async function enrichirBon(db, bon) {
  const [mouvements, overrides, modifications] = await Promise.all([
    db.getAllFromIndex('mouvements', 'parBon', bon.id),
    db.getAllFromIndex('overrides', 'parBon', bon.id),
    db.getAllFromIndex('modifications', 'parBon', bon.id),
  ]);
  const solde = calculerSolde(bon, mouvements, overrides);
  const statut = calculerStatut(bon, solde);
  return { ...bon, solde, statut, mouvements, overrides, modifications };
}

export async function listerBonsEnrichis() {
  const db = await getDb();
  const [bons, enseignes] = await Promise.all([
    db.getAll('bons'),
    db.getAll('enseignes'),
  ]);
  const enseignesParId = new Map(enseignes.map((e) => [e.id, e]));
  const enrichis = await Promise.all(bons.map((b) => enrichirBon(db, b)));
  return enrichis
    .map((b) => ({ ...b, enseigne: enseignesParId.get(b.enseigneId) ?? null }))
    .sort((a, b) => cleTriUrgence(a.dateExpiration).localeCompare(cleTriUrgence(b.dateExpiration)));
}

export async function obtenirBon(id) {
  const db = await getDb();
  const bon = await db.get('bons', id);
  if (!bon) return null;
  const enseigne = await db.get('enseignes', bon.enseigneId);
  const enrichi = await enrichirBon(db, bon);
  return { ...enrichi, enseigne };
}

// Solde actif déjà existant pour une enseigne : c'est le cœur de l'alerte
// anti-oubli (section 4). Appelé dès la sélection de l'enseigne, avant toute
// validation du formulaire de création.
export async function getSoldeActifParEnseigne(enseigneId) {
  const db = await getDb();
  const bons = await db.getAllFromIndex('bons', 'parEnseigne', enseigneId);
  const enrichis = await Promise.all(bons.map((b) => enrichirBon(db, b)));
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

// Pastilles par enseigne sur l'écran d'accueil : même donnée que l'alerte
// anti-oubli, mais pour toutes les enseignes ayant au moins un bon actif.
export async function listerPastillesEnseignes() {
  const enseignes = await listerEnseignes();
  const pastilles = await Promise.all(
    enseignes.map(async (e) => ({
      enseigne: e,
      ...(await getSoldeActifParEnseigne(e.id)),
    }))
  );
  return pastilles.filter((p) => p.nombreBons > 0);
}

// ---- Création / cycle de vie d'un bon -------------------------------------

export async function creerBon({
  enseigneNom,
  montantInitial,
  tauxReduction,
  dateAchat,
  dateExpiration,
  code,
  pin,
  auteur,
}) {
  const enseigne = await trouverOuCreerEnseigne(enseigneNom, auteur);
  const db = await getDb();
  const bon = {
    id: nouvelId(),
    enseigneId: enseigne.id,
    montantInitial,
    tauxReduction: tauxReduction ?? null,
    dateAchat,
    dateExpiration: dateExpiration || null,
    code: code.trim(),
    pin: pin?.trim() || null,
    archived: false,
    createdAt: maintenant(),
    createdBy: auteur,
  };
  await db.add('bons', bon);
  return { bon, enseigne };
}

// Édition complète d'un bon déjà créé (toutes les infos saisies à la
// création restent modifiables ensuite, y compris l'enseigne). Ne touche
// jamais aux mouvements ni aux corrections de solde déjà enregistrés — sauf
// le montant initial, dont chaque changement est tracé dans le store
// "modifications" (date, auteur, ancien montant, nouveau montant, solde
// résultant), pour qu'un changement de montant ne passe jamais inaperçu.
export async function modifierBon({
  id,
  enseigneNom,
  montantInitial,
  tauxReduction,
  dateAchat,
  dateExpiration,
  code,
  pin,
  auteur,
}) {
  const enseigne = await trouverOuCreerEnseigne(enseigneNom, auteur);

  const db = await getDb();
  const tx = db.transaction(['bons', 'mouvements', 'overrides', 'modifications'], 'readwrite');
  const bonsStore = tx.objectStore('bons');
  const modificationsStore = tx.objectStore('modifications');

  const bon = await bonsStore.get(id);
  if (!bon) throw new Error('Bon introuvable');

  const montantAvant = bon.montantInitial;

  const bonModifie = {
    ...bon,
    enseigneId: enseigne.id,
    montantInitial,
    tauxReduction: tauxReduction ?? null,
    dateAchat,
    dateExpiration: dateExpiration || null,
    code: code.trim(),
    pin: pin?.trim() || null,
  };
  await bonsStore.put(bonModifie);

  if (montantAvant !== montantInitial) {
    const [mouvements, overrides] = await Promise.all([
      tx.objectStore('mouvements').index('parBon').getAll(id),
      tx.objectStore('overrides').index('parBon').getAll(id),
    ]);
    const soldeApres = calculerSolde(bonModifie, mouvements, overrides);
    await modificationsStore.add({
      id: nouvelId(),
      bonId: id,
      auteur,
      createdAt: maintenant(),
      montantAvant,
      montantApres: montantInitial,
      soldeApres,
    });
  }

  await tx.done;
  return bonModifie;
}

export async function enregistrerMouvement({ bonId, montant, date, note, auteur }) {
  const db = await getDb();
  const tx = db.transaction(['bons', 'mouvements', 'overrides'], 'readwrite');
  const bonsStore = tx.objectStore('bons');
  const mouvementsStore = tx.objectStore('mouvements');
  const overridesStore = tx.objectStore('overrides');

  const bon = await bonsStore.get(bonId);
  if (!bon) throw new Error('Bon introuvable');
  const mouvements = await mouvementsStore.index('parBon').getAll(bonId);
  const overrides = await overridesStore.index('parBon').getAll(bonId);
  const soldeActuel = calculerSolde(bon, mouvements, overrides);

  if (montant > soldeActuel) {
    // Rien n'a été écrit : la transaction n'a servi qu'à lire de façon
    // cohérente. On la laisse se terminer sans écriture.
    throw new DepassementError(soldeActuel);
  }

  const mouvement = {
    id: nouvelId(),
    bonId,
    montant,
    date,
    note: note?.trim() || '',
    auteur,
    createdAt: maintenant(),
  };
  await mouvementsStore.add(mouvement);
  await tx.done;
  return mouvement;
}

export async function corrigerSolde({ bonId, nouveauSolde, motif, auteur }) {
  const db = await getDb();
  const override = {
    id: nouvelId(),
    bonId,
    nouveauSolde,
    motif: motif?.trim() || '',
    auteur,
    createdAt: maintenant(),
  };
  await db.add('overrides', override);
  return override;
}

export async function terminerBon(id) {
  const db = await getDb();
  const bon = await db.get('bons', id);
  if (!bon) throw new Error('Bon introuvable');
  bon.archived = true;
  await db.put('bons', bon);
}

export async function reactiverBon(id) {
  const db = await getDb();
  const bon = await db.get('bons', id);
  if (!bon) throw new Error('Bon introuvable');
  bon.archived = false;
  await db.put('bons', bon);
}

export async function supprimerBonDefinitivement(id) {
  const db = await getDb();
  const tx = db.transaction(['bons', 'mouvements', 'overrides', 'modifications', 'pdfs'], 'readwrite');
  const mouvements = await tx.objectStore('mouvements').index('parBon').getAll(id);
  const overrides = await tx.objectStore('overrides').index('parBon').getAll(id);
  const modifications = await tx.objectStore('modifications').index('parBon').getAll(id);
  await Promise.all(mouvements.map((m) => tx.objectStore('mouvements').delete(m.id)));
  await Promise.all(overrides.map((o) => tx.objectStore('overrides').delete(o.id)));
  await Promise.all(modifications.map((m) => tx.objectStore('modifications').delete(m.id)));
  await tx.objectStore('pdfs').delete(id).catch(() => {});
  await tx.objectStore('bons').delete(id);
  await tx.done;
}

// ---- PDF (stocké en Blob local — remplace le bucket Supabase pour le MVP) -

export async function enregistrerPdf(bonId, file) {
  const db = await getDb();
  await db.put('pdfs', {
    bonId,
    filename: file.name,
    contentType: file.type || 'application/pdf',
    blob: file,
    createdAt: maintenant(),
  });
}

export async function obtenirPdf(bonId) {
  const db = await getDb();
  return (await db.get('pdfs', bonId)) ?? null;
}

export async function supprimerPdf(bonId) {
  const db = await getDb();
  await db.delete('pdfs', bonId);
}
