// Synchronisation temps réel (§A6 du document d'architecture) : une seule
// souscription couvrant les 4 tables qui composent l'état d'un bon. Chaque
// écran qui affiche des bons s'y abonne et rappelle simplement sa fonction
// de chargement habituelle à chaque évènement — pas de fusion incrémentale
// fine, un rechargement complet est largement assez rapide pour deux
// comptes et quelques centaines de bons, et évite toute divergence subtile
// entre l'état local et la base.
import { useEffect } from 'react';
import { supabase } from '../supabase/client.js';

let compteurCanaux = 0;

export function suivreChangements(callback) {
  const nomCanal = `bons-realtime-${++compteurCanaux}`;
  const canal = supabase
    .channel(nomCanal)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bons' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mouvements' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'overrides' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'modifications' }, callback)
    .subscribe();

  return () => {
    supabase.removeChannel(canal);
  };
}

// Hook pratique pour les écrans de liste : `useSyncBons(charger)` rappelle
// `charger` une première fois au montage, puis à chaque évènement distant.
export function useSyncBons(charger, deps = []) {
  useEffect(() => {
    charger();
    const arreter = suivreChangements(() => charger());
    return arreter;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
