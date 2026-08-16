import './polyfills.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { installerCaptureGlobale, ajouterEntree } from './diagnostic/journal.js'
import { registerSW } from 'virtual:pwa-register'

installerCaptureGlobale()

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
