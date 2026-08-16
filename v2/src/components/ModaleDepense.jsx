import { useState } from 'react';
import Modal from './Modal.jsx';
import { enregistrerMouvement, DepassementError } from '../db/repository.js';
import { eurosVersCentimes, centimesVersAffichage } from '../utils/money.js';
import { dateInputAujourdhui } from '../utils/dates.js';
import { useAuth } from '../auth/AuthContext.jsx';

// Saisie d'une dépense : 1 appui pour ouvrir (depuis la liste ou le détail),
// 1 appui sur "Enregistrer" pour valider. Bloque si le montant dépasse le
// solde disponible (contrôle transactionnel côté repository).
export default function ModaleDepense({ bon, onFermer, onEnregistre }) {
  const { identite } = useAuth();
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(dateInputAujourdhui());
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(e) {
    e.preventDefault();
    const centimes = eurosVersCentimes(montant);
    if (centimes == null || centimes <= 0) {
      setErreur('Entrez un montant valide, supérieur à 0.');
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await enregistrerMouvement({
        bonId: bon.id,
        montant: centimes,
        date,
        note,
        auteur: identite,
      });
      onEnregistre();
    } catch (err) {
      if (err instanceof DepassementError) {
        setErreur(
          `Solde disponible : ${centimesVersAffichage(err.soldeDisponible)}. Ce montant est trop élevé.`
        );
      } else {
        setErreur('Une erreur est survenue, réessayez.');
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modal titre={`Dépenser — ${bon.enseigne?.nom ?? ''}`} onFermer={onFermer}>
      <p className="texte-discret">
        Solde actuel : <strong>{centimesVersAffichage(bon.solde)}</strong>
      </p>
      <form onSubmit={valider}>
        <div className="champ">
          <label htmlFor="montant-depense">Montant dépensé</label>
          <input
            id="montant-depense"
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="0,00"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="date-depense">Date</label>
          <input
            id="date-depense"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="note-depense">Note (optionnel)</label>
          <input
            id="note-depense"
            type="text"
            placeholder="ex. courses du samedi"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {erreur && <p className="champ erreur">{erreur}</p>}
        <button
          type="submit"
          className="bouton-grand bouton-principal bouton-pleine-largeur"
          disabled={enCours}
        >
          Enregistrer
        </button>
      </form>
    </Modal>
  );
}
