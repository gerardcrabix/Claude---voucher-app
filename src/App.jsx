import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { IdentityProvider, useIdentity, libelleIdentite } from './identity/IdentityContext.jsx';
import QuiEtesVous from './pages/QuiEtesVous.jsx';
import Accueil from './pages/Accueil.jsx';
import NouveauBon from './pages/NouveauBon.jsx';
import BonDetail from './pages/BonDetail.jsx';
import EditerBon from './pages/EditerBon.jsx';
import Enseignes from './pages/Enseignes.jsx';
import Expires from './pages/Expires.jsx';
import Calendrier from './pages/Calendrier.jsx';

function Entete() {
  const { identite, changerDePersonne } = useIdentity();
  return (
    <div className="entete">
      <h1>Bons</h1>
      <button className="bouton-identite" onClick={changerDePersonne}>
        {libelleIdentite(identite)}
      </button>
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
      </Routes>
      <NavBasse />
    </div>
  );
}

function Racine() {
  const { identite } = useIdentity();
  if (!identite) return <QuiEtesVous />;
  return <AppConnectee />;
}

export default function App() {
  return (
    <IdentityProvider>
      <HashRouter>
        <Racine />
      </HashRouter>
    </IdentityProvider>
  );
}
