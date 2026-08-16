import { useEffect, useState } from 'react';
import {
  definirLienEnseigne,
  EnseigneUtiliseeError,
  listerEnseignes,
  renommerEnseigne,
  supprimerEnseigne,
} from '../db/repository.js';

// Gestion des enseignes : renommer, lien de vérification de solde en ligne,
// suppression (section 6.11). La création se fait toujours à la volée
// depuis le formulaire de nouveau bon.
export default function Enseignes() {
  const [enseignes, setEnseignes] = useState(null);
  const [enEdition, setEnEdition] = useState(null); // id en cours d'édition
  const [nomEdite, setNomEdite] = useState('');
  const [lienEdite, setLienEdite] = useState('');
  const [erreur, setErreur] = useState(null);

  async function charger() {
    setEnseignes(await listerEnseignes());
  }

  useEffect(() => {
    charger();
  }, []);

  function commencerEdition(e) {
    setEnEdition(e.id);
    setNomEdite(e.nom);
    setLienEdite(e.lienVerification ?? '');
    setErreur(null);
  }

  async function enregistrerEdition(id) {
    await renommerEnseigne(id, nomEdite);
    await definirLienEnseigne(id, lienEdite);
    setEnEdition(null);
    await charger();
  }

  async function supprimer(id) {
    try {
      await supprimerEnseigne(id);
      await charger();
    } catch (err) {
      if (err instanceof EnseigneUtiliseeError) {
        setErreur("Impossible de supprimer : cette enseigne a encore des bons associés.");
      } else {
        setErreur('Une erreur est survenue.');
      }
    }
  }

  if (enseignes === null) {
    return <div className="contenu"><p className="texte-discret">Chargement…</p></div>;
  }

  return (
    <div className="contenu">
      <h1>Enseignes</h1>
      {erreur && <p className="champ erreur">{erreur}</p>}
      {enseignes.length === 0 ? (
        <div className="vide">
          <p>Aucune enseigne pour l'instant.</p>
          <p className="texte-discret">Elles se créent automatiquement à la création d'un bon.</p>
        </div>
      ) : (
        <div className="liste-simple">
          {enseignes.map((e) => (
            <div key={e.id} className="ligne-enseigne">
              {enEdition === e.id ? (
                <>
                  <div className="champ">
                    <label htmlFor={`nom-${e.id}`}>Nom</label>
                    <input
                      id={`nom-${e.id}`}
                      type="text"
                      value={nomEdite}
                      onChange={(ev) => setNomEdite(ev.target.value)}
                    />
                  </div>
                  <div className="champ">
                    <label htmlFor={`lien-${e.id}`}>Lien de vérification du solde (optionnel)</label>
                    <input
                      id={`lien-${e.id}`}
                      type="url"
                      placeholder="https://…"
                      value={lienEdite}
                      onChange={(ev) => setLienEdite(ev.target.value)}
                    />
                  </div>
                  <div className="actions">
                    <button className="bouton-grand bouton-secondaire" onClick={() => setEnEdition(null)}>
                      Annuler
                    </button>
                    <button
                      className="bouton-grand bouton-principal"
                      onClick={() => enregistrerEdition(e.id)}
                    >
                      Enregistrer
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="enseigne">{e.nom}</span>
                  {e.lienVerification && (
                    <a href={e.lienVerification} target="_blank" rel="noreferrer" className="texte-discret">
                      Vérifier le solde en ligne ↗
                    </a>
                  )}
                  <div className="actions">
                    <button className="bouton-grand bouton-secondaire" onClick={() => commencerEdition(e)}>
                      Modifier
                    </button>
                    <button className="bouton-grand bouton-danger" onClick={() => supprimer(e.id)}>
                      Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
