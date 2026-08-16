// Bandeau d'alerte affiché dès qu'au moins un bon actif passe sous le seuil
// des 30 jours avant expiration (section 5 et 6.7).
export default function BandeauExpiration({ bons }) {
  if (bons.length === 0) return null;

  return (
    <div className="bandeau-alerte">
      <span>⏰</span>
      <span>
        {bons.length === 1
          ? `Un bon ${bons[0].enseigne?.nom ? `chez ${bons[0].enseigne.nom} ` : ''}expire bientôt, pensez à l'utiliser.`
          : `${bons.length} bons expirent bientôt, pensez à les utiliser.`}
      </span>
    </div>
  );
}
