import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { listerEnseignes, modifierBon, obtenirBon } from '../db/repository.js';
import { eurosVersCentimes, centimesVersAffichage } from '../utils/money.js';
import { useIdentity } from '../identity/IdentityContext.jsx';
import { genererQrCode } from '../export/qrcode.js';
import { bitmapMonochromeVersDataUrl } from '../utils/image.js';
import { ajouterEntree } from '../diagnostic/journal.js';
import ChampsBon from '../components/ChampsBon.jsx';
import SelecteurVisibilite from '../components/SelecteurVisibilite.jsx';

// Édition complète d'un bon existant : toutes les infos saisies à la
// création (enseigne comprise) restent modifiables ensuite. Les mouvements
// et corrections de solde ne sont pas touchés par cet écran — c'est
// volontaire, ils ont leur propre historique.
export default function EditerBon() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { identite } = useIdentity();

  const [enseignes, setEnseignes] = useState([]);
  const [charge, setCharge] = useState(false);
  const [enseigneNom, setEnseigneNom] = useState('');
  const [montant, setMontant] = useState('');
  const [dateAchat, setDateAchat] = useState('');
  const [dateExpiration, setDateExpiration] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [visibilite, setVisibilite] = useState('partage');
  // Pour savoir, à l'enregistrement, si le code-barres/QR existant (celui
  // chargé avec le bon — peut être un vrai code-barres extrait d'un PDF)
  // doit être conservé tel quel ou régénéré : seulement si le code du bon
  // n'a pas changé, faute de quoi l'image ne correspondrait plus.
  const [codeOriginal, setCodeOriginal] = useState('');
  const [codeBarresUrlOriginal, setCodeBarresUrlOriginal] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    listerEnseignes().then(setEnseignes);
    obtenirBon(id, identite).then((bon) => {
      if (!bon) return;
      setEnseigneNom(bon.enseigne?.nom ?? '');
      setMontant((bon.montantInitial / 100).toString().replace('.', ','));
      setDateAchat(bon.dateAchat);
      setDateExpiration(bon.dateExpiration ?? '');
      setCode(bon.code ?? '');
      setPin(bon.pin ?? '');
      setVisibilite(bon.visibilite || 'partage');
      setCodeOriginal(bon.code ?? '');
      setCodeBarresUrlOriginal(bon.codeBarresUrl ?? null);
      setCharge(true);
    });
  }, [id, identite]);

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

    // Le code-barres/QR ne vaut que pour le code exact qu'il encode : s'il
    // n'a pas changé, on garde l'image existante (potentiellement un vrai
    // code-barres extrait d'un PDF, pas juste un QR générique) ; sinon un
    // QR est régénéré depuis le nouveau code — pas de PDF disponible ici
    // pour retenter une vraie extraction.
    let codeBarresUrl = codeBarresUrlOriginal;
    if (code.trim() !== codeOriginal.trim()) {
      codeBarresUrl = null;
      try {
        if (code.trim()) {
          const qr = genererQrCode(code.trim());
          if (qr) codeBarresUrl = bitmapMonochromeVersDataUrl(qr);
        }
      } catch (err) {
        ajouterEntree('editer-bon', `Échec génération QR : ${err?.message}`, err?.stack);
      }
    }

    setEnCours(true);
    try {
      await modifierBon({
        id,
        enseigneNom: enseigneNom.trim(),
        montantInitial: montantCentimes,
        dateAchat,
        dateExpiration: dateExpiration || null,
        code,
        pin,
        visibilite,
        codeBarresUrl,
        auteur: identite,
      });
      navigate(`/bon/${id}`);
    } catch {
      setErreur('Une erreur est survenue, réessayez.');
      setEnCours(false);
    }
  }

  if (!charge) {
    return <div className="contenu"><p className="texte-discret">Chargement…</p></div>;
  }

  return (
    <div className="contenu">
      <Link to={`/bon/${id}`} className="bouton-discret">← Retour</Link>
      <h1>Modifier le bon</h1>
      <p className="texte-discret">
        Le montant initial est {centimesVersAffichage(eurosVersCentimes(montant) ?? 0)} — le
        modifier ici ne touche pas aux dépenses déjà enregistrées, seulement à l'information de
        départ.
      </p>
      <form onSubmit={valider}>
        <ChampsBon
          enseignes={enseignes}
          enseigneNom={enseigneNom}
          setEnseigneNom={setEnseigneNom}
          montant={montant}
          setMontant={setMontant}
          dateAchat={dateAchat}
          setDateAchat={setDateAchat}
          dateExpiration={dateExpiration}
          setDateExpiration={setDateExpiration}
          code={code}
          setCode={setCode}
          pin={pin}
          setPin={setPin}
        />

        <SelecteurVisibilite valeur={visibilite} onChange={setVisibilite} />

        {erreur && <p className="champ erreur">{erreur}</p>}

        <button
          type="submit"
          className="bouton-grand bouton-principal bouton-pleine-largeur"
          disabled={enCours}
        >
          Enregistrer les modifications
        </button>
      </form>
    </div>
  );
}
