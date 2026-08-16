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

// Convertit un bitmap monochrome { width, height, pixels } (1 octet par
// pixel, 0 = noir, 1 = blanc — voir extraireImageCodeBarres et le générateur
// de QR code) en "data:" URL PNG, via un canvas hors-écran. Volontairement
// séparé du décodage lui-même (dans src/pdf/lecteurPdfMinimal.js et
// src/export/qrcode.js) pour que ce décodage reste testable sans navigateur
// (Node, voir les scripts de vérification) — seule cette dernière étape a
// besoin du DOM.
export function bitmapMonochromeVersDataUrl({ width, height, pixels }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i] === 1 ? 255 : 0;
    imageData.data[i * 4] = v;
    imageData.data[i * 4 + 1] = v;
    imageData.data[i * 4 + 2] = v;
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
