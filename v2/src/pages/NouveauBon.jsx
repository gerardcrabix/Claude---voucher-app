import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  creerBon,
  enregistrerPdf,
  getSoldeActifParEnseigne,
  listerEnseignes,
  trouverEnseigneParNom,
} from '../db/repository.js';
import { eurosVersCentimes } from '../utils/money.js';
import { dateAchatDepuisExpiration, dateExpirationParDefaut, dateInputAujourdhui } from '../utils/dates.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { extraireInfosPdf } from '../pdf/extraireInfosPdf.js';
import { genererQrCode } from '../export/qrcode.js';
import { bitmapMonochromeVersDataUrl } from '../utils/image.js';
import { ajouterEntree } from '../diagnostic/journal.js';
import AlerteAntiOubli from '../components/AlerteAntiOubli.jsx';
import ChampsBon from '../components/ChampsBon.jsx';
import SelecteurVisibilite from '../components/SelecteurVisibilite.jsx';

// Création d'un bon. L'alerte anti-oubli (section 4) se déclenche dès que
// l'enseigne est reconnue, avant toute validation du formulaire — c'est la
// fonction centrale de l'application.
export default function NouveauBon() {
  const navigate = useNavigate();
  const { identite } = useAuth();

  const [enseignes, setEnseignes] = useState([]);
  const [enseigneNom, setEnseigneNom] = useState('');
  const [soldeInfo, setSoldeInfo] = useState(null);
  const [montant, setMontant] = useState('');
  const [dateAchat, setDateAchat] = useState(dateInputAujourdhui());
  // Distingue "encore la date du jour par défaut" de "choisie" (par
  // l'utilisateur ou déduite d'un PDF), pour ne jamais écraser un choix
  // volontaire si un PDF est ajouté après une saisie manuelle.
  const [dateAchatTouchee, setDateAchatTouchee] = useState(false);
  function surChangementDateAchat(valeur) {
    setDateAchat(valeur);
    setDateAchatTouchee(true);
  }
  // Par défaut, un an après la date d'achat moins un jour — modifiable à
  // tout moment. `dateExpirationTouchee` distingue "encore la valeur par
  // défaut" (recalculée si la date d'achat change) de "choisie" (par
  // l'utilisateur ou trouvée dans un PDF), qu'on ne doit plus jamais
  // écraser automatiquement.
  const [dateExpiration, setDateExpiration] = useState(() => dateExpirationParDefaut(dateInputAujourdhui()));
  const [dateExpirationTouchee, setDateExpirationTouchee] = useState(false);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [visibilite, setVisibilite] = useState('partage');
  // Bitmap brut { width, height, pixels } du vrai code-barres trouvé dans le
  // PDF (voir extraireImageCodeBarres) — converti en image seulement à la
  // validation du formulaire (pas besoin avant). `null` si le PDF n'en a
  // pas (cas de Leroy Merlin/Fnac/IKEA testés) : un QR généré depuis le
  // code prend le relais à la validation.
  const [codeBarresBitmap, setCodeBarresBitmap] = useState(null);
  const [pdf, setPdf] = useState(null);
  // null | 'en-cours' | 'trouve' | 'rien-trouve' | 'echec-technique'
  const [etatExtraction, setEtatExtraction] = useState(null);
  const [detailEchec, setDetailEchec] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    listerEnseignes().then(setEnseignes);
  }, []);

  // Recalcule la date d'expiration par défaut si la date d'achat change —
  // mais seulement tant qu'elle n'a pas été choisie explicitement (par
  // l'utilisateur ou trouvée dans un PDF), pour ne jamais écraser un choix
  // volontaire.
  useEffect(() => {
    if (!dateExpirationTouchee) {
      setDateExpiration(dateExpirationParDefaut(dateAchat));
    }
  }, [dateAchat, dateExpirationTouchee]);

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
        setSoldeInfo(await getSoldeActifParEnseigne(existante.id, identite));
      } else {
        setSoldeInfo({ totalCentimes: 0, nombreBons: 0, prochaineExpiration: null });
      }
    }, 250);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [enseigneNom]);

  // Dès qu'un PDF est choisi : on essaie d'en extraire l'enseigne, le
  // montant, le code, le PIN et la date d'expiration, pour éviter la
  // ressaisie. Ça ne marche que si le PDF contient du texte (pas une photo)
  // — sinon les champs restent vides et se remplissent à la main comme
  // d'habitude.
  async function surChoixPdf(e) {
    const fichier = e.target.files?.[0];
    setPdf(fichier ?? null);
    setDetailEchec(null);
    if (!fichier) {
      setEtatExtraction(null);
      return;
    }
    setEtatExtraction('en-cours');
    const infos = await extraireInfosPdf(fichier, enseignes.map((e) => e.nom));

    if (infos.erreur) {
      // Vraie panne technique (réseau, PDF illisible…), distincte d'un PDF
      // lu normalement mais sans rien à en tirer — pour ne pas confondre
      // les deux si ça recoince.
      setEtatExtraction('echec-technique');
      setDetailEchec(infos.erreur);
      return;
    }

    setCodeBarresBitmap(infos.codeBarresBitmap ?? null);

    let trouveQuelqueChose = false;
    if (infos.enseigneNom && enseigneNom.trim() === '') {
      setEnseigneNom(infos.enseigneNom);
      trouveQuelqueChose = true;
    }
    if (infos.montant && montant.trim() === '') {
      setMontant(infos.montant);
      trouveQuelqueChose = true;
    }
    if (infos.code && code.trim() === '') {
      setCode(infos.code);
      trouveQuelqueChose = true;
    }
    if (infos.pin && pin.trim() === '') {
      setPin(infos.pin);
      trouveQuelqueChose = true;
    }
    if (infos.dateExpiration && !dateExpirationTouchee) {
      setDateExpiration(infos.dateExpiration);
      setDateExpirationTouchee(true);
      trouveQuelqueChose = true;
      // Ces bons n'impriment que la date de fin de validité, jamais la date
      // d'achat — mais leur validité est toujours "1 an depuis l'achat", donc
      // la date d'achat s'en déduit (voir dateAchatDepuisExpiration). On ne
      // touche à rien si l'utilisateur avait déjà choisi sa propre date.
      if (!dateAchatTouchee) {
        setDateAchat(dateAchatDepuisExpiration(infos.dateExpiration));
      }
    }
    setEtatExtraction(trouveQuelqueChose ? 'trouve' : 'rien-trouve');
  }

  // Image à présenter/scanner en magasin : le vrai code-barres trouvé dans
  // le PDF s'il y en avait un (Carrefour), sinon un QR généré depuis le
  // code du bon (Leroy Merlin/Fnac/IKEA testés, ou toute saisie manuelle).
  // Ne doit jamais empêcher la création du bon si ça échoue — juste rester
  // sans image dans ce cas, comme le reste des champs auto-remplis.
  function calculerImageCodeBarres() {
    try {
      if (codeBarresBitmap) return bitmapMonochromeVersDataUrl(codeBarresBitmap);
      if (code.trim()) {
        const qr = genererQrCode(code.trim());
        if (qr) return bitmapMonochromeVersDataUrl(qr);
      }
    } catch (e) {
      ajouterEntree('nouveau-bon', `Échec génération image code-barres/QR : ${e?.message}`, e?.stack);
    }
    return null;
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
    let bon;
    try {
      ({ bon } = await creerBon({
        enseigneNom: enseigneNom.trim(),
        montantInitial: montantCentimes,
        dateAchat,
        dateExpiration: dateExpiration || null,
        code,
        pin,
        visibilite,
        codeBarresUrl: calculerImageCodeBarres(),
        auteur: identite,
      }));
    } catch {
      setErreur('Une erreur est survenue, réessayez.');
      setEnCours(false);
      return;
    }

    // Le bon existe déjà à ce stade : un souci pour attacher le PDF ne doit
    // jamais empêcher d'arriver sur sa fiche (sinon il faut le retrouver
    // dans la liste pour ajouter le PDF à la main, alors qu'il n'y a aucune
    // bonne raison que ça échoue) — on journalise et on continue.
    if (pdf) {
      try {
        await enregistrerPdf(bon.id, pdf);
      } catch (e) {
        ajouterEntree('nouveau-bon', `Échec attachement du PDF au bon créé : ${e?.message}`, e?.stack);
      }
    }
    navigate(`/bon/${bon.id}`);
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
              "Le PDF a été lu mais rien d'exploitable n'y a été repéré, complétez à la main ci-dessous."}
            {etatExtraction === 'echec-technique' && (
              <>
                Échec technique de la lecture du PDF (pas un problème de mise en page du bon —
                complétez à la main pour l'instant).
                {detailEchec && (
                  <>
                    <br />
                    <code style={{ fontSize: '0.75rem' }}>{detailEchec}</code>
                  </>
                )}
              </>
            )}
            {etatExtraction === null && 'Si vous en avez un, ça préremplit le code, le PIN et la date.'}
          </span>
          {etatExtraction === 'echec-technique' && pdf && (
            <div className="actions">
              <button
                type="button"
                className="bouton-discret"
                onClick={() => surChoixPdf({ target: { files: [pdf] } })}
              >
                Réessayer la lecture du PDF
              </button>
              <Link to="/diagnostic" className="bouton-discret">
                Voir le journal détaillé
              </Link>
            </div>
          )}
        </div>

        <ChampsBon
          enseignes={enseignes}
          enseigneNom={enseigneNom}
          setEnseigneNom={setEnseigneNom}
          montant={montant}
          setMontant={setMontant}
          dateAchat={dateAchat}
          setDateAchat={surChangementDateAchat}
          dateExpiration={dateExpiration}
          setDateExpiration={(v) => {
            setDateExpirationTouchee(true);
            setDateExpiration(v);
          }}
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

        <SelecteurVisibilite valeur={visibilite} onChange={setVisibilite} />

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
