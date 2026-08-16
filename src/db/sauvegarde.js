// Sauvegarde/restauration complète des données locales (section "Export").
// MVP sans backend : toute la donnée vit uniquement sur cet appareil
// (IndexedDB) — sans ça, un téléphone perdu, cassé ou réinitialisé emporte
// tous les bons, codes et PIN avec lui. Le fichier exporté est un simple
// JSON (les PDF, en Blob dans IndexedDB, sont encodés en base64 pour tenir
// dans du texte), à conserver soi-même où on veut (mail, cloud, etc.).
import { getDb } from './database.js';

const VERSION_SAUVEGARDE = 1;
const STORES = ['enseignes', 'bons', 'mouvements', 'overrides', 'modifications', 'pdfs'];

async function blobVersBase64(blob) {
  const octets = new Uint8Array(await blob.arrayBuffer());
  let binaire = '';
  const CHUNK = 8192;
  for (let i = 0; i < octets.length; i += CHUNK) {
    binaire += String.fromCharCode(...octets.subarray(i, Math.min(i + CHUNK, octets.length)));
  }
  return btoa(binaire);
}

function base64VersBlob(base64, type) {
  const binaire = atob(base64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return new Blob([octets], { type });
}

export async function exporterSauvegarde() {
  const db = await getDb();
  const [enseignes, bons, mouvements, overrides, modifications, pdfs] = await Promise.all(
    STORES.map((nom) => db.getAll(nom))
  );

  const pdfsSerialisables = await Promise.all(
    pdfs.map(async ({ blob, ...reste }) => ({ ...reste, blobBase64: await blobVersBase64(blob) }))
  );

  return {
    version: VERSION_SAUVEGARDE,
    exporteLe: new Date().toISOString(),
    enseignes,
    bons,
    mouvements,
    overrides,
    modifications,
    pdfs: pdfsSerialisables,
  };
}

// Restauration = remplacement complet (pas une fusion) : c'est le sens
// attendu de "restaurer une sauvegarde", et une fusion silencieuse risquerait
// de mélanger deux historiques incohérents (soldes, corrections...). La
// confirmation explicite avant l'appel est à la charge de l'écran appelant.
export async function restaurerSauvegarde(donnees) {
  if (!donnees || typeof donnees !== 'object' || !Array.isArray(donnees.bons)) {
    throw new Error('Fichier de sauvegarde invalide ou illisible.');
  }

  const db = await getDb();
  const tx = db.transaction(STORES, 'readwrite');

  await Promise.all(STORES.map((nom) => tx.objectStore(nom).clear()));

  for (const e of donnees.enseignes ?? []) await tx.objectStore('enseignes').put(e);
  for (const b of donnees.bons ?? []) await tx.objectStore('bons').put(b);
  for (const m of donnees.mouvements ?? []) await tx.objectStore('mouvements').put(m);
  for (const o of donnees.overrides ?? []) await tx.objectStore('overrides').put(o);
  for (const mo of donnees.modifications ?? []) await tx.objectStore('modifications').put(mo);
  for (const { blobBase64, ...reste } of donnees.pdfs ?? []) {
    await tx.objectStore('pdfs').put({ ...reste, blob: base64VersBlob(blobBase64, reste.contentType) });
  }

  await tx.done;
}
