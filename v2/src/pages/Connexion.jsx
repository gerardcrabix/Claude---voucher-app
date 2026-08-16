import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

// Remplace l'écran "Qui êtes-vous ?" de la v1 : plus de mot de passe
// partagé par identité, chaque compte (CM, AJ) a désormais sa propre
// adresse e-mail et son propre mot de passe, vérifiés par Supabase Auth —
// donc valables depuis n'importe quel appareil, contrairement au choix
// mémorisé localement en v1.
export default function Connexion() {
  const { seConnecter } = useAuth();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(e) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      await seConnecter(email.trim(), motDePasse);
    } catch (err) {
      setErreur(
        err?.message === 'Invalid login credentials'
          ? 'E-mail ou mot de passe incorrect.'
          : "Connexion impossible pour l'instant, réessayez."
      );
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="ecran-centre">
      <h1>CAJAC-Voucher</h1>
      <p className="texte-discret">Connectez-vous avec votre compte.</p>
      <form onSubmit={valider} className="choix-identite">
        <div className="champ">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="mot-de-passe">Mot de passe</label>
          <input
            id="mot-de-passe"
            type="password"
            autoComplete="current-password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
          {erreur && <span className="erreur">{erreur}</span>}
        </div>
        <button type="submit" className="bouton-grand bouton-principal" disabled={enCours}>
          {enCours ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="texte-discret" style={{ fontSize: '0.72rem', marginTop: 24 }}>
        Version : {typeof __VERSION_BUILD__ !== 'undefined' ? __VERSION_BUILD__ : 'inconnue'}
      </p>
    </div>
  );
}
