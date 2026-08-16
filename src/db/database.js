// Ouverture de la base IndexedDB locale (stockage 100% sur l'appareil).
//
// MVP volontairement sans backend : cette base ne synchronise rien entre
// appareils. C'est un choix explicite pour tester l'ergonomie avant de
// brancher Supabase (voir docs/PLAN.md). Chaque store correspond à une
// future table de la vraie base :
//   enseignes  -> table "enseignes"
//   bons       -> table "bons"
//   mouvements -> table "mouvements" (dépenses)
//   overrides  -> table "overrides_solde" (corrections manuelles)
//   pdfs       -> objets du bucket de stockage (ici : Blob en IndexedDB)
import { openDB } from 'idb';

const DB_NAME = 'bons-app';
const DB_VERSION = 1;

let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const enseignes = db.createObjectStore('enseignes', { keyPath: 'id' });
        enseignes.createIndex('parNom', 'nomNormalise', { unique: false });

        const bons = db.createObjectStore('bons', { keyPath: 'id' });
        bons.createIndex('parEnseigne', 'enseigneId', { unique: false });

        const mouvements = db.createObjectStore('mouvements', { keyPath: 'id' });
        mouvements.createIndex('parBon', 'bonId', { unique: false });

        const overrides = db.createObjectStore('overrides', { keyPath: 'id' });
        overrides.createIndex('parBon', 'bonId', { unique: false });

        db.createObjectStore('pdfs', { keyPath: 'bonId' });
      },
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
