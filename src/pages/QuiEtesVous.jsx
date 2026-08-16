import { useState } from 'react';
import { IDENTITES, useIdentity } from '../identity/IdentityContext.jsx';
import { verifierMotDePasse } from '../identity/motsDePasse.js';

export default function QuiEtesVous() {
  const { setIdentite } = useIdentity();
  const [enAttenteDe, setEnAttenteDe] = useState(null); // id de l'identité choisie, en attente du mot de passe
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState(false);

  function choisir(id) {
    setEnAttenteDe(id);
    setMotDePasse('');
    setErreur(false);
  }

  function annuler() {
    setEnAttenteDe(null);
    setMotDePasse('');
    setErreur(false);
  }

  function valider(e) {
    e.preventDefault();
    if (verifierMotDePasse(enAttenteDe, motDePasse)) {
      setIdentite(enAttenteDe);
    } else {
      setErreur(true);
      setMotDePasse('');
    }
  }

  if (enAttenteDe) {
    const libelle = IDENTITES.find((i) => i.id === enAttenteDe)?.label ?? '';
    return (
      <div className="ecran-centre">
        <h1>Mot de passe — {libelle}</h1>
        <form onSubmit={valider} className="choix-identite">
          <div className="champ">
            <label htmlFor="mot-de-passe">Mot de passe</label>
            <input
              id="mot-de-passe"
              type="password"
              autoFocus
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
            {erreur && <span className="erreur">Mot de passe incorrect.</span>}
          </div>
          <button type="submit" className="bouton-grand bouton-principal">
            Continuer
          </button>
          <button type="button" className="bouton-grand bouton-secondaire" onClick={annuler}>
            Annuler
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="ecran-centre">
      <h1>Qui êtes-vous ?</h1>
      <p className="texte-discret">
        Sur cet appareil, vous êtes toujours reconnu comme la même personne.
        Vous pourrez changer plus tard depuis les réglages.
      </p>
      <div className="choix-identite">
        {IDENTITES.map((i) => (
          <button
            key={i.id}
            className="bouton-grand bouton-principal"
            onClick={() => choisir(i.id)}
          >
            {i.label}
          </button>
        ))}
      </div>
      {/* Repère de version, pour vérifier facilement qu'un appareil tourne
          bien sur le dernier déploiement plutôt que sur une version restée
          en cache (voir le commentaire dans vite.config.js). */}
      <p className="texte-discret" style={{ fontSize: '0.72rem', marginTop: 24 }}>
        Version : {typeof __VERSION_BUILD__ !== 'undefined' ? __VERSION_BUILD__ : 'inconnue'}
      </p>
    </div>
  );
}
