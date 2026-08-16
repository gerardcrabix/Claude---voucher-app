// Feuille modale générique, ancrée en bas (pattern iOS familier), utilisée
// pour les actions rapides : dépenser, corriger le solde, confirmer une
// suppression.
export default function Modal({ titre, onFermer, children }) {
  return (
    <div
      className="fond-modale"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="modale" role="dialog" aria-modal="true" aria-label={titre}>
        <div className="section-titre">
          <h2>{titre}</h2>
          <button
            className="bouton-discret"
            onClick={onFermer}
            aria-label="Fermer"
          >
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
