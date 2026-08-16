// Journal d'erreurs en mémoire, pour l'écran de diagnostic temporaire.
// Objectif : ne plus jamais se contenter d'un message d'erreur tronqué —
// avoir la pile complète, exportable en un clic, quand quelque chose casse
// sur un appareil qu'on ne peut pas inspecter avec les outils de dev.
const MAX_ENTREES = 200;
let entrees = [];
const abonnes = new Set();

function notifier() {
  for (const fn of abonnes) fn(entrees);
}

export function ajouterEntree(niveau, message, pile) {
  entrees = [
    ...entrees,
    { horodatage: new Date().toISOString(), niveau, message, pile: pile || null },
  ].slice(-MAX_ENTREES);
  notifier();
}

export function obtenirJournal() {
  return entrees;
}

export function viderJournal() {
  entrees = [];
  notifier();
}

export function sAbonner(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}

let installe = false;
// Capture tout ce qui peut casser sans qu'on le voie : erreurs non
// interceptées, promesses rejetées non gérées, et tout console.error/warn
// applicatif (y compris ceux déjà présents dans le code, ex. extraction PDF).
export function installerCaptureGlobale() {
  if (installe) return;
  installe = true;

  window.addEventListener('error', (e) => {
    ajouterEntree('erreur', e.message, e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const raison = e.reason;
    ajouterEntree(
      'promesse-rejetee',
      raison?.message || String(raison),
      raison?.stack || null
    );
  });

  const consoleErrorOriginal = console.error.bind(console);
  console.error = (...args) => {
    consoleErrorOriginal(...args);
    ajouterEntree('console.error', args.map(String).join(' '), null);
  };

  const consoleWarnOriginal = console.warn.bind(console);
  console.warn = (...args) => {
    consoleWarnOriginal(...args);
    ajouterEntree('console.warn', args.map(String).join(' '), null);
  };
}

export function infosEnvironnement() {
  return {
    // Horodatage du build en cours d'exécution (voir vite.config.js) —
    // permet de vérifier en un coup d'œil qu'un appareil tourne bien sur la
    // dernière version déployée plutôt que sur un ancien service worker
    // resté en cache, source récurrente de confusion sur ce projet.
    versionBuild: typeof __VERSION_BUILD__ !== 'undefined' ? __VERSION_BUILD__ : 'inconnue',
    userAgent: navigator.userAgent,
    plateforme: navigator.platform,
    enLigne: navigator.onLine,
    promiseWithResolvers: typeof Promise.withResolvers === 'function',
    workerDisponible: typeof Worker !== 'undefined',
    moduleWorkerProbable: typeof Worker !== 'undefined',
    indexedDBDisponible: typeof indexedDB !== 'undefined',
  };
}
