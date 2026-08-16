import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { listerEnseignes, modifierBon, obtenirBon } from '../db/repository.js';
import { eurosVersCentimes, centimesVersAffichage } from '../utils/money.js';
import { useIdentity } from '../identity/IdentityContext.jsx';
import ChampsBon from '../components/ChampsBon.jsx';

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
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    listerEnseignes().then(setEnseignes);
    obtenirBon(id).then((bon) => {
      if (!bon) return;
      setEnseigneNom(bon.enseigne?.nom ?? '');
      setMontant((bon.montantInitial / 100).toString().replace('.', ','));
      setDateAchat(bon.dateAchat);
      setDateExpiration(bon.dateExpiration ?? '');
      setCode(bon.code ?? '');
      setPin(bon.pin ?? '');
      setCharge(true);
    });
  }, [id]);

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
      await modifierBon({
        id,
        enseigneNom: enseigneNom.trim(),
        montantInitial: montantCentimes,
        dateAchat,
        dateExpiration: dateExpiration || null,
        code,
        pin,
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
          datalistId="liste-enseignes-edition"
        />

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
