import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import Connexion from './pages/Connexion.jsx';
import ReinitialiserMotDePasse from './pages/ReinitialiserMotDePasse.jsx';
import Accueil from './pages/Accueil.jsx';
import NouveauBon from './pages/NouveauBon.jsx';
import BonDetail from './pages/BonDetail.jsx';
import EditerBon from './pages/EditerBon.jsx';
import Enseignes from './pages/Enseignes.jsx';
import Expires from './pages/Expires.jsx';
import Calendrier from './pages/Calendrier.jsx';
import Diagnostic from './pages/Diagnostic.jsx';
import Export from './pages/Export.jsx';

function Entete() {
  const { profil, seDeconnecter } = useAuth();
  return (
    <div className="entete">
      <h1>CAJAC-Voucher</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="bouton-identite" onClick={seDeconnecter}>
          {profil?.label ?? '…'}
        </button>
      </div>
    </div>
  );
}

function NavBasse() {
  return (
    <nav className="nav-basse">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="icone">🏠</span>
        Accueil
      </NavLink>
      <NavLink to="/calendrier" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="icone">📅</span>
        Calendrier
      </NavLink>
      <NavLink to="/expires" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="icone">⏰</span>
        Expirés
      </NavLink>
      <NavLink to="/enseignes" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="icone">🏷️</span>
        Enseignes
      </NavLink>
      <NavLink to="/export" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="icone">📤</span>
        Export
      </NavLink>
    </nav>
  );
}

function AppConnectee() {
  return (
    <div className="app-shell">
      <Entete />
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="/nouveau" element={<NouveauBon />} />
        <Route path="/bon/:id" element={<BonDetail />} />
        <Route path="/bon/:id/modifier" element={<EditerBon />} />
        <Route path="/enseignes" element={<Enseignes />} />
        <Route path="/expires" element={<Expires />} />
        <Route path="/calendrier" element={<Calendrier />} />
        <Route path="/diagnostic" element={<Diagnostic />} />
        <Route path="/export" element={<Export />} />
      </Routes>
      <NavBasse />
    </div>
  );
}

function Racine() {
  const { connecte, chargementInitial, enRecuperation } = useAuth();
  // Prioritaire sur tout le reste, y compris le chargement : le lien reçu
  // par e-mail ("mot de passe oublié") doit toujours mener à ce formulaire,
  // quelle que soit la route dans l'URL au moment où il arrive (voir
  // AuthContext.jsx, `demanderReinitialisation`).
  if (enRecuperation) return <ReinitialiserMotDePasse />;
  if (chargementInitial) {
    return <div className="ecran-centre"><p className="texte-discret">Chargement…</p></div>;
  }
  if (!connecte) return <Connexion />;
  return <AppConnectee />;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Racine />
      </HashRouter>
    </AuthProvider>
  );
}
