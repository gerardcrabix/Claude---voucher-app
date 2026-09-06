// Ouvrir un lien externe (vérification de solde) depuis une PWA ajoutée à
// l'écran d'accueil sur iOS — signalé sur le terrain (voir Expires.jsx) :
// dans ce mode "standalone", il n'existe structurellement aucune notion
// d'onglet, donc ni `<a target="_blank">` ni `window.open()` ne peuvent
// ouvrir une page séparée — le lien remplace l'appli dans sa propre fenêtre,
// sans barre d'adresse pour revenir en arrière.
//
// La feuille de partage native (`navigator.share`) est différente : c'est
// une action système, pas une navigation dans la page. Un des choix qu'elle
// propose pour une URL est "Safari", qui ouvre alors une vraie app Safari
// séparée — l'app CAJAC-Voucher reste intacte en arrière-plan, accessible
// à nouveau via son icône ou le multitâche, exactement comme on la avait
// laissée.
export async function ouvrirLienExterne(url, titre) {
  if (navigator.share) {
    try {
      await navigator.share({ url, title: titre });
      return;
    } catch (e) {
      // AbortError = l'utilisateur a fermé la feuille de partage sans
      // choisir — pas une vraie erreur, pas de repli à tenter.
      if (e?.name === 'AbortError') return;
    }
  }
  // Pas de Web Share API (desktop, vieux navigateur) : repli sur
  // window.open, qui fonctionne normalement hors mode standalone.
  window.open(url, '_blank', 'noopener');
}
