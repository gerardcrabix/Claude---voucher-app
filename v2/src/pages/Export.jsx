import { useEffect, useMemo, useState } from 'react';
import { listerBonsEnrichis, listerEnseignes } from '../db/repository.js';
import { exporterSauvegarde } from '../db/sauvegarde.js';
import { construireClasseurXlsx } from '../export/xlsxEcrivain.js';
import { declencherTelechargement } from '../utils/telecharger.js';
import { formatDateAffichage } from '../utils/dates.js';
import { useAuth } from '../auth/AuthContext.jsx';

// Écran Export : sauvegarde des données visibles par ce compte (voir
// db/sauvegarde.js — en v2, chaque compte ne peut exporter que ce que Row
// Level Security lui laisse lire ; les bons privés de l'autre compte n'y
// figurent pas, contrairement à la v1 qui exportait tout), et export Excel
// ciblé (une enseigne, une plage de dates d'expiration) pour les bons
// encore actifs et visibles par l'identité courante. La restauration n'est
// plus proposée ici (voir db/sauvegarde.js) — c'est désormais une opération
// hors application, via scripts/migrate-from-v1-backup.mjs.
export default function Export() {
  const { identite } = useAuth();
  const [enseignes, setEnseignes] = useState([]);
  const [bons, setBons] = useState([]);
  const [enseigneId, setEnseigneId] = useState(null);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  const [enCoursExportSauvegarde, setEnCoursExportSauvegarde] = useState(false);
  const [messageSauvegarde, setMessageSauvegarde] = useState(null);
  const [erreurSauvegarde, setErreurSauvegarde] = useState(null);

  useEffect(() => {
    listerEnseignes().then(setEnseignes);
    listerBonsEnrichis(identite).then(setBons);
  }, [identite]);

  const bonsCorrespondants = useMemo(() => {
    if (!enseigneId || !dateDebut || !dateFin) return [];
    return bons.filter((b) =>
      b.statut === 'actif'
      && b.enseigneId === enseigneId
      && b.dateExpiration
      && b.dateExpiration >= dateDebut
      && b.dateExpiration <= dateFin
    );
  }, [bons, enseigneId, dateDebut, dateFin]);

  async function exporterSauvegardeComplete() {
    setEnCoursExportSauvegarde(true);
    setErreurSauvegarde(null);
    setMessageSauvegarde(null);
    try {
      const donnees = await exporterSauvegarde(identite);
      const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
      const horodatage = new Date().toISOString().slice(0, 10);
      declencherTelechargement(blob, `cajac-voucher-sauvegarde-${horodatage}.json`);
      setMessageSauvegarde(
        "Export terminé. Rappel : il ne contient que ce que ce compte peut voir — les bons que l'autre compte a marqués « réservés à lui/elle » n'y figurent pas."
      );
    } catch (e) {
      setErreurSauvegarde(e?.message || "Échec de l'export.");
    } finally {
      setEnCoursExportSauvegarde(false);
    }
  }

  function exporterXls() {
    const enseigne = enseignes.find((e) => e.id === enseigneId);
    const entetes = [
      'Enseigne', 'Montant initial (€)', 'Montant restant (€)',
      "Date d'achat", "Date d'expiration", 'Code', 'PIN', 'Statut',
    ];
    const lignes = [
      entetes,
      ...bonsCorrespondants.map((b) => [
        enseigne?.nom ?? '',
        b.montantInitial / 100,
        b.solde / 100,
        formatDateAffichage(b.dateAchat),
        formatDateAffichage(b.dateExpiration),
        b.code,
        b.pin ?? '',
        b.statut,
      ]),
    ];
    const octets = construireClasseurXlsx('Bons', lignes);
    const blob = new Blob([octets], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const nomFichier = (enseigne?.nom ?? 'enseigne').replace(/[^\w-]+/g, '_');
    declencherTelechargement(blob, `bons-${nomFichier}-${dateDebut}_${dateFin}.xlsx`);
  }

  return (
    <div className="contenu">
      <h1>Export</h1>

      <section>
        <h2>Sauvegarde</h2>
        <p className="texte-discret">
          Les données sont désormais partagées et synchronisées automatiquement entre vos appareils —
          cet export sert de filet de sécurité supplémentaire (mail, cloud…), pas de synchronisation.
          Il ne contient que ce que ce compte peut voir : les bons que l'autre compte a marqués
          « réservés à lui/elle » n'y figurent pas.
        </p>
        <div className="actions">
          <button
            className="bouton-grand bouton-principal"
            onClick={exporterSauvegardeComplete}
            disabled={enCoursExportSauvegarde}
          >
            {enCoursExportSauvegarde ? 'Export…' : 'Exporter mes données'}
          </button>
        </div>

        {messageSauvegarde && <p className="alerte-ok">{messageSauvegarde}</p>}
        {erreurSauvegarde && <p className="champ erreur">{erreurSauvegarde}</p>}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Export Excel</h2>
        <p className="texte-discret">
          Bons actifs d'une enseigne dont la date d'expiration tombe entre deux dates.
        </p>

        {enseignes.length === 0 ? (
          <p className="texte-discret">Aucune enseigne pour l'instant.</p>
        ) : (
          <div className="boutons-enseignes">
            {enseignes.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`bouton-enseigne ${enseigneId === e.id ? 'active' : ''}`}
                onClick={() => setEnseigneId(e.id)}
              >
                {e.nom}
              </button>
            ))}
          </div>
        )}

        <div className="champ">
          <label htmlFor="export-date-debut">Expiration entre le</label>
          <input
            id="export-date-debut"
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="export-date-fin">et le</label>
          <input
            id="export-date-fin"
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
          />
        </div>

        {enseigneId && dateDebut && dateFin && (
          <p className="texte-discret">
            {bonsCorrespondants.length === 0
              ? 'Aucun bon actif ne correspond à ces critères.'
              : `${bonsCorrespondants.length} bon${bonsCorrespondants.length > 1 ? 's' : ''} actif${bonsCorrespondants.length > 1 ? 's' : ''} trouvé${bonsCorrespondants.length > 1 ? 's' : ''}.`}
          </p>
        )}

        <div className="actions">
          <button
            className="bouton-grand bouton-principal"
            onClick={exporterXls}
            disabled={bonsCorrespondants.length === 0}
          >
            Exporter en Excel
          </button>
        </div>
      </section>
    </div>
  );
}
