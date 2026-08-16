import { useEffect, useMemo, useState } from 'react';
import { listerBonsEnrichis, listerEnseignes } from '../db/repository.js';
import { exporterSauvegarde, restaurerSauvegarde } from '../db/sauvegarde.js';
import { construireClasseurXlsx } from '../export/xlsxEcrivain.js';
import { declencherTelechargement } from '../utils/telecharger.js';
import { formatDateAffichage } from '../utils/dates.js';

// Écran Export : sauvegarde/restauration complète des données locales (voir
// db/sauvegarde.js — cet appareil ne synchronise rien ailleurs), et export
// Excel ciblé (une enseigne, une plage de dates d'expiration) pour les bons
// encore actifs.
export default function Export() {
  const [enseignes, setEnseignes] = useState([]);
  const [bons, setBons] = useState([]);
  const [enseigneId, setEnseigneId] = useState(null);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  const [enCoursExportSauvegarde, setEnCoursExportSauvegarde] = useState(false);
  const [fichierRestauration, setFichierRestauration] = useState(null);
  const [confirmationRestauration, setConfirmationRestauration] = useState(false);
  const [messageSauvegarde, setMessageSauvegarde] = useState(null);
  const [erreurSauvegarde, setErreurSauvegarde] = useState(null);

  useEffect(() => {
    listerEnseignes().then(setEnseignes);
    listerBonsEnrichis().then(setBons);
  }, []);

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
      const donnees = await exporterSauvegarde();
      const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
      const horodatage = new Date().toISOString().slice(0, 10);
      declencherTelechargement(blob, `cajac-voucher-sauvegarde-${horodatage}.json`);
    } catch (e) {
      setErreurSauvegarde(e?.message || "Échec de l'export.");
    } finally {
      setEnCoursExportSauvegarde(false);
    }
  }

  function surChoixFichierRestauration(ev) {
    const fichier = ev.target.files?.[0];
    setFichierRestauration(fichier ?? null);
    setConfirmationRestauration(false);
    setMessageSauvegarde(null);
    setErreurSauvegarde(null);
  }

  async function restaurer() {
    if (!fichierRestauration) return;
    setErreurSauvegarde(null);
    try {
      const texte = await fichierRestauration.text();
      const donnees = JSON.parse(texte);
      await restaurerSauvegarde(donnees);
      setMessageSauvegarde('Sauvegarde restaurée. Rechargement…');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setErreurSauvegarde(e?.message || 'Fichier illisible ou invalide.');
      setConfirmationRestauration(false);
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
        <h2>Sauvegarde complète</h2>
        <p className="texte-discret">
          Les données de cet appareil (bons, codes, PIN, enseignes…) ne vivent que localement, sans
          synchronisation entre appareils. Exportez une sauvegarde de temps en temps et conservez-la où
          vous voulez (mail, cloud…) — en cas de perte ou de changement de téléphone, restaurez-la ici.
        </p>
        <div className="actions">
          <button
            className="bouton-grand bouton-principal"
            onClick={exporterSauvegardeComplete}
            disabled={enCoursExportSauvegarde}
          >
            {enCoursExportSauvegarde ? 'Export…' : 'Exporter toutes les données'}
          </button>
        </div>

        <div className="champ" style={{ marginTop: 16 }}>
          <label htmlFor="fichier-restauration">Restaurer depuis un fichier de sauvegarde</label>
          <input
            id="fichier-restauration"
            type="file"
            accept="application/json"
            onChange={surChoixFichierRestauration}
          />
        </div>

        {fichierRestauration && !confirmationRestauration && (
          <div className="alerte-anti-oubli forte">
            <h2>Attention</h2>
            <p>
              Restaurer « {fichierRestauration.name} » remplace <strong>toutes</strong> les données
              actuelles de cet appareil par celles du fichier. C'est irréversible, sauf à avoir une
              sauvegarde plus récente sous la main.
            </p>
            <button className="bouton-grand bouton-danger" onClick={() => setConfirmationRestauration(true)}>
              Je comprends, continuer
            </button>
          </div>
        )}
        {confirmationRestauration && (
          <div className="actions">
            <button
              className="bouton-grand bouton-secondaire"
              onClick={() => { setFichierRestauration(null); setConfirmationRestauration(false); }}
            >
              Annuler
            </button>
            <button className="bouton-grand bouton-danger" onClick={restaurer}>
              Restaurer maintenant
            </button>
          </div>
        )}

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
