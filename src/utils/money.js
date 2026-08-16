// Montants toujours stockés/manipulés en centimes (entiers) — jamais en
// flottant — pour éviter les erreurs d'arrondi (section 4 du cahier des
// charges).

// "12,34" ou "12.34" ou "12" -> 1234 (centimes). Renvoie null si invalide.
export function eurosVersCentimes(saisie) {
  if (saisie == null) return null;
  const nettoye = String(saisie).trim().replace(',', '.');
  if (nettoye === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(nettoye)) return null;
  const [entiers, decimales = ''] = nettoye.split('.');
  const decimalesCompletes = (decimales + '00').slice(0, 2);
  return parseInt(entiers, 10) * 100 + parseInt(decimalesCompletes, 10);
}

export function centimesVersAffichage(centimes) {
  if (centimes == null || Number.isNaN(centimes)) return '';
  const negatif = centimes < 0;
  const abs = Math.abs(centimes);
  const entiers = Math.floor(abs / 100);
  const decimales = String(abs % 100).padStart(2, '0');
  return `${negatif ? '-' : ''}${entiers.toLocaleString('fr-FR')},${decimales} €`;
}
