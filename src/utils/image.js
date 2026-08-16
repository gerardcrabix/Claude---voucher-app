// Redimensionne une image choisie par l'utilisateur en une petite miniature
// stockée directement comme "data:" URL (voir Enseignes.jsx) — pas de vrai
// stockage fichier séparé nécessaire pour un logo de quelques dizaines de Ko,
// et ça évite d'avoir à gérer la durée de vie d'une URL de Blob à travers
// tous les endroits où le logo s'affiche (fiche enseigne, pastille
// d'accueil…) : un "data:" URL reste valide indéfiniment, sans rien à
// libérer.
export function redimensionnerImageEnDataUrl(file, tailleMax = 128) {
  return new Promise((resolve, reject) => {
    if (!file.type?.startsWith('image/')) {
      reject(new Error('Ce fichier n\'est pas une image.'));
      return;
    }
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible ou corrompue.'));
      img.onload = () => {
        const ratio = Math.min(1, tailleMax / Math.max(img.width, img.height));
        const largeur = Math.max(1, Math.round(img.width * ratio));
        const hauteur = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = largeur;
        canvas.height = hauteur;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, largeur, hauteur);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(file);
  });
}
