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
  // Passe à true quand le lien reçu par e-mail ("mot de passe oublié") vient
  // d'être ouvert : Supabase crée alors une session temporaire de
  // récupération et prévient via cet évènement, avant même que l'app sache
  // si la session est "normale" ou non — voir App.jsx, qui court-circuite le
  // routage habituel tant que c'est vrai, pour afficher le formulaire de
  // nouveau mot de passe plutôt que l'accueil ou l'écran de connexion.
  const [enRecuperation, setEnRecuperation] = useState(false);

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
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setEnRecuperation(true);
    });
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

  // "Mot de passe oublié" (remplace l'ancien onglet Admin de la v1, qui
  // changeait les mots de passe locaux à la main) : envoie un e-mail avec un
  // lien à usage unique. Le redirectTo pointe volontairement vers la racine
  // du site, SANS route "#/..." — Supabase ajoute ses propres jetons après
  // un "#" à l'arrivée, et un deuxième "#" dans l'URL (à cause du routage
  // par hash de l'appli) empêcherait Supabase de les relire correctement.
  async function demanderReinitialisation(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) throw error;
  }

  async function definirNouveauMotDePasse(nouveauMotDePasse) {
    const { error } = await supabase.auth.updateUser({ password: nouveauMotDePasse });
    if (error) throw error;
    setEnRecuperation(false);
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
    enRecuperation,
    seConnecter,
    seDeconnecter,
    demanderReinitialisation,
    definirNouveauMotDePasse,
    libelleIdentite,
  };

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
