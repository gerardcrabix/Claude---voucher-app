import Modal from './Modal.jsx';

// Confirmation générique — utilisée pour la suppression définitive, qui doit
// rester visuellement distincte et non accidentelle (section 6.9).
export default function ConfirmDialog({ titre, message, onAnnuler, onConfirmer, libelleConfirmer = 'Confirmer' }) {
  return (
    <Modal titre={titre} onFermer={onAnnuler}>
      <p>{message}</p>
      <div className="actions">
        <button className="bouton-grand bouton-secondaire" onClick={onAnnuler}>
          Annuler
        </button>
        <button className="bouton-grand bouton-danger" onClick={onConfirmer}>
          {libelleConfirmer}
        </button>
      </div>
    </Modal>
  );
}
