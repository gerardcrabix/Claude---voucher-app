import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { construireLignesHistorique, listerBonsEnrichis, reactiverBon, terminerBon } from '../db/repository.js';
import { dernierEvenementSolde } from '../db/solde.js';
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
//
// Groupés par enseigne (repéré sur le terrain : après une dépense en
// caisse, retrouver LE bon concerné parmi plusieurs de la même enseigne
// est le vrai problème — pas juste afficher son montant initial), et
// triés du plus récent au plus ancien à l'intérieur de chaque enseigne
// selon la date qui l'a fait atterrir ici (expiration, solde ou clôture) :
// le bon qui vient de bouger reste en haut.
export default function Expires() {
  const { identite, libelleIdentite } = useAuth();
  const [bons, setBons] = useState(null);
  const [bonACorriger, setBonACorriger] = useState(null);
  const [historiqueOuvertId, setHistoriqueOuvertId] = useState(null);
  // Nom de l'enseigne (titre de groupe) touché : filtre la liste sur cette
  // seule enseigne, un second appui sur la même remet tout affiché. Les
  // titres des autres enseignes restent visibles (pas leurs bons) pour
  // pouvoir basculer directement de l'une à l'autre sans repasser par
  // "toutes".
  const [filtreEnseigne, setFiltreEnseigne] = useState(null);

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

  function basculerHistorique(id) {
    setHistoriqueOuvertId((prec) => (prec === id ? null : id));
  }

  function basculerFiltreEnseigne(cle) {
    setFiltreEnseigne((prec) => (prec === cle ? null : cle));
  }

  // Date qui explique pourquoi ce bon est ici (unique pour chaque statut),
  // calculée une seule fois pour servir à la fois au tri et à l'affichage
  // de la pastille — évite de rejouer dernierEvenementSolde deux fois.
  const infosPertinentes = useMemo(() => {
    const parId = new Map();
    for (const bon of bons ?? []) {
      if (bon.statut === 'expire') {
        parId.set(bon.id, { date: bon.dateExpiration, auteur: null });
      } else if (bon.statut === 'solde') {
        const { date, auteur } = dernierEvenementSolde(bon, bon.mouvements, bon.overrides);
        parId.set(bon.id, { date, auteur });
      } else {
        const date = bon.archivedAt ? bon.archivedAt.slice(0, 10) : bon.dateAchat;
        parId.set(bon.id, { date, auteur: bon.archivedBy });
      }
    }
    return parId;
  }, [bons]);

  const groupes = useMemo(() => {
    if (!bons) return [];
    const parEnseigne = new Map();
    for (const bon of bons) {
      const cle = bon.enseigneId ?? 'sans-enseigne';
      if (!parEnseigne.has(cle)) {
        parEnseigne.set(cle, { cle, nom: bon.enseigne?.nom ?? 'Sans enseigne', logoUrl: bon.enseigne?.logoUrl, bons: [] });
      }
      parEnseigne.get(cle).bons.push(bon);
    }
    for (const groupe of parEnseigne.values()) {
      groupe.bons.sort((a, b) => {
        const dateA = infosPertinentes.get(a.id)?.date ?? '';
        const dateB = infosPertinentes.get(b.id)?.date ?? '';
        return dateB.localeCompare(dateA);
      });
    }
    return [...parEnseigne.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [bons, infosPertinentes]);

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
        groupes.map((groupe) => {
          const filtreActif = filtreEnseigne === groupe.cle;
          const groupeVisible = filtreEnseigne === null || filtreActif;
          return (
            <section key={groupe.cle} className="groupe-enseigne-expires">
              <h2>
                <button
                  type="button"
                  className={`titre-groupe-enseigne enseigne-avec-logo ${filtreActif ? 'actif' : ''}`}
                  onClick={() => basculerFiltreEnseigne(groupe.cle)}
                >
                  {groupe.logoUrl && (
                    <img
                      className="logo-enseigne"
                      src={groupe.logoUrl}
                      alt=""
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <span>{groupe.nom}</span>
                  <span className="nombre-bons">{groupe.bons.length}</span>
                </button>
              </h2>
              {groupeVisible && (
                <div className="liste-bons">
                  {groupe.bons.map((bon) => {
                const { date, auteur } = infosPertinentes.get(bon.id) ?? {};
                const historiqueOuvert = historiqueOuvertId === bon.id;
                const lignesHistorique = historiqueOuvert ? construireLignesHistorique([bon]) : [];
                return (
                  <div key={bon.id} className="carte-bon">
                    <div className="ligne-haut">
                      <span className="enseigne-avec-logo">
                        {bon.enseigne?.logoUrl && (
                          <img
                            className="logo-enseigne"
                            src={bon.enseigne.logoUrl}
                            alt=""
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        <Link to={`/bon/${bon.id}`} className="enseigne">
                          {bon.enseigne?.nom}
                        </Link>
                      </span>
                      <span className="solde">{centimesVersAffichage(bon.montantInitial)}</span>
                    </div>
                    {bon.code && (
                      <div className="codes">
                        <span className="code">{bon.code}</span>
                      </div>
                    )}
                    {bon.statut === 'expire' && (
                      <span className="pilule-statut jaune">
                        Expiré le {formatDateAffichage(date)}
                      </span>
                    )}
                    {bon.statut === 'solde' && (
                      <span className="pilule-statut">
                        Soldé le {formatDateAffichage(date)}{auteur && ` par ${libelleIdentite(auteur)}`}
                      </span>
                    )}
                    {bon.statut === 'termine' && (
                      <span className="pilule-statut neutre">
                        {date ? `Clôturé le ${formatDateAffichage(date)}` : 'Clôturé'}
                        {auteur && ` par ${libelleIdentite(auteur)}`}
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
                      <button className="bouton-grand bouton-secondaire" onClick={() => basculerHistorique(bon.id)}>
                        {historiqueOuvert ? "Masquer l'historique" : 'Historique'}
                      </button>
                    </div>
                    {historiqueOuvert && (
                      <div className="historique-enseigne">
                        {lignesHistorique.length === 0 ? (
                          <p className="texte-discret">Aucun mouvement enregistré pour ce bon.</p>
                        ) : (
                          <div className="tableau-scroll">
                            <table className="tableau-historique">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Modification</th>
                                  <th>Montant avant</th>
                                  <th>Montant après</th>
                                  <th>Qui</th>
                                  <th>Note</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lignesHistorique.map((l, i) => (
                                  <tr key={i}>
                                    <td>{formatDateAffichage(l.date)}</td>
                                    <td>{l.type}</td>
                                    <td>{l.montantAvant != null ? centimesVersAffichage(l.montantAvant) : '—'}</td>
                                    <td>{l.montantApres != null ? centimesVersAffichage(l.montantApres) : '—'}</td>
                                    <td>{libelleIdentite(l.auteur)}</td>
                                    <td>{l.note}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
                </div>
              )}
            </section>
          );
        })
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
