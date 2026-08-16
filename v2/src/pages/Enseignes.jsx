import { useEffect, useState } from 'react';
import {
  definirLienEnseigne,
  definirLogoEnseigne,
  EnseigneUtiliseeError,
  listerEnseignes,
  renommerEnseigne,
  supprimerEnseigne,
  trouverOuCreerEnseigne,
} from '../db/repository.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { redimensionnerImageEnDataUrl } from '../utils/image.js';

// Gestion des enseignes : création directe (pour pouvoir lui donner un logo
// avant même le premier bon), renommer, lien de vérification de solde en
// ligne, logo (réservé à l'admin — CM en pratique), suppression. Une
// enseigne se crée aussi toujours à la volée depuis le formulaire de nouveau
// bon. Le logo reste stocké en data URL comme en v1 (voir la note en tête de
// supabase/migrations/0001_init.sql) : c'est une petite image déjà
// redimensionnée côté client, pas besoin d'un bucket Storage pour ça.
export default function Enseignes() {
  const { identite, estAdmin } = useAuth();
  const peutGererLogo = estAdmin;

  const [enseignes, setEnseignes] = useState(null);
  const [enEdition, setEnEdition] = useState(null); // id en cours d'édition
  const [nomEdite, setNomEdite] = useState('');
  const [lienEdite, setLienEdite] = useState('');
  const [logoEdite, setLogoEdite] = useState('');
  const [erreurLogo, setErreurLogo] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [nomCreation, setNomCreation] = useState('');

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
    setErreurLogo(null);
    setErreur(null);
  }

  async function surChoixLogo(ev) {
    const fichier = ev.target.files?.[0];
    ev.target.value = ''; // permet de rechoisir le même fichier ensuite
    if (!fichier) return;
    setErreurLogo(null);
    try {
      setLogoEdite(await redimensionnerImageEnDataUrl(fichier));
    } catch (err) {
      setErreurLogo(err?.message || "Impossible d'utiliser cette image.");
    }
  }

  async function creerEnseigne(ev) {
    ev.preventDefault();
    const nom = nomCreation.trim();
    if (nom === '') return;
    const enseigne = await trouverOuCreerEnseigne(nom, identite);
    setNomCreation('');
    setCreationOuverte(false);
    await charger();
    commencerEdition(enseigne); // ouvre directement l'édition (dont le logo)
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

      {creationOuverte ? (
        <form onSubmit={creerEnseigne} className="champ">
          <label htmlFor="nouvelle-enseigne">Nom de l'enseigne</label>
          <input
            id="nouvelle-enseigne"
            type="text"
            autoFocus
            value={nomCreation}
            onChange={(ev) => setNomCreation(ev.target.value)}
          />
          <div className="actions">
            <button
              type="button"
              className="bouton-grand bouton-secondaire"
              onClick={() => { setCreationOuverte(false); setNomCreation(''); }}
            >
              Annuler
            </button>
            <button type="submit" className="bouton-grand bouton-principal">
              Créer
            </button>
          </div>
        </form>
      ) : (
        <button
          className="bouton-grand bouton-secondaire"
          style={{ marginBottom: 16 }}
          onClick={() => setCreationOuverte(true)}
        >
          + Nouvelle enseigne
        </button>
      )}

      {enseignes.length === 0 ? (
        <div className="vide">
          <p>Aucune enseigne pour l'instant.</p>
          <p className="texte-discret">
            Elles se créent automatiquement à la création d'un bon, ou directement ci-dessus.
          </p>
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
                        Chercher un logo sur Google Images ↗
                      </a>
                      <span className="aide">
                        Pour l'utiliser : appui long sur l'image choisie → « Enregistrer l'image » (elle
                        atterrit dans vos photos), puis choisissez-la ci-dessous.
                      </span>
                      <input
                        id={`logo-${e.id}`}
                        type="file"
                        accept="image/*"
                        onChange={surChoixLogo}
                        style={{ marginTop: 8 }}
                      />
                      {erreurLogo && <span className="aide erreur">{erreurLogo}</span>}
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
