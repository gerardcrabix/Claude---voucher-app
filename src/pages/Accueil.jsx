import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listerBonsEnrichis, listerPastillesEnseignes } from '../db/repository.js';
import { estSousLeSeuil } from '../utils/dates.js';
import { ajouterEntree } from '../diagnostic/journal.js';
import BonCard from '../components/BonCard.jsx';
import EnseignePill from '../components/EnseignePill.jsx';
import BandeauExpiration from '../components/BandeauExpiration.jsx';
import ModaleDepense from '../components/ModaleDepense.jsx';

// Écran d'accueil : la seule chose à comprendre pour elle. Liste des bons
// actifs triés par urgence, pastilles par enseigne, alerte expiration.
export default function Accueil() {
  const [bons, setBons] = useState(null);
  const [pastilles, setPastilles] = useState([]);
  const [enseigneFiltre, setEnseigneFiltre] = useState(null);
  const [bonADepenser, setBonADepenser] = useState(null);
  const [erreurChargement, setErreurChargement] = useState(null);

  async function charger() {
    setErreurChargement(null);
    try {
      const [tousBons, toutesPastilles] = await Promise.all([
        listerBonsEnrichis(),
        listerPastillesEnseignes(),
      ]);
      setBons(tousBons);
      setPastilles(toutesPastilles);
    } catch (e) {
      // Sans ce filet, une erreur ici laisse l'écran bloqué sur "Chargement…"
      // indéfiniment, sans aucun indice pour comprendre pourquoi.
      ajouterEntree('accueil', `Échec du chargement des bons : ${e?.message}`, e?.stack);
      setErreurChargement(e?.message || String(e));
    }
  }

  useEffect(() => {
    charger();
  }, []);

  if (erreurChargement) {
    return (
      <div className="contenu">
        <div className="vide">
          <p>Le chargement a échoué.</p>
          <code style={{ fontSize: '0.8rem' }}>{erreurChargement}</code>
          <div className="actions" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="bouton-grand bouton-principal" onClick={charger}>
              Réessayer
            </button>
            <Link to="/diagnostic" className="bouton-discret">Voir le journal</Link>
          </div>
        </div>
      </div>
    );
  }

  if (bons === null) {
    return <div className="contenu"><p className="texte-discret">Chargement…</p></div>;
  }

  const actifs = bons.filter((b) => b.statut === 'actif');
  const actifsAffiches = enseigneFiltre
    ? actifs.filter((b) => b.enseigneId === enseigneFiltre)
    : actifs;
  const bonsUrgents = actifs.filter((b) => estSousLeSeuil(b.dateExpiration));

  return (
    <div className="contenu">
      <BandeauExpiration bons={bonsUrgents} />

      {pastilles.length > 0 && (
        <div className="pastilles">
          {pastilles.map((p) => (
            <EnseignePill
              key={p.enseigne.id}
              pastille={p}
              active={enseigneFiltre === p.enseigne.id}
              onClick={() =>
                setEnseigneFiltre(enseigneFiltre === p.enseigne.id ? null : p.enseigne.id)
              }
            />
          ))}
        </div>
      )}

      {actifsAffiches.length === 0 ? (
        <div className="vide">
          {actifs.length === 0 ? (
            <>
              <p>Aucun bon actif pour l'instant.</p>
              <p className="texte-discret">Touchez le + pour en créer un.</p>
            </>
          ) : (
            <p>Aucun bon actif pour cette enseigne.</p>
          )}
        </div>
      ) : (
        <div className="liste-bons">
          {actifsAffiches.map((bon) => (
            <BonCard key={bon.id} bon={bon} onDepenser={setBonADepenser} />
          ))}
        </div>
      )}

      <div className="bouton-flottant-conteneur">
        <Link to="/nouveau" className="bouton-flottant" aria-label="Créer un bon">
          +
        </Link>
      </div>

      {bonADepenser && (
        <ModaleDepense
          bon={bonADepenser}
          onFermer={() => setBonADepenser(null)}
          onEnregistre={async () => {
            setBonADepenser(null);
            await charger();
          }}
        />
      )}
    </div>
  );
}
