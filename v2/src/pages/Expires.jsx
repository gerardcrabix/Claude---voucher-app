import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listerBonsEnrichis, reactiverBon, terminerBon } from '../db/repository.js';
import { dateDuDernierEvenement } from '../db/solde.js';
import { centimesVersAffichage } from '../utils/money.js';
import { formatDateAffichage } from '../utils/dates.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSyncBons } from '../db/realtime.js';
import ModaleCorrigerSolde from '../components/ModaleCorrigerSolde.jsx';

// Bons expirés (date dépassée), soldés (montant tombé à 0) ET clôturés —
// les trois disparaissent de l'accueil (qui ne montre que les bons actifs),
// donc sans cet écran il n'y avait aucun moyen de les retrouver ni de
// rattraper une erreur (correction de solde tapée à 0, clôture au mauvais
// bon...). Même traitement pour les trois : visibles ici, avec une date
// pertinente et un bouton pour revenir en arrière.
//
// Le solde affiché ailleurs dans l'appli (0 € pour un bon soldé ou
// clôturé) ne suffit pas à s'y retrouver quand plusieurs bons changent de
// catégorie au fil du temps — la carte montre donc ici le code du bon et
// son montant initial en plus de l'enseigne et de la date.
//
// "Corriger le solde" reste le seul vrai moyen de rattraper un solde tombé
// à 0 par erreur : une fois une correction manuelle enregistrée, elle prime
// sur le montant initial (voir db/solde.js) — modifier le montant initial
// depuis l'écran "Modifier" ne changerait rien à l'affichage. "Modifier"
// reste utile à côté pour corriger, par exemple, une date d'expiration
// erronée sur un bon expiré par erreur.
export default function Expires() {
  const { identite, libelleIdentite } = useAuth();
  const [bons, setBons] = useState(null);
  const [bonACorriger, setBonACorriger] = useState(null);

  async function charger() {
    const tous = await listerBonsEnrichis(identite);
    setBons(tous.filter((b) => b.statut === 'expire' || b.statut === 'solde' || b.statut === 'termine'));
  }

  useSyncBons(charger);

  async function surTerminer(id) {
    await terminerBon(id, identite);
    await charger();
  }

  async function surReactivation(id) {
    await reactiverBon(id);
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
          <p>Aucun bon expiré, soldé ou clôturé.</p>
        </div>
      ) : (
        <div className="liste-bons">
          {bons.map((bon) => (
            <div key={bon.id} className="carte-bon">
              <div className="ligne-haut">
                <Link to={`/bon/${bon.id}`} className="enseigne">
                  {bon.enseigne?.nom}
                </Link>
                <span className="solde">{centimesVersAffichage(bon.montantInitial)}</span>
              </div>
              {bon.code && (
                <div className="codes">
                  <span className="code">{bon.code}</span>
                </div>
              )}
              {bon.statut === 'expire' && (
                <span className="pilule-statut jaune">
                  Expiré le {formatDateAffichage(bon.dateExpiration)}
                </span>
              )}
              {bon.statut === 'solde' && (
                <span className="pilule-statut">
                  Soldé le {formatDateAffichage(dateDuDernierEvenement(bon, bon.mouvements, bon.overrides))}
                </span>
              )}
              {bon.statut === 'termine' && (
                <span className="pilule-statut neutre">
                  {bon.archivedAt ? `Clôturé le ${formatDateAffichage(bon.archivedAt.slice(0, 10))}` : 'Clôturé'}
                  {bon.archivedBy && ` par ${libelleIdentite(bon.archivedBy)}`}
                </span>
              )}
              <div className="actions">
                {bon.statut === 'solde' && (
                  <button className="bouton-grand bouton-secondaire" onClick={() => setBonACorriger(bon)}>
                    Corriger le solde
                  </button>
                )}
                <Link to={`/bon/${bon.id}/modifier`} className="bouton-grand bouton-secondaire">
                  Modifier
                </Link>
                {bon.statut === 'termine' ? (
                  <button className="bouton-grand bouton-secondaire" onClick={() => surReactivation(bon.id)}>
                    Reprendre
                  </button>
                ) : (
                  <button className="bouton-grand bouton-secondaire" onClick={() => surTerminer(bon.id)}>
                    Clôturer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {bonACorriger && (
        <ModaleCorrigerSolde
          bon={bonACorriger}
          onFermer={() => setBonACorriger(null)}
          onEnregistre={async () => {
            setBonACorriger(null);
            await charger();
          }}
        />
      )}
    </div>
  );
}
