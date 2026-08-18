import { useNavigate } from 'react-router-dom';
import { centimesVersAffichage } from '../utils/money.js';
import { formatDateAffichage, estSousLeSeuil, estExpire } from '../utils/dates.js';
import { useAuth } from '../auth/AuthContext.jsx';

// Carte affichée sur l'écran d'accueil. Toucher la carte ouvre le détail du
// bon ; le bouton "Dépenser" ouvre directement la saisie rapide (1er appui),
// sans passer par le détail (2 appuis max jusqu'à l'enregistrement — section 7).
export default function BonCard({ bon, onDepenser }) {
  const navigate = useNavigate();
  const { libelleIdentite } = useAuth();
  const urgent = estSousLeSeuil(bon.dateExpiration);
  const expire = estExpire(bon.dateExpiration);
  const prive = bon.visibilite && bon.visibilite !== 'partage';

  return (
    <div className="carte-bon" onClick={() => navigate(`/bon/${bon.id}`)}>
      <div className="ligne-haut">
        <span className="enseigne">
          {bon.enseigne?.nom ?? 'Enseigne'}
          {prive && <span className="pilule-statut" style={{ marginLeft: 6 }}>{libelleIdentite(bon.visibilite)} uniquement</span>}
        </span>
        <span className="montant-carte">
          <span className="solde">{centimesVersAffichage(bon.solde)}</span>
          {bon.solde !== bon.montantInitial && (
            <span className="montant-initial-carte">
              sur {centimesVersAffichage(bon.montantInitial)}
            </span>
          )}
        </span>
      </div>
      {(bon.code || bon.pin) && (
        <div className="codes">
          {bon.code && <span className="code">{bon.code}</span>}
          {bon.pin && <span className="pin">PIN {bon.pin}</span>}
        </div>
      )}
      {bon.codeBarresUrl && (
        // Affiché directement sur la carte (pas seulement dans la fiche
        // détail) : c'est ce qu'on montre en caisse, il ne doit pas falloir
        // un appui de plus pour l'avoir sous les yeux. L'étiquette et le
        // contour en couleur (voir index.css) existent pour que ce soit
        // repéré au premier coup d'œil, même par quelqu'un qui ne sait pas
        // encore que l'accueil montre déjà le code — signalé comme raté par
        // un vrai test utilisateur.
        <div className="bloc-code-barres">
          <span className="etiquette-code-barres">Scannez ici en caisse ↓</span>
          <img src={bon.codeBarresUrl} alt="Code-barres ou QR code du bon" className="image-code-barres" />
        </div>
      )}
      <span className={`expiration ${urgent ? 'urgent' : ''}`}>
        {bon.dateExpiration
          ? `${expire ? 'Expiré le' : "À utiliser avant le"} ${formatDateAffichage(bon.dateExpiration)}`
          : "Pas de date d'expiration"}
      </span>
      <div className="actions">
        <button
          className="bouton-grand bouton-principal"
          onClick={(e) => {
            e.stopPropagation();
            onDepenser(bon);
          }}
        >
          Dépenser
        </button>
      </div>
    </div>
  );
}
