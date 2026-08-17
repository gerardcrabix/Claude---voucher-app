// Calcul du solde d'un bon — jamais stocké en dur (section 4).
// solde = dernier ajustement manuel (override) OU montant initial du bon,
//         moins les mouvements de dépense postérieurs à cet ajustement.
import { estExpire } from '../utils/dates.js';

export function calculerSolde(bon, mouvements, overrides) {
  const overridesTries = [...overrides].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1
  );
  const dernierOverride = overridesTries[0] ?? null;

  const baseline = dernierOverride ? dernierOverride.nouveauSolde : bon.montantInitial;
  const depuis = dernierOverride ? dernierOverride.createdAt : bon.createdAt;

  const depensesApres = mouvements
    .filter((m) => m.createdAt > depuis)
    .reduce((somme, m) => somme + m.montant, 0);

  return baseline - depensesApres;
}

// Statut d'affichage d'un bon. L'archivage prime sur tout : un bon "terminé"
// sort du flux actif quel que soit son solde ou sa date.
export function calculerStatut(bon, solde) {
  if (bon.archived) return 'termine';
  if (estExpire(bon.dateExpiration)) return 'expire';
  if (solde <= 0) return 'solde';
  return 'actif';
}

export function estActif(statut) {
  return statut === 'actif';
}

// Date du dernier évènement (dépense ou correction) qui a amené le solde à
// sa valeur actuelle — utile dès que le solde est à 0 : dire juste "0 €"
// sans date ne permet pas de savoir depuis quand ni de le retrouver. Sert
// à l'affichage ("Soldé le …", écran Expirés) et à la purge automatique
// des vieux bons soldés (voir db/repository.js, `purgerBonsAnciens`).
export function dateDuDernierEvenement(bon, mouvements, overrides) {
  const evenements = [
    ...mouvements.map((m) => ({ createdAt: m.createdAt, date: m.date })),
    ...overrides.map((o) => ({ createdAt: o.createdAt, date: o.createdAt.slice(0, 10) })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return evenements[0]?.date ?? bon.dateAchat;
}
