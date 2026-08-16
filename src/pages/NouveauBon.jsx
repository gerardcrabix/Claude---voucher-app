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
import { extraireInfosPdf } from '../pdf/extraireInfosPdf.js';
import AlerteAntiOubli from '../components/AlerteAntiOubli.jsx';
import ChampsBon from '../components/ChampsBon.jsx';

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
  const [pin, setPin] = useState('');
  const [pdf, setPdf] = useState(null);
  const [etatExtraction, setEtatExtraction] = useState(null); // null | 'en-cours' | 'trouve' | 'rien-trouve'
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

  // Dès qu'un PDF est choisi : on essaie d'en extraire le code, le PIN et la
  // date d'expiration, pour éviter la ressaisie. Ça ne marche que si le PDF
  // contient du texte (pas une photo) — sinon les champs restent vides et se
  // remplissent à la main comme d'habitude.
  async function surChoixPdf(e) {
    const fichier = e.target.files?.[0];
    setPdf(fichier ?? null);
    if (!fichier) {
      setEtatExtraction(null);
      return;
    }
    setEtatExtraction('en-cours');
    const infos = await extraireInfosPdf(fichier);
    let trouveQuelqueChose = false;
    if (infos.code && code.trim() === '') {
      setCode(infos.code);
      trouveQuelqueChose = true;
    }
    if (infos.pin && pin.trim() === '') {
      setPin(infos.pin);
      trouveQuelqueChose = true;
    }
    if (infos.dateExpiration && dateExpiration.trim() === '') {
      setDateExpiration(infos.dateExpiration);
      trouveQuelqueChose = true;
    }
    setEtatExtraction(trouveQuelqueChose ? 'trouve' : 'rien-trouve');
  }

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
        pin,
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
          <label htmlFor="pdf">PDF du bon (optionnel)</label>
          <input id="pdf" type="file" accept="application/pdf" onChange={surChoixPdf} />
          <span className="aide">
            {etatExtraction === 'en-cours' && 'Lecture du PDF…'}
            {etatExtraction === 'trouve' &&
              'Code / PIN / date repérés dans le PDF et préremplis ci-dessous — vérifiez avant de valider.'}
            {etatExtraction === 'rien-trouve' &&
              "Rien d'exploitable trouvé dans ce PDF, complétez à la main ci-dessous."}
            {etatExtraction === null && 'Si vous en avez un, ça préremplit le code, le PIN et la date.'}
          </span>
        </div>

        <ChampsBon
          enseignes={enseignes}
          enseigneNom={enseigneNom}
          setEnseigneNom={setEnseigneNom}
          montant={montant}
          setMontant={setMontant}
          taux={taux}
          setTaux={setTaux}
          dateAchat={dateAchat}
          setDateAchat={setDateAchat}
          dateExpiration={dateExpiration}
          setDateExpiration={setDateExpiration}
          code={code}
          setCode={setCode}
          pin={pin}
          setPin={setPin}
          apresEnseigne={
            soldeInfo && (
              <div className="champ">
                <AlerteAntiOubli enseigneNom={enseigneNom.trim()} soldeInfo={soldeInfo} />
              </div>
            )
          }
        />

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
