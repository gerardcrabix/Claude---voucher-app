import { IDENTITES, useIdentity } from '../identity/IdentityContext.jsx';

export default function QuiEtesVous() {
  const { setIdentite } = useIdentity();

  return (
    <div className="ecran-centre">
      <h1>Qui êtes-vous ?</h1>
      <p className="texte-discret">
        Sur cet appareil, vous êtes toujours reconnu comme la même personne.
        Vous pourrez changer plus tard depuis les réglages.
      </p>
      <div className="choix-identite">
        {IDENTITES.map((i) => (
          <button
            key={i.id}
            className="bouton-grand bouton-principal"
            onClick={() => setIdentite(i.id)}
          >
            {i.label}
          </button>
        ))}
      </div>
    </div>
  );
}
