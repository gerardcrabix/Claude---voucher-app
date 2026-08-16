import { centimesVersAffichage } from '../utils/money.js';

// Pastille par enseigne : nombre de bons actifs + solde total, en évidence
// sur l'écran d'accueil (section 6.8). Un appui filtre la liste.
export default function EnseignePill({ pastille, active, onClick }) {
  return (
    <button className={`pastille ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="nom">{pastille.enseigne.nom}</span>
      <span className="detail">
        {pastille.nombreBons} bon{pastille.nombreBons > 1 ? 's' : ''} ·{' '}
        {centimesVersAffichage(pastille.totalCentimes)}
      </span>
    </button>
  );
}
