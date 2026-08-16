import { useAuth } from '../auth/AuthContext.jsx';

// Qui voit ce bon : les deux (par défaut) ou un seul des deux comptes. En
// v2, ce n'est plus un simple filtre d'affichage (voir la v1) : c'est une
// vraie règle appliquée par Row Level Security côté base (voir
// supabase/migrations/0001_init.sql, §A5) — un bon marqué pour un seul
// compte est réellement inaccessible à l'autre, pas seulement absent de
// l'écran.
export default function SelecteurVisibilite({ valeur, onChange }) {
  const { profils } = useAuth();

  const options = [
    { id: 'partage', label: profils.map((p) => p.label).join(' et ') || 'Les deux' },
    ...profils.map((p) => ({ id: p.id, label: `${p.label} seulement` })),
  ];

  return (
    <div className="champ">
      <label>Visible par</label>
      <div className="boutons-enseignes">
        {options.map((o) => (
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
          Ce bon ne sera visible que pour vous — l'autre compte ne pourra ni le voir ni y accéder.
        </span>
      )}
    </div>
  );
}
