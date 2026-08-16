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
registerSW({
  immediate: true,
  onRegisteredSW(url) {
    ajouterEntree('service-worker', `Enregistré : ${url}`, null);
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
