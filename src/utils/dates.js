// Fuseau de référence imposé : Europe/Paris (section 5 du cahier des charges).
// Toutes les comparaisons "aujourd'hui" passent par ces helpers pour éviter
// les décalages de fuseau du navigateur.
const FUSEAU = 'Europe/Paris';
export const SEUIL_ALERTE_JOURS = 30;

// Renvoie la date du jour à Paris au format 'YYYY-MM-DD'.
export function aujourdhuiParis() {
  const fmt = new Intl.DateTimeFormat('fr-CA', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date()); // fr-CA => YYYY-MM-DD
}

// Nombre de jours (entier, peut être négatif) entre aujourd'hui (Paris) et
// une date 'YYYY-MM-DD'. Comparaison sur les dates calendaires uniquement.
export function joursRestants(dateStr) {
  if (!dateStr) return null;
  const today = new Date(`${aujourdhuiParis()}T00:00:00`);
  const cible = new Date(`${dateStr}T00:00:00`);
  const diffMs = cible.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function estExpire(dateExpiration) {
  if (!dateExpiration) return false;
  return joursRestants(dateExpiration) < 0;
}

export function estSousLeSeuil(dateExpiration) {
  if (!dateExpiration) return false;
  const j = joursRestants(dateExpiration);
  return j >= 0 && j <= SEUIL_ALERTE_JOURS;
}

export function formatDateAffichage(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// Clé de tri "urgence" : expiration croissante, sans date à la fin.
export function cleTriUrgence(dateExpiration) {
  return dateExpiration ? dateExpiration : '9999-99-99';
}

export function dateInputAujourdhui() {
  return aujourdhuiParis();
}
