import { centimesVersAffichage } from '../utils/money.js';
import { formatDateAffichage } from '../utils/dates.js';

// Le cœur de l'application (section 4) : dès que l'enseigne est choisie,
// avant toute validation, on affiche de façon impossible à manquer s'il
// existe déjà un solde actif pour cette enseigne.
export default function AlerteAntiOubli({ enseigneNom, soldeInfo }) {
  if (!soldeInfo) return null;

  if (soldeInfo.nombreBons === 0) {
    return (
      <div className="alerte-ok">
        Aucun bon actif chez {enseigneNom} pour l'instant. Vous pouvez continuer.
      </div>
    );
  }

  return (
    <div className="alerte-anti-oubli forte">
      <h2>⚠️ Vous avez déjà {soldeInfo.nombreBons > 1 ? 'des bons' : 'un bon'} chez {enseigneNom} !</h2>
      <p className="montant">{centimesVersAffichage(soldeInfo.totalCentimes)} restants</p>
      <p>
        {soldeInfo.nombreBons} bon{soldeInfo.nombreBons > 1 ? 's' : ''} actif
        {soldeInfo.nombreBons > 1 ? 's' : ''}
        {soldeInfo.prochaineExpiration &&
          ` — le plus urgent expire le ${formatDateAffichage(soldeInfo.prochaineExpiration)}`}
      </p>
      <p>Vérifiez qu'il n'est pas préférable d'utiliser ce solde avant d'en créer un nouveau.</p>
    </div>
  );
}
