// Client Supabase unique pour toute l'application. Les deux valeurs viennent
// de variables d'environnement injectées au build (voir .env.example) :
// la clé "anon" est publique par construction (elle circule dans le bundle
// JS envoyé au navigateur) — ce qui protège réellement les données, c'est
// Row Level Security côté base (voir supabase/migrations/0001_init.sql),
// pas le secret de cette clé.
import { createClient } from '@supabase/supabase-js';
import { ajouterEntree } from '../diagnostic/journal.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Erreur volontairement bruyante : une app qui démarre "à moitié" sans
  // configuration est plus difficile à diagnostiquer qu'un échec immédiat
  // et explicite (même piège que l'ouverture IndexedDB en v1).
  ajouterEntree(
    'supabase-client',
    "VITE_SUPABASE_URL et/ou VITE_SUPABASE_ANON_KEY manquants — voir .env.example.",
    null
  );
}

// Par défaut, supabase-js accède directement à `window.localStorage` pour
// garder la session — hors certains réglages de confidentialité de Firefox
// (protection stricte des cookies/du stockage, navigation privée avec
// historique désactivé...), cet accès ne renvoie pas juste `undefined`, il
// LÈVE une exception synchrone ("The operation is insecure"). Comme ce
// module est importé avant même le premier rendu React, cette exception
// empêchait l'application entière de démarrer — écran blanc, sans que
// l'ErrorBoundary (qui ne protège que le rendu React, pas le chargement des
// modules) ne puisse rien afficher. Repéré sur Firefox, absent sur
// Edge/Safari qui n'ont pas ce comportement par défaut.
function creerStockageResilient() {
  const secours = new Map();
  try {
    const cle = '__cajac_voucher_test__';
    window.localStorage.setItem(cle, '1');
    window.localStorage.removeItem(cle);
    return window.localStorage;
  } catch {
    ajouterEntree(
      'supabase-client',
      "localStorage inaccessible (réglages de confidentialité du navigateur) — la session ne survivra pas à un rechargement de page, mais l'application démarre normalement.",
      null
    );
    return {
      getItem: (k) => (secours.has(k) ? secours.get(k) : null),
      setItem: (k, v) => { secours.set(k, v); },
      removeItem: (k) => { secours.delete(k); },
    };
  }
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: creerStockageResilient(),
  },
});
