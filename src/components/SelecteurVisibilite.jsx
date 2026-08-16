import { IDENTITES } from '../identity/IdentityContext.jsx';

// Qui voit ce bon : les deux (par défaut) ou une seule des deux identités.
// Pas une vraie sécurité (voir motsDePasse.js) — juste un filtrage
// d'affichage cohérent avec le reste du MVP local.
const OPTIONS = [
  { id: 'partage', label: `${IDENTITES[0].label} et ${IDENTITES[1].label}` },
  { id: IDENTITES[0].id, label: `${IDENTITES[0].label} seulement` },
  { id: IDENTITES[1].id, label: `${IDENTITES[1].label} seulement` },
];

export default function SelecteurVisibilite({ valeur, onChange }) {
  return (
    <div className="champ">
      <label>Visible par</label>
      <div className="boutons-enseignes">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`bouton-enseigne ${valeur === o.id ? 'active' : ''}`}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {valeur !== 'partage' && (
        <span className="aide">
          Ce bon ne sera visible que pour vous — l'autre personne ne le verra nulle part dans l'appli.
        </span>
      )}
    </div>
  );
}
