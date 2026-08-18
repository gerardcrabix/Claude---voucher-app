import { useEffect, useMemo, useState } from 'react';
import { construireLignesHistorique, listerBonsEnrichis, listerEnseignes } from '../db/repository.js';
import { exporterSauvegarde } from '../db/sauvegarde.js';
import { construireClasseurXlsx } from '../export/xlsxEcrivain.js';
import { declencherTelechargement } from '../utils/telecharger.js';
import { formatDateAffichage } from '../utils/dates.js';
import { useAuth } from '../auth/AuthContext.jsx';

const LIBELLES_STATUT = {
  actif: 'Actif',
  expire: 'Expiré',
  solde: 'Solde épuisé',
  termine: 'Clôturé',
};

// Écran Export : sauvegarde des données visibles par ce compte (voir
// db/sauvegarde.js), et deux exports Excel — un seul chargement de
// listerBonsEnrichis() sert aux deux, il couvre déjà tous les statuts et
// toutes les enseignes :
//   - "Bons actifs (période)" : ciblé, une ou plusieurs enseignes, une
//     plage de dates d'expiration — l'export historique de cet écran.
//   - "Export complet" : toutes les enseignes sélectionnées (ou toutes s'il
//     n'y en a aucune de cochée), tous les bons quel que soit leur statut
//     (consommés, expirés, clôturés, encore actifs), plus l'historique
//     complet de qui a fait quoi (dépenses, corrections, changements de
//     montant, clôtures) — deux onglets dans le même classeur.
export default function Export() {
  const { identite, libelleIdentite } = useAuth();
  const [enseignes, setEnseignes] = useState([]);
  const [bons, setBons] = useState([]);
  const [enseignesChoisies, setEnseignesChoisies] = useState(new Set());
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  const [enCoursExportSauvegarde, setEnCoursExportSauvegarde] = useState(false);
  const [messageSauvegarde, setMessageSauvegarde] = useState(null);
  const [erreurSauvegarde, setErreurSauvegarde] = useState(null);

  useEffect(() => {
    listerEnseignes().then(setEnseignes);
    listerBonsEnrichis(identite).then(setBons);
  }, [identite]);

  function basculerEnseigne(id) {
    setEnseignesChoisies((prec) => {
      const suivant = new Set(prec);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }

  function toutesLesEnseignes() {
    setEnseignesChoisies(
      enseignesChoisies.size === enseignes.length ? new Set() : new Set(enseignes.map((e) => e.id))
    );
  }

  const bonsActifsPeriode = useMemo(() => {
    if (enseignesChoisies.size === 0 || !dateDebut || !dateFin) return [];
    return bons.filter((b) =>
      b.statut === 'actif'
      && enseignesChoisies.has(b.enseigneId)
      && b.dateExpiration
      && b.dateExpiration >= dateDebut
      && b.dateExpiration <= dateFin
    );
  }, [bons, enseignesChoisies, dateDebut, dateFin]);

  // Aucune enseigne cochée = toutes, pour cet export complet ; pour l'export
  // ciblé ci-dessus (bons actifs par période), au moins une enseigne reste
  // requise — une période sans aucune enseigne précisée n'aurait pas grand
  // sens.
  const bonsExportComplet = useMemo(
    () => (enseignesChoisies.size === 0 ? bons : bons.filter((b) => enseignesChoisies.has(b.enseigneId))),
    [bons, enseignesChoisies]
  );

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

  function exporterXlsPeriode() {
    const entetes = [
      'Enseigne', 'Montant initial (€)', 'Montant restant (€)',
      "Date d'achat", "Date d'expiration", 'Code', 'PIN', 'Statut',
    ];
    const lignes = [
      entetes,
      ...bonsActifsPeriode.map((b) => [
        b.enseigne?.nom ?? '',
        b.montantInitial / 100,
        b.solde / 100,
        formatDateAffichage(b.dateAchat),
        formatDateAffichage(b.dateExpiration),
        b.code,
        b.pin ?? '',
        LIBELLES_STATUT[b.statut] ?? b.statut,
      ]),
    ];
    const octets = construireClasseurXlsx([{ nom: 'Bons', lignes }]);
    const blob = new Blob([octets], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    declencherTelechargement(blob, `bons-actifs-${dateDebut}_${dateFin}.xlsx`);
  }

  function exporterXlsComplet() {
    const entetesBons = [
      'Enseigne', 'Code', 'Statut', 'Montant initial (€)', 'Montant restant (€)',
      "Date d'achat", "Date d'expiration", 'PIN',
    ];
    const lignesBons = [
      entetesBons,
      ...bonsExportComplet.map((b) => [
        b.enseigne?.nom ?? '',
        b.code,
        LIBELLES_STATUT[b.statut] ?? b.statut,
        b.montantInitial / 100,
        b.solde / 100,
        formatDateAffichage(b.dateAchat),
        formatDateAffichage(b.dateExpiration),
        b.pin ?? '',
      ]),
    ];

    const entetesHistorique = [
      'Enseigne', 'N° du bon', 'Date', 'Modification', 'Montant avant (€)', 'Montant après (€)', 'Qui', 'Note',
    ];
    const lignesHistorique = [
      entetesHistorique,
      ...construireLignesHistorique(bonsExportComplet).map((l) => [
        l.enseigneNom ?? '',
        l.bonCode,
        formatDateAffichage(l.date),
        l.type,
        l.montantAvant != null ? l.montantAvant / 100 : '',
        l.montantApres != null ? l.montantApres / 100 : '',
        libelleIdentite(l.auteur),
        l.note,
      ]),
    ];

    const octets = construireClasseurXlsx([
      { nom: 'Bons', lignes: lignesBons },
      { nom: 'Historique', lignes: lignesHistorique },
    ]);
    const blob = new Blob([octets], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const horodatage = new Date().toISOString().slice(0, 10);
    declencherTelechargement(blob, `bons-export-complet-${horodatage}.xlsx`);
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
          Une ou plusieurs enseignes (aucune cochée = toutes), puis choisissez l'un des deux exports
          ci-dessous.
        </p>

        {enseignes.length === 0 ? (
          <p className="texte-discret">Aucune enseigne pour l'instant.</p>
        ) : (
          <div className="boutons-enseignes">
            <button
              type="button"
              className={`bouton-enseigne ${enseignesChoisies.size === enseignes.length ? 'active' : ''}`}
              onClick={toutesLesEnseignes}
            >
              Toutes
            </button>
            {enseignes.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`bouton-enseigne ${enseignesChoisies.has(e.id) ? 'active' : ''}`}
                onClick={() => basculerEnseigne(e.id)}
              >
                {e.nom}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <h3>Bons actifs, par période</h3>
          <p className="texte-discret">
            Bons actifs des enseignes cochées ci-dessus, dont la date d'expiration tombe entre deux
            dates. Nécessite au moins une enseigne cochée.
          </p>
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

          {enseignesChoisies.size > 0 && dateDebut && dateFin && (
            <p className="texte-discret">
              {bonsActifsPeriode.length === 0
                ? 'Aucun bon actif ne correspond à ces critères.'
                : `${bonsActifsPeriode.length} bon${bonsActifsPeriode.length > 1 ? 's' : ''} actif${bonsActifsPeriode.length > 1 ? 's' : ''} trouvé${bonsActifsPeriode.length > 1 ? 's' : ''}.`}
            </p>
          )}

          <div className="actions">
            <button
              className="bouton-grand bouton-principal"
              onClick={exporterXlsPeriode}
              disabled={bonsActifsPeriode.length === 0}
            >
              Exporter les bons actifs
            </button>
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <h3>Export complet</h3>
          <p className="texte-discret">
            Tous les bons des enseignes cochées ci-dessus, quel que soit leur statut (actifs, soldés,
            expirés, clôturés), plus l'historique complet de qui a fait quoi et quand — deux onglets
            dans le même fichier.
          </p>
          <p className="texte-discret">
            {bonsExportComplet.length} bon{bonsExportComplet.length > 1 ? 's' : ''}
            {enseignesChoisies.size === 0 ? ' (toutes enseignes).' : '.'}
          </p>
          <div className="actions">
            <button
              className="bouton-grand bouton-principal"
              onClick={exporterXlsComplet}
              disabled={bonsExportComplet.length === 0}
            >
              Exporter tout l'historique
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
