import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

// Remplace l'écran "Qui êtes-vous ?" de la v1 : plus de mot de passe
// partagé par identité, chaque compte (CM, AJ) a désormais sa propre
// adresse e-mail et son propre mot de passe, vérifiés par Supabase Auth —
// donc valables depuis n'importe quel appareil, contrairement au choix
// mémorisé localement en v1.
//
// "Mot de passe oublié" remplace ici l'ancien onglet Admin (qui changeait
// les mots de passe locaux à la main, uniquement depuis le compte de CM) :
// désormais chacun peut redemander le sien par e-mail, sans dépendre de
// l'autre personne.
export default function Connexion() {
  const { seConnecter, demanderReinitialisation } = useAuth();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const [oublie, setOublie] = useState(false);
  const [emailOubli, setEmailOubli] = useState('');
  const [messageOubli, setMessageOubli] = useState(null);
  const [erreurOubli, setErreurOubli] = useState(null);
  const [enCoursOubli, setEnCoursOubli] = useState(false);

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

  async function demanderLien(e) {
    e.preventDefault();
    setErreurOubli(null);
    setMessageOubli(null);
    setEnCoursOubli(true);
    try {
      await demanderReinitialisation(emailOubli.trim());
      setMessageOubli(
        `Si un compte existe pour ${emailOubli.trim()}, un e-mail vient d'être envoyé avec un lien pour choisir un nouveau mot de passe.`
      );
    } catch (err) {
      setErreurOubli(err?.message || "Échec de l'envoi, réessayez.");
    } finally {
      setEnCoursOubli(false);
    }
  }

  if (oublie) {
    return (
      <div className="ecran-centre">
        <h1>Mot de passe oublié</h1>
        <p className="texte-discret">
          Indiquez votre e-mail — vous recevrez un lien pour choisir un nouveau mot de passe.
        </p>
        <form onSubmit={demanderLien} className="choix-identite">
          <div className="champ">
            <label htmlFor="email-oubli">E-mail</label>
            <input
              id="email-oubli"
              type="email"
              autoFocus
              autoComplete="email"
              value={emailOubli}
              onChange={(e) => setEmailOubli(e.target.value)}
            />
            {erreurOubli && <span className="erreur">{erreurOubli}</span>}
          </div>
          {messageOubli && <p className="alerte-ok">{messageOubli}</p>}
          <button type="submit" className="bouton-grand bouton-principal" disabled={enCoursOubli}>
            {enCoursOubli ? 'Envoi…' : 'Envoyer le lien'}
          </button>
          <button
            type="button"
            className="bouton-grand bouton-secondaire"
            onClick={() => { setOublie(false); setMessageOubli(null); setErreurOubli(null); }}
          >
            Retour à la connexion
          </button>
        </form>
      </div>
    );
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
        <button type="button" className="bouton-discret" onClick={() => setOublie(true)}>
          Mot de passe oublié ?
        </button>
      </form>
      <p className="texte-discret" style={{ fontSize: '0.72rem', marginTop: 24 }}>
        Version : {typeof __VERSION_BUILD__ !== 'undefined' ? __VERSION_BUILD__ : 'inconnue'}
      </p>
    </div>
  );
}
