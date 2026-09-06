import './polyfills.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { installerCaptureGlobale, ajouterEntree } from './diagnostic/journal.js'
import { registerSW } from 'virtual:pwa-register'

installerCaptureGlobale()

// Contournement d'un gel de l'interface constaté sur iOS, app ajoutée à
// l'écran d'accueil : après un passage par la feuille de partage native
// (voir utils/partage.js — nécessaire pour ouvrir un lien externe dans ce
// mode) puis retour à l'app via le multitâche, l'écran reste figé — plus
// aucun appui ne réagit, jusqu'à forcer la fermeture de l'app. C'est un
// comportement WKWebView après une longue mise en arrière-plan, pas
// quelque chose que le code de l'app cause directement, et je n'ai pas
// d'appareil iOS ici pour le reproduire et vérifier une vraie correction.
//
// Recharger la page au retour au premier plan est le contournement le
// plus fiable pour ce genre de gel : rien de ce que montre l'app ne vit
// ailleurs que dans Supabase, un rechargement ne perd donc aucune donnée
// déjà enregistrée. Seul vrai coût : un formulaire en cours de saisie
// (nouveau bon, dépense...) serait perdu si l'app passe en arrière-plan
// plus de `SEUIL_RECHARGEMENT_MS` pendant cette saisie — accepté comme un
// moindre mal face à un gel complet nécessitant de tout refermer.
const SEUIL_RECHARGEMENT_MS = 2000;
let masqueeDepuis = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    masqueeDepuis = Date.now();
    return;
  }
  if (document.visibilityState === 'visible' && masqueeDepuis !== null) {
    const dureeMasquee = Date.now() - masqueeDepuis;
    masqueeDepuis = null;
    if (dureeMasquee > SEUIL_RECHARGEMENT_MS) {
      ajouterEntree('gel-interface', `Rechargement après ${Math.round(dureeMasquee / 1000)}s en arrière-plan`, null);
      window.location.reload();
    }
  }
});

// Enregistrement explicite du service worker (voir le commentaire dans
// vite.config.js) : avec `immediate: true` en mode autoUpdate, un onglet
// déjà ouvert recharge automatiquement dès qu'une nouvelle version vient
// d'être déployée, au lieu de continuer à tourner sur d'anciens fichiers
// jusqu'à une fermeture/réouverture manuelle.
//
// Ça ne suffit pas à soi seul : le navigateur ne vérifie l'existence d'une
// nouvelle version qu'à des moments qui lui sont propres (au mieux une fois
// par jour sur certains navigateurs), pas en continu tant que l'onglet reste
// ouvert. Sur un usage PWA mobile (onglet ou appli mis en arrière-plan puis
// repris, jamais vraiment "rechargé"), ça peut laisser tourner une version
// périmée bien plus longtemps que prévu — vécu concrètement sur ce projet.
// On force donc explicitement une vérification (registration.update()) à
// l'enregistrement, puis à chaque fois que l'app redevient visible (retour
// au premier plan) et en secours toutes les 5 minutes si elle reste ouverte
// en continu.
registerSW({
  immediate: true,
  onRegisteredSW(url, registration) {
    ajouterEntree('service-worker', `Enregistré : ${url}`, null);
    if (!registration) return;
    const verifier = () => registration.update().catch(() => {});
    verifier();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') verifier();
    });
    setInterval(verifier, 5 * 60 * 1000);
  },
  onRegisterError(erreur) {
    ajouterEntree('service-worker', `Échec d'enregistrement : ${erreur?.message}`, erreur?.stack);
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
