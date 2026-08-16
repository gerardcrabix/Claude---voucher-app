import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  creerBon,
  enregistrerPdf,
  getSoldeActifParEnseigne,
  listerEnseignes,
  trouverEnseigneParNom,
} from '../db/repository.js';
import { eurosVersCentimes } from '../utils/money.js';
import { dateInputAujourdhui } from '../utils/dates.js';
import { useIdentity } from '../identity/IdentityContext.jsx';
import AlerteAntiOubli from '../components/AlerteAntiOubli.jsx';

// Création d'un bon. L'alerte anti-oubli (section 4) se déclenche dès que
// l'enseigne est reconnue, avant toute validation du formulaire — c'est la
// fonction centrale de l'application.
export default function NouveauBon() {
  const navigate = useNavigate();
  const { identite } = useIdentity();

  const [enseignes, setEnseignes] = useState([]);
  const [enseigneNom, setEnseigneNom] = useState('');
  const [soldeInfo, setSoldeInfo] = useState(null);
  const [montant, setMontant] = useState('');
  const [taux, setTaux] = useState('');
  const [dateAchat, setDateAchat] = useState(dateInputAujourdhui());
  const [dateExpiration, setDateExpiration] = useState('');
  const [code, setCode] = useState('');
  const [pdf, setPdf] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    listerEnseignes().then(setEnseignes);
  }, []);

  useEffect(() => {
    const nom = enseigneNom.trim();
    if (nom === '') {
      setSoldeInfo(null);
      return;
    }
    let annule = false;
    const t = setTimeout(async () => {
      const existante = await trouverEnseigneParNom(nom);
      if (annule) return;
      if (existante) {
        setSoldeInfo(await getSoldeActifParEnseigne(existante.id));
      } else {
        setSoldeInfo({ totalCentimes: 0, nombreBons: 0, prochaineExpiration: null });
      }
    }, 250);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [enseigneNom]);

  async function valider(e) {
    e.preventDefault();
    setErreur(null);

    if (enseigneNom.trim() === '') {
      setErreur('Indiquez une enseigne.');
      return;
    }
    const montantCentimes = eurosVersCentimes(montant);
    if (montantCentimes == null || montantCentimes <= 0) {
      setErreur('Entrez un montant valide, supérieur à 0.');
      return;
    }
    if (code.trim() === '') {
      setErreur('Le code du bon est obligatoire.');
      return;
    }

    setEnCours(true);
    try {
      const { bon } = await creerBon({
        enseigneNom: enseigneNom.trim(),
        montantInitial: montantCentimes,
        tauxReduction: taux.trim() === '' ? null : Number(taux),
        dateAchat,
        dateExpiration: dateExpiration || null,
        code,
        auteur: identite,
      });
      if (pdf) {
        await enregistrerPdf(bon.id, pdf);
      }
      navigate(`/bon/${bon.id}`);
    } catch {
      setErreur('Une erreur est survenue, réessayez.');
      setEnCours(false);
    }
  }

  return (
    <div className="contenu">
      <h1>Nouveau bon</h1>
      <form onSubmit={valider}>
        <div className="champ">
          <label htmlFor="enseigne">Enseigne</label>
          <input
            id="enseigne"
            list="liste-enseignes"
            type="text"
            placeholder="ex. Boursobank"
            value={enseigneNom}
            onChange={(e) => setEnseigneNom(e.target.value)}
            autoFocus
          />
          <datalist id="liste-enseignes">
            {enseignes.map((e) => (
              <option key={e.id} value={e.nom} />
            ))}
          </datalist>
          <span className="aide">Nouvelle enseigne ? Tapez simplement son nom.</span>
        </div>

        {soldeInfo && (
          <div className="champ">
            <AlerteAntiOubli enseigneNom={enseigneNom.trim()} soldeInfo={soldeInfo} />
          </div>
        )}

        <div className="champ">
          <label htmlFor="montant">Montant du bon</label>
          <input
            id="montant"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
          />
        </div>

        <div className="champ">
          <label htmlFor="taux">Taux de réduction (optionnel)</label>
          <input
            id="taux"
            type="text"
            inputMode="decimal"
            placeholder="ex. 10"
            value={taux}
            onChange={(e) => setTaux(e.target.value)}
          />
          <span className="aide">En pourcentage, pour information seulement.</span>
        </div>

        <div className="champ">
          <label htmlFor="date-achat">Date d'achat</label>
          <input
            id="date-achat"
            type="date"
            value={dateAchat}
            onChange={(e) => setDateAchat(e.target.value)}
          />
        </div>

        <div className="champ">
          <label htmlFor="date-expiration">Date d'expiration (optionnel)</label>
          <input
            id="date-expiration"
            type="date"
            value={dateExpiration}
            onChange={(e) => setDateExpiration(e.target.value)}
          />
        </div>

        <div className="champ">
          <label htmlFor="code">Code du bon</label>
          <input
            id="code"
            type="text"
            placeholder="ex. ABCD-1234"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <div className="champ">
          <label htmlFor="pdf">PDF du bon (optionnel)</label>
          <input
            id="pdf"
            type="file"
            accept="application/pdf"
            onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
          />
        </div>

        {erreur && <p className="champ erreur">{erreur}</p>}

        <button
          type="submit"
          className="bouton-grand bouton-principal bouton-pleine-largeur"
          disabled={enCours}
        >
          Créer le bon
        </button>
      </form>
    </div>
  );
}
