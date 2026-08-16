import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { IDENTITES, useIdentity } from '../identity/IdentityContext.jsx';
import { definirMotDePasse, verifierMotDePasse } from '../identity/motsDePasse.js';

// Réservé à CM ("moi") : changer les mots de passe des deux identités.
// Rappel : ce verrou est local à l'appareil, pas une vraie authentification
// serveur (voir motsDePasse.js).
export default function Admin() {
  const { identite } = useIdentity();
  const [motDePasseActuel, setMotDePasseActuel] = useState('');
  const [nouveaux, setNouveaux] = useState({ moi: '', elle: '' });
  const [confirmation, setConfirmation] = useState({ moi: '', elle: '' });
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState(null);

  if (identite !== 'moi') {
    return <Navigate to="/" replace />;
  }

  function surSoumission(e) {
    e.preventDefault();
    setMessage(null);
    setErreur(null);

    if (!verifierMotDePasse('moi', motDePasseActuel)) {
      setErreur('Mot de passe actuel incorrect.');
      return;
    }

    const changements = IDENTITES.filter((i) => nouveaux[i.id].trim() !== '');
    if (changements.length === 0) {
      setErreur('Renseignez au moins un nouveau mot de passe.');
      return;
    }
    for (const i of changements) {
      if (nouveaux[i.id] !== confirmation[i.id]) {
        setErreur(`La confirmation ne correspond pas pour ${i.label}.`);
        return;
      }
    }

    for (const i of changements) {
      definirMotDePasse(i.id, nouveaux[i.id]);
    }
    setNouveaux({ moi: '', elle: '' });
    setConfirmation({ moi: '', elle: '' });
    setMotDePasseActuel('');
    setMessage('Mot(s) de passe mis à jour.');
  }

  return (
    <div className="contenu">
      <h1>Admin — mots de passe</h1>
      <p className="texte-discret">
        Réservé à CM. Change le mot de passe demandé à la connexion pour CM et/ou AJ.
      </p>
      <form onSubmit={surSoumission}>
        <div className="champ">
          <label htmlFor="mdp-actuel">Votre mot de passe actuel (CM)</label>
          <input
            id="mdp-actuel"
            type="password"
            value={motDePasseActuel}
            onChange={(e) => setMotDePasseActuel(e.target.value)}
          />
          <span className="aide">Demandé pour confirmer que c'est bien vous.</span>
        </div>

        {IDENTITES.map((i) => (
          <div key={i.id} className="champ">
            <label htmlFor={`nouveau-${i.id}`}>Nouveau mot de passe — {i.label}</label>
            <input
              id={`nouveau-${i.id}`}
              type="password"
              placeholder="laisser vide pour ne pas changer"
              value={nouveaux[i.id]}
              onChange={(e) => setNouveaux((n) => ({ ...n, [i.id]: e.target.value }))}
            />
            <input
              type="password"
              placeholder="confirmer le nouveau mot de passe"
              value={confirmation[i.id]}
              onChange={(e) => setConfirmation((c) => ({ ...c, [i.id]: e.target.value }))}
              style={{ marginTop: 8 }}
            />
          </div>
        ))}

        {erreur && <p className="champ erreur">{erreur}</p>}
        {message && <p className="alerte-ok">{message}</p>}

        <button type="submit" className="bouton-grand bouton-principal bouton-pleine-largeur">
          Enregistrer
        </button>
      </form>
    </div>
  );
}
