// Remplace src/identity/IdentityContext.jsx de la v1. Le choix "CM ou AJ" +
// mot de passe local devient une vraie session Supabase Auth : c'est ce
// changement qui règle le problème structurel de la v1 (se connecter sur un
// autre appareil ouvrait une base vide) — la session est désormais vérifiée
// par le serveur, pas lue dans le localStorage de l'appareil.
//
// Pour que les écrans repris de la v1 (BonCard, SelecteurVisibilite,
// Admin...) changent le moins possible, ce contexte garde un vocabulaire
// proche : `identite` reste l'identifiant de "qui je suis" (désormais un uid
// Supabase, plus 'moi'/'elle'), et `libelleIdentite`/`profils` remplacent la
// constante statique IDENTITES par la liste réelle des deux comptes, chargée
// depuis la table `profiles`.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase/client.js';
import { ajouterEntree } from '../diagnostic/journal.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = pas encore su, null = déconnecté
  const [profils, setProfils] = useState([]); // [{id, label, role}, ...] — les deux comptes (CM, AJ)
  const [chargementProfils, setChargementProfils] = useState(false);

  const chargerProfils = useCallback(async () => {
    setChargementProfils(true);
    const { data, error } = await supabase.from('profiles').select('id, display_name, role');
    if (error) {
      ajouterEntree('auth', `Échec chargement des profils : ${error.message}`, null);
      setProfils([]);
    } else {
      setProfils(data.map((p) => ({ id: p.id, label: p.display_name, role: p.role })));
    }
    setChargementProfils(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) chargerProfils();
    else setProfils([]);
  }, [session, chargerProfils]);

  async function seConnecter(email, motDePasse) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
    if (error) throw error;
  }

  async function seDeconnecter() {
    await supabase.auth.signOut();
  }

  const identite = session?.user?.id ?? null;
  const profil = profils.find((p) => p.id === identite) ?? null;
  const estAdmin = profil?.role === 'admin';

  function libelleIdentite(id) {
    return profils.find((p) => p.id === id)?.label ?? id ?? '';
  }

  const valeur = {
    session,
    identite,
    profil,
    profils,
    estAdmin,
    // `chargementInitial` couvre à la fois "on ne sait pas encore s'il y a une
    // session" et, une fois connecté, "les profils ne sont pas encore là" —
    // sans ça, un écran qui a besoin du libellé de l'auteur afficherait un
    // uid brut le temps du premier chargement.
    chargementInitial: session === undefined || (session !== null && chargementProfils && profils.length === 0),
    connecte: !!session,
    seConnecter,
    seDeconnecter,
    libelleIdentite,
  };

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
