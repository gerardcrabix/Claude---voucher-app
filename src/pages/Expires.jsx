import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listerBonsEnrichis, terminerBon } from '../db/repository.js';
import { centimesVersAffichage } from '../utils/money.js';
import { formatDateAffichage } from '../utils/dates.js';

// Section distincte pour les bons expirés (section 5) : exclus des pastilles
// et de l'alerte anti-oubli, mais toujours visibles ici et archivables.
export default function Expires() {
  const [bons, setBons] = useState(null);

  async function charger() {
    const tous = await listerBonsEnrichis();
    setBons(tous.filter((b) => b.statut === 'expire'));
  }

  useEffect(() => {
    charger();
  }, []);

  async function surTerminer(id) {
    await terminerBon(id);
    await charger();
  }

  if (bons === null) {
    return <div className="contenu"><p className="texte-discret">Chargement…</p></div>;
  }

  return (
    <div className="contenu">
      <h1>Expirés</h1>
      {bons.length === 0 ? (
        <div className="vide">
          <p>Aucun bon expiré.</p>
        </div>
      ) : (
        <div className="liste-bons">
          {bons.map((bon) => (
            <div key={bon.id} className="carte-bon">
              <div className="ligne-haut">
                <Link to={`/bon/${bon.id}`} className="enseigne">
                  {bon.enseigne?.nom}
                </Link>
                <span className="solde">{centimesVersAffichage(bon.solde)}</span>
              </div>
              <span className="expiration urgent">
                Expiré le {formatDateAffichage(bon.dateExpiration)}
              </span>
              <div className="actions">
                <button className="bouton-grand bouton-secondaire" onClick={() => surTerminer(bon.id)}>
                  Clôturer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
