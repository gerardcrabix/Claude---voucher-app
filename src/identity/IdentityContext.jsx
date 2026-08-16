// MVP sans compte réel : chaque appareil "se souvient" de qui l'utilise
// (Moi / Ma femme) pour tracer l'auteur des bons et des mouvements, comme le
// ferait l'authentification Supabase dans la vraie version. Ce choix est
// local à l'appareil (localStorage), donc les deux iPhones ne partagent pas
// leurs données à ce stade — c'est prévu et documenté (voir README).
import { createContext, useContext, useEffect, useState } from 'react';

const CLE_STOCKAGE = 'bons-app:identite';

export const IDENTITES = [
  { id: 'moi', label: 'Moi' },
  { id: 'elle', label: 'Ma femme' },
];

const IdentityContext = createContext(null);

export function IdentityProvider({ children }) {
  const [identite, setIdentiteState] = useState(() => {
    return localStorage.getItem(CLE_STOCKAGE);
  });

  useEffect(() => {
    if (identite) localStorage.setItem(CLE_STOCKAGE, identite);
  }, [identite]);

  function setIdentite(id) {
    setIdentiteState(id);
  }

  function changerDePersonne() {
    localStorage.removeItem(CLE_STOCKAGE);
    setIdentiteState(null);
  }

  return (
    <IdentityContext.Provider value={{ identite, setIdentite, changerDePersonne }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error('useIdentity doit être utilisé dans IdentityProvider');
  return ctx;
}

export function libelleIdentite(id) {
  return IDENTITES.find((i) => i.id === id)?.label ?? id;
}
