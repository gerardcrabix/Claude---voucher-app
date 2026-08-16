import { useEffect, useState } from 'react';
import {
  definirLienEnseigne,
  definirLogoEnseigne,
  EnseigneUtiliseeError,
  listerEnseignes,
  renommerEnseigne,
  supprimerEnseigne,
} from '../db/repository.js';
import { useIdentity } from '../identity/IdentityContext.jsx';

// Gestion des enseignes : renommer, lien de vérification de solde en ligne,
// logo (réservé à CM), suppression (section 6.11). La création se fait
// toujours à la volée depuis le formulaire de nouveau bon.
export default function Enseignes() {
  const { identite } = useIdentity();
  const peutGererLogo = identite === 'moi';

  const [enseignes, setEnseignes] = useState(null);
  const [enEdition, setEnEdition] = useState(null); // id en cours d'édition
  const [nomEdite, setNomEdite] = useState('');
  const [lienEdite, setLienEdite] = useState('');
  const [logoEdite, setLogoEdite] = useState('');
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
    setLogoEdite(e.logoUrl ?? '');
    setErreur(null);
  }

  async function enregistrerEdition(id) {
    await renommerEnseigne(id, nomEdite);
    await definirLienEnseigne(id, lienEdite);
    if (peutGererLogo) await definirLogoEnseigne(id, logoEdite);
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
                  {peutGererLogo && (
                    <div className="champ">
                      <label htmlFor={`logo-${e.id}`}>Logo (optionnel)</label>
                      <a
                        className="bouton-grand bouton-secondaire"
                        href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${nomEdite || e.nom} logo`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Chercher une image sur Google Images ↗
                      </a>
                      <span className="aide">
                        Ouvre la recherche d'images dans un nouvel onglet. Sur l'image choisie : clic droit
                        (ou appui long) → « Copier l'adresse de l'image », puis colle le lien ci-dessous.
                      </span>
                      <input
                        id={`logo-${e.id}`}
                        type="url"
                        placeholder="https://…"
                        value={logoEdite}
                        onChange={(ev) => setLogoEdite(ev.target.value)}
                        style={{ marginTop: 8 }}
                      />
                      {logoEdite && (
                        <div className="apercu-logo">
                          <img src={logoEdite} alt="" onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />
                          <button
                            type="button"
                            className="bouton-discret"
                            onClick={() => setLogoEdite('')}
                          >
                            Retirer le logo
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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
                  <div className="ligne-enseigne-entete">
                    {e.logoUrl && (
                      <img
                        className="logo-enseigne"
                        src={e.logoUrl}
                        alt=""
                        onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <span className="enseigne">{e.nom}</span>
                  </div>
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
