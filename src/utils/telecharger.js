// Déclenche le téléchargement d'un Blob depuis le navigateur — pattern
// standard (lien invisible avec l'attribut "download", cliqué par script),
// fonctionne dans l'appli réelle déployée (contrairement à un artefact en
// bac à sable, ce n'est pas une contrainte ici).
export function declencherTelechargement(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  // Laisse le temps au navigateur de démarrer le téléchargement avant de
  // libérer l'URL — la révoquer immédiatement peut l'invalider trop tôt sur
  // certains navigateurs mobiles.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
