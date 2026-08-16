import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listerBonsEnrichis } from '../db/repository.js';
import {
  aujourdhuiParis,
  estSousLeSeuil,
  formatDateAffichage,
  grilleDuMois,
  nomMois,
  prochainsMois,
} from '../utils/dates.js';
import { centimesVersAffichage } from '../utils/money.js';

const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Vue calendrier sur les 3 prochains mois : où trouver, en un coup d'œil,
// les bons actifs à consommer avant leur expiration.
export default function Calendrier() {
  const [bons, setBons] = useState(null);
  const [jourSelectionne, setJourSelectionne] = useState(null);

  useEffect(() => {
    listerBonsEnrichis().then((tous) =>
      setBons(tous.filter((b) => b.statut === 'actif' && b.dateExpiration))
    );
  }, []);

  const parDate = useMemo(() => {
    const map = new Map();
    for (const b of bons ?? []) {
      const liste = map.get(b.dateExpiration) ?? [];
      liste.push(b);
      map.set(b.dateExpiration, liste);
    }
    return map;
  }, [bons]);

  if (bons === null) {
    return <div className="contenu"><p className="texte-discret">Chargement…</p></div>;
  }

  const aujourdhui = aujourdhuiParis();
  const mois = prochainsMois(3);
  const bonsTries = [...bons].sort((a, b) => a.dateExpiration.localeCompare(b.dateExpiration));
  const bonsDuJourSelectionne = jourSelectionne ? parDate.get(jourSelectionne) ?? [] : [];

  return (
    <div className="contenu">
      <h1>Calendrier</h1>
      <p className="texte-discret">Bons actifs à consommer, 3 prochains mois.</p>

      {mois.map(({ annee, moisIndex }) => (
        <div key={`${annee}-${moisIndex}`} className="mois-calendrier">
          <h2>{nomMois(annee, moisIndex)}</h2>
          <div className="grille-jours-semaine">
            {JOURS_SEMAINE.map((j, i) => (
              <span key={i} className="jour-semaine">{j}</span>
            ))}
          </div>
          {grilleDuMois(annee, moisIndex).map((semaine, i) => (
            <div key={i} className="ligne-calendrier">
              {semaine.map((jour) => {
                const bonsJour = parDate.get(jour.date) ?? [];
                const aUrgence = bonsJour.some((b) => estSousLeSeuil(b.dateExpiration));
                const classes = [
                  'jour-calendrier',
                  !jour.dansLeMois && 'hors-mois',
                  jour.date === aujourdhui && 'aujourdhui',
                  bonsJour.length > 0 && 'avec-bon',
                  aUrgence && 'urgent',
                  jourSelectionne === jour.date && 'selectionne',
                ].filter(Boolean).join(' ');
                return (
                  <button
                    key={jour.date}
                    className={classes}
                    onClick={() => setJourSelectionne(bonsJour.length > 0 ? jour.date : null)}
                    disabled={bonsJour.length === 0}
                  >
                    {Number(jour.date.slice(-2))}
                    {bonsJour.length > 0 && <span className="pastille-jour" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ))}

      {jourSelectionne && bonsDuJourSelectionne.length > 0 && (
        <div>
          <h2>Le {formatDateAffichage(jourSelectionne)}</h2>
          <div className="liste-simple">
            {bonsDuJourSelectionne.map((b) => (
              <Link key={b.id} to={`/bon/${b.id}`} className="ligne-enseigne">
                <span className="enseigne">{b.enseigne?.nom}</span>
                <span className="texte-discret">{centimesVersAffichage(b.solde)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2>Tous les bons à échéance</h2>
        {bonsTries.length === 0 ? (
          <p className="texte-discret">Aucun bon actif avec une date d'expiration pour l'instant.</p>
        ) : (
          <div className="liste-simple">
            {bonsTries.map((b) => (
              <Link key={b.id} to={`/bon/${b.id}`} className="ligne-enseigne">
                <div className="ligne-haut">
                  <span className="enseigne">{b.enseigne?.nom}</span>
                  <span className="solde">{centimesVersAffichage(b.solde)}</span>
                </div>
                <span className={`expiration ${estSousLeSeuil(b.dateExpiration) ? 'urgent' : ''}`}>
                  À utiliser avant le {formatDateAffichage(b.dateExpiration)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
