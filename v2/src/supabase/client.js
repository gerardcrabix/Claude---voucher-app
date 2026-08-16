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

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
