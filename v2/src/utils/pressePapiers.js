// Copie un lien "Vérifier le solde en ligne" dans le presse-papiers — voisin
// du lien lui-même, pas un remplacement : sur iOS, `target="_blank"` sur ce
// type de lien externe ne garantit pas un nouvel onglet (comportement
// dépendant de l'appareil/version, hors du contrôle de la page — même après
// être passé de `rel="noreferrer"` à `rel="noopener"` seul). Copier le lien
// permet de l'ouvrir soi-même dans un nouvel onglet sans jamais perdre la
// page CAJAC-Voucher en cours.
export async function copierDansPressePapiers(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    // Clipboard API indisponible (contexte non sécurisé, permission refusée,
    // vieux navigateur) — pas grave, le lien cliquable reste utilisable.
    return false;
  }
}
