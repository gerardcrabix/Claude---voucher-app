import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listerBonsEnrichis } from '../db/repository.js';
import { estSousLeSeuil, formatDateAffichage, nomMois, prochainsMois } from '../utils/dates.js';
import { centimesVersAffichage } from '../utils/money.js';

// Vue calendrier sur les 3 prochains mois : juste ce qu'il faut pour voir
// d'un coup d'œil ce qui arrive à échéance — mois, date, enseigne, montant.
// Pas de grille de tous les jours du mois : ça n'apporte rien pour la
// quarantaine de jours sans bon, seuls les jours avec un bon comptent.
export default function Calendrier() {
  const [bons, setBons] = useState(null);
  const [nombreMois, setNombreMois] = useState(3);

  useEffect(() => {
    listerBonsEnrichis().then((tous) =>
      setBons(tous.filter((b) => b.statut === 'actif' && b.dateExpiration))
    );
  }, []);

  if (bons === null) {
    return <div className="contenu"><p className="texte-discret">Chargement…</p></div>;
  }

  const mois = prochainsMois(nombreMois);

  return (
    <div className="contenu">
      <h1>Calendrier</h1>
      <div className="boutons-enseignes">
        {[3, 6].map((n) => (
          <button
            key={n}
            type="button"
            className={`bouton-enseigne ${nombreMois === n ? 'active' : ''}`}
            onClick={() => setNombreMois(n)}
          >
            {n} mois
          </button>
        ))}
      </div>
      <p className="texte-discret">Bons actifs à consommer, {nombreMois} prochains mois.</p>

      {mois.map(({ annee, moisIndex }) => {
        const prefixe = `${annee}-${String(moisIndex + 1).padStart(2, '0')}`;
        const bonsDuMois = bons
          .filter((b) => b.dateExpiration.startsWith(prefixe))
          .sort((a, b) => a.dateExpiration.localeCompare(b.dateExpiration));

        return (
          <div key={prefixe} className="mois-calendrier">
            <h2>{nomMois(annee, moisIndex)}</h2>
            {bonsDuMois.length === 0 ? (
              <p className="texte-discret">Rien à signaler.</p>
            ) : (
              <div className="liste-simple">
                {bonsDuMois.map((b) => (
                  <Link key={b.id} to={`/bon/${b.id}`} className="ligne-calendrier-bon">
                    <span className="jour-calendrier-liste">
                      {formatDateAffichage(b.dateExpiration).slice(0, 2)}
                    </span>
                    <span className="enseigne-calendrier-liste">{b.enseigne?.nom}</span>
                    <span className={`solde-calendrier-liste ${estSousLeSeuil(b.dateExpiration) ? 'urgent' : ''}`}>
                      {centimesVersAffichage(b.solde)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
