import { useState } from 'react';
import Modal from './Modal.jsx';
import { corrigerSolde } from '../db/repository.js';
import { eurosVersCentimes, centimesVersAffichage } from '../utils/money.js';
import { useIdentity } from '../identity/IdentityContext.jsx';

// "Corriger le solde" = l'override manuel du cahier des charges, renommé en
// langage courant (section 7 : pas de jargon technique visible).
export default function ModaleCorrigerSolde({ bon, onFermer, onEnregistre }) {
  const { identite } = useIdentity();
  const [nouveauSolde, setNouveauSolde] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(e) {
    e.preventDefault();
    const centimes = eurosVersCentimes(nouveauSolde);
    if (centimes == null || centimes < 0) {
      setErreur('Entrez un solde valide (0 ou plus).');
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await corrigerSolde({ bonId: bon.id, nouveauSolde: centimes, motif, auteur: identite });
      onEnregistre();
    } catch {
      setErreur('Une erreur est survenue, réessayez.');
      setEnCours(false);
    }
  }

  return (
    <Modal titre="Corriger le solde" onFermer={onFermer}>
      <p className="texte-discret">
        Solde actuel : <strong>{centimesVersAffichage(bon.solde)}</strong>
      </p>
      <form onSubmit={valider}>
        <div className="champ">
          <label htmlFor="nouveau-solde">Nouveau solde réel</label>
          <input
            id="nouveau-solde"
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="0,00"
            value={nouveauSolde}
            onChange={(e) => setNouveauSolde(e.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="motif">Raison (optionnel)</label>
          <input
            id="motif"
            type="text"
            placeholder="ex. solde vérifié en ligne"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
        </div>
        {erreur && <p className="champ erreur">{erreur}</p>}
        <button
          type="submit"
          className="bouton-grand bouton-principal bouton-pleine-largeur"
          disabled={enCours}
        >
          Corriger le solde
        </button>
      </form>
    </Modal>
  );
}
