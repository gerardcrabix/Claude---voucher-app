import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listerBonsEnrichis, terminerBon } from '../db/repository.js';
import { centimesVersAffichage } from '../utils/money.js';
import { formatDateAffichage } from '../utils/dates.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSyncBons } from '../db/realtime.js';
import ModaleCorrigerSolde from '../components/ModaleCorrigerSolde.jsx';

// Bons expirés (date dépassée) ET bons soldés (montant tombé à 0) — les
// deux disparaissent de l'accueil (qui ne montre que les bons actifs), donc
// sans cet écran un bon soldé par erreur (mauvaise correction de solde,
// faute de frappe) devenait introuvable nulle part dans l'application. Les
// deux catégories sont mélangées ici plutôt que séparées, avec une pastille
// jaune sur les expirés pour les distinguer d'un coup d'œil des soldés.
//
// "Corriger le solde" reste le seul vrai moyen de rattraper un solde tombé
// à 0 par erreur : une fois une correction manuelle enregistrée, elle prime
// sur le montant initial (voir db/solde.js) — modifier le montant initial
// depuis l'écran "Modifier" ne changerait rien à l'affichage. "Modifier"
// reste utile à côté pour corriger, par exemple, une date d'expiration
// erronée sur un bon expiré par erreur.
function dateDeSolde(bon) {
  const evenements = [
    ...bon.mouvements.map((m) => ({ createdAt: m.createdAt, date: m.date })),
    ...bon.overrides.map((o) => ({ createdAt: o.createdAt, date: o.createdAt.slice(0, 10) })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return evenements[0]?.date ?? bon.dateAchat;
}

export default function Expires() {
  const { identite } = useAuth();
  const [bons, setBons] = useState(null);
  const [bonACorriger, setBonACorriger] = useState(null);

  async function charger() {
    const tous = await listerBonsEnrichis(identite);
    setBons(tous.filter((b) => b.statut === 'expire' || b.statut === 'solde'));
  }

  useSyncBons(charger);

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
          <p>Aucun bon expiré ou soldé.</p>
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
              {bon.statut === 'expire' ? (
                <span className="pilule-statut jaune">
                  Expiré le {formatDateAffichage(bon.dateExpiration)}
                </span>
              ) : (
                <span className="pilule-statut">
                  Soldé le {formatDateAffichage(dateDeSolde(bon))}
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
                <button className="bouton-grand bouton-secondaire" onClick={() => surTerminer(bon.id)}>
                  Clôturer
                </button>
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
