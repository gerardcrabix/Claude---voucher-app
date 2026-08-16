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

// Date d'expiration par défaut proposée à la création d'un bon : un an
// après la date d'achat, moins un jour (ex. acheté le 16/08/2026=> expire
// par défaut le 15/08/2027). Reste modifiable dans le formulaire.
export function dateExpirationParDefaut(dateAchat = aujourdhuiParis()) {
  const [annee, mois, jour] = dateAchat.split('-').map(Number);
  const date = new Date(annee, mois - 1, jour);
  date.setFullYear(date.getFullYear() + 1);
  date.setDate(date.getDate() - 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Inverse de dateExpirationParDefaut : déduit la date d'achat à partir de
// la date d'expiration lue sur le PDF (date de fin − 1 an + 1 jour), pour
// les bons dont la validité est "1 an à compter de l'achat" et qui n'imprime
// que la date de fin — c'est le cas de tous les modèles rencontrés
// jusqu'ici (Carrefour, Leroy Merlin, Fnac, IKEA).
export function dateAchatDepuisExpiration(dateExpiration) {
  const [annee, mois, jour] = dateExpiration.split('-').map(Number);
  const date = new Date(annee, mois - 1, jour);
  date.setFullYear(date.getFullYear() - 1);
  date.setDate(date.getDate() + 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const NOMS_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function nomMois(annee, moisIndex) {
  return `${NOMS_MOIS[moisIndex]} ${annee}`;
}

// Les 3 prochains mois à afficher sur l'écran Calendrier, en commençant par
// le mois en cours.
export function prochainsMois(nombre = 3) {
  const [anneeStr, moisStr] = aujourdhuiParis().split('-');
  const annee = Number(anneeStr);
  const moisIndex = Number(moisStr) - 1;
  const resultat = [];
  for (let i = 0; i < nombre; i++) {
    const total = moisIndex + i;
    resultat.push({ annee: annee + Math.floor(total / 12), moisIndex: total % 12 });
  }
  return resultat;
}
