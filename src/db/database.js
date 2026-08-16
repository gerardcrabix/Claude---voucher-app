// Ouverture de la base IndexedDB locale (stockage 100% sur l'appareil).
//
// MVP volontairement sans backend : cette base ne synchronise rien entre
// appareils. C'est un choix explicite pour tester l'ergonomie avant de
// brancher Supabase (voir docs/PLAN.md). Chaque store correspond à une
// future table de la vraie base :
//   enseignes     -> table "enseignes"
//   bons          -> table "bons"
//   mouvements    -> table "mouvements" (dépenses)
//   overrides     -> table "overrides_solde" (corrections manuelles)
//   modifications -> journal des changements du montant initial d'un bon
//   pdfs          -> objets du bucket de stockage (ici : Blob en IndexedDB)
import { openDB } from 'idb';
import { ajouterEntree } from '../diagnostic/journal.js';

const DB_NAME = 'bons-app';
const DB_VERSION = 2;
const DELAI_MAX_MS = 8000;

let dbPromise = null;

function ouvrirIndexedDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // db.objectStoreNames.contains(...) en garde : sur un état déjà
      // partiellement migré (ou un bug de navigateur), on ne veut jamais
      // planter toute l'ouverture de la base pour un store qui existe déjà
      // — juste passer à la suite.
      if (!db.objectStoreNames.contains('enseignes')) {
        const enseignes = db.createObjectStore('enseignes', { keyPath: 'id' });
        enseignes.createIndex('parNom', 'nomNormalise', { unique: false });
      }
      if (!db.objectStoreNames.contains('bons')) {
        const bons = db.createObjectStore('bons', { keyPath: 'id' });
        bons.createIndex('parEnseigne', 'enseigneId', { unique: false });
      }
      if (!db.objectStoreNames.contains('mouvements')) {
        const mouvements = db.createObjectStore('mouvements', { keyPath: 'id' });
        mouvements.createIndex('parBon', 'bonId', { unique: false });
      }
      if (!db.objectStoreNames.contains('overrides')) {
        const overrides = db.createObjectStore('overrides', { keyPath: 'id' });
        overrides.createIndex('parBon', 'bonId', { unique: false });
      }
      if (!db.objectStoreNames.contains('pdfs')) {
        db.createObjectStore('pdfs', { keyPath: 'bonId' });
      }
      if (!db.objectStoreNames.contains('modifications')) {
        const modifications = db.createObjectStore('modifications', { keyPath: 'id' });
        modifications.createIndex('parBon', 'bonId', { unique: false });
      }
    },
    // Cas classique d'IndexedDB qui n'échoue JAMAIS mais n'aboutit jamais
    // non plus : un autre onglet/une autre instance de l'app a une
    // connexion ouverte sur une version différente, et le navigateur met
    // l'ouverture en attente indéfiniment, sans erreur ni délai — c'est
    // très exactement ce qui produisait un "Chargement…" qui tourne dans le
    // vide, sans que le filet de sécurité (qui ne réagit qu'aux rejets)
    // puisse s'en apercevoir.
    blocked(currentVersion, blockedVersion) {
      ajouterEntree(
        'base-de-donnees',
        `Ouverture bloquée par une autre connexion (onglet resté ouvert ?) : currentVersion=${currentVersion}, blockedVersion=${blockedVersion}`,
        null
      );
    },
    // Si CETTE connexion-ci bloque une autre tentative d'ouverture (ex. un
    // autre onglet qui vient d'être mis à jour), on se ferme proactivement
    // pour ne pas être la cause du blocage ailleurs.
    blocking(currentVersion, blockedVersion, event) {
      ajouterEntree('base-de-donnees', 'Cette connexion bloque une autre ouverture, fermeture.', null);
      event.target.close();
    },
  });
}

// Sans timeout, un blocage IndexedDB (voir `blocked` ci-dessus) laisse cette
// promesse en attente pour toujours : aucune erreur, aucune résolution,
// l'app reste bloquée sur son écran de chargement sans aucun moyen de s'en
// rendre compte. Au-delà de DELAI_MAX_MS, on force un échec explicite.
function avecDelaiMax(promesse, description) {
  let idTimeout;
  const timeout = new Promise((_, reject) => {
    idTimeout = setTimeout(() => {
      reject(new Error(`${description} : délai dépassé (${DELAI_MAX_MS / 1000}s). Fermez les autres onglets de l'application et réessayez.`));
    }, DELAI_MAX_MS);
  });
  return Promise.race([promesse, timeout]).finally(() => clearTimeout(idTimeout));
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = avecDelaiMax(ouvrirIndexedDB(), 'Ouverture de la base locale');

    // Comme pour le chargement de pdfjs-dist : si l'ouverture échoue (ou
    // dépasse le délai), on ne garde SURTOUT PAS la promesse rejetée en
    // cache, sinon l'app resterait cassée pour le reste de la session sans
    // jamais retenter.
    dbPromise.catch((e) => {
      ajouterEntree('base-de-donnees', `Échec ouverture IndexedDB : ${e?.message}`, e?.stack);
      dbPromise = null;
    });
  }
  return dbPromise;
}

export function nouvelId() {
  return crypto.randomUUID();
}

export function maintenant() {
  return new Date().toISOString();
}
