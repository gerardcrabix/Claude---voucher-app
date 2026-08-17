import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

// Affichée à l'arrivée sur le lien reçu par e-mail après "mot de passe
// oublié" (voir AuthContext.jsx, `demanderReinitialisation`). App.jsx
// l'affiche à la place du reste de l'application tant que la session de
// récupération est active, quelle que soit la route dans l'URL.
export default function ReinitialiserMotDePasse() {
  const { profil, definirNouveauMotDePasse } = useAuth();
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState(null);
  const [termine, setTermine] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function valider(e) {
    e.preventDefault();
    setErreur(null);
    if (motDePasse.length < 6) {
      setErreur('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('La confirmation ne correspond pas.');
      return;
    }
    setEnCours(true);
    try {
      await definirNouveauMotDePasse(motDePasse);
      setTermine(true);
      setTimeout(() => {
        window.location.hash = '#/';
        window.location.reload();
      }, 1500);
    } catch (err) {
      setErreur(err?.message || 'Une erreur est survenue, réessayez.');
      setEnCours(false);
    }
  }

  if (termine) {
    return (
      <div className="ecran-centre">
        <h1>Mot de passe changé</h1>
        <p className="texte-discret">C'est fait — redirection vers l'application…</p>
      </div>
    );
  }

  return (
    <div className="ecran-centre">
      <h1>Nouveau mot de passe</h1>
      <p className="texte-discret">
        {profil?.label ? `Pour le compte de ${profil.label}.` : 'Choisissez un nouveau mot de passe.'}
      </p>
      <form onSubmit={valider} className="choix-identite">
        <div className="champ">
          <label htmlFor="nouveau-mdp">Nouveau mot de passe</label>
          <input
            id="nouveau-mdp"
            type="password"
            autoFocus
            autoComplete="new-password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="confirmation-mdp">Confirmer le mot de passe</label>
          <input
            id="confirmation-mdp"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          {erreur && <span className="erreur">{erreur}</span>}
        </div>
        <button type="submit" className="bouton-grand bouton-principal" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}
        </button>
      </form>
    </div>
  );
}
