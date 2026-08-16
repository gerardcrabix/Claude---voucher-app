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

const NOMS_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function nomMois(annee, moisIndex) {
  return `${NOMS_MOIS[moisIndex]} ${annee}`;
}

function joursDansLeMois(annee, moisIndex) {
  return new Date(annee, moisIndex + 1, 0).getDate();
}

// Jour de la semaine du 1er du mois, 0 = lundi ... 6 = dimanche (convention
// française), pour aligner la grille du calendrier.
function premierJourSemaine(annee, moisIndex) {
  const jsDay = new Date(`${annee}-${String(moisIndex + 1).padStart(2, '0')}-01T00:00:00`).getDay();
  return (jsDay + 6) % 7;
}

function versDateStr(annee, moisIndex, jour) {
  const m = String(moisIndex + 1).padStart(2, '0');
  const j = String(jour).padStart(2, '0');
  return `${annee}-${m}-${j}`;
}

// Grille de semaines pour un mois donné : chaque semaine est un tableau de 7
// { date, dansLeMois } — les jours des mois voisins servent juste à
// compléter la grille visuellement.
export function grilleDuMois(annee, moisIndex) {
  const total = joursDansLeMois(annee, moisIndex);
  const decalage = premierJourSemaine(annee, moisIndex);

  const moisPrecedent = moisIndex === 0 ? 11 : moisIndex - 1;
  const anneePrecedente = moisIndex === 0 ? annee - 1 : annee;
  const totalPrecedent = joursDansLeMois(anneePrecedente, moisPrecedent);

  const moisSuivant = moisIndex === 11 ? 0 : moisIndex + 1;
  const anneeSuivante = moisIndex === 11 ? annee + 1 : annee;

  const jours = [];
  for (let i = 0; i < decalage; i++) {
    const jour = totalPrecedent - decalage + i + 1;
    jours.push({ date: versDateStr(anneePrecedente, moisPrecedent, jour), dansLeMois: false });
  }
  for (let jour = 1; jour <= total; jour++) {
    jours.push({ date: versDateStr(annee, moisIndex, jour), dansLeMois: true });
  }
  while (jours.length % 7 !== 0) {
    const jour = jours.length - decalage - total + 1;
    jours.push({ date: versDateStr(anneeSuivante, moisSuivant, jour), dansLeMois: false });
  }

  const semaines = [];
  for (let i = 0; i < jours.length; i += 7) {
    semaines.push(jours.slice(i, i + 7));
  }
  return semaines;
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
